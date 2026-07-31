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
    payload: { email: `${randomUUID().slice(0, 8)}@example.com`, password: 'correct horse 9' },
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

/** Seed a group, a business with a keyword rule, an assignment, and an accepted opportunity. */
async function seedScenario(store: InMemoryStore, ws: string, keyword: string, message: string) {
  const group = await store.createFacebookGroup({
    id: randomUUID(),
    workspaceId: ws,
    facebookGroupId: '123',
    canonicalUrl: `https://www.facebook.com/groups/${randomUUID().slice(0, 8)}`,
    originalUrl: 'https://www.facebook.com/groups/123',
  });
  const biz = await store.createBusiness(
    {
      id: randomUUID(),
      workspaceId: ws,
      name: `Biz ${randomUUID().slice(0, 6)}`,
      slug: randomUUID(),
    },
    { id: randomUUID(), category: null, description: null },
  );
  await store.createRule({
    id: randomUUID(),
    businessId: biz.id,
    ruleType: 'keyword',
    ruleValue: keyword,
    priority: 10,
    status: 'active',
  });
  await store.assignGroupToBusiness({
    id: randomUUID(),
    workspaceId: ws,
    businessId: biz.id,
    facebookGroupId: group.id,
  });
  const signal = await store.createSignal({
    id: randomUUID(),
    workspaceId: ws,
    groupId: group.id,
    facebookPostId: null,
    postUrl: `https://www.facebook.com/groups/1/posts/${randomUUID().slice(0, 8)}`,
    authorName: 'A',
    authorProfile: null,
    message,
    mediaUrls: [],
    createdTime: null,
    normalizedHash: randomUUID(),
  });
  const opp = await store.createOpportunity({
    id: randomUUID(),
    workspaceId: ws,
    signalId: signal.id,
    decision: 'ACCEPT',
    status: 'READY',
    classifierVersion: 'rules-v1',
  });
  return { opportunityId: opp.id, businessId: biz.id };
}

describe('business matching API', () => {
  it('rejects unauthenticated access', async () => {
    const { app } = await makeTestApp();
    expect((await app.inject({ method: 'POST', url: '/business-matching/run' })).statusCode).toBe(
      401,
    );
    expect((await app.inject({ method: 'GET', url: '/business-matches' })).statusCode).toBe(401);
    await app.close();
  });

  it('runs matching, lists matches, and filters by decision', async () => {
    const { app, store } = await makeTestApp();
    const { token, workspaceId } = await setup(app);
    await seedScenario(store, workspaceId, 'plumber', 'Need a plumber urgently');

    const run = await app.inject({
      method: 'POST',
      url: '/business-matching/run',
      headers: cookieHeader(token),
    });
    expect(run.statusCode).toBe(200);
    expect(run.json().summary).toMatchObject({
      processedOpportunities: 1,
      candidates: 1,
      matches: 1,
      noMatches: 0,
    });

    const list = await app.inject({
      method: 'GET',
      url: '/business-matches',
      headers: cookieHeader(token),
    });
    expect(list.json().matches).toHaveLength(1);
    expect(list.json().matches[0].decision).toBe('MATCH');
    expect(list.json().matches[0].reasons[0]).toMatchObject({ ruleType: 'keyword', matched: true });

    const matched = await app.inject({
      method: 'GET',
      url: '/business-matches?decision=NO_MATCH',
      headers: cookieHeader(token),
    });
    expect(matched.json().matches).toHaveLength(0);
  });

  it('returns detail with match, business, and opportunity', async () => {
    const { app, store } = await makeTestApp();
    const { token, workspaceId } = await setup(app);
    await seedScenario(store, workspaceId, 'plumber', 'Need a plumber');
    await app.inject({
      method: 'POST',
      url: '/business-matching/run',
      headers: cookieHeader(token),
    });
    const id = (
      await app.inject({ method: 'GET', url: '/business-matches', headers: cookieHeader(token) })
    ).json().matches[0].id;

    const detail = await app.inject({
      method: 'GET',
      url: `/business-matches/${id}`,
      headers: cookieHeader(token),
    });
    const body = detail.json();
    expect(body.match.decision).toBe('MATCH');
    expect(body.business).not.toBeNull();
    expect(body.opportunity.decision).toBe('ACCEPT');
  });

  it('is idempotent — running twice does not duplicate matches', async () => {
    const { app, store } = await makeTestApp();
    const { token, workspaceId } = await setup(app);
    await seedScenario(store, workspaceId, 'plumber', 'Need a plumber');
    await app.inject({
      method: 'POST',
      url: '/business-matching/run',
      headers: cookieHeader(token),
    });
    const second = await app.inject({
      method: 'POST',
      url: '/business-matching/run',
      headers: cookieHeader(token),
    });
    expect(second.json().summary).toMatchObject({ matches: 0, skipped: 1 });
    const list = await app.inject({
      method: 'GET',
      url: '/business-matches',
      headers: cookieHeader(token),
    });
    expect(list.json().matches).toHaveLength(1);
  });

  it("a user cannot access another workspace's match", async () => {
    const { app, store } = await makeTestApp();
    const a = await setup(app);
    await seedScenario(store, a.workspaceId, 'plumber', 'Need a plumber');
    await app.inject({
      method: 'POST',
      url: '/business-matching/run',
      headers: cookieHeader(a.token),
    });
    const id = (
      await app.inject({ method: 'GET', url: '/business-matches', headers: cookieHeader(a.token) })
    ).json().matches[0].id;

    const regB = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: { email: `${randomUUID().slice(0, 8)}@example.com`, password: 'correct horse 9' },
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
      url: `/business-matches/${id}`,
      headers: cookieHeader(tokenB),
    });
    expect(res.statusCode).toBe(404);
    expect(
      (
        await app.inject({ method: 'GET', url: '/business-matches', headers: cookieHeader(tokenB) })
      ).json().matches,
    ).toEqual([]);
    await app.close();
  });
});
