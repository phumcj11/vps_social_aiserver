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
import { ExecutionCoordinator } from './coordinator';
import { ExecutionError } from './errors';
import type { FakeScenario } from './fake-adapter';
import type { ExecutionSessionRecord } from '../store/types';

/**
 * Safe Execution CLI (SPRINT 012).
 *
 *   pnpm action:execution:prepare  --workspace <uuid> --action <uuid>
 *   pnpm action:execution:show     --workspace <uuid> --session <uuid>
 *   pnpm action:execution:evidence --workspace <uuid> --session <uuid>
 *   pnpm action:execution:cancel   --workspace <uuid> --session <uuid>
 *   pnpm action:execution:dry-run  --workspace <uuid> --action <uuid> [--scenario <name>]
 *
 * NEVER performs a real Facebook write. Under the safe defaults every prepare/
 * dry-run returns BLOCKED (kill switch on, writes off). `dry-run` is fake-only.
 * Prints no secrets, cookies, or profile paths.
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

  const commands = ['prepare', 'show', 'evidence', 'cancel', 'dry-run'];
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
