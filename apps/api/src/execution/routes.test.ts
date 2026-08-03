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

async function seedApprovedReview(store: InMemoryStore, ws: string): Promise<string> {
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
      name: `ร้าน ${randomUUID().slice(0, 6)}`,
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
    content: 'สวัสดีค่ะ',
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
    status: 'APPROVED',
    decidedBy: 'u-1',
    editedContent: null,
  });
  return review.id;
}

async function createAction(app: App, token: string, reviewTaskId: string): Promise<string> {
  const res = await app.inject({
    method: 'POST',
    url: '/actions',
    headers: cookieHeader(token),
    payload: { reviewTaskId, actionType: 'facebook_comment' },
  });
  return res.json().action.id;
}

describe('execution routes (safe defaults)', () => {
  it('prepare-execution is BLOCKED under safe defaults and creates no session', async () => {
    const { app, store } = await makeTestApp();
    const { token, workspaceId } = await setup(app);
    const reviewId = await seedApprovedReview(store, workspaceId);
    const jobId = await createAction(app, token, reviewId);

    const res = await app.inject({
      method: 'POST',
      url: `/actions/${jobId}/prepare-execution`,
      headers: cookieHeader(token),
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.status).toBe('blocked');
    expect(body.session).toBeNull();
    // Crucially, execution never reports success under safe defaults.
    expect(body.status).not.toBe('verified');

    const sessions = await app.inject({
      method: 'GET',
      url: `/actions/${jobId}/execution-sessions`,
      headers: cookieHeader(token),
    });
    expect(sessions.json().sessions).toHaveLength(0);
    await app.close();
  });

  it('dry-run is also blocked under safe defaults (kill switch honored)', async () => {
    const { app, store } = await makeTestApp();
    const { token, workspaceId } = await setup(app);
    const reviewId = await seedApprovedReview(store, workspaceId);
    const jobId = await createAction(app, token, reviewId);

    const res = await app.inject({
      method: 'POST',
      url: `/actions/${jobId}/dry-run`,
      headers: cookieHeader(token),
      payload: { scenario: 'verified_success' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().status).toBe('blocked');
    await app.close();
  });

  it('requires authentication', async () => {
    const { app } = await makeTestApp();
    const res = await app.inject({
      method: 'POST',
      url: `/actions/${randomUUID()}/prepare-execution`,
    });
    expect(res.statusCode).toBe(401);
    await app.close();
  });

  it('404s for a session in another workspace / unknown session', async () => {
    const { app } = await makeTestApp();
    const { token } = await setup(app);
    const res = await app.inject({
      method: 'GET',
      url: `/action-executions/${randomUUID()}`,
      headers: cookieHeader(token),
    });
    expect(res.statusCode).toBe(404);
    await app.close();
  });
});
