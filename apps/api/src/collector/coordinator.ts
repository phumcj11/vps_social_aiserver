import type { ApiEnv } from '../lib/env';
import type { Logger } from '../lib/logger';
import type { ProfileService } from '../facebook/profile';
import { AuditService, AuditEventTypes } from '../lib/audit';
import type { CollectorRepository } from './repository';
import type { CollectorBrowser } from './browser';
import { extractPostsFromPage } from './extractor';
import { normalize, contentHashOf } from './normalizer';
import { CollectorError, CollectorErrorCode } from './errors';
import type { CollectorRunSummary } from './types';
import type { CollectorRunRecord } from '../store/types';

/**
 * Coordinator (SPRINT 006) — runs the pipeline:
 *   Navigation → Extraction → Normalization → Persistence
 *
 * State machine: idle → running → (completed | paused | failed).
 * Concurrency one; reader gated by FACEBOOK_READER_ENABLED (default off → no
 * browser); requires a connected Facebook session. READ-ONLY — no clicks,
 * likes, shares, comments, messages, joins, or any write.
 */
export interface CoordinatorDeps {
  repo: CollectorRepository;
  browser: CollectorBrowser;
  profiles: ProfileService;
  audit: AuditService;
  env: ApiEnv;
  logger: Logger;
}

function toSummary(run: CollectorRunRecord): CollectorRunSummary {
  const durationMs = run.finishedAt ? run.finishedAt.getTime() - run.startedAt.getTime() : null;
  return {
    runId: run.id,
    status: run.status,
    startedAt: run.startedAt.toISOString(),
    finishedAt: run.finishedAt ? run.finishedAt.toISOString() : null,
    groupsProcessed: run.groupsProcessed,
    postsCollected: run.postsCollected,
    duplicatesSkipped: run.duplicatesSkipped,
    errors: run.errors,
    errorSummary: run.errorSummary,
    durationMs,
  };
}

export class CollectorCoordinator {
  private readonly active = new Set<string>();
  private readonly aborts = new Map<string, AbortController>();
  private readonly tasks = new Map<string, Promise<void>>();

  constructor(private readonly deps: CoordinatorDeps) {}

  /** Await the in-flight collection task for a workspace (tests/CLI). */
  async waitForIdle(workspaceId: string): Promise<void> {
    await this.tasks.get(workspaceId)?.catch(() => undefined);
  }

  /** Current status: latest run summary + total collected signals + running. */
  async status(
    workspaceId: string,
  ): Promise<{ run: CollectorRunSummary | null; totalSignals: number; running: boolean }> {
    this.deps.profiles.assertWorkspaceId(workspaceId);
    const run = await this.deps.repo.latestRun(workspaceId);
    const totalSignals = await this.deps.repo.countSignals(workspaceId);
    return {
      run: run ? toSummary(run) : null,
      totalSignals,
      running: this.active.has(workspaceId),
    };
  }

  async listRuns(workspaceId: string): Promise<CollectorRunSummary[]> {
    this.deps.profiles.assertWorkspaceId(workspaceId);
    const runs = await this.deps.repo.listRuns(workspaceId);
    return runs.map(toSummary);
  }

  /** Start a collection run (background). Returns the initial run summary. */
  async start(workspaceId: string): Promise<CollectorRunSummary> {
    this.deps.profiles.assertWorkspaceId(workspaceId);
    if (this.active.size > 0 || this.active.has(workspaceId)) {
      throw new CollectorError(
        CollectorErrorCode.ALREADY_RUNNING,
        'A collection is already running',
      );
    }
    const run = await this.deps.repo.createRun(workspaceId);
    this.active.add(workspaceId);
    const abort = new AbortController();
    this.aborts.set(workspaceId, abort);
    await this.deps.audit.record(AuditEventTypes.CollectorRunStarted, {
      workspaceId,
      payload: { runId: run.id },
    });

    const task = this.runCollect(workspaceId, run.id, abort.signal);
    this.tasks.set(workspaceId, task);
    void task.finally(() => this.tasks.delete(workspaceId));

    return toSummary(run);
  }

  /** Stop an active run (graceful → paused). Idempotent. */
  async stop(workspaceId: string): Promise<CollectorRunSummary | null> {
    this.deps.profiles.assertWorkspaceId(workspaceId);
    this.aborts.get(workspaceId)?.abort();
    const run = await this.deps.repo.latestRun(workspaceId);
    return run ? toSummary(run) : null;
  }

  private async runCollect(workspaceId: string, runId: string, signal: AbortSignal): Promise<void> {
    const { repo, browser, profiles, audit, env, logger } = this.deps;
    try {
      // Safety gate 1: reader disabled → no browser, no Facebook contact.
      if (!env.FACEBOOK_READER_ENABLED) {
        await repo.updateRun(runId, {
          status: 'completed',
          finishedAt: new Date(),
          groupsProcessed: 0,
          postsCollected: 0,
          errors: 0,
          errorSummary: 'reader_disabled: collection skipped (no browser launched)',
        });
        await audit.record(AuditEventTypes.CollectorRunCompleted, {
          workspaceId,
          payload: { runId, reason: 'reader_disabled' },
        });
        return;
      }

      // Safety gate 2: require a connected Facebook session.
      const account = await repo.getFacebookAccount(workspaceId);
      if (!account || account.connectionState !== 'connected') {
        await repo.updateRun(runId, {
          status: 'failed',
          finishedAt: new Date(),
          errorSummary: 'session_not_connected',
        });
        await audit.record(AuditEventTypes.CollectorRunFailed, {
          workspaceId,
          payload: { runId, code: CollectorErrorCode.SESSION_NOT_CONNECTED },
        });
        return;
      }

      // Acquire the shared per-workspace browser lock (concurrency one).
      await profiles.acquireLock(workspaceId);
      try {
        const dir = await profiles.profileDirForDriver(workspaceId);
        const groups = await repo.listActiveGroups(workspaceId);
        const maxPosts = env.COLLECTOR_MAX_POSTS_PER_GROUP;

        let groupsProcessed = 0;
        let postsCollected = 0;
        let duplicatesSkipped = 0;
        let errors = 0;
        const notes: string[] = [];

        for (const group of groups) {
          if (signal.aborted) break;
          try {
            const result = await browser.collect(dir, group.canonicalUrl, {
              maxScrolls: env.COLLECTOR_MAX_SCROLLS,
              maxPosts,
              timeoutMs: env.COLLECTOR_TIMEOUT_MS,
              signal,
            });
            const captures = extractPostsFromPage(result.pageHtml).slice(0, maxPosts);

            let lastUrl: string | null = null;
            let lastId: string | null = null;
            let groupPosts = 0;
            for (const capture of captures) {
              const normalized = normalize(capture);
              const dup = await repo.isDuplicate(workspaceId, {
                postUrl: capture.postUrl,
                facebookPostId: capture.facebookPostId,
                normalizedHash: normalized.normalizedHash,
              });
              if (dup) {
                duplicatesSkipped += 1;
                continue;
              }
              const persisted = await repo.persistSignal({
                workspaceId,
                groupId: group.id,
                capture,
                contentHash: contentHashOf(capture),
                normalized,
              });
              // A duplicate detected only at insert time (a race) is a safe skip,
              // NOT a new post and NOT an error.
              if (!persisted.inserted) {
                duplicatesSkipped += 1;
                continue;
              }
              groupPosts += 1;
              postsCollected += 1;
              lastUrl = capture.postUrl;
              lastId = capture.facebookPostId;
            }

            await repo.saveCheckpoint({
              workspaceId,
              groupId: group.id,
              lastPostId: lastId,
              lastPostUrl: lastUrl,
              lastScan: new Date(),
              lastCursor: String(result.scrolls),
            });
            groupsProcessed += 1;
            await audit.record(AuditEventTypes.CollectorGroupCollected, {
              workspaceId,
              payload: { runId, groupId: group.id, count: groupPosts },
            });
          } catch (err) {
            errors += 1;
            const code = this.classify(err);
            // Safe detail: the CollectorError message carries only a code
            // (e.g. "…(ER_DATA_TOO_LONG)") — never post content or secrets.
            const detail = err instanceof CollectorError ? err.message : '';
            notes.push(`${group.id}:${code}`);
            await audit.record(AuditEventTypes.CollectorGroupError, {
              workspaceId,
              payload: { runId, groupId: group.id, code },
            });
            logger.warn('collector.group_error', { workspaceId, groupId: group.id, code, detail });
          }
        }

        const status = signal.aborted ? 'paused' : 'completed';
        await repo.updateRun(runId, {
          status,
          finishedAt: new Date(),
          groupsProcessed,
          postsCollected,
          duplicatesSkipped,
          errors,
          errorSummary: notes.length > 0 ? notes.join('; ') : null,
        });
        await audit.record(
          status === 'paused'
            ? AuditEventTypes.CollectorRunPaused
            : AuditEventTypes.CollectorRunCompleted,
          { workspaceId, payload: { runId, postsCollected, errors } },
        );
      } finally {
        await profiles.releaseLock(workspaceId);
      }
    } catch (err) {
      const code = this.classify(err);
      await repo.updateRun(runId, {
        status: 'failed',
        finishedAt: new Date(),
        errorSummary: code,
      });
      await audit.record(AuditEventTypes.CollectorRunFailed, {
        workspaceId,
        payload: { runId, code },
      });
    } finally {
      this.active.delete(workspaceId);
      this.aborts.delete(workspaceId);
    }
  }

  private classify(err: unknown): string {
    if (err instanceof CollectorError) return err.code;
    const message = (err as Error).message ?? '';
    if (/browser_launch_failed/.test(message)) return CollectorErrorCode.BROWSER_ERROR;
    return CollectorErrorCode.NAVIGATION_ERROR;
  }
}
