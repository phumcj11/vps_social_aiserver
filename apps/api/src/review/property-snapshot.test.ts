import { describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { InMemoryStore } from '../store/memory';
import { InMemoryBusinessPropertyStore } from '../business-property/memory-store';
import { createLogger } from '../lib/logger';
import { ReviewRepository } from './repository';
import { ReviewQueue } from './queue';
import { ReviewCoordinator } from './coordinator';
import { loadApiEnv } from '../lib/env';

const logger = createLogger('error');
const env = loadApiEnv({});

async function seed(store: InMemoryStore, bp: InMemoryBusinessPropertyStore) {
  const ws = randomUUID();
  const business = await store.createBusiness(
    {
      id: randomUUID(),
      workspaceId: ws,
      name: 'Sea Villa Bangsaen',
      slug: `sv-${randomUUID().slice(0, 6)}`,
    },
    { id: randomUUID(), category: null, description: null },
  );
  // Minimal Opportunity/Signal graph so getOpportunityById is satisfiable.
  const signal = await store.createSignal({
    id: randomUUID(),
    workspaceId: ws,
    groupId: randomUUID(),
    facebookPostId: null,
    postUrl: 'https://www.facebook.com/groups/1/posts/abc',
    authorName: 'A',
    authorProfile: null,
    message: 'หาพูลวิลล่าบางแสน 12 คน',
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
    reasons: [],
    matcherVersion: 'rules-v1',
  });
  const property = await bp.createProperty({
    id: randomUUID(),
    workspaceId: ws,
    businessId: business.id,
    name: 'Villa B',
  });
  await bp.updateProperty(property.id, {
    capacity: { maxGuests: 15 },
    location: { area: 'บางแสน' },
  });
  const propertyMatch = await store.createPropertyMatch({
    id: randomUUID(),
    workspaceId: ws,
    opportunityId: opp.id,
    businessMatchId: match.id,
    businessId: business.id,
    propertyId: property.id,
    decision: 'MATCH',
    reasons: {
      reasons: ['AREA_MATCH: บางแสน', 'CAPACITY_MATCH: 12 <= 15'],
      rejected: [],
      requirement: {},
    },
    matcherVersion: 'property-rules-v1',
    candidatesEvaluated: 1,
  });
  const draft = await store.createAiDraft({
    id: randomUUID(),
    workspaceId: ws,
    businessMatchId: match.id,
    opportunityId: opp.id,
    businessId: business.id,
    version: 1,
    status: 'needs_review',
    content: 'Sea Villa Bangsaen ยินดีให้บริการครับ',
    provider: 'mock',
    model: 'mock-draft-v1',
    promptVersion: 'rules-v2-property',
    inputSnapshot: { property: { name: 'Villa B' } },
    policyResult: {
      decision: 'NEEDS_REVIEW',
      reasons: [{ code: 'NO_PROPERTY_MATCH', detail: 'x' }],
    },
    createdBy: null,
  });
  return { ws, business, property, match, propertyMatch, draft };
}

function coordinator(store: InMemoryStore, bp: InMemoryBusinessPropertyStore) {
  const repo = new ReviewRepository(store, bp);
  return new ReviewCoordinator({ repo, queue: new ReviewQueue(repo), env, logger });
}

describe('Review Property-match snapshot (SPRINT 016B)', () => {
  it('snapshots business/property/property-match ids and a context hash at creation', async () => {
    const store = new InMemoryStore();
    const bp = new InMemoryBusinessPropertyStore();
    const reviews = coordinator(store, bp);
    const { ws, business, property, propertyMatch, draft } = await seed(store, bp);

    const { task } = await reviews.enqueue(ws, draft.id, null);
    expect(task.businessId).toBe(business.id);
    expect(task.propertyId).toBe(property.id);
    expect(task.propertyMatchId).toBe(propertyMatch.id);
    expect(task.contextHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('a later Property edit does NOT mutate the already-created Review snapshot', async () => {
    const store = new InMemoryStore();
    const bp = new InMemoryBusinessPropertyStore();
    const reviews = coordinator(store, bp);
    const { ws, property, draft } = await seed(store, bp);

    const { task } = await reviews.enqueue(ws, draft.id, null);
    const originalHash = task.contextHash;
    const originalPropertyId = task.propertyId;

    // Owner renames + re-capacities the Property AFTER the review exists.
    await bp.updateProperty(property.id, { name: 'Villa B RENAMED', capacity: { maxGuests: 99 } });

    const detail = await reviews.getDetail(ws, task.id);
    // The immutable snapshot is unchanged; the live Property reflects the edit.
    expect(detail.task.propertyId).toBe(originalPropertyId);
    expect(detail.task.contextHash).toBe(originalHash);
    expect(detail.property?.name).toBe('Villa B RENAMED');
  });

  it('exposes Property-match context and reviewer warnings in the detail read model', async () => {
    const store = new InMemoryStore();
    const bp = new InMemoryBusinessPropertyStore();
    const reviews = coordinator(store, bp);
    const { ws, draft } = await seed(store, bp);

    const { task } = await reviews.enqueue(ws, draft.id, null);
    const detail = await reviews.getDetail(ws, task.id);
    expect(detail.propertyMatch?.decision).toBe('MATCH');
    expect(detail.property?.name).toBe('Villa B');
    // The draft policyResult carried NO_PROPERTY_MATCH → surfaced as a warning.
    expect(detail.warnings).toContain('NO_PROPERTY_MATCH');
  });
});
