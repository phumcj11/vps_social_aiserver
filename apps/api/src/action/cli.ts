import { loadApiEnv } from '../lib/env';
import { loadDotenv } from '../lib/load-dotenv';
import { createLogger } from '../lib/logger';
import { createDb } from '../db/client';
import { DrizzleStore } from '../store/drizzle-store';
import { ActionRepository } from './repository';
import { ActionQueue } from './queue';
import { ActionCoordinator } from './coordinator';
import { ActionError } from './errors';
import type { ActionJobRecord, ActionType } from '../store/types';

/**
 * Action Queue CLI (SPRINT 011).
 *
 *   pnpm action:create   --workspace <uuid> --review <uuid> --type facebook_comment
 *   pnpm action:list     --workspace <uuid>
 *   pnpm action:show     --workspace <uuid> --action <uuid>
 *   pnpm action:cancel   --workspace <uuid> --action <uuid>
 *   pnpm action:retry    --workspace <uuid> --action <uuid>
 *   pnpm action:recheck  --workspace <uuid> --action <uuid>
 *
 * A SAFE BOUNDARY only: it NEVER executes Facebook, NEVER runs a worker, and
 * NEVER prints secrets or profile paths. Under current defaults every job is
 * BLOCKED. Returns useful exit codes.
 */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 ? process.argv[i + 1] : undefined;
}

function printJob(j: ActionJobRecord): void {
  console.log(
    `  action=${j.id} type=${j.actionType} status=${j.status} platform=${j.targetPlatform} ` +
      `attempts=${j.attemptCount}/${j.maxAttempts} url=${j.targetUrl}`,
  );
  console.log(`  approvedContent: ${j.approvedContent}`);
}

async function main(): Promise<void> {
  loadDotenv();
  const command = process.argv[2];
  const workspaceId = arg('workspace');
  const reviewId = arg('review');
  const actionId = arg('action');
  const type = (arg('type') ?? 'facebook_comment') as ActionType;

  if (!command || !['create', 'list', 'show', 'cancel', 'retry', 'recheck'].includes(command)) {
    console.error('Usage: action <create|list|show|cancel|retry|recheck> --workspace <uuid> [...]');
    process.exit(2);
  }
  if (!workspaceId || !UUID_RE.test(workspaceId)) {
    console.error('Refusing: --workspace must be a valid workspace UUID.');
    process.exit(2);
  }

  const env = loadApiEnv();
  const { pool, db } = createDb(env.DATABASE_URL);
  const store = new DrizzleStore(db);
  const repo = new ActionRepository(store);
  const coordinator = new ActionCoordinator({
    repo,
    queue: new ActionQueue(repo),
    env,
    logger: createLogger('info'),
  });

  let exitCode = 0;
  try {
    if (command === 'create') {
      if (!reviewId || !UUID_RE.test(reviewId)) {
        console.error('Refusing: --review must be a valid UUID.');
        process.exit(2);
      }
      const { job, policy } = await coordinator.createFromReview(workspaceId, reviewId, type);
      console.log(`Created action (policy=${policy.outcome}):`);
      printJob(job);
    } else if (command === 'list') {
      const jobs = await coordinator.listActions(workspaceId);
      console.log(`${jobs.length} action job(s):`);
      for (const j of jobs) printJob(j);
    } else if (command === 'show') {
      if (!actionId || !UUID_RE.test(actionId)) {
        console.error('Refusing: --action must be a valid UUID.');
        process.exit(2);
      }
      const detail = await coordinator.getDetail(workspaceId, actionId);
      printJob(detail.job);
      console.log(`  events: ${detail.events.map((e) => e.event).join(', ')}`);
    } else if (command === 'cancel') {
      if (!actionId || !UUID_RE.test(actionId)) {
        console.error('Refusing: --action must be a valid UUID.');
        process.exit(2);
      }
      printJob(await coordinator.cancel(workspaceId, actionId));
    } else if (command === 'retry') {
      if (!actionId || !UUID_RE.test(actionId)) {
        console.error('Refusing: --action must be a valid UUID.');
        process.exit(2);
      }
      printJob(await coordinator.retry(workspaceId, actionId));
    } else {
      // recheck
      if (!actionId || !UUID_RE.test(actionId)) {
        console.error('Refusing: --action must be a valid UUID.');
        process.exit(2);
      }
      const { job, policy } = await coordinator.recheckPolicy(workspaceId, actionId);
      console.log(`Rechecked (policy=${policy.outcome}):`);
      printJob(job);
    }
  } catch (err) {
    if (err instanceof ActionError) console.error(`Error [${err.code}]: ${err.message}`);
    else console.error(`Error: ${(err as Error).message}`);
    exitCode = 1;
  } finally {
    await pool.end().catch(() => undefined);
  }

  process.exit(exitCode);
}

void main();
