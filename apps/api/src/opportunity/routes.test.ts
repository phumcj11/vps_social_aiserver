import { describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import { makeTestApp, sessionCookie, cookieHeader } from '../testing/harness';
import type { InMemoryStore } from '../store/memory';

type App = FastifyInstance;

async function setup(app: App): Promise<{ token: string; workspaceId: string }> {
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
  const ws = await app.inject({
    method: 'GET',
    url: '/workspaces/current',
    headers: cookieHeader(token),
  });
  return { token, workspaceId: ws.json().workspace.id };
}

async function seedSignal(store: InMemoryStore, ws: string, message: string) {
  return store.createSignal({
    id: randomUUID(),
    workspaceId: ws,
    groupId: randomUUID(),
    facebookPostId: '456',
    postUrl: `https://www.facebook.com/groups/123/posts/${randomUUID().slice(0, 8)}`,
    authorName: 'Jane',
    authorProfile: null,
    message,
    mediaUrls: [],
    createdTime: null,
    normalizedHash: randomUUID(),
  });
}

describe('opportunity API', () => {
  it('rejects unauthenticated access', async () => {
    const { app } = await makeTestApp();
    expect((await app.inject({ method: 'POST', url: '/opportunities/classify' })).statusCode).toBe(
      401,
    );
    expect((await app.inject({ method: 'GET', url: '/opportunities' })).statusCode).toBe(401);
    expect((await app.inject({ method: 'GET', url: '/opportunities/statistics' })).statusCode).toBe(
      401,
    );
    await app.close();
  });

  it('classifies signals, lists opportunities, and reports statistics', async () => {
    const { app, store } = await makeTestApp();
    const { token, workspaceId } = await setup(app);
    await seedSignal(store, workspaceId, 'หาที่พักบางแสน 4 คน ใกล้ทะเล');
    await seedSignal(store, workspaceId, 'help'); // too short → REJECT

    const classify = await app.inject({
      method: 'POST',
      url: '/opportunities/classify',
      headers: cookieHeader(token),
    });
    expect(classify.statusCode).toBe(200);
    expect(classify.json().summary).toEqual({ processed: 2, accepted: 1, rejected: 1 });

    const list = await app.inject({
      method: 'GET',
      url: '/opportunities',
      headers: cookieHeader(token),
    });
    expect(list.json().opportunities).toHaveLength(2);
    const accepted = await app.inject({
      method: 'GET',
      url: '/opportunities?decision=ACCEPT',
      headers: cookieHeader(token),
    });
    expect(accepted.json().opportunities).toHaveLength(1);

    const stats = await app.inject({
      method: 'GET',
      url: '/opportunities/statistics',
      headers: cookieHeader(token),
    });
    expect(stats.json().statistics).toMatchObject({
      total: 2,
      accepted: 1,
      rejected: 1,
      ready: 1,
      archived: 1,
    });
    await app.close();
  });

  it('returns detail with decision, reasons, signal, and events', async () => {
    const { app, store } = await makeTestApp();
    const { token, workspaceId } = await setup(app);
    await seedSignal(store, workspaceId, 'หาพูลวิลล่าพัทยา 10 คน วันเสาร์');
    await app.inject({
      method: 'POST',
      url: '/opportunities/classify',
      headers: cookieHeader(token),
    });
    const list = await app.inject({
      method: 'GET',
      url: '/opportunities',
      headers: cookieHeader(token),
    });
    const id = list.json().opportunities[0].id;

    const detail = await app.inject({
      method: 'GET',
      url: `/opportunities/${id}`,
      headers: cookieHeader(token),
    });
    const body = detail.json();
    expect(body.opportunity.decision).toBe('ACCEPT');
    expect(body.signal.message).toContain('พูลวิลล่า');
    expect(body.events[0].event).toBe('OpportunityCreated');
    expect(
      body.events[0].payload.reasons.some(
        (r: { code: string; passed: boolean }) => r.code === 'CUSTOMER_SEARCH_INTENT' && r.passed,
      ),
    ).toBe(true);
    await app.close();
  });

  it('patches status to ARCHIVED', async () => {
    const { app, store } = await makeTestApp();
    const { token, workspaceId } = await setup(app);
    await seedSignal(store, workspaceId, 'A valid message about a service request here');
    await app.inject({
      method: 'POST',
      url: '/opportunities/classify',
      headers: cookieHeader(token),
    });
    const id = (
      await app.inject({ method: 'GET', url: '/opportunities', headers: cookieHeader(token) })
    ).json().opportunities[0].id;

    const patch = await app.inject({
      method: 'PATCH',
      url: `/opportunities/${id}/status`,
      headers: cookieHeader(token),
      payload: { status: 'ARCHIVED' },
    });
    expect(patch.statusCode).toBe(200);
    expect(patch.json().opportunity.status).toBe('ARCHIVED');

    const bad = await app.inject({
      method: 'PATCH',
      url: `/opportunities/${id}/status`,
      headers: cookieHeader(token),
      payload: { status: 'BOGUS' },
    });
    expect(bad.statusCode).toBe(400);
    await app.close();
  });

  it("a user cannot access another workspace's opportunity", async () => {
    const { app, store } = await makeTestApp();
    const a = await setup(app);
    await seedSignal(store, a.workspaceId, 'หาที่พักบางแสน 4 คน ใกล้ทะเล');
    await app.inject({
      method: 'POST',
      url: '/opportunities/classify',
      headers: cookieHeader(a.token),
    });
    const id = (
      await app.inject({ method: 'GET', url: '/opportunities', headers: cookieHeader(a.token) })
    ).json().opportunities[0].id;

    // User B with their own workspace.
    const regB = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: { email: 'b@example.com', password: 'correct horse 9' },
    });
    const tokenB = sessionCookie(regB)!;
    await app.inject({
      method: 'POST',
      url: '/workspaces',
      headers: cookieHeader(tokenB),
      payload: { name: 'wsB' },
    });

    const res = await app.inject({
      method: 'GET',
      url: `/opportunities/${id}`,
      headers: cookieHeader(tokenB),
    });
    expect(res.statusCode).toBe(404);
    expect(
      (
        await app.inject({ method: 'GET', url: '/opportunities', headers: cookieHeader(tokenB) })
      ).json().opportunities,
    ).toEqual([]);
    await app.close();
  });
});
