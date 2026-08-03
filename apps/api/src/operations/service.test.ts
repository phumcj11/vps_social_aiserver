import { describe, expect, it, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { InMemoryStore } from '../store/memory';
import { loadApiEnv, type ApiEnv } from '../lib/env';
import { createLogger } from '../lib/logger';
import { AuditService } from '../lib/audit';
import { OperationalStateStore } from './state';
import { OperationsService } from './service';

const logger = createLogger('error');
const dirs: string[] = [];
function tmpFile(): string {
  const d = mkdtempSync(join(tmpdir(), 'kmkt-ops-'));
  dirs.push(d);
  return join(d, 'ops-state.json');
}
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

function makeService(opts: { env?: ApiEnv; dbHealth?: () => Promise<boolean> } = {}) {
  const store = new InMemoryStore();
  const env = opts.env ?? loadApiEnv({ OPERATIONS_OPERATOR_EMAILS: 'ops@example.com' });
  const stateStore = new OperationalStateStore(tmpFile());
  const service = new OperationsService({
    store,
    env,
    audit: new AuditService(store),
    stateStore,
    logger,
    dbHealth: opts.dbHealth,
  });
  return { service, store, env, stateStore };
}

describe('OperationsService health', () => {
  it('reports execution intentionally disabled under safe defaults', async () => {
    const { service } = makeService();
    const s = await service.safetyHealth();
    expect(s.executionIntentionallyDisabled).toBe(true);
    expect(s.flags.killSwitchOn).toBe(true);
    expect(s.flags.adapter).toBe('fake');
  });

  it('readiness is false when the DB is down', async () => {
    const { service } = makeService({ dbHealth: async () => false });
    const r = await service.readiness();
    expect(r.ready).toBe(false);
    expect(r.dependencies.database).toBe('down');
  });

  it('readiness is false during maintenance even with a healthy DB', async () => {
    const { service } = makeService({ dbHealth: async () => true });
    await service.setMaintenance(true, 'ops@example.com', 'window');
    const r = await service.readiness();
    expect(r.ready).toBe(false);
  });

  it('dependency health is down when the DB is unreachable', async () => {
    const { service } = makeService({ dbHealth: async () => false });
    const d = await service.dependencyHealth();
    expect(d.status).toBe('down');
  });

  it('queue health flags ambiguous executions as a warning', async () => {
    const { service, store } = makeService();
    // Seed an ambiguous execution session directly.
    const s = await store.createExecutionSession({
      id: '11111111-1111-1111-1111-111111111111',
      workspaceId: '22222222-2222-2222-2222-222222222222',
      actionJobId: '33333333-3333-3333-3333-333333333333',
      attemptNumber: 1,
      adapter: 'fake',
      browserProfileKey: null,
    });
    await store.updateExecutionSession(s.id, { status: 'ambiguous' });
    const q = await service.queueHealth();
    const amb = q.checks.find((c) => c.name === 'ambiguous_executions');
    expect(amb?.level).toBe('WARNING');
    expect(q.status).toBe('degraded');
  });
});

describe('OperationsService modes', () => {
  it('maintenance requires a reason and updates effective state', async () => {
    const { service } = makeService();
    await expect(service.setMaintenance(true, 'ops@example.com', '')).rejects.toThrow();
    await service.setMaintenance(true, 'ops@example.com', 'planned window');
    expect(await service.effective()).toMatchObject({ maintenance: true });
  });

  it('lockdown makes effective safety fully disabled', async () => {
    const env = loadApiEnv({
      ACTION_ENGINE_ENABLED: 'true',
      FACEBOOK_WRITE_ACTION_ENABLED: 'true',
      GLOBAL_KILL_SWITCH: 'false',
      OPERATIONS_OPERATOR_EMAILS: 'ops@example.com',
    });
    const { service } = makeService({ env });
    await service.setLockdown(true, 'ops@example.com', 'incident 42');
    const eff = await service.effective();
    expect(eff.lockdown).toBe(true);
    expect(eff.killSwitchOn).toBe(true);
    expect(eff.facebookWriteEnabled).toBe(false);
  });

  it('status never leaks secrets and reports a coarse readiness level', async () => {
    const { service } = makeService();
    const status = await service.status();
    const json = JSON.stringify(status);
    expect(json).not.toMatch(/password|cookie|token|DATABASE_URL/i);
    expect(status.mode).toBe('NORMAL');
    expect(status.readinessLevel).toBe('LEVEL_1_INTERNAL_FAKE_EXECUTION');
  });
});
