import { describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { InMemoryStore } from '../store/memory';
import { InMemoryBusinessPropertyStore } from '../business-property/memory-store';
import { createLogger } from '../lib/logger';
import { loadApiEnv } from '../lib/env';

import { RoutingRepository } from './repository';
import { RoutingCoordinator } from './coordinator';
import { RoutingError } from './errors';
import { MatchRepository } from '../matching/repository';
import { MatchingCoordinator } from '../matching/coordinator';
import { AiDraftRepository } from '../ai/repository';
import { AiDraftCoordinator } from '../ai/coordinator';
import { MockAiDraftProvider } from '../ai/provider';
import { ReviewRepository } from '../review/repository';
import { ReviewQueue } from '../review/queue';
import { ReviewCoordinator } from '../review/coordinator';
import { NoopReviewAdapter } from '../review/adapter';
import { ReviewError } from '../review/errors';
import { AiDraftError } from '../ai/errors';
import { selectMedia } from '../media/selection';
import { parsePropertyRequirement } from '../matching/property-selection';

/**
 * MODEL C — Central Scanner cross-workspace routing WITH customer-safe lead
 * projection (M2b, synthetic).
 *
 * One central Signal/Opportunity in a SYSTEM source tenant fans out to multiple
 * customer workspaces. For each MATCHING Business, an IMMUTABLE customer-safe
 * projection (Signal + Opportunity, safe facts only) is created in the customer
 * workspace and the Business Match references the PROJECTED Opportunity — so
 * match+opportunity+signal+business all share the customer workspace and the
 * existing buildDraftContext single-workspace guard passes UNCHANGED. The full
 * downstream (Property → Draft → Media → Human Review) then runs per customer.
 *
 * Nothing weakens a tenant guard; no scanner session/account data ever crosses;
 * no Action Job / execution / Facebook write / Telegram / external AI is touched.
 */

const logger = createLogger('error');
const env = loadApiEnv({});
const REQUEST = 'หาพูลวิลล่าบางแสน 12 คน มีสระ คาราโอเกะ';
const AREA = 'บางแสน';

interface Wiring {
  store: InMemoryStore;
  bp: InMemoryBusinessPropertyStore;
  routing: RoutingCoordinator;
  routingRepo: RoutingRepository;
  matching: MatchingCoordinator;
  drafts: AiDraftCoordinator;
  reviews: ReviewCoordinator;
}

function wire(): Wiring {
  const store = new InMemoryStore();
  const bp = new InMemoryBusinessPropertyStore();
  const routingRepo = new RoutingRepository(store, bp);
  const reviewRepo = new ReviewRepository(store, bp);
  return {
    store,
    bp,
    routingRepo,
    routing: new RoutingCoordinator({ repo: routingRepo, logger }),
    matching: new MatchingCoordinator({ repo: new MatchRepository(store, bp), logger }),
    drafts: new AiDraftCoordinator({
      repo: new AiDraftRepository(store, bp),
      provider: new MockAiDraftProvider(),
      env,
      logger,
    }),
    reviews: new ReviewCoordinator({
      repo: reviewRepo,
      queue: new ReviewQueue(reviewRepo),
      adapter: new NoopReviewAdapter(),
      env,
      logger,
    }),
  };
}

/** A SYSTEM source tenant: source group + one accepted central Opportunity. */
async function seedSource(w: Wiring, message = REQUEST) {
  const sourceWs = randomUUID();
  const group = await w.store.createFacebookGroup({
    id: randomUUID(),
    workspaceId: sourceWs,
    facebookGroupId: 'src-1',
    canonicalUrl: `https://www.facebook.com/groups/${randomUUID().slice(0, 8)}`,
    originalUrl: 'https://www.facebook.com/groups/src-1',
  });
  const signal = await w.store.createSignal({
    id: randomUUID(),
    workspaceId: sourceWs,
    groupId: group.id,
    facebookPostId: `post-${randomUUID().slice(0, 8)}`,
    postUrl: `https://www.facebook.com/groups/src-1/posts/${randomUUID().slice(0, 8)}`,
    authorName: 'คุณลูกค้า',
    authorProfile: null,
    message,
    mediaUrls: [],
    createdTime: null,
    normalizedHash: randomUUID(),
  });
  const opp = await w.store.createOpportunity({
    id: randomUUID(),
    workspaceId: sourceWs,
    signalId: signal.id,
    decision: 'ACCEPT',
    status: 'READY',
    classifierVersion: 'rules-v2',
  });
  await w.store.createOpportunityEvent({
    id: randomUUID(),
    opportunityId: opp.id,
    event: 'OpportunityCreated',
    payload: { decision: 'ACCEPT', reasons: [{ code: 'HAS_TEXT', passed: true }] },
  });
  return { sourceWs, groupId: group.id, signalId: signal.id, opportunityId: opp.id };
}

interface Customer {
  ws: string;
  businessId: string;
  propertyId: string;
  mediaId: string;
}

/** Create a business (+ rule + property + policies + contact + media) in a workspace. */
async function seedBusiness(
  w: Wiring,
  ws: string,
  name: string,
  opts: {
    ruleValue?: string;
    maxGuests?: number;
    karaoke?: boolean;
    price?: number | null;
    pricingPolicy?: 'DO_NOT_MENTION' | 'STARTING_FROM';
    availabilityPolicy?: 'MANUAL_CONFIRMATION' | 'DO_NOT_MENTION';
  } = {},
): Promise<Customer> {
  const {
    ruleValue = 'พูลวิลล่า',
    maxGuests = 15,
    karaoke = true,
    price = null,
    pricingPolicy = 'DO_NOT_MENTION',
    availabilityPolicy = 'MANUAL_CONFIRMATION',
  } = opts;
  const business = await w.store.createBusiness(
    { id: randomUUID(), workspaceId: ws, name, slug: `${name}-${randomUUID().slice(0, 6)}` },
    { id: randomUUID(), category: null, description: null },
  );
  await w.store.updateProfile(business.id, { serviceArea: AREA, responseTone: 'สุภาพ' });
  await w.store.createRule({
    id: randomUUID(),
    businessId: business.id,
    ruleType: 'keyword',
    ruleValue,
    priority: 10,
    status: 'active',
  });
  await w.bp.upsertBusinessPolicies(business.id, {
    availabilityPolicy,
    pricingPolicy,
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
  const contact = await w.bp.createContact({
    id: randomUUID(),
    workspaceId: ws,
    businessId: business.id,
    type: 'PHONE',
    value: '0812345678',
  });
  await w.bp.updateContact(contact.id, { approvedForDrafts: true, ownerVerified: true });

  const property = await w.bp.createProperty({
    id: randomUUID(),
    workspaceId: ws,
    businessId: business.id,
    name: `${name}-Villa`,
    propertyType: 'pool_villa',
  });
  await w.bp.updateProperty(property.id, {
    location: { area: AREA },
    capacity: { maxGuests },
    amenities: { privatePool: 'YES', karaoke },
    ...(price != null ? { pricing: { startingPrice: price } } : {}),
  });

  const media = await w.bp.createMediaAsset({
    id: randomUUID(),
    workspaceId: ws,
    businessId: business.id,
    propertyId: property.id,
    storageKey: `k/${randomUUID()}.jpg`,
    originalFilename: 'pool.jpg',
    mimeType: 'image/jpeg',
    sizeBytes: 1000,
    category: 'pool',
    caption: null,
    width: 800,
    height: 600,
  });
  await w.bp.updateMediaAsset(media.id, { approvedForDrafts: true, ownerVerified: true });

  return { ws, businessId: business.id, propertyId: property.id, mediaId: media.id };
}

/** A customer = a fresh workspace with one business. */
async function seedCustomer(
  w: Wiring,
  name: string,
  opts: Parameters<typeof seedBusiness>[3] = {},
): Promise<Customer> {
  return seedBusiness(w, randomUUID(), name, opts);
}

async function subscribe(w: Wiring, sourceGroupId: string, businessId: string) {
  return w.routingRepo.createSubscription({ id: randomUUID(), sourceGroupId, businessId });
}

async function matchesOf(w: Wiring, customerWs: string) {
  return w.store.listBusinessMatchesByWorkspace(customerWs);
}
async function matchOf(w: Wiring, customerWs: string) {
  const [m] = await matchesOf(w, customerWs);
  return m ?? null;
}
async function projectedOppOf(w: Wiring, customerWs: string) {
  const [o] = await w.store.listOpportunitiesByWorkspace(customerWs);
  return o ?? null;
}

/** Drive one routed customer Match through Property → Draft → Review. */
async function downstream(w: Wiring, customer: Customer) {
  const match = await matchOf(w, customer.ws);
  if (!match) return { match: null, propertyMatch: null, draft: null, task: null };
  const propertyMatch = await w.matching.runPropertyStageForMatch(customer.ws, match.id);
  const gen = await w.drafts.generate(customer.ws, match.id, null);
  const { task } = await w.reviews.enqueue(customer.ws, gen.draft.id, null);
  return { match, propertyMatch, draft: gen.draft, task };
}

describe('MODEL C central scanner routing + customer-safe projection (M2b, synthetic)', () => {
  // 1 ─ central Opportunity → Customer A projection
  it('1. central Opportunity projects into Customer A; Match references the projection', async () => {
    const w = wire();
    const src = await seedSource(w);
    const a = await seedCustomer(w, 'A');
    await subscribe(w, src.groupId, a.businessId);

    const summary = await w.routing.routeOpportunity(src.sourceWs, src.opportunityId);
    expect(summary.matches).toBe(1);
    expect(summary.projectionsCreated).toBe(1);

    const projOpp = await projectedOppOf(w, a.ws);
    const match = await matchOf(w, a.ws);
    expect(projOpp?.sourceOpportunityId).toBe(src.opportunityId);
    expect(match?.opportunityId).toBe(projOpp?.id); // NOT the central id
    expect(match?.opportunityId).not.toBe(src.opportunityId);
  });

  // 2 ─ projected Signal workspace = Customer A
  it('2. projected Signal belongs to Customer A (safe facts, source group referenced)', async () => {
    const w = wire();
    const src = await seedSource(w);
    const a = await seedCustomer(w, 'A');
    await subscribe(w, src.groupId, a.businessId);
    await w.routing.routeOpportunity(src.sourceWs, src.opportunityId);

    const projOpp = await projectedOppOf(w, a.ws);
    const projSignal = await w.store.getSignalById(projOpp!.signalId);
    expect(projSignal?.workspaceId).toBe(a.ws);
    expect(projSignal?.message).toBe(REQUEST); // customer-visible text copied
    expect(projSignal?.groupId).toBe(src.groupId); // source group referenced, not copied
    // The source Signal remains in the source tenant, untouched.
    const srcSignal = await w.store.getSignalById(src.signalId);
    expect(srcSignal?.workspaceId).toBe(src.sourceWs);
  });

  // 3 ─ projected Opportunity workspace = Customer A
  it('3. projected Opportunity belongs to Customer A and links to the source (audit-only)', async () => {
    const w = wire();
    const src = await seedSource(w);
    const a = await seedCustomer(w, 'A');
    await subscribe(w, src.groupId, a.businessId);
    await w.routing.routeOpportunity(src.sourceWs, src.opportunityId);

    const projOpp = await projectedOppOf(w, a.ws);
    expect(projOpp?.workspaceId).toBe(a.ws);
    expect(projOpp?.sourceOpportunityId).toBe(src.opportunityId);
    expect(projOpp?.decision).toBe('ACCEPT');
  });

  // 4 ─ Business Match workspace = Customer A
  it('4. Business Match belongs to Customer A', async () => {
    const w = wire();
    const src = await seedSource(w);
    const a = await seedCustomer(w, 'A');
    await subscribe(w, src.groupId, a.businessId);
    await w.routing.routeOpportunity(src.sourceWs, src.opportunityId);
    const match = await matchOf(w, a.ws);
    expect(match?.workspaceId).toBe(a.ws);
    expect(match?.businessId).toBe(a.businessId);
    expect(match?.decision).toBe('MATCH');
  });

  // 5 + 6 ─ buildDraftContext passes (guard unchanged) and a Draft is generated
  it('5+6. Draft generates for a routed Match — buildDraftContext guard passes UNCHANGED', async () => {
    const w = wire();
    const src = await seedSource(w);
    const a = await seedCustomer(w, 'A');
    await subscribe(w, src.groupId, a.businessId);
    await w.routing.routeOpportunity(src.sourceWs, src.opportunityId);

    const match = await matchOf(w, a.ws);
    await w.matching.runPropertyStageForMatch(a.ws, match!.id);
    const gen = await w.drafts.generate(a.ws, match!.id, null);
    expect(gen.created).toBe(true);
    expect(gen.draft.provider).toBe('mock');
    expect(gen.draft.content).toContain('A-Villa');
  });

  // 7 ─ Property selected from Customer A only
  it('7. Property matching selects Customer A’s own property', async () => {
    const w = wire();
    const src = await seedSource(w);
    const a = await seedCustomer(w, 'A', { maxGuests: 15 });
    await subscribe(w, src.groupId, a.businessId);
    await w.routing.routeOpportunity(src.sourceWs, src.opportunityId);
    const pm = await w.matching.runPropertyStageForMatch(a.ws, (await matchOf(w, a.ws))!.id);
    expect(pm?.decision).toBe('MATCH');
    expect(pm?.propertyId).toBe(a.propertyId);
    expect(pm?.workspaceId).toBe(a.ws);
  });

  // 8 ─ Customer A media only
  it('8. media selection uses Customer A’s own approved assets only', async () => {
    const w = wire();
    const src = await seedSource(w);
    const a = await seedCustomer(w, 'A');
    const b = await seedCustomer(w, 'B');
    await subscribe(w, src.groupId, a.businessId);
    await subscribe(w, src.groupId, b.businessId);
    await w.routing.routeOpportunity(src.sourceWs, src.opportunityId);

    const aAssets = await w.bp.listMediaByBusiness(a.businessId);
    const req = parsePropertyRequirement(REQUEST, [AREA]);
    const sel = selectMedia(aAssets, {
      imageResponseMode: 'HUMAN_REVIEW_ONLY',
      propertyMatch: { decision: 'MATCH', propertyId: a.propertyId },
      requestedAmenities: req.requestedAmenities,
      requirementFlags: { needsPrivatePool: req.needsPrivatePool },
    });
    expect(sel.selected?.id).toBe(a.mediaId);
    expect(sel.selected?.id).not.toBe(b.mediaId);
  });

  // 9 ─ Review PENDING in Customer A
  it('9. Human Review is created PENDING in Customer A', async () => {
    const w = wire();
    const src = await seedSource(w);
    const a = await seedCustomer(w, 'A');
    await subscribe(w, src.groupId, a.businessId);
    await w.routing.routeOpportunity(src.sourceWs, src.opportunityId);
    const down = await downstream(w, a);
    expect(down.task!.status).toBe('PENDING');
    expect(down.task!.workspaceId).toBe(a.ws);
    const detail = await w.reviews.getDetail(a.ws, down.task!.id);
    expect(detail.property?.name).toBe('A-Villa');
  });

  // 10 ─ same central Opportunity routed ×5 → one projection
  it('10. routing the same Opportunity ×5 → exactly one projection + one Match per business', async () => {
    const w = wire();
    const src = await seedSource(w);
    const a = await seedCustomer(w, 'A');
    await subscribe(w, src.groupId, a.businessId);

    let projections = 0;
    let matches = 0;
    for (let i = 0; i < 5; i++) {
      const s = await w.routing.routeOpportunity(src.sourceWs, src.opportunityId);
      projections += s.projectionsCreated;
      matches += s.matches;
    }
    expect(projections).toBe(1);
    expect(matches).toBe(1);
    expect(await w.store.listOpportunitiesByWorkspace(a.ws)).toHaveLength(1);
    expect(await matchesOf(w, a.ws)).toHaveLength(1);
  });

  // 11 ─ two Businesses in the SAME workspace → one projection, two Matches
  it('11. two Businesses in the same workspace → ONE projection, TWO Business Matches', async () => {
    const w = wire();
    const src = await seedSource(w);
    const ws = randomUUID();
    const a1 = await seedBusiness(w, ws, 'A1');
    const a2 = await seedBusiness(w, ws, 'A2');
    await subscribe(w, src.groupId, a1.businessId);
    await subscribe(w, src.groupId, a2.businessId);

    const summary = await w.routing.routeOpportunity(src.sourceWs, src.opportunityId);
    expect(summary.matches).toBe(2);
    expect(summary.projectionsCreated).toBe(1); // shared projection

    const opps = await w.store.listOpportunitiesByWorkspace(ws);
    expect(opps).toHaveLength(1);
    const matches = await matchesOf(w, ws);
    expect(matches).toHaveLength(2);
    expect(new Set(matches.map((m) => m.opportunityId)).size).toBe(1); // both → same projection
    expect(new Set(matches.map((m) => m.businessId))).toEqual(
      new Set([a1.businessId, a2.businessId]),
    );
  });

  // 12 ─ three different customer workspaces → three projections
  it('12. three customer workspaces → three independent projections + three Matches', async () => {
    const w = wire();
    const src = await seedSource(w);
    const customers = await Promise.all([
      seedCustomer(w, 'A'),
      seedCustomer(w, 'B'),
      seedCustomer(w, 'C'),
    ]);
    for (const c of customers) await subscribe(w, src.groupId, c.businessId);

    const summary = await w.routing.routeOpportunity(src.sourceWs, src.opportunityId);
    expect(summary.matches).toBe(3);
    expect(summary.projectionsCreated).toBe(3);
    for (const c of customers) {
      const projOpp = await projectedOppOf(w, c.ws);
      expect(projOpp?.workspaceId).toBe(c.ws);
      expect(projOpp?.sourceOpportunityId).toBe(src.opportunityId);
    }
  });

  // 13 ─ Customer A cannot see B's projection / review
  it('13. Customer A cannot read Customer B’s projection or Review', async () => {
    const w = wire();
    const src = await seedSource(w);
    const a = await seedCustomer(w, 'A');
    const b = await seedCustomer(w, 'B');
    await subscribe(w, src.groupId, a.businessId);
    await subscribe(w, src.groupId, b.businessId);
    await w.routing.routeOpportunity(src.sourceWs, src.opportunityId);
    const bDown = await downstream(w, b);

    // A's opportunity list contains only A's projection, never B's.
    const aOpps = await w.store.listOpportunitiesByWorkspace(a.ws);
    const bProj = await projectedOppOf(w, b.ws);
    expect(aOpps.some((o) => o.id === bProj!.id)).toBe(false);
    // A cannot open B's review through A's workspace.
    await expect(w.reviews.getDetail(a.ws, bDown.task!.id)).rejects.toBeInstanceOf(ReviewError);
    expect(await w.reviews.listReviews(a.ws)).toHaveLength(0);
  });

  // 14 ─ Customer cannot reach the central source Opportunity through a customer API
  it('14. the central source Opportunity is NOT reachable via a customer-scoped list', async () => {
    const w = wire();
    const src = await seedSource(w);
    const a = await seedCustomer(w, 'A');
    await subscribe(w, src.groupId, a.businessId);
    await w.routing.routeOpportunity(src.sourceWs, src.opportunityId);

    const aOpps = await w.store.listOpportunitiesByWorkspace(a.ws);
    // A sees only its own projection — never the central source Opportunity row.
    expect(aOpps.every((o) => o.id !== src.opportunityId)).toBe(true);
    expect(aOpps.every((o) => o.workspaceId === a.ws)).toBe(true);
    // The central Opportunity lives only in the source workspace.
    const sourceOpps = await w.store.listOpportunitiesByWorkspace(src.sourceWs);
    expect(sourceOpps.map((o) => o.id)).toContain(src.opportunityId);
  });

  // 15 ─ customer Review payload contains safe lead facts
  it('15. customer Review carries the safe lead facts (post text, group name/url)', async () => {
    const w = wire();
    const src = await seedSource(w);
    const a = await seedCustomer(w, 'A');
    await subscribe(w, src.groupId, a.businessId);
    await w.routing.routeOpportunity(src.sourceWs, src.opportunityId);
    const down = await downstream(w, a);
    const snap = down.draft!.inputSnapshot as {
      signal?: { message?: string; sourceUrl?: string };
    };
    // The draft context carries the safe lead facts (post text + post URL).
    expect(snap.signal?.message).toBe(REQUEST);
    expect(snap.signal?.sourceUrl).toContain('groups/src-1/posts');
    expect(down.task!.status).toBe('PENDING');
  });

  // 16 ─ scanner/session data absent from projected + downstream records
  it('16. no Facebook account/session/profile/token appears in projected or downstream records', async () => {
    const w = wire();
    const src = await seedSource(w);
    const a = await seedCustomer(w, 'A');
    await subscribe(w, src.groupId, a.businessId);
    await w.routing.routeOpportunity(src.sourceWs, src.opportunityId);
    const down = await downstream(w, a);
    const projOpp = await projectedOppOf(w, a.ws);
    const projSignal = await w.store.getSignalById(projOpp!.signalId);
    const detail = await w.reviews.getDetail(a.ws, down.task!.id);

    const blob = JSON.stringify({
      projOpp,
      projSignal,
      match: down.match,
      draft: down.draft,
      detail,
    }).toLowerCase();
    // Concrete scanner-secret markers must never appear. (authorProfile — a
    // benign, allowed public author-profile link — is intentionally not scanned
    // as a "profile" secret; the danger is a browser-profile PATH / cookies /
    // tokens, none of which the projection ever reads.)
    for (const secret of [
      'cookie',
      'password',
      'credential',
      'browser-profiles',
      'browserprofile',
      'sessionstorage',
      'accesstoken',
      'access_token',
      'facebookaccount',
    ]) {
      expect(blob).not.toContain(secret);
    }
  });

  // 17 ─ price policy per customer
  it('17. price policy is per customer — DO_NOT_MENTION suppresses the saved price', async () => {
    const w = wire();
    const src = await seedSource(w);
    const a = await seedCustomer(w, 'A', { price: 9500, pricingPolicy: 'DO_NOT_MENTION' });
    await subscribe(w, src.groupId, a.businessId);
    await w.routing.routeOpportunity(src.sourceWs, src.opportunityId);
    const down = await downstream(w, a);
    const snap = down.draft!.inputSnapshot as {
      property?: { priceFact?: string | null };
      mustNotClaim?: string[];
    };
    expect(snap.property?.priceFact ?? null).toBeNull();
    expect(snap.mustNotClaim).toContain('price');
    expect(down.draft!.content).not.toContain('9500');
  });

  // 18 ─ availability policy per customer
  it('18. availability policy is per customer — no vacancy claim in the Draft', async () => {
    const w = wire();
    const src = await seedSource(w);
    const a = await seedCustomer(w, 'A', { availabilityPolicy: 'MANUAL_CONFIRMATION' });
    await subscribe(w, src.groupId, a.businessId);
    await w.routing.routeOpportunity(src.sourceWs, src.opportunityId);
    const down = await downstream(w, a);
    for (const claim of ['ว่าง', 'มีห้อง', 'จองได้', 'พร้อมเข้าพัก']) {
      expect(down.draft!.content).not.toContain(claim);
    }
  });

  // 19 + 20 ─ no Action Job, no execution session
  it('19+20. routing + full downstream create NO Action Job and NO execution session', async () => {
    const w = wire();
    const src = await seedSource(w);
    const a = await seedCustomer(w, 'A');
    await subscribe(w, src.groupId, a.businessId);
    await w.routing.routeOpportunity(src.sourceWs, src.opportunityId);
    const down = await downstream(w, a);
    expect(down.task!.status).toBe('PENDING');
    expect(down.task!.decidedAt ?? null).toBeNull();
    expect((down.task as Record<string, unknown>).actionJobId ?? null).toBeNull();
    expect((down.task as Record<string, unknown>).executionSessionId ?? null).toBeNull();
  });

  // 21 + 22 + 23 ─ no Facebook write, no Telegram, no external AI
  it('21+22+23. no Facebook write, no Telegram, no external AI', async () => {
    const w = wire();
    const src = await seedSource(w);
    const a = await seedCustomer(w, 'A');
    await subscribe(w, src.groupId, a.businessId);
    await w.routing.routeOpportunity(src.sourceWs, src.opportunityId);
    const down = await downstream(w, a);
    expect(down.draft!.provider).toBe('mock'); // no external AI
    expect(env.FACEBOOK_WRITE_ACTION_ENABLED).toBe(false);
    expect(env.TELEGRAM_ENABLED ?? false).toBe(false);
    expect(env.AI_ENABLED ?? false).toBe(false);
  });

  // ── Preserved routing invariants ───────────────────────────────────────────

  it('ROUTING: non-matching subscriber gets no projection and no Match', async () => {
    const w = wire();
    const src = await seedSource(w);
    const d = await seedCustomer(w, 'D', { ruleValue: 'ร้านอาหาร' });
    await subscribe(w, src.groupId, d.businessId);
    const summary = await w.routing.routeOpportunity(src.sourceWs, src.opportunityId);
    expect(summary.matches).toBe(0);
    expect(summary.noMatches).toBe(1);
    expect(summary.projectionsCreated).toBe(0);
    expect(await w.store.listOpportunitiesByWorkspace(d.ws)).toHaveLength(0);
    expect(await matchOf(w, d.ws)).toBeNull();
  });

  it('ROUTING: late subscriber only receives its own new Match; existing customers unchanged', async () => {
    const w = wire();
    const src = await seedSource(w);
    const [a, b] = [await seedCustomer(w, 'A'), await seedCustomer(w, 'B')];
    await subscribe(w, src.groupId, a.businessId);
    await subscribe(w, src.groupId, b.businessId);
    await w.routing.routeOpportunity(src.sourceWs, src.opportunityId);
    const aMatchId = (await matchOf(w, a.ws))!.id;

    const c = await seedCustomer(w, 'C');
    await subscribe(w, src.groupId, c.businessId);
    const summary = await w.routing.routeOpportunity(src.sourceWs, src.opportunityId);
    expect(summary.matches).toBe(1); // only C
    expect(summary.skipped).toBe(2); // A + B already routed
    expect((await matchOf(w, a.ws))!.id).toBe(aMatchId);
    expect(await matchOf(w, c.ws)).not.toBeNull();
  });

  it('GUARD: routing rejects an Opportunity not owned by the source workspace', async () => {
    const w = wire();
    const src = await seedSource(w);
    await expect(
      w.routing.routeOpportunity(randomUUID(), src.opportunityId),
    ).rejects.toBeInstanceOf(RoutingError);
  });

  it('GUARD: buildDraftContext single-workspace check is still enforced for a genuinely cross-workspace Match', async () => {
    // Sanity: the guard we rely on staying intact still rejects a Match whose
    // Opportunity is in a different workspace (i.e. NOT projected). We simulate
    // this by pointing a customer Match at the raw source Opportunity.
    const w = wire();
    const src = await seedSource(w);
    const a = await seedCustomer(w, 'A');
    // Hand-craft a Match that (incorrectly) references the source Opportunity.
    const bad = await w.store.createBusinessMatch({
      id: randomUUID(),
      workspaceId: a.ws,
      businessId: a.businessId,
      opportunityId: src.opportunityId, // source-tenant Opportunity — must be refused
      decision: 'MATCH',
      reasons: [{ ruleType: 'keyword', ruleValue: 'พูลวิลล่า', matched: true }],
      matcherVersion: 'rules-v1',
    });
    await expect(w.drafts.generate(a.ws, bad.id, null)).rejects.toBeInstanceOf(AiDraftError);
  });

  it('SUBSCRIPTION: unique per (source group, business); disabled subscriptions do not route', async () => {
    const w = wire();
    const src = await seedSource(w);
    const a = await seedCustomer(w, 'A');
    const sub = await subscribe(w, src.groupId, a.businessId);
    await expect(subscribe(w, src.groupId, a.businessId)).rejects.toThrow();

    await w.routingRepo.setSubscriptionEnabled(sub.id, false);
    const disabled = await w.routing.routeOpportunity(src.sourceWs, src.opportunityId);
    expect(disabled.subscriptionsEvaluated).toBe(0);
    expect(await matchOf(w, a.ws)).toBeNull();

    await w.routingRepo.setSubscriptionEnabled(sub.id, true);
    const enabled = await w.routing.routeOpportunity(src.sourceWs, src.opportunityId);
    expect(enabled.matches).toBe(1);
  });

  it('MIGRATION: 0016 (subscriptions) + 0017 (projection link) are additive with the right constraints', () => {
    const m16 = readFileSync(join(__dirname, '../../drizzle/0016_modern_vindicator.sql'), 'utf8');
    expect(m16).toContain('CREATE TABLE `business_group_subscriptions`');
    expect(m16).toContain(
      '`business_group_subscriptions_unique` UNIQUE(`source_group_id`,`business_id`)',
    );
    const m17 = readFileSync(join(__dirname, '../../drizzle/0017_eminent_songbird.sql'), 'utf8');
    expect(m17).toContain('ADD `source_opportunity_id`');
    expect(m17).toContain(
      '`opportunities_source_projection_unique` UNIQUE(`source_opportunity_id`,`workspace_id`)',
    );
    for (const sql of [m16, m17]) expect(sql).not.toMatch(/DROP TABLE|DROP COLUMN/);
  });
});
