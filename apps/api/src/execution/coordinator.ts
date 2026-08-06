import type { ApiEnv } from '../lib/env';
import type { Logger } from '../lib/logger';
import type {
  ActionJobRecord,
  ExecutionSessionRecord,
  ExecutionEvidenceRecord,
  IdempotencyRecord,
} from '../store/types';
import type { ActionRepository } from '../action/repository';
import type { ActionQueue } from '../action/queue';
import { ExecutionSessionRepository } from './session-repository';
import { ExecutionEvidenceRepository } from './evidence-repository';
import { ActionIdempotencyRepository } from './idempotency-repository';
import { ActionExecutor } from './executor';
import { ExecutionRecoveryPolicy, type RecoveryClassification } from './recovery';
import { selectCommentAdapter } from './adapter';
import type { FakeScenario } from './fake-adapter';
import { idempotencyKey } from './idempotency-repository';
import { isTerminalExecutionStatus } from './session-state';
import { ExecutionError, ExecutionErrorCode } from './errors';
import type { ExecutionContext, ExecutionResult, TargetVerification } from './types';
import type { FacebookCommentPage } from './comment-page';
import {
  PlaywrightFacebookCommentAdapter,
  type ProfileLock,
  type AdapterMode,
} from './playwright-adapter';
import { newId } from '../lib/tokens';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Builds the real browser page + exclusive profile lock for one attempt. */
export type CommentPageFactory = (input: {
  workspaceId: string;
  targetUrl: string;
  mode: AdapterMode;
}) => Promise<{ page: FacebookCommentPage; lock: ProfileLock }>;

export interface ExecutionCoordinatorDeps {
  sessions: ExecutionSessionRepository;
  evidence: ExecutionEvidenceRepository;
  idempotency: ActionIdempotencyRepository;
  executor: ActionExecutor;
  recovery: ExecutionRecoveryPolicy;
  actionRepo: ActionRepository;
  actionQueue: ActionQueue;
  env: ApiEnv;
  logger: Logger;
  /**
   * Optional real-browser wiring. Required only for the REAL Playwright path
   * (submit_once) and the read-only `prepareOnly` probe. Absent in unit tests
   * (fake adapter) and under the safe defaults (execution gates block first).
   */
  commentPageFactory?: CommentPageFactory;
}

/** Structured result of a strictly read-only `prepare_only` readiness probe. */
export interface PrepareOnlyResult {
  ok: boolean;
  jobId: string;
  targetUrl: string;
  /** True when the observed post identity matches the immutable target key. */
  targetMatches: boolean;
  observedPostKey: string | null;
  /** A safe reason code when a check aborted (no typing/submitting occurred). */
  reasonCode: string | null;
  reasonDetail: string | null;
  /** Always false — this mode never types or submits. */
  typed: false;
  submitted: false;
}

export interface PrepareExecutionResult {
  status: ExecutionResult['status'] | 'blocked';
  session: ExecutionSessionRecord | null;
  job: ActionJobRecord;
  result: ExecutionResult | null;
  blockedReasons?: string[];
}

export interface SessionDetail {
  session: ExecutionSessionRecord;
  job: ActionJobRecord;
  evidence: ExecutionEvidenceRecord[];
}

export interface RecoveryResult {
  session: ExecutionSessionRecord;
  classification: RecoveryClassification;
}

/**
 * ExecutionCoordinator (SPRINT 012) — the safe boundary that turns a queued
 * Action Job into a fully-audited execution attempt WITHOUT ever performing a
 * real Facebook write this sprint.
 *
 * It enforces, in order: workspace ownership, action-type support, the five
 * safety gates (engine/write/comment enabled, kill switch off, adapter), the job
 * precondition (must be queued), single-active-session, and duplicate-success —
 * then reserves DB-level idempotency, opens a session, and runs the executor
 * with the SELECTED adapter (fake by default; the Playwright boundary refuses).
 *
 * Under the mandated safe defaults (engine off, writes off, kill switch on) it
 * returns `blocked` and creates no session — nothing executes. The full pipeline
 * is proven by tests using the fake adapter with execution enabled.
 */
export class ExecutionCoordinator {
  constructor(private readonly deps: ExecutionCoordinatorDeps) {}

  private assertWorkspace(workspaceId: string): void {
    if (!UUID_RE.test(workspaceId)) {
      throw new ExecutionError(ExecutionErrorCode.INVALID_WORKSPACE, 'Invalid workspace');
    }
  }

  /** The five safety gates. Any closed gate blocks execution — no session. */
  private gateBlockers(): string[] {
    const e = this.deps.env;
    const blockers: string[] = [];
    if (!e.ACTION_ENGINE_ENABLED) blockers.push('ACTION_ENGINE_ENABLED is false');
    if (!e.FACEBOOK_WRITE_ACTION_ENABLED) blockers.push('FACEBOOK_WRITE_ACTION_ENABLED is false');
    if (!e.FACEBOOK_COMMENT_ENABLED) blockers.push('FACEBOOK_COMMENT_ENABLED is false');
    if (e.GLOBAL_KILL_SWITCH) blockers.push('GLOBAL_KILL_SWITCH is on');
    return blockers;
  }

  private async loadOwnedJob(workspaceId: string, id: string): Promise<ActionJobRecord> {
    const job = await this.deps.actionRepo.getJobById(id);
    if (!job || job.workspaceId !== workspaceId) {
      throw new ExecutionError(ExecutionErrorCode.JOB_NOT_FOUND, 'Action job not found');
    }
    return job;
  }

  private async loadOwnedSession(workspaceId: string, id: string): Promise<ExecutionSessionRecord> {
    const session = await this.deps.sessions.getById(id);
    if (!session || session.workspaceId !== workspaceId) {
      throw new ExecutionError(ExecutionErrorCode.SESSION_NOT_FOUND, 'Execution session not found');
    }
    return session;
  }

  /**
   * Prepare and run ONE execution attempt for a queued facebook_comment job.
   * `dryRun` (fake-only) runs the full pipeline for diagnostics without mutating
   * the job's terminal state or permanently holding the idempotency reservation.
   */
  async prepareExecution(
    workspaceId: string,
    jobId: string,
    opts: { scenario?: FakeScenario; dryRun?: boolean; authorizeSubmit?: boolean } = {},
  ): Promise<PrepareExecutionResult> {
    this.assertWorkspace(workspaceId);
    const dryRun = opts.dryRun === true;
    const job = await this.loadOwnedJob(workspaceId, jobId);

    if (job.actionType !== 'facebook_comment') {
      throw new ExecutionError(
        ExecutionErrorCode.UNSUPPORTED_ACTION_TYPE,
        'Only facebook_comment actions can be executed',
      );
    }

    // Safety gates — closed gates block with no side effects.
    const blockers = this.gateBlockers();
    if (blockers.length > 0) {
      await this.deps.actionRepo.createEvent(job.id, 'execution.blocked', { reasons: blockers });
      this.deps.logger.info('execution.blocked', { jobId: job.id, reasons: blockers });
      return { status: 'blocked', session: null, job, result: null, blockedReasons: blockers };
    }

    // A dry run forces the FAKE adapter. A real run honors configuration: for
    // 'playwright' it builds the REAL, gated adapter with browser wiring +
    // submit_once mode. A real submit additionally requires an explicit
    // one-shot `authorizeSubmit`; without it the adapter refuses before typing.
    let adapter;
    if (dryRun) {
      adapter = selectCommentAdapter(
        { ...this.deps.env, FACEBOOK_COMMENT_ADAPTER: 'fake' },
        { scenario: opts.scenario },
      );
    } else if (this.deps.env.FACEBOOK_COMMENT_ADAPTER === 'playwright') {
      if (!this.deps.commentPageFactory) {
        throw new ExecutionError(
          ExecutionErrorCode.ADAPTER_DISABLED,
          'Playwright adapter selected but no browser wiring is configured',
        );
      }
      const { page, lock } = await this.deps.commentPageFactory({
        workspaceId,
        targetUrl: job.targetUrl,
        mode: 'submit_once',
      });
      adapter = selectCommentAdapter(this.deps.env, {
        playwright: {
          page,
          lock,
          mode: 'submit_once',
          submitAuthorized: opts.authorizeSubmit === true,
        },
      });
    } else {
      adapter = selectCommentAdapter(this.deps.env, { scenario: opts.scenario });
    }

    // Precondition: only a queued job executes (a real run consumes it).
    if (!dryRun && job.status !== 'queued') {
      throw new ExecutionError(
        ExecutionErrorCode.JOB_NOT_EXECUTABLE,
        `Job is ${job.status}; only a queued job can execute`,
      );
    }

    // Never two live sessions for one job.
    const active = await this.deps.sessions.getActiveForJob(job.id);
    if (active) {
      throw new ExecutionError(
        ExecutionErrorCode.ACTIVE_SESSION_EXISTS,
        'An execution session is already active for this job',
      );
    }

    const match = await this.deps.actionRepo.getMatchById(job.businessMatchId);
    if (!match) {
      throw new ExecutionError(ExecutionErrorCode.JOB_NOT_EXECUTABLE, 'Job business match missing');
    }
    const identity = {
      workspaceId,
      businessId: match.businessId,
      targetPostKey: job.targetPostKey,
      actionType: 'facebook_comment' as const,
    };

    // Duplicate-success guard — a verified comment already exists for this post.
    const live = await this.deps.idempotency.getLive(identity);
    if (live && live.status === 'verified') {
      throw new ExecutionError(
        ExecutionErrorCode.DUPLICATE_SUCCESS,
        'A verified comment already exists for this business and post',
      );
    }
    if (live && (live.status === 'reserved' || live.status === 'submitted')) {
      throw new ExecutionError(
        ExecutionErrorCode.IDEMPOTENCY_CONFLICT,
        'Another execution is already in flight for this business and post',
      );
    }

    // Reserve idempotency (DB unique index is the real guard against races).
    const reservation =
      live && live.status === 'ambiguous'
        ? live
        : await this.deps.idempotency.reserve({
            ...identity,
            actionJobId: job.id,
            executionSessionId: null,
          });

    const prior = await this.deps.sessions.listForJob(job.id);
    const attemptNumber = prior.length + 1;

    const session = await this.deps.sessions.create({
      workspaceId,
      actionJobId: job.id,
      attemptNumber,
      adapter: adapter.name,
      // Fake adapter uses no browser; a real (refusing) adapter would use the
      // single per-workspace profile. Collector never shares it concurrently.
      browserProfileKey: adapter.name === 'playwright' ? `ws:${workspaceId}` : null,
    });
    await this.deps.idempotency.updateStatus(reservation.id, reservation.status).catch(() => null);

    let processing = job;
    if (!dryRun) {
      processing = await this.deps.actionQueue.markProcessing(job);
      await this.deps.actionRepo.updateJob(job.id, {
        executionState: 'executing',
        lastExecutionSessionId: session.id,
      });
    }

    const ctx: ExecutionContext = {
      workspaceId,
      actionJobId: job.id,
      sessionId: session.id,
      attemptNumber,
      targetUrl: job.targetUrl,
      targetPostKey: job.targetPostKey,
      approvedContent: job.approvedContent,
      adapter: adapter.name,
    };

    const result = await this.deps.executor.execute(ctx, session, adapter);
    await this.applyResult(processing, reservation, result, dryRun);

    const refreshed = await this.deps.sessions.getById(session.id);
    const finalJob = (await this.deps.actionRepo.getJobById(job.id)) ?? processing;
    return { status: result.status, session: refreshed, job: finalJob, result };
  }

  /**
   * prepare_only — a STRICTLY read-only readiness probe against the exact target
   * post. It opens the browser, validates the connected session, verifies the
   * post identity + comment availability, checks for a duplicate, and confirms a
   * single composer — then closes. It NEVER types, submits, reacts, likes,
   * messages, or joins, and it creates NO execution session, NO idempotency
   * reservation, and NO job state change. It intentionally does NOT require the
   * write gates (they may stay disabled) — it can never write.
   */
  async prepareOnly(workspaceId: string, jobId: string): Promise<PrepareOnlyResult> {
    this.assertWorkspace(workspaceId);
    const job = await this.loadOwnedJob(workspaceId, jobId);
    if (job.actionType !== 'facebook_comment') {
      throw new ExecutionError(
        ExecutionErrorCode.UNSUPPORTED_ACTION_TYPE,
        'Only facebook_comment actions can be probed',
      );
    }
    if (!this.deps.commentPageFactory) {
      throw new ExecutionError(
        ExecutionErrorCode.ADAPTER_DISABLED,
        'prepare_only requires real browser wiring',
      );
    }

    const { page, lock } = await this.deps.commentPageFactory({
      workspaceId,
      targetUrl: job.targetUrl,
      mode: 'prepare_only',
    });
    const adapter = new PlaywrightFacebookCommentAdapter({
      env: this.deps.env,
      mode: 'prepare_only',
      submitAuthorized: false,
      page,
      lock,
    });
    const ctx: ExecutionContext = {
      workspaceId,
      actionJobId: job.id,
      sessionId: newId(),
      attemptNumber: 0,
      targetUrl: job.targetUrl,
      targetPostKey: job.targetPostKey,
      approvedContent: job.approvedContent,
      adapter: 'playwright',
    };

    let target: TargetVerification;
    try {
      target = await adapter.verifyTarget(ctx);
    } finally {
      // ALWAYS close the browser and release the lock — even on error.
      await adapter.close();
    }

    const targetMatches = target.ok && target.observedPostKey === job.targetPostKey;
    const { code, detail } = splitReason(target.reason);
    const reasonCode = target.ok
      ? targetMatches
        ? null
        : ExecutionErrorCode.TARGET_MISMATCH
      : code;
    this.deps.logger.info('execution.prepare_only', {
      jobId: job.id,
      ok: target.ok && targetMatches,
      reasonCode,
    });
    return {
      ok: target.ok && targetMatches,
      jobId: job.id,
      targetUrl: job.targetUrl,
      targetMatches,
      observedPostKey: target.observedPostKey,
      reasonCode,
      reasonDetail: target.ok
        ? targetMatches
          ? null
          : 'Observed post identity does not match the target'
        : detail,
      typed: false,
      submitted: false,
    };
  }

  /** Apply the execution result to the Action Job + idempotency reservation. */
  private async applyResult(
    job: ActionJobRecord,
    reservation: IdempotencyRecord,
    result: ExecutionResult,
    dryRun: boolean,
  ): Promise<void> {
    if (dryRun) {
      // Leave the job untouched; release the reservation so it can run again.
      await this.deps.idempotency.release(reservation.id);
      return;
    }

    switch (result.status) {
      case 'verified': {
        // Permanent DB guards: job success key + verified idempotency record.
        await this.deps.actionRepo.updateJob(job.id, {
          successIdempotencyKey: idempotencyKey({
            workspaceId: reservation.workspaceId,
            businessId: reservation.businessId,
            targetPostKey: reservation.targetPostKey,
            actionType: reservation.actionType,
          }),
          executionState: 'verified',
          verificationRequired: false,
          lastExecutionSessionId: result.sessionId,
        });
        await this.deps.idempotency.markVerified(reservation.id, result.facebookCommentId);
        await this.deps.actionQueue.markSucceeded(job);
        break;
      }
      case 'failed':
      case 'blocked': {
        // Deterministic, provably pre-submit → release so a deliberate retry is
        // possible; the job records the failure.
        await this.deps.idempotency.release(reservation.id);
        await this.deps.actionRepo.updateJob(job.id, {
          executionState: 'failed',
          lastExecutionSessionId: result.sessionId,
        });
        await this.deps.actionQueue.markFailed(job, {
          code: result.reasonCode ?? 'EXECUTION_FAILED',
          message: result.reasonDetail ?? 'Execution failed',
        });
        break;
      }
      case 'ambiguous': {
        // Outcome unknown: keep the reservation LIVE (never release, never
        // auto-retry), flag the job for mandatory human recovery. The job stays
        // 'processing' — a human resolves it via recovery.
        await this.deps.idempotency.markAmbiguous(reservation.id);
        await this.deps.actionRepo.updateJob(job.id, {
          executionState: 'ambiguous',
          ambiguousAt: new Date(),
          verificationRequired: true,
          lastExecutionSessionId: result.sessionId,
        });
        break;
      }
    }
  }

  async listSessions(workspaceId: string, jobId: string): Promise<ExecutionSessionRecord[]> {
    this.assertWorkspace(workspaceId);
    const job = await this.loadOwnedJob(workspaceId, jobId);
    return this.deps.sessions.listForJob(job.id);
  }

  async getSessionDetail(workspaceId: string, sessionId: string): Promise<SessionDetail> {
    this.assertWorkspace(workspaceId);
    const session = await this.loadOwnedSession(workspaceId, sessionId);
    const [job, evidence] = await Promise.all([
      this.deps.actionRepo.getJobById(session.actionJobId),
      this.deps.evidence.listForSession(session.id),
    ]);
    if (!job) throw new ExecutionError(ExecutionErrorCode.JOB_NOT_FOUND, 'Action job not found');
    return { session, job, evidence };
  }

  async listEvidence(workspaceId: string, sessionId: string): Promise<ExecutionEvidenceRecord[]> {
    this.assertWorkspace(workspaceId);
    const session = await this.loadOwnedSession(workspaceId, sessionId);
    return this.deps.evidence.listForSession(session.id);
  }

  /** Cancel a still-live session (operator action). Never touches Facebook. */
  async cancelSession(workspaceId: string, sessionId: string): Promise<ExecutionSessionRecord> {
    this.assertWorkspace(workspaceId);
    const session = await this.loadOwnedSession(workspaceId, sessionId);
    if (isTerminalExecutionStatus(session.status)) {
      throw new ExecutionError(
        ExecutionErrorCode.INVALID_SESSION_STATE,
        `Session is ${session.status}; only a live session can be cancelled`,
      );
    }
    return this.deps.sessions.transition(session, 'cancelled', new Date(), {
      errorCode: 'CANCELLED',
      errorMessage: 'Cancelled by operator',
    });
  }

  /**
   * Classify a terminal, non-successful session for recovery. This NEVER
   * auto-retries: an ambiguous outcome and all platform interrupts require a
   * human. For a provably pre-submit failure it releases the idempotency
   * reservation so a deliberate retry becomes possible.
   */
  async recover(workspaceId: string, sessionId: string): Promise<RecoveryResult> {
    this.assertWorkspace(workspaceId);
    const session = await this.loadOwnedSession(workspaceId, sessionId);
    const classification = this.deps.recovery.classify(session);

    const updated = await this.deps.sessions.update(session.id, {
      recoveryState: classification.disposition,
    });
    await this.deps.actionRepo.createEvent(session.actionJobId, 'execution.recovery', {
      sessionId: session.id,
      disposition: classification.disposition,
      reasonCode: classification.reasonCode,
    });

    return { session: updated ?? session, classification };
  }
}

/** Split an adapter reason of the form "CODE: detail" (or bare "CODE"). */
function splitReason(reason: string | undefined): { code: string | null; detail: string | null } {
  if (!reason) return { code: null, detail: null };
  const i = reason.indexOf(': ');
  if (i < 0) return { code: reason, detail: reason };
  return { code: reason.slice(0, i), detail: reason.slice(i + 2) };
}
