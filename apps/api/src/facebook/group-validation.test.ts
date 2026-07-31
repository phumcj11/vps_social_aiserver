import { describe, expect, it, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { InMemoryStore } from '../store/memory';
import { loadApiEnv } from '../lib/env';
import { createLogger } from '../lib/logger';
import { AuditService } from '../lib/audit';
import { ProfileService } from './profile';
import { GroupValidationService } from './group-validation';
import { FacebookErrorCode } from './errors';
import { FakeBrowserDriver } from '../testing/fake-driver';
import type { GroupValidateOutcome } from './driver';

const roots: string[] = [];
afterEach(() => {
  for (const r of roots.splice(0)) rmSync(r, { recursive: true, force: true });
});

async function setup(opts: { login?: boolean; connected?: boolean; driver?: FakeBrowserDriver }) {
  const store = new InMemoryStore();
  const root = mkdtempSync(join(tmpdir(), 'kmkt-grp-'));
  roots.push(root);
  const env = loadApiEnv({
    APP_ENV: 'test',
    BROWSER_PROFILE_ROOT: root,
    FACEBOOK_LOGIN_ENABLED: opts.login ? 'true' : 'false',
    FACEBOOK_VALIDATE_TIMEOUT_MS: '1000',
  });
  const driver = opts.driver ?? new FakeBrowserDriver();
  const service = new GroupValidationService({
    store,
    profiles: new ProfileService(root),
    driver,
    audit: new AuditService(store),
    env,
    logger: createLogger('error'),
  });
  const workspaceId = randomUUID();
  if (opts.connected !== false) {
    const acc = await store.createFacebookConnection({
      id: randomUUID(),
      workspaceId,
      profilePath: `${workspaceId}/facebook`,
    });
    await store.updateFacebookIdentity(acc.id, {
      displayName: 'User',
      facebookUserId: '1',
      sessionExpiresAt: null,
    });
  }
  const group = await store.createFacebookGroup({
    id: randomUUID(),
    workspaceId,
    facebookGroupId: '123456789',
    canonicalUrl: 'https://www.facebook.com/groups/123456789',
    originalUrl: 'https://www.facebook.com/groups/123456789',
  });
  return { store, service, driver, workspaceId, group };
}

describe('GroupValidationService', () => {
  it('login-disabled: validation_failed with LOGIN_DISABLED and no browser', async () => {
    const { service, driver, workspaceId, group } = await setup({ login: false });
    const s = await service.validateGroupAccess(workspaceId, group.id);
    expect(s.accessState).toBe('validation_failed');
    expect(s.lastErrorCode).toBe(FacebookErrorCode.LOGIN_DISABLED);
    expect(driver.groupValidateCalls).toBe(0);
  });

  it('no connected session: login_required and no browser', async () => {
    const { service, driver, workspaceId, group } = await setup({ login: true, connected: false });
    const s = await service.validateGroupAccess(workspaceId, group.id);
    expect(s.accessState).toBe('login_required');
    expect(s.lastErrorCode).toBe(FacebookErrorCode.SESSION_NOT_CONNECTED);
    expect(driver.groupValidateCalls).toBe(0);
  });

  const cases: Array<{ outcome: GroupValidateOutcome; state: string }> = [
    { outcome: 'accessible', state: 'accessible' },
    { outcome: 'inaccessible', state: 'inaccessible' },
    { outcome: 'login_required', state: 'login_required' },
    { outcome: 'checkpoint_required', state: 'checkpoint_required' },
    { outcome: 'not_found', state: 'not_found' },
    { outcome: 'validation_failed', state: 'validation_failed' },
  ];
  for (const c of cases) {
    it(`maps driver outcome ${c.outcome} → ${c.state} (connection-only: no scan/comment)`, async () => {
      const { service, driver, workspaceId, group } = await setup({
        login: true,
        driver: new FakeBrowserDriver({ groupOutcome: c.outcome }),
      });
      const s = await service.validateGroupAccess(workspaceId, group.id);
      expect(s.accessState).toBe(c.state);
      // Only group-access validation was called — never a scan/read/write path.
      expect(driver.groupValidateCalls).toBe(1);
      expect(driver.connectCalls).toBe(0);
      expect(driver.validateCalls).toBe(0);
    });
  }

  it('accessible: persists safe group name and facebook id', async () => {
    const { service, workspaceId, group } = await setup({
      login: true,
      driver: new FakeBrowserDriver({ groupOutcome: 'accessible' }),
    });
    const s = await service.validateGroupAccess(workspaceId, group.id);
    expect(s.name).toBe('Test Group');
    expect(s.facebookGroupId).toBe('123456789');
    expect(s.lastValidatedAt).not.toBeNull();
  });

  it('browser launch failure → validation_failed / BROWSER_LAUNCH_FAILED', async () => {
    const { service, workspaceId, group } = await setup({
      login: true,
      driver: new FakeBrowserDriver({ throwOnGroup: 'browser_launch_failed: boom' }),
    });
    const s = await service.validateGroupAccess(workspaceId, group.id);
    expect(s.accessState).toBe('validation_failed');
    expect(s.lastErrorCode).toBe(FacebookErrorCode.BROWSER_LAUNCH_FAILED);
  });

  it('retries once on a transient navigation failure, then succeeds', async () => {
    const driver = new FakeBrowserDriver({
      throwOnGroupOnce: 'nav timeout',
      groupOutcome: 'accessible',
    });
    const { service, workspaceId, group } = await setup({ login: true, driver });
    const s = await service.validateGroupAccess(workspaceId, group.id);
    expect(s.accessState).toBe('accessible');
    expect(driver.groupValidateCalls).toBe(2); // one retry
  });

  it('records audit events with no secrets', async () => {
    const { service, store, workspaceId, group } = await setup({
      login: true,
      driver: new FakeBrowserDriver({ groupOutcome: 'accessible' }),
    });
    await service.validateGroupAccess(workspaceId, group.id);
    const started = await store.listAuditEventsByType('facebook_group_validation_started');
    const ok = await store.listAuditEventsByType('facebook_group_accessible');
    expect(started).toHaveLength(1);
    expect(ok).toHaveLength(1);
    const text = JSON.stringify([...started, ...ok]);
    expect(text).not.toMatch(/password|cookie|profile_path|\/tmp\//i);
  });

  it('rejects a group from another workspace (ownership)', async () => {
    const { service, group } = await setup({ login: true });
    await expect(service.validateGroupAccess(randomUUID(), group.id)).rejects.toMatchObject({
      code: FacebookErrorCode.GROUP_NOT_FOUND,
    });
  });
});
