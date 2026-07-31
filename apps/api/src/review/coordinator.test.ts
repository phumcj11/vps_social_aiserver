import { describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { InMemoryStore } from '../store/memory';
import { loadApiEnv } from '../lib/env';
import { createLogger } from '../lib/logger';
import { ReviewRepository } from './repository';
import { ReviewQueue } from './queue';
import { ReviewCoordinator } from './coordinator';
import { NoopReviewAdapter, type ReviewAdapter } from './adapter';
import { TelegramReviewAdapter, FakeTelegramTransport } from './telegram-adapter';
import { ReviewError } from './errors';
import type { AiDraftStatus } from '../store/types';

const env = loadApiEnv({});
const logger = createLogger('error');

function makeCoordinator(store: InMemoryStore, adapter: ReviewAdapter = new NoopReviewAdapter()) {
  const repo = new ReviewRepository(store);
  return new ReviewCoordinator({ repo, queue: new ReviewQueue(repo), adapter, env, logger });
}

async function seedDraft(
  store: InMemoryStore,
  ws: string,
  opts: { draftStatus?: AiDraftStatus; matchDecision?: 'MATCH' | 'NO_MATCH' } = {},
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
    decision: opts.matchDecision ?? 'MATCH',
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
    status: opts.draftStatus ?? 'draft',
    content: 'สวัสดีค่ะ ยินดีให้บริการ',
    provider: 'mock',
    model: 'mock-draft-v1',
    promptVersion: 'rules-v1',
    inputSnapshot: null,
    policyResult: { decision: 'PASS', reasons: [] },
    createdBy: null,
  });
  return { draftId: draft.id, matchId: match.id, businessId: business.id };
}

describe('ReviewCoordinator', () => {
  it('creates one Review Task from a Draft (AI Draft → Review Task)', async () => {
    const store = new InMemoryStore();
    const coord = makeCoordinator(store);
    const ws = randomUUID();
    const { draftId } = await seedDraft(store, ws);

    const { task, created } = await coord.enqueue(ws, draftId, null);
    expect(created).toBe(true);
    expect(task.status).toBe('PENDING');
    expect(task.draftId).toBe(draftId);

    const events = await new ReviewRepository(store).listEvents(task.id);
    expect(events.map((e) => e.event)).toContain('review_created');
  });

  it('is idempotent — a second enqueue returns the same task (one draft → one review)', async () => {
    const store = new InMemoryStore();
    const coord = makeCoordinator(store);
    const ws = randomUUID();
    const { draftId } = await seedDraft(store, ws);
    const first = await coord.enqueue(ws, draftId, null);
    const second = await coord.enqueue(ws, draftId, null);
    expect(second.created).toBe(false);
    expect(second.task.id).toBe(first.task.id);
    expect(await coord.listReviews(ws)).toHaveLength(1);
  });

  it('refuses to enqueue a rejected/superseded draft', async () => {
    const store = new InMemoryStore();
    const coord = makeCoordinator(store);
    const ws = randomUUID();
    const { draftId } = await seedDraft(store, ws, { draftStatus: 'rejected' });
    await expect(coord.enqueue(ws, draftId, null)).rejects.toBeInstanceOf(ReviewError);
  });

  it('approves a review (records decision only — no post)', async () => {
    const store = new InMemoryStore();
    const coord = makeCoordinator(store);
    const ws = randomUUID();
    const { draftId } = await seedDraft(store, ws);
    const { task } = await coord.enqueue(ws, draftId, null);
    const approved = await coord.approve(ws, task.id, 'user-1', 'looks good');
    expect(approved.status).toBe('APPROVED');
    expect(approved.decidedBy).toBe('user-1');
    const events = await new ReviewRepository(store).listEvents(task.id);
    expect(events.map((e) => e.event)).toContain('review_approved');
  });

  it('rejects a review', async () => {
    const store = new InMemoryStore();
    const coord = makeCoordinator(store);
    const ws = randomUUID();
    const { draftId } = await seedDraft(store, ws);
    const { task } = await coord.enqueue(ws, draftId, null);
    const rejected = await coord.reject(ws, task.id, 'user-1', 'not relevant');
    expect(rejected.status).toBe('REJECTED');
    expect(rejected.decisionReason).toBe('not relevant');
  });

  it('edits a review (stores edited content, stays PENDING, still needs approval)', async () => {
    const store = new InMemoryStore();
    const coord = makeCoordinator(store);
    const ws = randomUUID();
    const { draftId } = await seedDraft(store, ws);
    const { task } = await coord.enqueue(ws, draftId, null);
    const edited = await coord.edit(ws, task.id, 'user-1', 'ข้อความที่แก้ไขแล้วค่ะ');
    expect(edited.status).toBe('PENDING');
    expect(edited.editedContent).toBe('ข้อความที่แก้ไขแล้วค่ะ');
    expect(edited.editor).toBe('user-1');
    // Approving after edit uses the edited content.
    const approved = await coord.approve(ws, task.id, 'user-2', null);
    expect(approved.status).toBe('APPROVED');
    const events = await new ReviewRepository(store).listEvents(task.id);
    expect(events.map((e) => e.event)).toEqual(
      expect.arrayContaining(['review_created', 'review_edited', 'review_approved']),
    );
  });

  it('rejects an empty edit', async () => {
    const store = new InMemoryStore();
    const coord = makeCoordinator(store);
    const ws = randomUUID();
    const { draftId } = await seedDraft(store, ws);
    const { task } = await coord.enqueue(ws, draftId, null);
    await expect(coord.edit(ws, task.id, 'user-1', '   ')).rejects.toBeInstanceOf(ReviewError);
  });

  it('protects against duplicate/late decisions (first valid wins)', async () => {
    const store = new InMemoryStore();
    const coord = makeCoordinator(store);
    const ws = randomUUID();
    const { draftId } = await seedDraft(store, ws);
    const { task } = await coord.enqueue(ws, draftId, null);
    await coord.approve(ws, task.id, 'user-1', null);
    await expect(coord.approve(ws, task.id, 'user-1', null)).rejects.toBeInstanceOf(ReviewError);
    await expect(coord.reject(ws, task.id, 'user-1', null)).rejects.toBeInstanceOf(ReviewError);
    await expect(coord.edit(ws, task.id, 'user-1', 'late edit')).rejects.toBeInstanceOf(
      ReviewError,
    );
  });

  it('expires a pending review', async () => {
    const store = new InMemoryStore();
    const coord = makeCoordinator(store);
    const ws = randomUUID();
    const { draftId } = await seedDraft(store, ws);
    const { task } = await coord.enqueue(ws, draftId, null);
    const expired = await coord.expire(ws, task.id);
    expect(expired.status).toBe('EXPIRED');
  });

  it('enforces ownership (cross-workspace access rejected)', async () => {
    const store = new InMemoryStore();
    const coord = makeCoordinator(store);
    const ws = randomUUID();
    const { draftId } = await seedDraft(store, ws);
    const { task } = await coord.enqueue(ws, draftId, null);
    await expect(coord.getDetail(randomUUID(), task.id)).rejects.toBeInstanceOf(ReviewError);
    await expect(coord.approve(randomUUID(), task.id, 'x', null)).rejects.toBeInstanceOf(
      ReviewError,
    );
  });

  it('works WITHOUT a Telegram adapter (engine is channel-agnostic)', async () => {
    const store = new InMemoryStore();
    const repo = new ReviewRepository(store);
    // No adapter at all.
    const coord = new ReviewCoordinator({ repo, queue: new ReviewQueue(repo), env, logger });
    const ws = randomUUID();
    const { draftId } = await seedDraft(store, ws);
    const { task } = await coord.enqueue(ws, draftId, null);
    expect(task.status).toBe('PENDING');
    const approved = await coord.approve(ws, task.id, 'u', null);
    expect(approved.status).toBe('APPROVED');
  });

  it('delivers via the Telegram adapter best-effort and records review_sent', async () => {
    const store = new InMemoryStore();
    const transport = new FakeTelegramTransport();
    const coord = makeCoordinator(store, new TelegramReviewAdapter(transport));
    const ws = randomUUID();
    const { draftId } = await seedDraft(store, ws);
    const { task } = await coord.enqueue(ws, draftId, null);
    expect(transport.sent).toHaveLength(1);
    const events = await new ReviewRepository(store).listEvents(task.id);
    expect(events.map((e) => e.event)).toContain('review_sent');
  });

  it('a disabled adapter never blocks the review (best-effort delivery)', async () => {
    const store = new InMemoryStore();
    const failing: ReviewAdapter = {
      name: 'telegram',
      sendReview: () => Promise.reject(new Error('telegram disabled')),
      updateReview: () => Promise.reject(new Error('telegram disabled')),
      closeReview: () => Promise.reject(new Error('telegram disabled')),
    };
    const coord = makeCoordinator(store, failing);
    const ws = randomUUID();
    const { draftId } = await seedDraft(store, ws);
    const { task, created } = await coord.enqueue(ws, draftId, null);
    expect(created).toBe(true);
    expect(task.status).toBe('PENDING');
    const approved = await coord.approve(ws, task.id, 'u', null);
    expect(approved.status).toBe('APPROVED');
  });
});
