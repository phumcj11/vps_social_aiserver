import { loadApiEnv } from '../lib/env';
import { loadDotenv } from '../lib/load-dotenv';
import { createDb } from '../db/client';
import { DrizzleStore } from '../store/drizzle-store';
import { ProfileService } from './profile';

/**
 * Browser-profile diagnostics CLI (SPRINT 013).
 *
 *   pnpm facebook:profile:status --workspace <uuid>
 *   pnpm facebook:profile:verify --workspace <uuid>
 *
 * Reports ONLY safe status: whether a profile exists, whether it is locked (and
 * for how long), and the connection state from the database. It NEVER prints
 * cookies, localStorage, profile paths, or any credential. `verify` additionally
 * flags a stale lock and a reconnect-required state.
 */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 ? process.argv[i + 1] : undefined;
}

async function main(): Promise<void> {
  loadDotenv();
  const command = process.argv[2];
  const workspaceId = arg('workspace');
  if (command !== 'status' && command !== 'verify') {
    console.error('Usage: facebook:profile <status|verify> --workspace <uuid>');
    process.exit(2);
  }
  if (!workspaceId || !UUID_RE.test(workspaceId)) {
    console.error('Refusing: --workspace must be a valid workspace UUID.');
    process.exit(2);
  }

  const env = loadApiEnv();
  const { pool, db } = createDb(env.DATABASE_URL);
  const store = new DrizzleStore(db);
  const profiles = new ProfileService(env.BROWSER_PROFILE_ROOT);

  let exitCode = 0;
  try {
    const account = await store.getFacebookAccountByWorkspace(workspaceId);
    const status = await profiles.profileStatus(workspaceId);
    // SAFE fields only — no path, no cookies, no session material.
    console.log(`workspace=${workspaceId}`);
    console.log(
      `  connection=${account?.connectionState ?? 'none'} status=${account?.status ?? 'none'}`,
    );
    console.log(
      `  profileExists=${status.exists} locked=${status.locked} lockAgeSeconds=${status.lockAgeSeconds ?? '-'}`,
    );

    if (command === 'verify') {
      const staleLock =
        status.locked &&
        status.lockAgeSeconds !== null &&
        status.lockAgeSeconds * 1000 > env.FACEBOOK_COMMENT_EXECUTION_TIMEOUT_MS;
      const reconnectRequired = account?.connectionState === 'reconnect_required';
      if (staleLock) {
        console.log(
          '  WARN: stale profile lock — an execution may have crashed; investigate before reuse.',
        );
        exitCode = 1;
      }
      if (reconnectRequired) {
        console.log(
          '  WARN: reconnect_required — operator must reconnect this account (default recovery).',
        );
        exitCode = 1;
      }
      if (!staleLock && !reconnectRequired) console.log('  OK: profile healthy.');
    }
  } catch (err) {
    console.error(`Error: ${(err as Error).message}`);
    exitCode = 1;
  } finally {
    await pool.end().catch(() => undefined);
  }
  process.exit(exitCode);
}

void main();
