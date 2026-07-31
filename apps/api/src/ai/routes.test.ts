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

async function seedMatch(
  store: InMemoryStore,
  ws: string,
  decision: 'MATCH' | 'NO_MATCH' = 'MATCH',
) {
  const group = await store.createFacebookGroup({
    id: randomUUID(),
    workspaceId: ws,
    facebookGroupId: '1',
    canonicalUrl: `https://www.facebook.com/groups/${randomUUID().slice(0, 8)}`,
    originalUrl: 'https://www.facebook.com/groups/1',
  });
  const business = await store.createBusiness(
    { id: randomUUID(), workspaceId: ws, name: 'ร้านช่างประปา', slug: randomUUID() },
    { id: randomUUID(), category: 'ประปา', description: 'ซ่อมประปา' },
  );
  await store.createRule({
    id: randomUUID(),
    businessId: business.id,
    ruleType: 'keyword',
    ruleValue: 'ประปา',
    priority: 10,
    status: 'active',
  });
  const signal = await store.createSignal({
    id: randomUUID(),
    workspaceId: ws,
    groupId: group.id,
    facebookPostId: null,
    postUrl: `https://www.facebook.com/groups/1/posts/${randomUUID().slice(0, 8)}`,
    authorName: 'A',
    authorProfile: null,
    message: 'หาช่างประปา',
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
  await store.createOpportunityEvent({
    id: randomUUID(),
    opportunityId: opp.id,
    event: 'OpportunityCreated',
    payload: { decision: 'ACCEPT', reasons: [{ code: 'HAS_TEXT', passed: true }] },
  });
  const match = await store.createBusinessMatch({
    id: randomUUID(),
    workspaceId: ws,
    businessId: business.id,
    opportunityId: opp.id,
    decision,
    reasons: [{ ruleType: 'keyword', ruleValue: 'ประปา', matched: true }],
    matcherVersion: 'rules-v1',
  });
  return match.id;
}

describe('ai draft API', () => {
  it('rejects unauthenticated access', async () => {
    const { app } = await makeTestApp();
    expect((await app.inject({ method: 'POST', url: '/ai-drafts/generate' })).statusCode).toBe(401);
    expect((await app.inject({ method: 'GET', url: '/ai-drafts' })).statusCode).toBe(401);
    await app.close();
  });

  it('generates a draft from a MATCH and never leaks secrets or the prompt', async () => {
    const { app, store } = await makeTestApp();
    const { token, workspaceId } = await setup(app);
    const matchId = await seedMatch(store, workspaceId);

    const gen = await app.inject({
      method: 'POST',
      url: '/ai-drafts/generate',
      headers: cookieHeader(token),
      payload: { businessMatchId: matchId },
    });
    expect(gen.statusCode).toBe(201);
    const body = gen.json();
    expect(body.created).toBe(true);
    expect(body.draft.version).toBe(1);
    expect(body.draft.status).toBe('draft');
    expect(body.draft.provider).toBe('mock');
    // No secrets, no hidden prompt.
    const raw = gen.payload;
    expect(raw).not.toMatch(/api[_-]?key|apiKey|Authorization|### System Rules|chain-of-thought/i);
    expect(body.draft.prompt).toBeUndefined();
    await app.close();
  });

  it('does not overwrite on duplicate generate; regenerate makes version 2', async () => {
    const { app, store } = await makeTestApp();
    const { token, workspaceId } = await setup(app);
    const matchId = await seedMatch(store, workspaceId);

    const first = await app.inject({
      method: 'POST',
      url: '/ai-drafts/generate',
      headers: cookieHeader(token),
      payload: { businessMatchId: matchId },
    });
    const firstId = first.json().draft.id;
    const dup = await app.inject({
      method: 'POST',
      url: '/ai-drafts/generate',
      headers: cookieHeader(token),
      payload: { businessMatchId: matchId },
    });
    expect(dup.statusCode).toBe(200);
    expect(dup.json().created).toBe(false);
    expect(dup.json().draft.id).toBe(firstId);

    const regen = await app.inject({
      method: 'POST',
      url: `/ai-drafts/${firstId}/regenerate`,
      headers: cookieHeader(token),
    });
    expect(regen.statusCode).toBe(201);
    expect(regen.json().draft.version).toBe(2);

    const history = await app.inject({
      method: 'GET',
      url: `/business-matches/${matchId}/ai-drafts`,
      headers: cookieHeader(token),
    });
    expect(history.json().drafts).toHaveLength(2);
    await app.close();
  });

  it('rejects generation for a NO_MATCH', async () => {
    const { app, store } = await makeTestApp();
    const { token, workspaceId } = await setup(app);
    const matchId = await seedMatch(store, workspaceId, 'NO_MATCH');
    const gen = await app.inject({
      method: 'POST',
      url: '/ai-drafts/generate',
      headers: cookieHeader(token),
      payload: { businessMatchId: matchId },
    });
    expect(gen.statusCode).toBe(409);
    expect(gen.json().error.code).toBe('not_a_match');
    await app.close();
  });

  it('rejects a draft and returns detail', async () => {
    const { app, store } = await makeTestApp();
    const { token, workspaceId } = await setup(app);
    const matchId = await seedMatch(store, workspaceId);
    const id = (
      await app.inject({
        method: 'POST',
        url: '/ai-drafts/generate',
        headers: cookieHeader(token),
        payload: { businessMatchId: matchId },
      })
    ).json().draft.id;

    const rej = await app.inject({
      method: 'POST',
      url: `/ai-drafts/${id}/reject`,
      headers: cookieHeader(token),
    });
    expect(rej.json().draft.status).toBe('rejected');

    const detail = await app.inject({
      method: 'GET',
      url: `/ai-drafts/${id}`,
      headers: cookieHeader(token),
    });
    expect(detail.json().draft.id).toBe(id);
    expect(detail.json().events.map((e: { event: string }) => e.event)).toContain(
      'ai_draft_rejected',
    );
    await app.close();
  });

  it("a user cannot access another workspace's draft", async () => {
    const { app, store } = await makeTestApp();
    const a = await setup(app);
    const matchId = await seedMatch(store, a.workspaceId);
    const id = (
      await app.inject({
        method: 'POST',
        url: '/ai-drafts/generate',
        headers: cookieHeader(a.token),
        payload: { businessMatchId: matchId },
      })
    ).json().draft.id;

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

    expect(
      (await app.inject({ method: 'GET', url: `/ai-drafts/${id}`, headers: cookieHeader(tokenB) }))
        .statusCode,
    ).toBe(404);
    expect(
      (await app.inject({ method: 'GET', url: '/ai-drafts', headers: cookieHeader(tokenB) })).json()
        .drafts,
    ).toEqual([]);
    await app.close();
  });
});
