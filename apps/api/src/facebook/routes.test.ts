import { describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import { makeTestApp, sessionCookie, cookieHeader, type TestAppOptions } from '../testing/harness';
import { FakeBrowserDriver } from '../testing/fake-driver';
import { InMemoryStore } from '../store/memory';

type App = FastifyInstance;

async function withWorkspace(app: App, email: string): Promise<string> {
  const reg = await app.inject({
    method: 'POST',
    url: '/auth/register',
    payload: { email, password: 'correct horse 9' },
  });
  const token = sessionCookie(reg)!;
  await app.inject({
    method: 'POST',
    url: '/workspaces',
    headers: cookieHeader(token),
    payload: { name: `${email} ws` },
  });
  return token;
}

async function pollStatus(app: App, token: string) {
  for (let i = 0; i < 50; i += 1) {
    const res = await app.inject({
      method: 'GET',
      url: '/facebook/connect/status',
      headers: cookieHeader(token),
    });
    const status = res.json().status;
    if (status.connectionState !== 'connecting') return status;
    await new Promise((r) => setTimeout(r, 20));
  }
  throw new Error('status never settled');
}

function connectedApp() {
  const opts: TestAppOptions = {
    facebookLoginEnabled: true,
    facebookDriver: new FakeBrowserDriver({ connectOutcome: 'connected' }),
  };
  return makeTestApp(opts);
}

describe('facebook API — auth & ownership', () => {
  it('rejects unauthenticated access to every endpoint', async () => {
    const { app } = await makeTestApp();
    expect((await app.inject({ method: 'GET', url: '/facebook/account' })).statusCode).toBe(401);
    expect((await app.inject({ method: 'POST', url: '/facebook/connect/start' })).statusCode).toBe(
      401,
    );
    expect((await app.inject({ method: 'GET', url: '/facebook/connect/status' })).statusCode).toBe(
      401,
    );
    expect((await app.inject({ method: 'POST', url: '/facebook/validate' })).statusCode).toBe(401);
    expect((await app.inject({ method: 'POST', url: '/facebook/disconnect' })).statusCode).toBe(
      401,
    );
    await app.close();
  });

  it('requires a workspace first', async () => {
    const { app } = await makeTestApp();
    const reg = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: { email: 'no-ws@example.com', password: 'correct horse 9' },
    });
    const token = sessionCookie(reg)!;
    const res = await app.inject({
      method: 'GET',
      url: '/facebook/account',
      headers: cookieHeader(token),
    });
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe('workspace_required');
    await app.close();
  });

  it('never returns a profile path or cookies', async () => {
    const { app, profileRoot } = await connectedApp();
    const token = await withWorkspace(app, 'a@example.com');
    await app.inject({
      method: 'POST',
      url: '/facebook/connect/start',
      headers: cookieHeader(token),
    });
    await pollStatus(app, token);
    const res = await app.inject({
      method: 'GET',
      url: '/facebook/account',
      headers: cookieHeader(token),
    });
    const text = JSON.stringify(res.json());
    expect(text).not.toContain('profilePath');
    expect(text).not.toContain('profile_path');
    expect(text).not.toContain('cookie');
    expect(text).not.toContain(profileRoot); // absolute path never leaks
    await app.close();
  });

  it('accepts a bodyless POST with an application/json content-type (empty body)', async () => {
    const { app } = await connectedApp();
    const token = await withWorkspace(app, 'a@example.com');
    // Real browsers send Content-Type: application/json even with no body.
    const start = await app.inject({
      method: 'POST',
      url: '/facebook/connect/start',
      headers: { ...cookieHeader(token), 'content-type': 'application/json' },
    });
    expect(start.statusCode).toBe(202);
    await pollStatus(app, token);
    await app.close();
  });

  it('connect/start returns 202 and settles to connected (login enabled + fake driver)', async () => {
    const { app } = await connectedApp();
    const token = await withWorkspace(app, 'a@example.com');
    const start = await app.inject({
      method: 'POST',
      url: '/facebook/connect/start',
      headers: cookieHeader(token),
    });
    expect(start.statusCode).toBe(202);
    expect(start.json().status.connectionState).toBe('connecting');
    const settled = await pollStatus(app, token);
    expect(settled.connectionState).toBe('connected');
    await app.close();
  });

  it('ignores any credentials submitted in the body (no field accepts them)', async () => {
    const { app } = await connectedApp();
    const token = await withWorkspace(app, 'a@example.com');
    const res = await app.inject({
      method: 'POST',
      url: '/facebook/connect/start',
      headers: cookieHeader(token),
      payload: { email: 'victim@example.com', password: 'sup3rSecret!' },
    });
    expect(res.statusCode).toBe(202);
    const settled = await pollStatus(app, token);
    expect(JSON.stringify(settled)).not.toContain('sup3rSecret!');
    await app.close();
  });

  it('rejects a duplicate connection start while one is running', async () => {
    const opts: TestAppOptions = {
      facebookLoginEnabled: true,
      facebookDriver: new FakeBrowserDriver({ connectOutcome: 'connected', connectDelayMs: 300 }),
    };
    const { app } = await makeTestApp(opts);
    const token = await withWorkspace(app, 'a@example.com');
    const first = await app.inject({
      method: 'POST',
      url: '/facebook/connect/start',
      headers: cookieHeader(token),
    });
    expect(first.statusCode).toBe(202);
    const dup = await app.inject({
      method: 'POST',
      url: '/facebook/connect/start',
      headers: cookieHeader(token),
    });
    expect(dup.statusCode).toBe(409);
    expect(dup.json().error.code).toBe('connection_busy');
    await pollStatus(app, token);
    await app.close();
  });

  it('disconnect requires explicit confirmation', async () => {
    const { app } = await connectedApp();
    const token = await withWorkspace(app, 'a@example.com');
    await app.inject({
      method: 'POST',
      url: '/facebook/connect/start',
      headers: cookieHeader(token),
    });
    await pollStatus(app, token);

    const noConfirm = await app.inject({
      method: 'POST',
      url: '/facebook/disconnect',
      headers: cookieHeader(token),
      payload: {},
    });
    expect(noConfirm.statusCode).toBe(400);

    const confirmed = await app.inject({
      method: 'POST',
      url: '/facebook/disconnect',
      headers: cookieHeader(token),
      payload: { confirm: true },
    });
    expect(confirmed.statusCode).toBe(200);
    expect(confirmed.json().status.connectionState).toBe('disconnected');
    await app.close();
  });

  it('a user only ever sees their own workspace account (isolation)', async () => {
    const { app } = await connectedApp();
    const tokenA = await withWorkspace(app, 'a@example.com');
    await app.inject({
      method: 'POST',
      url: '/facebook/connect/start',
      headers: cookieHeader(tokenA),
    });
    await pollStatus(app, tokenA);

    const tokenB = await withWorkspace(app, 'b@example.com');
    const bAccount = await app.inject({
      method: 'GET',
      url: '/facebook/account',
      headers: cookieHeader(tokenB),
    });
    expect(bAccount.json().account.connected).toBe(false);
    expect(bAccount.json().account.displayName).toBeNull();
    await app.close();
  });
});

describe('facebook account model (store)', () => {
  it('allows at most one Facebook account per workspace', async () => {
    const store = new InMemoryStore();
    const ws = randomUUID();
    await store.createFacebookConnection({
      id: randomUUID(),
      workspaceId: ws,
      profilePath: `${ws}/facebook`,
    });
    await expect(
      store.createFacebookConnection({
        id: randomUUID(),
        workspaceId: ws,
        profilePath: `${ws}/facebook`,
      }),
    ).rejects.toThrow();
  });

  it('the account record has no password, cookie, or token fields', async () => {
    const store = new InMemoryStore();
    const ws = randomUUID();
    const account = await store.createFacebookConnection({
      id: randomUUID(),
      workspaceId: ws,
      profilePath: `${ws}/facebook`,
    });
    const keys = Object.keys(account).join(',').toLowerCase();
    expect(keys).not.toMatch(/password|cookie|token/);
  });
});
