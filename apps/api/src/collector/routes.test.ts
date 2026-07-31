import { describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { makeTestApp, sessionCookie, cookieHeader, type TestAppOptions } from '../testing/harness';
import { FakeCollectorBrowser } from '../testing/fake-collector-browser';

type App = FastifyInstance;

const TWO_POSTS = `
<div role="article"><a href="/user/1/">A</a><a href="/groups/9/posts/111/">t</a>
<div data-ad-comet-preview="message"><div dir="auto">post one</div></div></div>
<div role="article"><a href="/user/2/">B</a><a href="/groups/9/posts/222/">t</a>
<div data-ad-comet-preview="message"><div dir="auto">post two</div></div></div>`;

async function setupWorkspace(app: App): Promise<string> {
  const reg = await app.inject({
    method: 'POST',
    url: '/auth/register',
    payload: { email: 'a@example.com', password: 'correct horse 9' },
  });
  const token = sessionCookie(reg)!;
  await app.inject({
    method: 'POST',
    url: '/workspaces',
    headers: cookieHeader(token),
    payload: { name: 'ws' },
  });
  return token;
}

async function pollStatus(app: App, token: string) {
  for (let i = 0; i < 60; i += 1) {
    const res = await app.inject({
      method: 'GET',
      url: '/collector/status',
      headers: cookieHeader(token),
    });
    const s = res.json();
    if (!s.running && s.run && s.run.status !== 'running') return s;
    await new Promise((r) => setTimeout(r, 20));
  }
  throw new Error('status never settled');
}

describe('collector API', () => {
  it('rejects unauthenticated access', async () => {
    const { app } = await makeTestApp();
    expect((await app.inject({ method: 'POST', url: '/collector/start' })).statusCode).toBe(401);
    expect((await app.inject({ method: 'GET', url: '/collector/status' })).statusCode).toBe(401);
    expect((await app.inject({ method: 'GET', url: '/collector/runs' })).statusCode).toBe(401);
    await app.close();
  });

  it('requires a workspace first', async () => {
    const { app } = await makeTestApp();
    const reg = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: { email: 'nows@example.com', password: 'correct horse 9' },
    });
    const token = sessionCookie(reg)!;
    const res = await app.inject({
      method: 'GET',
      url: '/collector/status',
      headers: cookieHeader(token),
    });
    expect(res.statusCode).toBe(409);
    await app.close();
  });

  it('reader-disabled default: start → 202 → completes with 0 posts, no browser', async () => {
    const browser = new FakeCollectorBrowser({ pageHtml: TWO_POSTS });
    const { app } = await makeTestApp({ collectorBrowser: browser }); // reader disabled by default
    const token = await setupWorkspace(app);
    const start = await app.inject({
      method: 'POST',
      url: '/collector/start',
      headers: cookieHeader(token),
    });
    expect(start.statusCode).toBe(202);
    expect(start.json().run.status).toBe('running');
    const settled = await pollStatus(app, token);
    expect(settled.run.status).toBe('completed');
    expect(settled.run.postsCollected).toBe(0);
    expect(browser.collectCalls).toBe(0);
    await app.close();
  });

  it('collects when reader is enabled and lists the run', async () => {
    const opts: TestAppOptions = {
      facebookReaderEnabled: true,
      facebookLoginEnabled: true,
      collectorBrowser: new FakeCollectorBrowser({ pageHtml: TWO_POSTS }),
    };
    const { app, store } = await makeTestApp(opts);
    const token = await setupWorkspace(app);
    // Wire a connected Facebook account + an active group for this workspace.
    const wsRes = await app.inject({
      method: 'GET',
      url: '/workspaces/current',
      headers: cookieHeader(token),
    });
    const workspaceId = wsRes.json().workspace.id;
    const acc = await store.createFacebookConnection({
      id: crypto.randomUUID(),
      workspaceId,
      profilePath: `${workspaceId}/facebook`,
    });
    await store.updateFacebookIdentity(acc.id, {
      displayName: 'U',
      facebookUserId: '1',
      sessionExpiresAt: null,
    });
    await store.createFacebookGroup({
      id: crypto.randomUUID(),
      workspaceId,
      facebookGroupId: '9',
      canonicalUrl: 'https://www.facebook.com/groups/9',
      originalUrl: 'https://www.facebook.com/groups/9',
    });

    await app.inject({ method: 'POST', url: '/collector/start', headers: cookieHeader(token) });
    const settled = await pollStatus(app, token);
    expect(settled.run.status).toBe('completed');
    expect(settled.run.postsCollected).toBe(2);
    expect(settled.totalSignals).toBe(2);

    const runs = await app.inject({
      method: 'GET',
      url: '/collector/runs',
      headers: cookieHeader(token),
    });
    expect(runs.json().runs.length).toBeGreaterThanOrEqual(1);
    // Safe response: no cookies / profile paths / raw html in the status payload.
    const text = JSON.stringify(settled);
    expect(text).not.toContain('profilePath');
    expect(text).not.toContain('cookie');
    await app.close();
  });

  it('stop is safe to call and returns a run summary', async () => {
    const { app } = await makeTestApp();
    const token = await setupWorkspace(app);
    await app.inject({ method: 'POST', url: '/collector/start', headers: cookieHeader(token) });
    await pollStatus(app, token);
    const stop = await app.inject({
      method: 'POST',
      url: '/collector/stop',
      headers: cookieHeader(token),
    });
    expect(stop.statusCode).toBe(200);
    await app.close();
  });
});
