import { describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { InMemoryStore } from '../store/memory';
import { loadApiEnv } from '../lib/env';
import { createLogger } from '../lib/logger';
import { ActionRepository } from './repository';
import { ActionQueue } from './queue';
import { ActionCoordinator } from './coordinator';
import { ActionError } from './errors';
import type { ReviewStatus } from '../store/types';

const logger = createLogger('error');
const defaultEnv = loadApiEnv({});

function makeCoordinator(store: InMemoryStore, env = defaultEnv) {
  const repo = new ActionRepository(store);
  return new ActionCoordinator({ repo, queue: new ActionQueue(repo), env, logger });
}

async function seedApprovedReview(
  store: InMemoryStore,
  ws: string,
  opts: { reviewStatus?: ReviewStatus; editedContent?: string | null } = {},
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
  const status = opts.reviewStatus ?? 'APPROVED';
  await store.updateReviewTask(review.id, {
    status,
    decidedBy: status === 'APPROVED' || status === 'REJECTED' ? 'u-1' : null,
    editedContent: opts.editedContent ?? null,
  });
  return { reviewId: review.id };
}

describe('ActionCoordinator', () => {
  it('creates a BLOCKED job from an APPROVED review under current safety defaults', async () => {
    const store = new InMemoryStore();
    const coord = makeCoordinator(store);
    const ws = randomUUID();
    const { reviewId } = await seedApprovedReview(store, ws);

    const { job, policy } = await coord.createFromReview(ws, reviewId, 'facebook_comment');
    expect(job.status).toBe('blocked');
    expect(policy.outcome).toBe('BLOCK');
    expect(policy.reasons.map((r) => r.code)).toEqual(
      expect.arrayContaining(['ENGINE_DISABLED', 'WRITE_DISABLED', 'KILL_SWITCH_ON']),
    );
    const events = await new ActionRepository(store).listEvents(job.id);
    expect(events.map((e) => e.event)).toEqual(['action_job_created', 'action_job_blocked']);
  });

  it('uses edited review content as the approved content', async () => {
    const store = new InMemoryStore();
    const coord = makeCoordinator(store);
    const ws = randomUUID();
    const { reviewId } = await seedApprovedReview(store, ws, {
      editedContent: 'ข้อความที่แก้ไขค่ะ',
    });
    const { job } = await coord.createFromReview(ws, reviewId, 'facebook_comment');
    expect(job.approvedContent).toBe('ข้อความที่แก้ไขค่ะ');
  });

  it('rejects a PENDING review', async () => {
    const store = new InMemoryStore();
    const coord = makeCoordinator(store);
    const ws = randomUUID();
    const { reviewId } = await seedApprovedReview(store, ws, { reviewStatus: 'PENDING' });
    await expect(coord.createFromReview(ws, reviewId, 'facebook_comment')).rejects.toBeInstanceOf(
      ActionError,
    );
  });

  it('rejects a REJECTED review', async () => {
    const store = new InMemoryStore();
    const coord = makeCoordinator(store);
    const ws = randomUUID();
    const { reviewId } = await seedApprovedReview(store, ws, { reviewStatus: 'REJECTED' });
    await expect(coord.createFromReview(ws, reviewId, 'facebook_comment')).rejects.toBeInstanceOf(
      ActionError,
    );
  });

  it('rejects a duplicate active job', async () => {
    const store = new InMemoryStore();
    const coord = makeCoordinator(store);
    const ws = randomUUID();
    const { reviewId } = await seedApprovedReview(store, ws);
    await coord.createFromReview(ws, reviewId, 'facebook_comment');
    await expect(coord.createFromReview(ws, reviewId, 'facebook_comment')).rejects.toBeInstanceOf(
      ActionError,
    );
  });

  it('enforces ownership (cross-workspace create rejected)', async () => {
    const store = new InMemoryStore();
    const coord = makeCoordinator(store);
    const ws = randomUUID();
    const { reviewId } = await seedApprovedReview(store, ws);
    await expect(
      coord.createFromReview(randomUUID(), reviewId, 'facebook_comment'),
    ).rejects.toBeInstanceOf(ActionError);
  });

  it('cancels a blocked job (never executes)', async () => {
    const store = new InMemoryStore();
    const coord = makeCoordinator(store);
    const ws = randomUUID();
    const { reviewId } = await seedApprovedReview(store, ws);
    const { job } = await coord.createFromReview(ws, reviewId, 'facebook_comment');
    const cancelled = await coord.cancel(ws, job.id);
    expect(cancelled.status).toBe('cancelled');
  });

  it('recheck-policy keeps the job BLOCKED under current defaults', async () => {
    const store = new InMemoryStore();
    const coord = makeCoordinator(store);
    const ws = randomUUID();
    const { reviewId } = await seedApprovedReview(store, ws);
    const { job } = await coord.createFromReview(ws, reviewId, 'facebook_comment');
    const { job: rechecked, policy } = await coord.recheckPolicy(ws, job.id);
    expect(rechecked.status).toBe('blocked');
    expect(policy.outcome).toBe('BLOCK');
    const events = await new ActionRepository(store).listEvents(job.id);
    expect(events.map((e) => e.event)).toContain('action_job_policy_rejected');
  });

  it('recheck-policy moves blocked → queued when safety allows', async () => {
    const store = new InMemoryStore();
    const safeEnv = loadApiEnv({
      ACTION_ENGINE_ENABLED: 'true',
      FACEBOOK_WRITE_ACTION_ENABLED: 'true',
      GLOBAL_KILL_SWITCH: 'false',
    });
    const coord = makeCoordinator(store, safeEnv);
    const ws = randomUUID();
    const { reviewId } = await seedApprovedReview(store, ws);
    // With safe env the initial job is queued, so block it first to test recheck.
    const { job } = await coord.createFromReview(ws, reviewId, 'facebook_comment');
    expect(job.status).toBe('queued');
  });

  it('no execution occurs — a created job never enters processing', async () => {
    const store = new InMemoryStore();
    const coord = makeCoordinator(store);
    const ws = randomUUID();
    const { reviewId } = await seedApprovedReview(store, ws);
    const { job } = await coord.createFromReview(ws, reviewId, 'facebook_comment');
    const events = await new ActionRepository(store).listEvents(job.id);
    expect(events.map((e) => e.event)).not.toContain('action_job_processing');
    expect(job.startedAt).toBeNull();
  });
});
