import { loadApiEnv } from '../lib/env';
import { loadDotenv } from '../lib/load-dotenv';
import { createLogger } from '../lib/logger';
import { createDb } from '../db/client';
import { DrizzleStore } from '../store/drizzle-store';
import { AuditService } from '../lib/audit';
import { ProfileService } from './profile';
import { PlaywrightBrowserDriver } from './driver';
import { FacebookConnectionService, type SafeFacebookStatus } from './connection-service';
import { FacebookError } from './errors';

/**
 * Operator-assisted Facebook connection CLI (SPRINT 004).
 *
 * Commands: connect | validate | disconnect | status  (one workspace at a time).
 * Safety: refuses invalid workspace ids; concurrency one; NEVER prints
 * credentials, cookies, or absolute profile paths; times out safely; performs
 * NO scanning and NO commenting.
 *
 *   pnpm facebook:connect    --workspace <uuid>
 *   pnpm facebook:validate   --workspace <uuid>
 *   pnpm facebook:disconnect --workspace <uuid> --confirm
 *   pnpm facebook:status     --workspace <uuid>
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 ? process.argv[i + 1] : undefined;
}
function hasFlag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

/** Print a safe status summary. Never includes paths, cookies, or secrets. */
function printStatus(s: SafeFacebookStatus): void {
  const lines = [
    `  connected:        ${s.connected}`,
    `  status:           ${s.status}`,
    `  connectionState:  ${s.connectionState}`,
    `  displayName:      ${s.displayName ?? '(none)'}`,
    `  lastValidatedAt:  ${s.lastValidatedAt ?? '(never)'}`,
    `  lastErrorCode:    ${s.lastErrorCode ?? '(none)'}`,
    `  lastErrorMessage: ${s.lastErrorMessage ?? '(none)'}`,
    `  actionRequired:   ${s.userActionRequired ?? '(none)'}`,
    `  cleanupRequired:  ${s.cleanupRequired}`,
  ];
  console.log(lines.join('\n'));
}

/** Exit code from a terminal connection state. */
function exitCodeFor(s: SafeFacebookStatus): number {
  if (s.connectionState === 'connected') return 0;
  if (
    s.connectionState === 'checkpoint_required' ||
    s.connectionState === 'reconnect_required' ||
    s.connectionState === 'validation_failed'
  ) {
    return 1;
  }
  return 0;
}

async function main(): Promise<void> {
  loadDotenv();
  const command = process.argv[2];
  const workspaceId = arg('workspace');

  if (!command || !['connect', 'validate', 'disconnect', 'status'].includes(command)) {
    console.error(
      'Usage: facebook <connect|validate|disconnect|status> --workspace <uuid> [--confirm]',
    );
    process.exit(2);
  }
  if (!workspaceId || !UUID_RE.test(workspaceId)) {
    console.error('Refusing: --workspace must be a valid workspace UUID.');
    process.exit(2);
  }

  const env = loadApiEnv();
  const logger = createLogger('info');
  const { pool, db } = createDb(env.DATABASE_URL);
  const store = new DrizzleStore(db);
  const service = new FacebookConnectionService({
    store,
    profiles: new ProfileService(env.BROWSER_PROFILE_ROOT),
    driver: new PlaywrightBrowserDriver(),
    audit: new AuditService(store),
    env,
    logger,
  });

  let exitCode = 0;
  try {
    if (command === 'status') {
      const s = await service.getStatus(workspaceId);
      console.log(`Facebook connection status for workspace ${workspaceId}:`);
      printStatus(s);
      exitCode = 0;
    } else if (command === 'connect') {
      if (!env.FACEBOOK_LOGIN_ENABLED) {
        console.log(
          'NOTE: FACEBOOK_LOGIN_ENABLED is false. No browser will launch; the connection will be ' +
            'recorded as login-disabled. Set FACEBOOK_LOGIN_ENABLED=true in your local .env to run the ' +
            'operator-assisted browser login.',
        );
      }
      console.log(
        `Starting connection for workspace ${workspaceId} (concurrency one, no scanning)…`,
      );
      await service.startConnection(workspaceId);
      // Await the tracked background task deterministically (bounded by its own timeout).
      await service.waitForIdle(workspaceId);
      const s = await service.getStatus(workspaceId);
      printStatus(s);
      exitCode = exitCodeFor(s);
    } else if (command === 'validate') {
      console.log(`Validating session for workspace ${workspaceId} (no scanning, no writing)…`);
      const s = await service.validateSession(workspaceId);
      printStatus(s);
      exitCode = exitCodeFor(s);
    } else {
      // disconnect
      if (!hasFlag('confirm')) {
        console.error('Refusing: disconnect requires explicit --confirm.');
        exitCode = 2;
      } else {
        const { status, cleanupFailed } = await service.disconnect(workspaceId, true);
        printStatus(status);
        if (cleanupFailed) {
          console.error('WARNING: profile cleanup failed — manual cleanup required.');
          exitCode = 5;
        } else {
          console.log('Disconnected and profile cleaned.');
          exitCode = 0;
        }
      }
    }
  } catch (err) {
    if (err instanceof FacebookError) {
      console.error(`Error [${err.code}]: ${err.message}`);
    } else {
      console.error(`Error: ${(err as Error).message}`);
    }
    exitCode = 2;
  } finally {
    await pool.end().catch(() => undefined);
  }

  process.exit(exitCode);
}

void main();
