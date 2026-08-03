import { describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import { makeTestApp, sessionCookie, cookieHeader } from '../testing/harness';

type App = FastifyInstance;

const OPERATOR = 'ops@example.com';
const CSRF = { origin: 'http://localhost:3000' };

async function register(app: App, email: string): Promise<string> {
  const reg = await app.inject({
    method: 'POST',
    url: '/auth/register',
    payload: { email, password: 'correct horse 9' },
  });
  return sessionCookie(reg)!;
}

describe('health endpoints (public-safe)', () => {
  it('safety health reports execution intentionally disabled and leaks no secrets', async () => {
    const { app } = await makeTestApp();
    const res = await app.inject({ method: 'GET', url: '/health/safety' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.executionIntentionallyDisabled).toBe(true);
    expect(JSON.stringify(body)).not.toMatch(/password|cookie|token|DATABASE_URL|\/opt\//i);
    await app.close();
  });

  it('dependency health is 503 when the DB is down', async () => {
    const { app } = await makeTestApp({ dbHealth: async () => false });
    const res = await app.inject({ method: 'GET', url: '/health/dependencies' });
    expect(res.statusCode).toBe(503);
    await app.close();
  });

  it('queue and storage health respond without secrets', async () => {
    const { app } = await makeTestApp();
    for (const url of ['/health/queues', '/health/storage']) {
      const res = await app.inject({ method: 'GET', url });
      expect([200, 503]).toContain(res.statusCode);
      expect(JSON.stringify(res.json())).not.toMatch(/password|cookie|token/i);
    }
    await app.close();
  });
});

describe('operations API authorization', () => {
  it('rejects unauthenticated access', async () => {
    const { app } = await makeTestApp({ envOverrides: { OPERATIONS_OPERATOR_EMAILS: OPERATOR } });
    const res = await app.inject({ method: 'GET', url: '/operations/status' });
    expect(res.statusCode).toBe(401);
    await app.close();
  });

  it('rejects an authenticated NON-operator with 403', async () => {
    const { app } = await makeTestApp({ envOverrides: { OPERATIONS_OPERATOR_EMAILS: OPERATOR } });
    const token = await register(app, `${randomUUID().slice(0, 8)}@example.com`);
    const res = await app.inject({
      method: 'GET',
      url: '/operations/status',
      headers: cookieHeader(token),
    });
    expect(res.statusCode).toBe(403);
    await app.close();
  });

  it('allows an operator and returns a safe status payload', async () => {
    const { app } = await makeTestApp({ envOverrides: { OPERATIONS_OPERATOR_EMAILS: OPERATOR } });
    const token = await register(app, OPERATOR);
    const res = await app.inject({
      method: 'GET',
      url: '/operations/status',
      headers: cookieHeader(token),
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.mode).toBe('NORMAL');
    expect(JSON.stringify(body)).not.toMatch(/password|cookie|token|DATABASE_URL/i);
    await app.close();
  });
});

describe('maintenance mode', () => {
  it('enable requires reason + confirm, persists, and blocks protected work', async () => {
    const { app } = await makeTestApp({ envOverrides: { OPERATIONS_OPERATOR_EMAILS: OPERATOR } });
    const token = await register(app, OPERATOR);

    // Missing reason/confirm → 400.
    const bad = await app.inject({
      method: 'POST',
      url: '/operations/maintenance/enable',
      headers: { ...cookieHeader(token), ...CSRF },
      payload: {},
    });
    expect(bad.statusCode).toBe(400);

    const ok = await app.inject({
      method: 'POST',
      url: '/operations/maintenance/enable',
      headers: { ...cookieHeader(token), ...CSRF },
      payload: { reason: 'planned window', confirm: true },
    });
    expect(ok.statusCode).toBe(200);
    expect(ok.json().maintenance.enabled).toBe(true);

    // A work-initiating POST is now rejected with 503.
    const blocked = await app.inject({
      method: 'POST',
      url: '/collector/start',
      headers: { ...cookieHeader(token), ...CSRF },
    });
    expect(blocked.statusCode).toBe(503);
    expect(blocked.json().error.code).toBe('maintenance_mode');

    // Health still works.
    const health = await app.inject({ method: 'GET', url: '/health/safety' });
    expect(health.statusCode).toBe(200);
    await app.close();
  });
});

describe('incident lockdown', () => {
  it('blocks Facebook operations and overrides write flags', async () => {
    const { app } = await makeTestApp({
      envOverrides: {
        OPERATIONS_OPERATOR_EMAILS: OPERATOR,
        // Even with writes enabled, lockdown must force them off.
        ACTION_ENGINE_ENABLED: 'true',
        FACEBOOK_WRITE_ACTION_ENABLED: 'true',
        GLOBAL_KILL_SWITCH: 'false',
      },
    });
    const token = await register(app, OPERATOR);

    const enable = await app.inject({
      method: 'POST',
      url: '/operations/lockdown/enable',
      headers: { ...cookieHeader(token), ...CSRF },
      payload: { reason: 'incident 42', confirm: true },
    });
    expect(enable.statusCode).toBe(200);
    expect(enable.json().lockdown.enabled).toBe(true);

    // A Facebook-touching endpoint is blocked with 423.
    const blocked = await app.inject({
      method: 'POST',
      url: '/facebook/connect/start',
      headers: { ...cookieHeader(token), ...CSRF },
    });
    expect(blocked.statusCode).toBe(423);
    expect(blocked.json().error.code).toBe('incident_lockdown');

    // Safety health now reports effective write flags forced off.
    const safety = await app.inject({ method: 'GET', url: '/health/safety' });
    expect(safety.json().flags.facebookWriteEnabled).toBe(false);
    expect(safety.json().flags.killSwitchOn).toBe(true);

    // Unlock requires confirm + reason.
    const unlock = await app.inject({
      method: 'POST',
      url: '/operations/lockdown/disable',
      headers: { ...cookieHeader(token), ...CSRF },
      payload: { reason: 'resolved', confirm: true },
    });
    expect(unlock.statusCode).toBe(200);
    expect(unlock.json().lockdown.enabled).toBe(false);
    await app.close();
  });
});
