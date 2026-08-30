import { describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { InMemoryStore } from '../store/memory';
import { createLogger } from '../lib/logger';
import { MatchRepository } from './repository';
import { MatchingCoordinator } from './coordinator';
import { MatchingError } from './errors';

const logger = createLogger('error');

function coordinator(store: InMemoryStore): MatchingCoordinator {
  return new MatchingCoordinator({ repo: new MatchRepository(store), logger });
}

async function seedGroup(store: InMemoryStore, workspaceId: string) {
  const id = randomUUID();
  return store.createFacebookGroup({
    id,
    workspaceId,
    facebookGroupId: '123',
    canonicalUrl: `https://www.facebook.com/groups/${randomUUID().slice(0, 8)}`,
    originalUrl: 'https://www.facebook.com/groups/123',
  });
}

async function seedBusiness(
  store: InMemoryStore,
  workspaceId: string,
  name: string,
  status = 'active',
) {
  const b = await store.createBusiness(
    { id: randomUUID(), workspaceId, name, slug: `${name}-${randomUUID().slice(0, 6)}` },
    { id: randomUUID(), category: null, description: null },
  );
  if (status !== 'active') await store.updateBusiness(b.id, { status });
  return b;
}

async function assign(
  store: InMemoryStore,
  workspaceId: string,
  businessId: string,
  groupId: string,
) {
  await store.assignGroupToBusiness({
    id: randomUUID(),
    workspaceId,
    businessId,
    facebookGroupId: groupId,
  });
}

async function addRule(
  store: InMemoryStore,
  businessId: string,
  ruleValue: string,
  status = 'active',
) {
  await store.createRule({
    id: randomUUID(),
    businessId,
    ruleType: 'keyword',
    ruleValue,
    priority: 10,
    status,
  });
}

async function seedAcceptedOpportunity(
  store: InMemoryStore,
  workspaceId: string,
  groupId: string,
  message: string,
  decision: 'ACCEPT' | 'REJECT' = 'ACCEPT',
) {
  const signal = await store.createSignal({
    id: randomUUID(),
    workspaceId,
    groupId,
    facebookPostId: null,
    postUrl: `https://www.facebook.com/groups/1/posts/${randomUUID().slice(0, 8)}`,
    authorName: 'A',
    authorProfile: null,
    message,
    mediaUrls: [],
    createdTime: null,
    normalizedHash: randomUUID(),
  });
  return store.createOpportunity({
    id: randomUUID(),
    workspaceId,
    signalId: signal.id,
    decision,
    status: decision === 'ACCEPT' ? 'READY' : 'ARCHIVED',
    classifierVersion: 'rules-v1',
  });
}

describe('MatchingCoordinator', () => {
  it('generates candidates and produces MATCH / NO_MATCH decisions', async () => {
    const store = new InMemoryStore();
    const coord = coordinator(store);
    const ws = randomUUID();
    const group = await seedGroup(store, ws);
    const bizMatch = await seedBusiness(store, ws, 'Plumbing Co');
    await addRule(store, bizMatch.id, 'plumber');
    const bizNoMatch = await seedBusiness(store, ws, 'Catering Co');
    await addRule(store, bizNoMatch.id, 'catering');
    await assign(store, ws, bizMatch.id, group.id);
    await assign(store, ws, bizNoMatch.id, group.id);
    const opp = await seedAcceptedOpportunity(store, ws, group.id, 'Need a plumber urgently');

    const summary = await coord.runMatching(ws);
    expect(summary).toEqual({
      processedOpportunities: 1,
      candidates: 2,
      matches: 1,
      noMatches: 1,
      skipped: 0,
      // The one Business MATCH runs the Property stage; this coordinator has no
      // bpStore, so the business has no Properties → a single NO_PROPERTY_MATCH.
      propertyCandidates: 0,
      propertyMatches: 0,
      propertyNeedsConfirmation: 0,
      propertyNoMatches: 1,
      propertySkipped: 0,
    });

    const all = await coord.listMatches(ws, { opportunityId: opp.id });
    expect(all).toHaveLength(2);
    const matched = await coord.listMatches(ws, { decision: 'MATCH' });
    expect(matched).toHaveLength(1);
    expect(matched[0]?.businessName).toBe('Plumbing Co');
    expect(matched[0]?.match.reasons.some((r) => r.matched)).toBe(true);
  });

  it('is idempotent — a second run skips existing (opportunity, business) pairs', async () => {
    const store = new InMemoryStore();
    const coord = coordinator(store);
    const ws = randomUUID();
    const group = await seedGroup(store, ws);
    const biz = await seedBusiness(store, ws, 'Plumbing Co');
    await addRule(store, biz.id, 'plumber');
    await assign(store, ws, biz.id, group.id);
    await seedAcceptedOpportunity(store, ws, group.id, 'Need a plumber');

    const first = await coord.runMatching(ws);
    expect(first.matches).toBe(1);
    const second = await coord.runMatching(ws);
    expect(second).toMatchObject({ candidates: 1, matches: 0, noMatches: 0, skipped: 1 });
    expect(await coord.listMatches(ws)).toHaveLength(1);
  });

  it('does not process rejected opportunities', async () => {
    const store = new InMemoryStore();
    const coord = coordinator(store);
    const ws = randomUUID();
    const group = await seedGroup(store, ws);
    const biz = await seedBusiness(store, ws, 'Plumbing Co');
    await addRule(store, biz.id, 'plumber');
    await assign(store, ws, biz.id, group.id);
    await seedAcceptedOpportunity(store, ws, group.id, 'Need a plumber', 'REJECT');

    const summary = await coord.runMatching(ws);
    expect(summary.processedOpportunities).toBe(0);
    expect(await coord.listMatches(ws)).toHaveLength(0);
  });

  it('excludes disabled businesses from candidates', async () => {
    const store = new InMemoryStore();
    const coord = coordinator(store);
    const ws = randomUUID();
    const group = await seedGroup(store, ws);
    const disabled = await seedBusiness(store, ws, 'Disabled Co', 'disabled');
    await addRule(store, disabled.id, 'plumber');
    await assign(store, ws, disabled.id, group.id);
    await seedAcceptedOpportunity(store, ws, group.id, 'Need a plumber');

    const summary = await coord.runMatching(ws);
    expect(summary.candidates).toBe(0);
  });

  it('enforces ownership on getDetail (cross-workspace → not found)', async () => {
    const store = new InMemoryStore();
    const coord = coordinator(store);
    const ws = randomUUID();
    const group = await seedGroup(store, ws);
    const biz = await seedBusiness(store, ws, 'Plumbing Co');
    await addRule(store, biz.id, 'plumber');
    await assign(store, ws, biz.id, group.id);
    await seedAcceptedOpportunity(store, ws, group.id, 'Need a plumber');
    await coord.runMatching(ws);
    const [{ match }] = await coord.listMatches(ws);

    await expect(coord.getDetail(randomUUID(), match.id)).rejects.toBeInstanceOf(MatchingError);
    const detail = await coord.getDetail(ws, match.id);
    expect(detail.business?.name).toBe('Plumbing Co');
  });
});
