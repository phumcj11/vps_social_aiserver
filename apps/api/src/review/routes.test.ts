import { describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import { makeTestApp, sessionCookie, cookieHeader } from '../testing/harness';
import type { InMemoryStore } from '../store/memory';
import type { AiDraftStatus } from '../store/types';

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

async function seedDraft(store: InMemoryStore, ws: string, draftStatus: AiDraftStatus = 'draft') {
  const group = await store.createFacebookGroup({
    id: randomUUID(),
    workspaceId: ws,
    facebookGroupId: '1',
    canonicalUrl: `https://www.facebook.com/groups/${randomUUID().slice(0, 8)}`,
    originalUrl: 'https://www.facebook.com/groups/1',
  });
  const business = await store.createBusiness(
    { id: randomUUID(), workspaceId: ws, name: 'ร้านช่างประปา', slug: randomUUID() },
    { id: randomUUID(), category: 'ประปา', description: null },
  );
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
    payload: { decision: 'ACCEPT', reasons: [] },
  });
  const match = await store.createBusinessMatch({
    id: randomUUID(),
    workspaceId: ws,
    businessId: business.id,
    opportunityId: opp.id,
    decision: 'MATCH',
    reasons: [{ ruleType: 'keyword', ruleValue: 'ประปา', matched: true }],
    matcherVersion: 'rules-v1',
  });
  const draft = await store.createAiDraft({
    id: randomUUID(),
    workspaceId: ws,
    businessMatchId: match.id,
    opportunityId: opp.id,
    businessId: business.id,
    version: 1,
    status: draftStatus,
    content: 'สวัสดีค่ะ ยินดีให้บริการ',
    provider: 'mock',
    model: 'mock-draft-v1',
    promptVersion: 'rules-v1',
    inputSnapshot: null,
    policyResult: { decision: 'PASS', reasons: [] },
    createdBy: null,
  });
  return draft.id;
}

async function enqueue(app: App, token: string, draftId: string) {
  const res = await app.inject({
    method: 'POST',
    url: '/reviews',
    headers: cookieHeader(token),
    payload: { draftId },
  });
  return res;
}

describe('review API', () => {
  it('rejects unauthenticated access', async () => {
    const { app } = await makeTestApp();
    expect((await app.inject({ method: 'POST', url: '/reviews' })).statusCode).toBe(401);
    expect((await app.inject({ method: 'GET', url: '/reviews' })).statusCode).toBe(401);
    await app.close();
  });

  it('enqueues a review from a draft, lists it, and returns detail', async () => {
    const { app, store } = await makeTestApp();
    const { token, workspaceId } = await setup(app);
    const draftId = await seedDraft(store, workspaceId);

    const res = await enqueue(app, token, draftId);
    expect(res.statusCode).toBe(201);
    expect(res.json().review.status).toBe('PENDING');
    const id = res.json().review.id;

    const list = await app.inject({ method: 'GET', url: '/reviews', headers: cookieHeader(token) });
    expect(list.json().reviews).toHaveLength(1);

    const detail = await app.inject({
      method: 'GET',
      url: `/reviews/${id}`,
      headers: cookieHeader(token),
    });
    const body = detail.json();
    expect(body.draft.content).toContain('สวัสดี');
    expect(body.business.name).toBe('ร้านช่างประปา');
    expect(body.presentation.business.name).toBe('ร้านช่างประปา');
    await app.close();
  });

  it('is idempotent — a second enqueue returns the same review (one draft → one review)', async () => {
    const { app, store } = await makeTestApp();
    const { token, workspaceId } = await setup(app);
    const draftId = await seedDraft(store, workspaceId);
    const first = await enqueue(app, token, draftId);
    const second = await enqueue(app, token, draftId);
    expect(second.statusCode).toBe(200);
    expect(second.json().created).toBe(false);
    expect(second.json().review.id).toBe(first.json().review.id);
    await app.close();
  });

  it('approves, and blocks a duplicate decision', async () => {
    const { app, store } = await makeTestApp();
    const { token, workspaceId } = await setup(app);
    const id = (await enqueue(app, token, await seedDraft(store, workspaceId))).json().review.id;

    const approve = await app.inject({
      method: 'POST',
      url: `/reviews/${id}/approve`,
      headers: cookieHeader(token),
      payload: {},
    });
    expect(approve.statusCode).toBe(200);
    expect(approve.json().review.status).toBe('APPROVED');

    const again = await app.inject({
      method: 'POST',
      url: `/reviews/${id}/approve`,
      headers: cookieHeader(token),
      payload: {},
    });
    expect(again.statusCode).toBe(409);
    await app.close();
  });

  it('edits (stays PENDING) then rejects', async () => {
    const { app, store } = await makeTestApp();
    const { token, workspaceId } = await setup(app);
    const id = (await enqueue(app, token, await seedDraft(store, workspaceId))).json().review.id;

    const edit = await app.inject({
      method: 'POST',
      url: `/reviews/${id}/edit`,
      headers: cookieHeader(token),
      payload: { editedContent: 'ข้อความที่แก้ไขแล้วค่ะ' },
    });
    expect(edit.json().review.status).toBe('PENDING');
    expect(edit.json().review.editedContent).toBe('ข้อความที่แก้ไขแล้วค่ะ');

    const reject = await app.inject({
      method: 'POST',
      url: `/reviews/${id}/reject`,
      headers: cookieHeader(token),
      payload: { reason: 'no' },
    });
    expect(reject.json().review.status).toBe('REJECTED');
    await app.close();
  });

  it("a user cannot access another workspace's review", async () => {
    const { app, store } = await makeTestApp();
    const a = await setup(app);
    const id = (await enqueue(app, a.token, await seedDraft(store, a.workspaceId))).json().review
      .id;

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
      (await app.inject({ method: 'GET', url: `/reviews/${id}`, headers: cookieHeader(tokenB) }))
        .statusCode,
    ).toBe(404);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: `/reviews/${id}/approve`,
          headers: cookieHeader(tokenB),
          payload: {},
        })
      ).statusCode,
    ).toBe(404);
    expect(
      (await app.inject({ method: 'GET', url: '/reviews', headers: cookieHeader(tokenB) })).json()
        .reviews,
    ).toEqual([]);
    await app.close();
  });
});
