import { loadApiEnv } from '../lib/env';
import { loadDotenv } from '../lib/load-dotenv';
import { createLogger } from '../lib/logger';
import { createDb } from '../db/client';
import { DrizzleStore } from '../store/drizzle-store';
import { AuditService } from '../lib/audit';
import { ProfileService } from '../facebook/profile';
import { CollectorRepository } from './repository';
import { PlaywrightCollectorBrowser } from './browser';
import { CollectorCoordinator } from './coordinator';
import { CollectorError } from './errors';

/**
 * Collector Worker CLI (SPRINT 006).
 *
 *   pnpm collector:run --workspace <uuid>
 *
 * READ-ONLY: opens groups, reads posts, normalizes, and stores Signals. It
 * never comments, messages, likes, shares, joins, or writes. Reading is gated
 * by FACEBOOK_READER_ENABLED (default off → no browser). Never prints
 * credentials, cookies, profile paths, or raw HTML.
 */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 ? process.argv[i + 1] : undefined;
}

async function main(): Promise<void> {
  loadDotenv();
  const workspaceId = arg('workspace');
  if (!workspaceId || !UUID_RE.test(workspaceId)) {
    console.error('Refusing: --workspace must be a valid workspace UUID.');
    process.exit(2);
  }

  const env = loadApiEnv();
  const { pool, db } = createDb(env.DATABASE_URL);
  const store = new DrizzleStore(db);
  const coordinator = new CollectorCoordinator({
    repo: new CollectorRepository(store),
    browser: new PlaywrightCollectorBrowser(),
    profiles: new ProfileService(env.BROWSER_PROFILE_ROOT),
    audit: new AuditService(store),
    env,
    logger: createLogger('info'),
  });

  let exitCode = 0;
  try {
    if (!env.FACEBOOK_READER_ENABLED) {
      console.log(
        'NOTE: FACEBOOK_READER_ENABLED is false; the collector will not launch a browser (reader-disabled result).',
      );
    }
    console.log(`Collecting for workspace ${workspaceId} (read-only, concurrency one)…`);
    await coordinator.start(workspaceId);
    await coordinator.waitForIdle(workspaceId);
    const status = await coordinator.status(workspaceId);
    const r = status.run;
    console.log(
      `  status=${r?.status} groups=${r?.groupsProcessed} posts=${r?.postsCollected} ` +
        `dupsSkipped=${r?.duplicatesSkipped} errors=${r?.errors} totalSignals=${status.totalSignals} ` +
        `note=${r?.errorSummary ?? '(none)'}`,
    );
    exitCode = r?.status === 'completed' ? 0 : r?.status === 'paused' ? 1 : 2;
  } catch (err) {
    if (err instanceof CollectorError) console.error(`Error [${err.code}]: ${err.message}`);
    else console.error(`Error: ${(err as Error).message}`);
    exitCode = 2;
  } finally {
    await pool.end().catch(() => undefined);
  }

  process.exit(exitCode);
}

void main();
