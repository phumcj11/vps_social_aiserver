import { describe, expect, it, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { OperationalStateStore } from './state';

const dirs: string[] = [];
function tmpStateFile(): string {
  const d = mkdtempSync(join(tmpdir(), 'kmkt-ops-'));
  dirs.push(d);
  return join(d, 'ops-state.json');
}
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

describe('OperationalStateStore', () => {
  it('defaults to no mode engaged when the file is missing', async () => {
    const store = new OperationalStateStore(tmpStateFile());
    const state = await store.read();
    expect(state.maintenance.enabled).toBe(false);
    expect(state.lockdown.enabled).toBe(false);
  });

  it('persists maintenance across a fresh store instance (survives restart)', async () => {
    const file = tmpStateFile();
    const a = new OperationalStateStore(file, () => new Date('2026-08-03T00:00:00Z'));
    await a.setMaintenance(true, 'ops@example.com', 'db migration');
    // A brand-new instance reading the same file simulates a process restart.
    const b = new OperationalStateStore(file);
    expect(await b.isMaintenance()).toBe(true);
    const state = await b.read();
    expect(state.maintenance.operator).toBe('ops@example.com');
    expect(state.maintenance.reason).toBe('db migration');
    expect(state.maintenance.since).toBe('2026-08-03T00:00:00.000Z');
  });

  it('records an audit history for every transition', async () => {
    const store = new OperationalStateStore(tmpStateFile());
    await store.setLockdown(true, 'ops@example.com', 'incident');
    await store.setLockdown(false, 'ops@example.com', 'resolved');
    const state = await store.read();
    const lockdownHistory = state.history.filter((h) => h.mode === 'lockdown');
    expect(lockdownHistory.map((h) => h.action)).toEqual(['enable', 'disable']);
  });

  it('clears operator/since/reason on disable', async () => {
    const store = new OperationalStateStore(tmpStateFile());
    await store.setMaintenance(true, 'ops@example.com', 'x');
    const state = await store.setMaintenance(false, 'ops@example.com', 'done');
    expect(state.maintenance.enabled).toBe(false);
    expect(state.maintenance.since).toBeNull();
    expect(state.maintenance.operator).toBeNull();
  });

  it('recovers safely from a corrupt state file', async () => {
    const file = tmpStateFile();
    const store = new OperationalStateStore(file);
    await store.setMaintenance(true, 'ops@example.com', 'x');
    const { writeFileSync } = await import('node:fs');
    writeFileSync(file, '{ not valid json');
    const fresh = new OperationalStateStore(file);
    // Corrupt → safe default (no mode engaged), never a throw.
    expect(await fresh.isMaintenance()).toBe(false);
  });
});
