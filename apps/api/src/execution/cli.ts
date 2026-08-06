import { loadApiEnv } from '../lib/env';
import { loadDotenv } from '../lib/load-dotenv';
import { createLogger } from '../lib/logger';
import { createDb } from '../db/client';
import { DrizzleStore } from '../store/drizzle-store';
import { ActionRepository } from '../action/repository';
import { ActionQueue } from '../action/queue';
import { ExecutionSessionRepository } from './session-repository';
import { ExecutionEvidenceRepository } from './evidence-repository';
import { ActionIdempotencyRepository } from './idempotency-repository';
import { ActionExecutor } from './executor';
import { ExecutionVerificationService } from './verification';
import { ExecutionRecoveryPolicy } from './recovery';
import { ExecutionCoordinator, type CommentPageFactory } from './coordinator';
import { ExecutionError } from './errors';
import type { FakeScenario } from './fake-adapter';
import type { ExecutionSessionRecord } from '../store/types';
import { ProfileService } from '../facebook/profile';
import { PlaywrightCommentPage, parsePostIdentity } from './comment-page';
import type { ProfileLock } from './playwright-adapter';

/**
 * Safe Execution CLI (SPRINT 012).
 *
 *   pnpm action:execution:prepare      --workspace <uuid> --action <uuid>
 *   pnpm action:execution:prepare-live --workspace <uuid> --action <uuid>
 *   pnpm action:execution:show         --workspace <uuid> --session <uuid>
 *   pnpm action:execution:evidence     --workspace <uuid> --session <uuid>
 *   pnpm action:execution:cancel       --workspace <uuid> --session <uuid>
 *   pnpm action:execution:dry-run      --workspace <uuid> --action <uuid> [--scenario <name>]
 *
 * `prepare-live` is the ONLY command that opens a real browser: a STRICTLY
 * read-only prepare_only probe (opens the target, validates identity/comments/
 * duplicate/composer, then closes). It NEVER types or submits. There is NO
 * one-shot submit command here — a real submit requires an explicit executor
 * authorization that is deliberately not exposed as casual tooling (no Execute
 * Now surface). Under the safe defaults every `prepare`/`dry-run` returns BLOCKED
 * (kill switch on, writes off); `dry-run` is fake-only. Prints no secrets,
 * cookies, or profile paths.
 */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 ? process.argv[i + 1] : undefined;
}

function printSession(s: ExecutionSessionRecord): void {
  console.log(
    `  session=${s.id} job=${s.actionJobId} attempt=${s.attemptNumber} status=${s.status} ` +
      `adapter=${s.adapter} recovery=${s.recoveryState ?? '-'} error=${s.errorCode ?? '-'}`,
  );
}

async function main(): Promise<void> {
  loadDotenv();
  const command = process.argv[2];
  const workspaceId = arg('workspace');
  const actionId = arg('action');
  const sessionId = arg('session');
  const scenario = arg('scenario') as FakeScenario | undefined;

  const commands = ['prepare', 'prepare-live', 'show', 'evidence', 'cancel', 'dry-run'];
  if (!command || !commands.includes(command)) {
    console.error(`Usage: execution <${commands.join('|')}> --workspace <uuid> [...]`);
    process.exit(2);
  }
  if (!workspaceId || !UUID_RE.test(workspaceId)) {
    console.error('Refusing: --workspace must be a valid workspace UUID.');
    process.exit(2);
  }

  const env = loadApiEnv();
  const { pool, db } = createDb(env.DATABASE_URL);
  const store = new DrizzleStore(db);
  const actionRepo = new ActionRepository(store);
  const sessions = new ExecutionSessionRepository(store);
  const evidence = new ExecutionEvidenceRepository(store);

  // Real-browser wiring: one persistent Chromium profile per workspace, guarded
  // by the exclusive profile lock. Used only by prepare-live (read-only) and the
  // gated submit_once path — never under the safe defaults.
  const profiles = new ProfileService(env.BROWSER_PROFILE_ROOT);
  const commentPageFactory: CommentPageFactory = async ({ workspaceId: ws, targetUrl, mode }) => {
    const profileDir = await profiles.profileDirForDriver(ws);
    const { groupId, postId } = parsePostIdentity(targetUrl);
    const page = new PlaywrightCommentPage({
      profileDir,
      expectedGroupId: groupId,
      expectedPostId: postId,
      headless: true,
      navTimeoutMs: env.FACEBOOK_COMMENT_EXECUTION_TIMEOUT_MS,
    });
    // The adapter acquires this lock before browsing and releases it on close.
    void mode;
    const lock: ProfileLock = {
      acquire: () => profiles.acquireLock(ws),
      release: () => profiles.releaseLock(ws),
    };
    return { page, lock };
  };

  const coordinator = new ExecutionCoordinator({
    sessions,
    evidence,
    idempotency: new ActionIdempotencyRepository(store),
    executor: new ActionExecutor({
      sessions,
      evidence,
      verification: new ExecutionVerificationService(),
      env,
      logger: createLogger('info'),
    }),
    recovery: new ExecutionRecoveryPolicy(),
    actionRepo,
    actionQueue: new ActionQueue(actionRepo),
    env,
    logger: createLogger('info'),
    commentPageFactory,
  });

  let exitCode = 0;
  try {
    if (command === 'prepare' || command === 'dry-run') {
      if (!actionId || !UUID_RE.test(actionId)) {
        console.error('Refusing: --action must be a valid UUID.');
        process.exit(2);
      }
      const r = await coordinator.prepareExecution(workspaceId, actionId, {
        scenario,
        dryRun: command === 'dry-run',
      });
      console.log(`Execution ${command} → status=${r.status}`);
      if (r.blockedReasons?.length) console.log(`  blocked: ${r.blockedReasons.join('; ')}`);
      if (r.session) printSession(r.session);
    } else if (command === 'prepare-live') {
      if (!actionId || !UUID_RE.test(actionId)) {
        console.error('Refusing: --action must be a valid UUID.');
        process.exit(2);
      }
      const r = await coordinator.prepareOnly(workspaceId, actionId);
      console.log(
        `prepare_only → ready=${r.ok} targetMatches=${r.targetMatches} reason=${r.reasonCode ?? '-'}`,
      );
      console.log(
        `  observedPostKey=${r.observedPostKey ?? '-'} typed=${r.typed} submitted=${r.submitted}`,
      );
    } else if (command === 'show') {
      if (!sessionId || !UUID_RE.test(sessionId)) {
        console.error('Refusing: --session must be a valid UUID.');
        process.exit(2);
      }
      const d = await coordinator.getSessionDetail(workspaceId, sessionId);
      printSession(d.session);
      console.log(`  evidence: ${d.evidence.map((e) => e.evidenceType).join(', ') || '(none)'}`);
    } else if (command === 'evidence') {
      if (!sessionId || !UUID_RE.test(sessionId)) {
        console.error('Refusing: --session must be a valid UUID.');
        process.exit(2);
      }
      const items = await coordinator.listEvidence(workspaceId, sessionId);
      console.log(`${items.length} evidence record(s):`);
      for (const e of items) {
        console.log(
          `  ${e.evidenceType} hash=${e.evidenceHash ?? '-'} commentId=${e.facebookCommentId ?? '-'} key=${e.storageKey ?? '-'}`,
        );
      }
    } else {
      // cancel
      if (!sessionId || !UUID_RE.test(sessionId)) {
        console.error('Refusing: --session must be a valid UUID.');
        process.exit(2);
      }
      printSession(await coordinator.cancelSession(workspaceId, sessionId));
    }
  } catch (err) {
    if (err instanceof ExecutionError) console.error(`Error [${err.code}]: ${err.message}`);
    else console.error(`Error: ${(err as Error).message}`);
    exitCode = 1;
  } finally {
    await pool.end().catch(() => undefined);
  }

  process.exit(exitCode);
}

void main();
