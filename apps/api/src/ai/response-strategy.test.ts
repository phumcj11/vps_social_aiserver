import { describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { InMemoryStore } from '../store/memory';
import { InMemoryBusinessPropertyStore } from '../business-property/memory-store';
import { loadApiEnv } from '../lib/env';
import { createLogger } from '../lib/logger';
import { AiDraftRepository } from './repository';
import { AiDraftCoordinator } from './coordinator';
import { MockAiDraftProvider } from './provider';
import type { BusinessPolicies, NoPropertyMatchStrategy } from '../business-property/types';

const env = loadApiEnv({});
const logger = createLogger('error');

function policies(strategy: NoPropertyMatchStrategy): BusinessPolicies {
  return {
    availabilityPolicy: 'MANUAL_CONFIRMATION',
    pricingPolicy: 'DO_NOT_MENTION',
    promotionPolicy: 'NONE',
    bookingPolicy: 'CONTACT_ONLY',
    cancellationInfoPolicy: null,
    prohibitedClaims: [],
    escalationPolicy: null,
    responsibleOwner: null,
    operatingHours: null,
    responseSlaMinutes: 10,
    noPropertyMatchStrategy: strategy,
    allowNearMatchSuggestions: false,
  };
}

/** Seed a Business MATCH + a NO_PROPERTY_MATCH row + the given strategy. */
async function seed(
  strategy: NoPropertyMatchStrategy | null,
  propertyDecision: 'MATCH' | 'NO_MATCH' = 'NO_MATCH',
) {
  const store = new InMemoryStore();
  const bpStore = new InMemoryBusinessPropertyStore();
  const ws = randomUUID();
  const coord = new AiDraftCoordinator({
    repo: new AiDraftRepository(store, bpStore),
    provider: new MockAiDraftProvider(),
    env,
    logger,
  });
  const group = await store.createFacebookGroup({
    id: randomUUID(),
    workspaceId: ws,
    facebookGroupId: '1',
    canonicalUrl: `https://www.facebook.com/groups/${randomUUID().slice(0, 8)}`,
    originalUrl: 'https://www.facebook.com/groups/1',
  });
  const business = await store.createBusiness(
    { id: randomUUID(), workspaceId: ws, name: 'บางแสนวิลล่า', slug: randomUUID() },
    { id: randomUUID(), category: 'accommodation', description: 'ที่พักบางแสน' },
  );
  if (strategy) await bpStore.upsertBusinessPolicies(business.id, policies(strategy));
  const signal = await store.createSignal({
    id: randomUUID(),
    workspaceId: ws,
    groupId: group.id,
    facebookPostId: null,
    postUrl: `https://www.facebook.com/groups/1/posts/${randomUUID().slice(0, 8)}`,
    authorName: 'A',
    authorProfile: null,
    message: 'หาพูลวิลล่าบางแสน 20 คน',
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
    decision: 'MATCH',
    reasons: [{ ruleType: 'keyword', ruleValue: 'บางแสน', matched: true }],
    matcherVersion: 'rules-v1',
  });
  await store.createPropertyMatch({
    id: randomUUID(),
    workspaceId: ws,
    opportunityId: opp.id,
    businessMatchId: match.id,
    businessId: business.id,
    propertyId: null,
    decision: propertyDecision,
    reasons: { reasons: ['NO_PROPERTY_MATCH'], rejected: [], requirement: {} },
    matcherVersion: 'property-rules-v1',
    candidatesEvaluated: 2,
  });
  return { coord, ws, matchId: match.id };
}

describe('Response Strategy — NO_PROPERTY_MATCH gating', () => {
  it('defaults to HUMAN_REVIEW (safe) when no strategy is stored', async () => {
    const { coord, ws, matchId } = await seed(null);
    const { draft, created } = await coord.generate(ws, matchId, null);
    expect(created).toBe(true);
    expect(draft).not.toBeNull();
    expect(draft!.status).toBe('needs_review'); // forced review
  });

  it('DO_NOT_RESPOND creates no draft', async () => {
    const { coord, ws, matchId } = await seed('DO_NOT_RESPOND');
    const result = await coord.generate(ws, matchId, null);
    expect(result.draft).toBeNull();
    expect(result.created).toBe(false);
    expect(result.skipped).toBe('DO_NOT_RESPOND');
    expect(await coord.listForMatch(ws, matchId)).toHaveLength(0);
  });

  it('DRAFT_BUSINESS_ONLY creates a business-only draft (Business facts only)', async () => {
    const { coord, ws, matchId } = await seed('DRAFT_BUSINESS_ONLY');
    const { draft } = await coord.generate(ws, matchId, null);
    expect(draft).not.toBeNull();
    expect(draft!.content).toContain('บางแสนวิลล่า'); // business fact allowed
    // NO_PROPERTY_MATCH drafts always require human confirmation (existing safety
    // net); the strategy decides WHETHER to draft, not to bypass that.
    expect(draft!.status).toBe('needs_review');
  });

  it('HUMAN_REVIEW creates the same safe draft and requires review', async () => {
    const { coord, ws, matchId } = await seed('HUMAN_REVIEW');
    const { draft } = await coord.generate(ws, matchId, null);
    expect(draft).not.toBeNull();
    expect(draft!.status).toBe('needs_review');
  });

  it('no Property facts leak into a NO_PROPERTY_MATCH draft (no name/price/capacity/availability)', async () => {
    const { coord, ws, matchId } = await seed('DRAFT_BUSINESS_ONLY');
    const { draft } = await coord.generate(ws, matchId, null);
    const c = draft!.content ?? '';
    for (const forbidden of [
      'Villa',
      '9500',
      '9,500',
      'ราคา',
      'รองรับได้สูงสุด',
      'ว่างวันนี้',
      'พร้อมจอง',
    ]) {
      expect(c.includes(forbidden), `must not contain "${forbidden}"`).toBe(false);
    }
    // The stored input snapshot has no selected property.
    const snap = draft!.inputSnapshot as { property?: unknown; noPropertyMatch?: boolean };
    expect(snap.property).toBeNull();
    expect(snap.noPropertyMatch).toBe(true);
  });

  it('never auto-creates an Action Job (draft only)', async () => {
    const { coord, ws, matchId } = await seed('HUMAN_REVIEW');
    await coord.generate(ws, matchId, null);
    // The coordinator has no Action surface; a draft in needs_review requires
    // explicit human approval downstream. Nothing here creates an action.
    const drafts = await coord.listForMatch(ws, matchId);
    expect(drafts).toHaveLength(1);
    expect(drafts[0]!.status).toBe('needs_review');
  });
});

describe('Response Strategy — CASE 1 (Property MATCH) is unchanged', () => {
  it('a Property MATCH still drafts normally regardless of strategy', async () => {
    // propertyDecision MATCH but propertyId null here — the gate keys on
    // noPropertyMatch (decision === NO_MATCH), so MATCH bypasses the strategy.
    const { coord, ws, matchId } = await seed('DO_NOT_RESPOND', 'MATCH');
    const result = await coord.generate(ws, matchId, null);
    expect(result.draft).not.toBeNull(); // NOT suppressed
  });
});
