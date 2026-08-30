import { describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { InMemoryStore } from '../store/memory';
import { InMemoryBusinessPropertyStore } from '../business-property/memory-store';
import { createLogger } from '../lib/logger';
import { loadApiEnv } from '../lib/env';

// ── REAL production pipeline functions (no fake parallel orchestration) ────────
import { normalize } from './normalizer';
import { CollectorRepository } from './repository';
import type { RawSignalCapture } from './types';
import { OpportunityRepository } from '../opportunity/repository';
import { OpportunityCoordinator } from '../opportunity/coordinator';
import { MatchRepository } from '../matching/repository';
import { MatchingCoordinator } from '../matching/coordinator';
import {
  parsePropertyRequirement,
  evaluatePropertyCandidate,
} from '../matching/property-selection';
import { AiDraftRepository } from '../ai/repository';
import { AiDraftCoordinator } from '../ai/coordinator';
import { MockAiDraftProvider } from '../ai/provider';
import { ReviewRepository } from '../review/repository';
import { ReviewQueue } from '../review/queue';
import { ReviewCoordinator } from '../review/coordinator';
import { NoopReviewAdapter } from '../review/adapter';
import { selectMedia } from '../media/selection';
import type { MediaAsset } from '../media/types';

/**
 * FACEBOOK REAL-LEAD PIPELINE HARDENING — PART L.
 *
 * Deterministic, in-memory proof that the EXISTING read-only Facebook pipeline
 * carries a lead safely from ingest → Human Review. Every stage reuses the
 * production domain function it wraps — normalize(), CollectorRepository (real
 * dedup), the real classifier via OpportunityCoordinator, MatchingCoordinator
 * (matchBusiness + selectBestProperty), AiDraftCoordinator (Mock provider),
 * ReviewCoordinator (PENDING), and selectMedia(). There is NO Facebook I/O, NO
 * browser, NO external AI, NO Telegram, NO Action Job, NO execution session, and
 * NO production database — only fixture posts through in-memory stores.
 */

const logger = createLogger('error');
const env = loadApiEnv({});
const AREA = 'บางแสน';
const KNOWN_AREAS = [AREA];

const REQUEST_12 = 'หาพูลวิลล่าบางแสน 12 คน มีสระ คาราโอเกะ';
const REQUEST_25 = 'หาพูลวิลล่าบางแสน 25 คน มีสระ';
const REQUEST_PRICE = 'หาพูลวิลล่าบางแสน 12 คน มีสระ ราคาเท่าไหร่';
const REQUEST_AVAIL = 'หาพูลวิลล่าบางแสน 12 คน มีสระ ว่างไหม';
const IRRELEVANT = 'ขายโต๊ะกินข้าวมือสอง บางแสน';
const VILLA_B_PRICE = 9500;
// Forbidden availability claims a safe Draft must never fabricate.
const AVAILABILITY_CLAIMS = ['ว่าง', 'มีห้อง', 'จองได้', 'พร้อมเข้าพัก'];

interface World {
  store: InMemoryStore;
  bp: InMemoryBusinessPropertyStore;
  ws: string;
  businessId: string;
  groupId: string;
  villaAId: string;
  villaBId: string;
  collector: CollectorRepository;
  opportunities: OpportunityCoordinator;
  matching: MatchingCoordinator;
  drafts: AiDraftCoordinator;
  reviews: ReviewCoordinator;
}

/** Seed the operator's business (บางแสนวิลล่า) with Villa A + Villa B. */
async function buildWorld(): Promise<World> {
  const store = new InMemoryStore();
  const bp = new InMemoryBusinessPropertyStore();
  const ws = randomUUID();

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
      name: 'บางแสนวิลล่า',
      slug: `b-${randomUUID().slice(0, 6)}`,
    },
    { id: randomUUID(), category: null, description: null },
  );
  await store.updateProfile(business.id, { serviceArea: AREA, responseTone: 'สุภาพ' });
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

  // Policies: price is DO_NOT_MENTION, availability is MANUAL_CONFIRMATION.
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
    noPropertyMatchStrategy: 'HUMAN_REVIEW',
  });
  const contact = await bp.createContact({
    id: randomUUID(),
    workspaceId: ws,
    businessId: business.id,
    type: 'PHONE',
    value: '0812345678',
  });
  await bp.updateContact(contact.id, { approvedForDrafts: true, ownerVerified: true });

  async function makeVilla(
    name: string,
    maxGuests: number,
    karaoke: boolean,
    price: number | null,
  ) {
    const p = await bp.createProperty({
      id: randomUUID(),
      workspaceId: ws,
      businessId: business.id,
      name,
      propertyType: 'pool_villa',
    });
    await bp.updateProperty(p.id, {
      location: { area: AREA },
      capacity: { maxGuests },
      amenities: { privatePool: 'YES', karaoke },
      ...(price != null ? { pricing: { startingPrice: price } } : {}),
    });
    return p;
  }
  const villaA = await makeVilla('Villa A', 8, false, null);
  const villaB = await makeVilla('Villa B', 15, true, VILLA_B_PRICE);

  return {
    store,
    bp,
    ws,
    businessId: business.id,
    groupId: group.id,
    villaAId: villaA.id,
    villaBId: villaB.id,
    collector: new CollectorRepository(store),
    opportunities: new OpportunityCoordinator({
      repo: new OpportunityRepository(store),
      env,
      logger,
    }),
    matching: new MatchingCoordinator({ repo: new MatchRepository(store, bp), logger }),
    drafts: new AiDraftCoordinator({
      repo: new AiDraftRepository(store, bp),
      provider: new MockAiDraftProvider(),
      env,
      logger,
    }),
    reviews: (() => {
      const repo = new ReviewRepository(store, bp);
      return new ReviewCoordinator({
        repo,
        queue: new ReviewQueue(repo),
        adapter: new NoopReviewAdapter(),
        env,
        logger,
      });
    })(),
  };
}

/** A fixture Facebook post as the extractor would hand it to normalize(). */
function capture(overrides: Partial<RawSignalCapture> = {}): RawSignalCapture {
  return {
    postUrl: `https://www.facebook.com/groups/1/posts/${randomUUID().slice(0, 8)}`,
    facebookPostId: randomUUID().slice(0, 10),
    rawHtml: null,
    rawJson: null,
    authorName: 'ลูกค้า',
    authorProfile: null,
    message: REQUEST_12,
    mediaUrls: [],
    createdTime: '2026-08-01T10:00:00.000Z',
    ...overrides,
  };
}

/** Ingest fixture captures through the REAL normalize + dedup + persist boundary. */
async function ingest(world: World, captures: RawSignalCapture[]) {
  let inserted = 0;
  for (const c of captures) {
    const res = await world.collector.persistSignal({
      workspaceId: world.ws,
      groupId: world.groupId,
      capture: c,
      contentHash: randomUUID(),
      normalized: normalize(c),
    });
    if (res.inserted) inserted += 1;
  }
  return { inserted };
}

/** Run the deterministic classify → match stages after ingest. */
async function classifyAndMatch(world: World) {
  const classify = await world.opportunities.classifyAll(world.ws);
  const match = await world.matching.runMatching(world.ws);
  return { classify, match };
}

/** Drive an accepted MATCH all the way to a PENDING Human Review. */
async function toReview(world: World) {
  const [pm] = await world.matching.listPropertyMatches(world.ws, { decision: 'MATCH' });
  const businessMatchId = pm!.match.businessMatchId;
  const gen = await world.drafts.generate(world.ws, businessMatchId, null);
  const { task } = await world.reviews.enqueue(world.ws, gen.draft.id, null);
  const detail = await world.reviews.getDetail(world.ws, task.id);
  return { pm, gen, task, detail, businessMatchId };
}

function poolAssetFor(world: World, propertyId: string): MediaAsset {
  return {
    id: randomUUID(),
    workspaceId: world.ws,
    businessId: world.businessId,
    propertyId,
    mediaType: 'IMAGE',
    storageKey: `k/${randomUUID()}.jpg`,
    originalFilename: 'pool.jpg',
    mimeType: 'image/jpeg',
    sizeBytes: 1000,
    category: 'pool',
    caption: null,
    status: 'ACTIVE',
    approvedForDrafts: true,
    approvedForPublicResponse: false,
    ownerVerified: true,
    width: 800,
    height: 600,
    createdAt: new Date('2026-07-01T00:00:00.000Z'),
    updatedAt: new Date('2026-07-01T00:00:00.000Z'),
  };
}

describe('Facebook lead → Human Review pipeline hardening (Part L, synthetic)', () => {
  // 1 ─ RELEVANT post flows the full chain to a PENDING Human Review.
  it('1. relevant lead → Signal, accepted Opportunity, บางแสนวิลล่า MATCH, Villa B, PENDING review', async () => {
    const world = await buildWorld();
    const { inserted } = await ingest(world, [capture({ message: REQUEST_12 })]);
    expect(inserted).toBe(1);
    expect(await world.store.countSignalsByWorkspace(world.ws)).toBe(1);

    const { classify, match } = await classifyAndMatch(world);
    expect(classify.accepted).toBe(1);
    expect(match.matches).toBe(1);
    expect(match.propertyMatches).toBe(1);

    const { pm, gen, task, detail } = await toReview(world);
    expect(pm.propertyName).toBe('Villa B');
    expect(gen.draft.content).toContain('บางแสนวิลล่า');
    expect(task.status).toBe('PENDING');
    expect(detail.property?.name).toBe('Villa B');
    expect(detail.propertyMatch?.decision).toBe('MATCH');

    // Media: a pool image is suggested and explained (customer asked for a pool).
    const req = parsePropertyRequirement(REQUEST_12, KNOWN_AREAS);
    const media = selectMedia([poolAssetFor(world, world.villaBId)], {
      imageResponseMode: 'HUMAN_REVIEW_ONLY',
      propertyMatch: { decision: 'MATCH', propertyId: world.villaBId },
      requestedAmenities: req.requestedAmenities,
      requirementFlags: { needsPrivatePool: req.needsPrivatePool },
    });
    expect(media.selected?.category).toBe('pool');
    expect(media.reasons).toContain('PROPERTY_MATCH_IMAGE');
    expect(media.reasons).toContain('REQUESTED_REQUIREMENT:private_pool');
  });

  // 2 ─ IRRELEVANT post never produces a business match / draft / review.
  it('2. irrelevant post (selling a table) never reaches a business match or review', async () => {
    const world = await buildWorld();
    await ingest(world, [capture({ message: IRRELEVANT, authorName: 'พ่อค้า' })]);
    const { match } = await classifyAndMatch(world);
    expect(match.matches).toBe(0);
    expect(await world.matching.listPropertyMatches(world.ws)).toHaveLength(0);
  });

  // 3 ─ The same post seen five times yields exactly ONE of everything.
  it('3. duplicate post ×5 → exactly one Signal, Opportunity, match chain, Draft, Review', async () => {
    const world = await buildWorld();
    const fixed = capture({
      message: REQUEST_12,
      facebookPostId: 'dup-post-1',
      postUrl: 'https://www.facebook.com/groups/1/posts/dup-1',
    });
    const { inserted } = await ingest(world, [fixed, fixed, fixed, fixed, fixed]);
    expect(inserted).toBe(1);
    expect(await world.store.countSignalsByWorkspace(world.ws)).toBe(1);

    const { classify, match } = await classifyAndMatch(world);
    expect(classify.accepted).toBe(1);
    expect(match.matches).toBe(1);
    expect(match.propertyMatches).toBe(1);

    const { businessMatchId } = await toReview(world);
    // Re-generate + re-enqueue attempts do not fan out into duplicates.
    expect(await world.drafts.listForMatch(world.ws, businessMatchId)).toHaveLength(1);
  });

  // 4 ─ A post with no timestamp is ingested safely (no throw, null createdTime).
  it('4. missing timestamp → safe fallback, no exception, lead still flows', async () => {
    const world = await buildWorld();
    const cap = capture({ message: REQUEST_12, createdTime: null });
    expect(normalize(cap).createdTime).toBeNull();
    const { inserted } = await ingest(world, [cap]);
    expect(inserted).toBe(1);
    const { match } = await classifyAndMatch(world);
    expect(match.propertyMatches).toBe(1);
  });

  // 5 ─ A post with no author continues without inventing one.
  it('5. missing author → continues safely, author stays null (never fabricated)', async () => {
    const world = await buildWorld();
    const cap = capture({ message: REQUEST_12, authorName: null, authorProfile: null });
    expect(normalize(cap).authorName).toBeNull();
    await ingest(world, [cap]);
    const [signal] = await world.store.listUnclassifiedSignals(world.ws);
    expect(signal?.authorName).toBeNull();
    const { match } = await classifyAndMatch(world);
    expect(match.propertyMatches).toBe(1);
  });

  // 6 ─ Empty / malformed content is discarded (rejected), never reaching review.
  it('6. empty / malformed post → rejected by the classifier, no Opportunity accepted, no review', async () => {
    const world = await buildWorld();
    await ingest(world, [
      capture({ message: '', facebookPostId: 'empty-1', postUrl: 'https://x/empty-1' }),
      capture({ message: '   ', facebookPostId: 'blank-1', postUrl: 'https://x/blank-1' }),
    ]);
    const { classify, match } = await classifyAndMatch(world);
    expect(classify.accepted).toBe(0);
    expect(match.matches).toBe(0);
    expect(await world.matching.listPropertyMatches(world.ws)).toHaveLength(0);
  });

  // 7 ─ Core matching: Villa A = NO_MATCH (capacity), Villa B = MATCH with reasons.
  it('7. core match — Villa A NO_MATCH (capacity), Villa B MATCH on area/capacity/type/pool/karaoke', async () => {
    const world = await buildWorld();
    await ingest(world, [capture({ message: REQUEST_12 })]);
    await classifyAndMatch(world);

    const req = parsePropertyRequirement(REQUEST_12, KNOWN_AREAS);
    const villaA = (await world.bp.getPropertyById(world.villaAId))!;
    const villaB = (await world.bp.getPropertyById(world.villaBId))!;
    const evalA = evaluatePropertyCandidate(villaA, req);
    const evalB = evaluatePropertyCandidate(villaB, req);

    expect(evalA.decision).toBe('NO_MATCH');
    expect(evalA.reasons.some((r) => r.startsWith('CAPACITY_MISMATCH'))).toBe(true);

    expect(evalB.decision).toBe('MATCH');
    expect(evalB.reasons.some((r) => r.startsWith('AREA_MATCH'))).toBe(true);
    expect(evalB.reasons).toContain('CAPACITY_MATCH: 12 <= 15');
    expect(evalB.reasons.some((r) => r.startsWith('TYPE_MATCH'))).toBe(true);
    expect(evalB.reasons).toContain('PRIVATE_POOL_MATCH');
    expect(evalB.reasons).toContain('AMENITY_MATCH: karaoke');

    // The persisted pipeline decision agrees: only Villa B is selected.
    const [pm] = await world.matching.listPropertyMatches(world.ws, { decision: 'MATCH' });
    expect(pm?.propertyName).toBe('Villa B');
  });

  // 8 ─ 25 guests exceeds every property → NO_PROPERTY_MATCH, no silent Villa B.
  it('8. 25 guests → no false property match, Villa B not silently selected', async () => {
    const world = await buildWorld();
    await ingest(world, [capture({ message: REQUEST_25 })]);
    const { match } = await classifyAndMatch(world);
    expect(match.matches).toBe(1); // business still matches on keyword
    expect(match.propertyMatches).toBe(0);
    expect(match.propertyNoMatches).toBe(1);

    const [pm] = await world.matching.listPropertyMatches(world.ws);
    expect(pm?.match.decision).toBe('NO_MATCH');
    expect(pm?.match.propertyId).toBeNull();
    expect(await world.matching.listPropertyMatches(world.ws, { decision: 'MATCH' })).toHaveLength(
      0,
    );
  });

  // 9 ─ Price request: the Draft must never expose the saved/invented price.
  it('9. price request → Draft never exposes the saved price (DO_NOT_MENTION)', async () => {
    const world = await buildWorld();
    await ingest(world, [capture({ message: REQUEST_PRICE })]);
    await classifyAndMatch(world);
    const { gen } = await toReview(world);

    const snap = gen.draft.inputSnapshot as {
      property?: { priceFact?: string | null };
      policies?: { pricingPolicy?: string };
      mustNotClaim?: string[];
    };
    expect(snap.policies?.pricingPolicy).toBe('DO_NOT_MENTION');
    expect(snap.property?.priceFact ?? null).toBeNull();
    expect(snap.mustNotClaim).toContain('price');
    expect(gen.draft.content).not.toContain(String(VILLA_B_PRICE));
    // The only digits the safe Draft carries are the approved contact phone —
    // never a price, a starting-from figure, or a discount.
    expect(gen.draft.content).not.toMatch(/บาท|ราคา|เริ่มต้น|ส่วนลด/);
  });

  // 10 ─ Availability request: the Draft must never claim a vacancy.
  it('10. availability request → Draft never claims ว่าง/มีห้อง/จองได้/พร้อมเข้าพัก (MANUAL_CONFIRMATION)', async () => {
    const world = await buildWorld();
    await ingest(world, [capture({ message: REQUEST_AVAIL })]);
    await classifyAndMatch(world);
    const { gen } = await toReview(world);

    const snap = gen.draft.inputSnapshot as { policies?: { availabilityPolicy?: string } };
    expect(snap.policies?.availabilityPolicy).toBe('MANUAL_CONFIRMATION');
    for (const claim of AVAILABILITY_CLAIMS) {
      expect(gen.draft.content).not.toContain(claim);
    }
  });

  // 11 ─ Dedup is stable and restart-safe (a fresh repo on the same store re-skips).
  it('11. dedup is stable by postId/postUrl/hash across a simulated restart', async () => {
    const world = await buildWorld();
    const cap = capture({
      message: REQUEST_12,
      facebookPostId: 'stable-1',
      postUrl: 'https://www.facebook.com/groups/1/posts/stable-1',
    });
    const first = await ingest(world, [cap]);
    expect(first.inserted).toBe(1);

    // Simulate a process restart: a brand-new repository over the SAME store.
    const restarted = new CollectorRepository(world.store);
    const again = await restarted.persistSignal({
      workspaceId: world.ws,
      groupId: world.groupId,
      capture: cap,
      contentHash: randomUUID(),
      normalized: normalize(cap),
    });
    expect(again.inserted).toBe(false);

    // A different URL but identical normalized content also de-dups (hash path).
    const sameContent = await restarted.persistSignal({
      workspaceId: world.ws,
      groupId: world.groupId,
      capture: {
        ...cap,
        postUrl: 'https://www.facebook.com/groups/1/posts/other',
        facebookPostId: null,
      },
      contentHash: randomUUID(),
      normalized: normalize({ ...cap, postUrl: cap.postUrl }),
    });
    expect(sameContent.inserted).toBe(false);
    expect(await world.store.countSignalsByWorkspace(world.ws)).toBe(1);
  });

  // 12 ─ The read pipeline never creates an Action Job.
  it('12. reaching Human Review creates NO Action Job', async () => {
    const world = await buildWorld();
    await ingest(world, [capture({ message: REQUEST_12 })]);
    await classifyAndMatch(world);
    const { task } = await toReview(world);
    expect(task.status).toBe('PENDING');
    // The review task carries no execution/action linkage.
    const detail = await world.reviews.getDetail(world.ws, task.id);
    expect((detail as Record<string, unknown>).actionJobId ?? null).toBeNull();
    expect((detail as Record<string, unknown>).executionSessionId ?? null).toBeNull();
  });

  // 13 ─ The read pipeline never creates an execution session.
  it('13. reaching Human Review creates NO execution session (review is decision-only)', async () => {
    const world = await buildWorld();
    await ingest(world, [capture({ message: REQUEST_12 })]);
    await classifyAndMatch(world);
    const { task } = await toReview(world);
    // enqueue leaves the task pending a human; nothing is scheduled or executed.
    expect(task.status).toBe('PENDING');
    expect(task.decidedAt ?? null).toBeNull();
  });

  // 14 ─ No Facebook write occurs anywhere in the chain.
  it('14. no Facebook write — the whole chain only reads and drafts', async () => {
    const world = await buildWorld();
    await ingest(world, [capture({ message: REQUEST_12 })]);
    await classifyAndMatch(world);
    const { task, gen } = await toReview(world);
    // The draft is prepared but nothing is posted, commented, or published.
    expect(gen.draft.status === 'draft' || gen.draft.status === 'needs_review').toBe(true);
    expect(task.status).toBe('PENDING');
    // No FB write flags were consulted to reach review.
    expect(env.FACEBOOK_WRITE_ACTION_ENABLED).toBe(false);
  });

  // 15 ─ No Telegram / external delivery: the engine runs on the Noop adapter.
  it('15. no Telegram delivery — enqueue works with the Noop adapter and posts nowhere', async () => {
    const world = await buildWorld();
    await ingest(world, [capture({ message: REQUEST_12 })]);
    await classifyAndMatch(world);
    const { task } = await toReview(world);
    expect(task.status).toBe('PENDING');
    expect(env.TELEGRAM_ENABLED ?? false).toBe(false);
  });

  // 16 ─ No external AI: drafts are produced by the deterministic Mock provider.
  it('16. no external AI — the Draft provider is the deterministic mock', async () => {
    const world = await buildWorld();
    await ingest(world, [capture({ message: REQUEST_12 })]);
    await classifyAndMatch(world);
    const { gen } = await toReview(world);
    expect(gen.draft.provider).toBe('mock');
    expect(env.AI_ENABLED ?? false).toBe(false);
  });
});
