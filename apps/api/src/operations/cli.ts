import { loadApiEnv } from '../lib/env';
import { loadDotenv } from '../lib/load-dotenv';
import { createLogger } from '../lib/logger';
import { createDb } from '../db/client';
import { DrizzleStore } from '../store/drizzle-store';
import { AuditService } from '../lib/audit';
import { OperationalStateStore } from './state';
import { OperationsService } from './service';

/**
 * Maintenance / Incident-Lockdown CLI (SPRINT 013).
 *
 *   pnpm maintenance:enable  --operator <email> --reason "<why>" --yes
 *   pnpm maintenance:disable --operator <email> --reason "<why>" --yes
 *   pnpm maintenance:status
 *   pnpm incident:lockdown   --operator <email> --reason "<why>" --yes
 *   pnpm incident:unlock     --operator <email> --reason "<why>" --yes
 *   pnpm incident:status
 *
 * State is persisted to a file and survives restart. Every change is audited.
 * Enabling/disabling requires an explicit --yes confirmation and a reason.
 * NEVER contacts Facebook, launches a browser, or prints secrets.
 */
function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 ? process.argv[i + 1] : undefined;
}
function hasFlag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

async function main(): Promise<void> {
  loadDotenv();
  const command = process.argv[2];
  const commands = [
    'maintenance:enable',
    'maintenance:disable',
    'maintenance:status',
    'incident:lockdown',
    'incident:unlock',
    'incident:status',
  ];
  if (!command || !commands.includes(command)) {
    console.error(`Usage: ops <${commands.join('|')}> [--operator <email> --reason "<why>" --yes]`);
    process.exit(2);
  }

  const env = loadApiEnv();
  const stateStore = new OperationalStateStore(env.OPERATIONS_STATE_FILE);

  // Status commands never need the DB.
  if (command === 'maintenance:status' || command === 'incident:status') {
    const state = await stateStore.read();
    const mode = command.startsWith('maintenance') ? state.maintenance : state.lockdown;
    console.log(
      `${command.split(':')[0]}: ${mode.enabled ? 'ENABLED' : 'disabled'}` +
        (mode.enabled
          ? ` since=${mode.since} operator=${mode.operator} reason=${mode.reason}`
          : ''),
    );
    process.exit(0);
  }

  const operator = arg('operator');
  const reason = arg('reason');
  if (!operator || !operator.includes('@')) {
    console.error('Refusing: --operator must be a valid email.');
    process.exit(2);
  }
  if (!reason || reason.trim().length < 3) {
    console.error('Refusing: --reason is required.');
    process.exit(2);
  }
  if (!hasFlag('yes')) {
    console.error('Refusing: this changes runtime state. Re-run with --yes to confirm.');
    process.exit(2);
  }

  const { pool, db } = createDb(env.DATABASE_URL);
  const store = new DrizzleStore(db);
  const service = new OperationsService({
    store,
    env,
    audit: new AuditService(store),
    stateStore,
    logger: createLogger('info'),
  });

  let exitCode = 0;
  try {
    if (command === 'maintenance:enable') {
      await service.setMaintenance(true, operator, reason);
      console.log('Maintenance mode ENABLED.');
    } else if (command === 'maintenance:disable') {
      await service.setMaintenance(false, operator, reason);
      console.log('Maintenance mode disabled.');
    } else if (command === 'incident:lockdown') {
      await service.setLockdown(true, operator, reason);
      console.log(
        'Incident lockdown ENABLED. All Facebook access is blocked; write flags forced off.',
      );
    } else if (command === 'incident:unlock') {
      await service.setLockdown(false, operator, reason);
      console.log('Incident lockdown disabled.');
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
