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
import { FacebookConnectionService } from './connection-service';
import { FacebookErrorCode } from './errors';
import { FakeBrowserDriver } from '../testing/fake-driver';
import type { ConnectOutcome, ValidateOutcome } from './driver';

const roots: string[] = [];
afterEach(() => {
  for (const r of roots.splice(0)) rmSync(r, { recursive: true, force: true });
});

function makeService(opts: {
  login?: boolean;
  driver?: FakeBrowserDriver;
  profiles?: ProfileService;
}) {
  const store = new InMemoryStore();
  const root = mkdtempSync(join(tmpdir(), 'kmkt-svc-'));
  roots.push(root);
  const env = loadApiEnv({
    APP_ENV: 'test',
    BROWSER_PROFILE_ROOT: root,
    FACEBOOK_LOGIN_ENABLED: opts.login ? 'true' : 'false',
    FACEBOOK_CONNECT_TIMEOUT_MS: '1000',
    FACEBOOK_VALIDATE_TIMEOUT_MS: '1000',
  });
  const driver = opts.driver ?? new FakeBrowserDriver();
  const profiles = opts.profiles ?? new ProfileService(root);
  const audit = new AuditService(store);
  const service = new FacebookConnectionService({
    store,
    profiles,
    driver,
    audit,
    env,
    logger: createLogger('error'),
  });
  return { store, service, driver, root };
}

async function waitSettled(service: FacebookConnectionService, ws: string) {
  await service.waitForIdle(ws);
  return service.getStatus(ws);
}

describe('FacebookConnectionService — connection states', () => {
  it('starts as not_connected before any connection', async () => {
    const { service } = makeService({});
    const s = await service.getStatus(randomUUID());
    expect(s.connectionState).toBe('not_connected');
    expect(s.connected).toBe(false);
  });

  it('login-disabled: records validation_failed with LOGIN_DISABLED (no browser)', async () => {
    const { service, driver } = makeService({ login: false });
    const ws = randomUUID();
    await service.startConnection(ws);
    const s = await waitSettled(service, ws);
    expect(s.connectionState).toBe('validation_failed');
    expect(s.lastErrorCode).toBe(FacebookErrorCode.LOGIN_DISABLED);
    expect(driver.connectCalls).toBe(0); // no real browser invoked
  });

  it('successful connect → connected with display name', async () => {
    const { service, store } = makeService({
      login: true,
      driver: new FakeBrowserDriver({ connectOutcome: 'connected' }),
    });
    const ws = randomUUID();
    await service.startConnection(ws);
    const s = await waitSettled(service, ws);
    expect(s.connectionState).toBe('connected');
    expect(s.connected).toBe(true);
    expect(s.displayName).toBe('Test User');
    const events = await store.listAuditEventsByType('facebook_connection_succeeded');
    expect(events).toHaveLength(1);
  });

  const outcomeCases: Array<{ outcome: ConnectOutcome; state: string; code: string }> = [
    {
      outcome: 'checkpoint_required',
      state: 'checkpoint_required',
      code: FacebookErrorCode.CHECKPOINT_REQUIRED,
    },
    { outcome: 'blocked', state: 'validation_failed', code: FacebookErrorCode.ACCOUNT_BLOCKED },
    { outcome: 'timeout', state: 'reconnect_required', code: FacebookErrorCode.LOGIN_TIMEOUT },
    {
      outcome: 'login_required',
      state: 'reconnect_required',
      code: FacebookErrorCode.LOGIN_REQUIRED,
    },
  ];
  for (const c of outcomeCases) {
    it(`connect outcome ${c.outcome} → ${c.state}`, async () => {
      const { service } = makeService({
        login: true,
        driver: new FakeBrowserDriver({ connectOutcome: c.outcome }),
      });
      const ws = randomUUID();
      await service.startConnection(ws);
      const s = await waitSettled(service, ws);
      expect(s.connectionState).toBe(c.state);
      expect(s.lastErrorCode).toBe(c.code);
    });
  }

  it('browser launch failure → validation_failed / BROWSER_LAUNCH_FAILED', async () => {
    const { service } = makeService({
      login: true,
      driver: new FakeBrowserDriver({ throwOnConnect: 'browser_launch_failed: boom' }),
    });
    const ws = randomUUID();
    await service.startConnection(ws);
    const s = await waitSettled(service, ws);
    expect(s.connectionState).toBe('validation_failed');
    expect(s.lastErrorCode).toBe(FacebookErrorCode.BROWSER_LAUNCH_FAILED);
  });

  it('rejects a duplicate/concurrent connection start (concurrency one)', async () => {
    const { service } = makeService({
      login: true,
      driver: new FakeBrowserDriver({ connectDelayMs: 300 }),
    });
    const ws = randomUUID();
    await service.startConnection(ws); // occupies the single slot
    await expect(service.startConnection(ws)).rejects.toMatchObject({
      code: FacebookErrorCode.CONNECTION_ALREADY_RUNNING,
    });
    await waitSettled(service, ws);
  });

  const validateCases: Array<{ outcome: ValidateOutcome; state: string }> = [
    { outcome: 'connected', state: 'connected' },
    { outcome: 'login_required', state: 'reconnect_required' },
    { outcome: 'checkpoint_required', state: 'checkpoint_required' },
    { outcome: 'blocked', state: 'validation_failed' },
  ];
  for (const c of validateCases) {
    it(`validate outcome ${c.outcome} → ${c.state}`, async () => {
      const { service } = makeService({
        login: true,
        driver: new FakeBrowserDriver({ connectOutcome: 'connected', validateOutcome: c.outcome }),
      });
      const ws = randomUUID();
      await service.startConnection(ws);
      await waitSettled(service, ws);
      const s = await service.validateSession(ws);
      expect(s.connectionState).toBe(c.state);
    });
  }

  it('disconnect requires confirmation', async () => {
    const { service } = makeService({ login: true });
    const ws = randomUUID();
    await service.startConnection(ws);
    await waitSettled(service, ws);
    await expect(service.disconnect(ws, false)).rejects.toMatchObject({
      code: FacebookErrorCode.CONFIRMATION_REQUIRED,
    });
  });

  it('disconnect marks disconnected and cleans the profile', async () => {
    const { service, store, root } = makeService({ login: true });
    const ws = randomUUID();
    await service.startConnection(ws);
    await waitSettled(service, ws);
    const { status, cleanupFailed } = await service.disconnect(ws, true);
    expect(status.connectionState).toBe('disconnected');
    expect(cleanupFailed).toBe(false);
    void root;
    const events = await store.listAuditEventsByType('facebook_disconnected');
    expect(events).toHaveLength(1);
  });

  it('reports cleanup failure explicitly (no silent failure)', async () => {
    // ProfileService whose deleteProfile always fails.
    const root = mkdtempSync(join(tmpdir(), 'kmkt-fail-'));
    roots.push(root);
    class FailingProfiles extends ProfileService {
      override async deleteProfile(): Promise<void> {
        const { FacebookError, FacebookErrorCode: C } = await import('./errors');
        throw new FacebookError(C.PROFILE_CLEANUP_FAILED, 'boom');
      }
    }
    const { service, store } = makeService({ login: true, profiles: new FailingProfiles(root) });
    const ws = randomUUID();
    await service.startConnection(ws);
    await waitSettled(service, ws);
    const { cleanupFailed } = await service.disconnect(ws, true);
    expect(cleanupFailed).toBe(true);
    const s = await service.getStatus(ws);
    expect(s.cleanupRequired).toBe(true);
    expect(s.lastErrorCode).toBe(FacebookErrorCode.PROFILE_CLEANUP_FAILED);
    const events = await store.listAuditEventsByType('facebook_profile_cleanup_failed');
    expect(events).toHaveLength(1);
  });

  it('records a connection_started audit event with no secrets', async () => {
    const { service, store } = makeService({ login: true });
    const ws = randomUUID();
    await service.startConnection(ws);
    await waitSettled(service, ws);
    const started = await store.listAuditEventsByType('facebook_connection_started');
    expect(started).toHaveLength(1);
    const text = JSON.stringify(started[0]);
    expect(text).not.toMatch(/password|cookie|c_user/i);
  });
});
