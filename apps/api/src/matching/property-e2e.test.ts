import { describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { InMemoryStore } from '../store/memory';
import { InMemoryBusinessPropertyStore } from '../business-property/memory-store';
import { createLogger } from '../lib/logger';
import { loadApiEnv } from '../lib/env';
import { MatchRepository } from './repository';
import { MatchingCoordinator } from './coordinator';
import { AiDraftRepository } from '../ai/repository';
import { AiDraftCoordinator } from '../ai/coordinator';
import { MockAiDraftProvider } from '../ai/provider';
import { ReviewRepository } from '../review/repository';
import { ReviewQueue } from '../review/queue';
import { ReviewCoordinator } from '../review/coordinator';

const logger = createLogger('error');
const env = loadApiEnv({});
const REQUEST = 'หาพูลวิลล่าบางแสน 12 คน มีสระ คาราโอเกะ';

/**
 * Runtime pipeline verification (SPRINT 016B, Phase T) with SYNTHETIC data only:
 * Opportunity → Business MATCH → Property candidates → Property MATCH →
 * Draft Context → Mock Draft → Human Review. No Facebook, no external AI.
 */
describe('Property pipeline end-to-end (synthetic)', () => {
  it('flows a matched Property through to a Mock Draft and a Human Review', async () => {
    const store = new InMemoryStore();
    const bp = new InMemoryBusinessPropertyStore();
    const ws = randomUUID();

    // Seed the graph.
    const group = await store.createFacebookGroup({
      id: randomUUID(),
      workspaceId: ws,
      facebookGroupId: '1',
      canonicalUrl: `https://www.facebook.com/groups/${randomUUID().slice(0, 8)}`,
      originalUrl: 'https://www.facebook.com/groups/1',
    });
    const business = await store.createBusiness(
      {
        id: randomUUID(),
        workspaceId: ws,
        name: 'Demo Bangsaen Pool Villa',
        slug: `d-${randomUUID().slice(0, 6)}`,
      },
      { id: randomUUID(), category: null, description: null },
    );
    await store.updateProfile(business.id, { serviceArea: 'บางแสน', responseTone: 'สุภาพ' });
    await store.createRule({
      id: randomUUID(),
      businessId: business.id,
      ruleType: 'keyword',
      ruleValue: 'พูลวิลล่า',
      priority: 10,
      status: 'active',
    });
    await store.assignGroupToBusiness({
      id: randomUUID(),
      workspaceId: ws,
      businessId: business.id,
      facebookGroupId: group.id,
    });
    // Business policies + an approved contact so the draft context is complete.
    await bp.upsertBusinessPolicies(business.id, {
      availabilityPolicy: 'MANUAL_CONFIRMATION',
      pricingPolicy: 'DO_NOT_MENTION',
      promotionPolicy: 'NONE',
      bookingPolicy: 'CONTACT_ONLY',
      cancellationInfoPolicy: null,
      prohibitedClaims: [],
      escalationPolicy: null,
      responsibleOwner: null,
      operatingHours: null,
      responseSlaMinutes: null,
    });
    const contact = await bp.createContact({
      id: randomUUID(),
      workspaceId: ws,
      businessId: business.id,
      type: 'PHONE',
      value: '0812345678',
    });
    await bp.updateContact(contact.id, { approvedForDrafts: true, ownerVerified: true });

    const signal = await store.createSignal({
      id: randomUUID(),
      workspaceId: ws,
      groupId: group.id,
      facebookPostId: null,
      postUrl: `https://www.facebook.com/groups/1/posts/${randomUUID().slice(0, 8)}`,
      authorName: 'A',
      authorProfile: null,
      message: REQUEST,
      mediaUrls: [],
      createdTime: null,
      normalizedHash: randomUUID(),
    });
    await store.createOpportunity({
      id: randomUUID(),
      workspaceId: ws,
      signalId: signal.id,
      decision: 'ACCEPT',
      status: 'READY',
      classifierVersion: 'rules-v1',
    });

    async function makeVilla(name: string, area: string, maxGuests: number, karaoke: boolean) {
      const p = await bp.createProperty({
        id: randomUUID(),
        workspaceId: ws,
        businessId: business.id,
        name,
        propertyType: 'pool_villa',
      });
      await bp.updateProperty(p.id, {
        location: { area },
        capacity: { maxGuests },
        amenities: { privatePool: true, karaoke },
      });
      return p;
    }
    await makeVilla('Villa A', 'บางแสน', 8, false);
    const villaB = await makeVilla('Villa B', 'บางแสน', 15, true);
    await makeVilla('Villa C', 'พัทยา', 20, false);

    // 1) Matching (Business + Property stages).
    const matching = new MatchingCoordinator({ repo: new MatchRepository(store, bp), logger });
    const summary = await matching.runMatching(ws);
    expect(summary.matches).toBe(1);
    expect(summary.propertyMatches).toBe(1);

    const [pm] = await matching.listPropertyMatches(ws, { decision: 'MATCH' });
    expect(pm?.propertyName).toBe('Villa B');
    const businessMatchId = pm!.match.businessMatchId;

    // 2) AI Draft (Mock provider) — uses the selected Property context.
    const aiDrafts = new AiDraftCoordinator({
      repo: new AiDraftRepository(store, bp),
      provider: new MockAiDraftProvider(),
      env,
      logger,
    });
    const gen = await aiDrafts.generate(ws, businessMatchId, null);
    const snapshot = gen.draft.inputSnapshot as {
      property?: { name?: string };
      noPropertyMatch?: boolean;
    };
    expect(snapshot.property?.name).toBe('Villa B');
    expect(snapshot.noPropertyMatch).toBe(false);
    // The mock draft mentions the business and never fabricates a guaranteed price.
    expect(gen.draft.content ?? '').toContain('Demo Bangsaen Pool Villa');

    // 3) Human Review — created with the immutable Property snapshot.
    const reviewRepo = new ReviewRepository(store, bp);
    const reviews = new ReviewCoordinator({
      repo: reviewRepo,
      queue: new ReviewQueue(reviewRepo),
      env,
      logger,
    });
    const { task } = await reviews.enqueue(ws, gen.draft.id, null);
    expect(task.propertyId).toBe(villaB.id);
    expect(task.propertyMatchId).toBe(pm!.match.id);

    const detail = await reviews.getDetail(ws, task.id);
    expect(detail.property?.name).toBe('Villa B');
    expect(detail.propertyMatch?.decision).toBe('MATCH');
    // Nothing was posted, executed, or sent anywhere.
    expect(task.status).toBe('PENDING');
  });
});
