import { describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import { makeTestApp, sessionCookie, cookieHeader } from '../testing/harness';
import type { InMemoryStore } from '../store/memory';
import type { ReviewStatus } from '../store/types';

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

async function seedApprovedReview(
  store: InMemoryStore,
  ws: string,
  status: ReviewStatus = 'APPROVED',
) {
  const group = await store.createFacebookGroup({
    id: randomUUID(),
    workspaceId: ws,
    facebookGroupId: randomUUID().slice(0, 12),
    canonicalUrl: `https://www.facebook.com/groups/${randomUUID().slice(0, 8)}`,
    originalUrl: 'https://www.facebook.com/groups/1',
  });
  const business = await store.createBusiness(
    {
      id: randomUUID(),
      workspaceId: ws,
      name: `ร้านช่างประปา ${randomUUID().slice(0, 6)}`,
      slug: randomUUID(),
    },
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
    status: 'draft',
    content: 'สวัสดีค่ะ ยินดีให้บริการ',
    provider: 'mock',
    model: 'mock-draft-v1',
    promptVersion: 'rules-v1',
    inputSnapshot: null,
    policyResult: { decision: 'PASS', reasons: [] },
    createdBy: null,
  });
  const review = await store.createReviewTask({
    id: randomUUID(),
    workspaceId: ws,
    businessMatchId: match.id,
    draftId: draft.id,
    assignedTo: null,
  });
  await store.updateReviewTask(review.id, {
    status,
    decidedBy: status === 'APPROVED' || status === 'REJECTED' ? 'u-1' : null,
  });
  return review.id;
}

async function createAction(app: App, token: string, reviewTaskId: string) {
  return app.inject({
    method: 'POST',
    url: '/actions',
    headers: cookieHeader(token),
    payload: { reviewTaskId, actionType: 'facebook_comment' },
  });
}

describe('action API', () => {
  it('rejects unauthenticated access', async () => {
    const { app } = await makeTestApp();
    expect((await app.inject({ method: 'POST', url: '/actions' })).statusCode).toBe(401);
    expect((await app.inject({ method: 'GET', url: '/actions' })).statusCode).toBe(401);
    await app.close();
  });

  it('creates a BLOCKED job from an APPROVED review; response carries no secrets', async () => {
    const { app, store } = await makeTestApp();
    const { token, workspaceId } = await setup(app);
    const reviewId = await seedApprovedReview(store, workspaceId);

    const res = await createAction(app, token, reviewId);
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.action.status).toBe('blocked');
    expect(body.policy.outcome).toBe('BLOCK');
    // No secrets / credentials / profile paths / cookies in the response.
    expect(res.payload).not.toMatch(
      /api[_-]?key|apikey|cookie|password|token|\/root\/|storage\/browser|Authorization/i,
    );

    const list = await app.inject({ method: 'GET', url: '/actions', headers: cookieHeader(token) });
    expect(list.json().actions).toHaveLength(1);
    expect(list.json().statistics.blocked).toBe(1);
    await app.close();
  });

  it('rejects creating from a PENDING or REJECTED review', async () => {
    const { app, store } = await makeTestApp();
    const { token, workspaceId } = await setup(app);
    const pending = await seedApprovedReview(store, workspaceId, 'PENDING');
    const rejected = await seedApprovedReview(store, workspaceId, 'REJECTED');
    expect((await createAction(app, token, pending)).statusCode).toBe(409);
    expect((await createAction(app, token, rejected)).statusCode).toBe(409);
    await app.close();
  });

  it('rejects a duplicate active job', async () => {
    const { app, store } = await makeTestApp();
    const { token, workspaceId } = await setup(app);
    const reviewId = await seedApprovedReview(store, workspaceId);
    expect((await createAction(app, token, reviewId)).statusCode).toBe(201);
    const dup = await createAction(app, token, reviewId);
    expect(dup.statusCode).toBe(409);
    expect(dup.json().error.code).toBe('duplicate_active_job');
    await app.close();
  });

  it('cancels a job and recheck-policy keeps it blocked under defaults', async () => {
    const { app, store } = await makeTestApp();
    const { token, workspaceId } = await setup(app);
    const id1 = (
      await createAction(app, token, await seedApprovedReview(store, workspaceId))
    ).json().action.id;
    const recheck = await app.inject({
      method: 'POST',
      url: `/actions/${id1}/recheck-policy`,
      headers: cookieHeader(token),
    });
    expect(recheck.json().action.status).toBe('blocked');
    expect(recheck.json().policy.outcome).toBe('BLOCK');

    const id2 = (
      await createAction(app, token, await seedApprovedReview(store, workspaceId))
    ).json().action.id;
    const cancel = await app.inject({
      method: 'POST',
      url: `/actions/${id2}/cancel`,
      headers: cookieHeader(token),
    });
    expect(cancel.json().action.status).toBe('cancelled');
    await app.close();
  });

  it('retry respects max_attempts (guarded)', async () => {
    const { app, store } = await makeTestApp();
    const { token, workspaceId } = await setup(app);
    const id = (await createAction(app, token, await seedApprovedReview(store, workspaceId))).json()
      .action.id;
    // A blocked job cannot be retried (only failed jobs) → invalid transition/state.
    const retry = await app.inject({
      method: 'POST',
      url: `/actions/${id}/retry`,
      headers: cookieHeader(token),
    });
    expect(retry.statusCode).toBe(409);

    // Seed a failed job at the attempt limit and confirm retry is refused.
    const failed = await store.getActionJobById(id);
    await store.updateActionJob(id, { status: 'failed', attemptCount: failed!.maxAttempts });
    const retry2 = await app.inject({
      method: 'POST',
      url: `/actions/${id}/retry`,
      headers: cookieHeader(token),
    });
    expect(retry2.statusCode).toBe(409);
    expect(retry2.json().error.code).toBe('retry_limit_reached');
    await app.close();
  });

  it("a user cannot access another workspace's action", async () => {
    const { app, store } = await makeTestApp();
    const a = await setup(app);
    const id = (
      await createAction(app, a.token, await seedApprovedReview(store, a.workspaceId))
    ).json().action.id;

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
      (await app.inject({ method: 'GET', url: `/actions/${id}`, headers: cookieHeader(tokenB) }))
        .statusCode,
    ).toBe(404);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: `/actions/${id}/cancel`,
          headers: cookieHeader(tokenB),
        })
      ).statusCode,
    ).toBe(404);
    expect(
      (await app.inject({ method: 'GET', url: '/actions', headers: cookieHeader(tokenB) })).json()
        .actions,
    ).toEqual([]);
    await app.close();
  });
});
