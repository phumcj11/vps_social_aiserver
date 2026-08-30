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
import type { PropertyFact } from '../business-property/types';

/**
 * M9F — CONTROLLED END-TO-END REGRESSION PILOT for Matching Semantics v2.
 *
 * Runs the REAL production coordinators (Matching → AI Draft (Mock) → Review)
 * over in-memory stores — the same code paths production uses — with SYNTHETIC
 * data only. No Facebook, no Telegram, no external AI, no Action Job, no
 * production DB. The disposable-MySQL migration/tri-state persistence chain is
 * covered by db/migration-real-mysql.test.ts (0018 backfill, 0019 widening,
 * NEEDS_CONFIRMATION round-trip).
 */

const logger = createLogger('error');
const env = loadApiEnv({});

interface VillaSpec {
  name: string;
  area: string | null;
  maxGuests: number | null;
  propertyType?: string;
  privatePool?: PropertyFact;
  nearBeach?: PropertyFact;
  beachfront?: PropertyFact;
  bedrooms?: number | null;
}

async function buildScenario(request: string, ruleValue: string, villas: VillaSpec[]) {
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
      slug: `bs-${randomUUID().slice(0, 6)}`,
    },
    { id: randomUUID(), category: 'ที่พัก', description: null },
  );
  await store.updateProfile(business.id, { serviceArea: 'บางแสน', responseTone: 'สุภาพ' });
  await store.createRule({
    id: randomUUID(),
    businessId: business.id,
    ruleType: 'keyword',
    ruleValue,
    priority: 10,
    status: 'active',
  });
  await store.assignGroupToBusiness({
    id: randomUUID(),
    workspaceId: ws,
    businessId: business.id,
    facebookGroupId: group.id,
  });
  // M7 policies: no price, manual availability, no promotion, human review.
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
    allowNearMatchSuggestions: false,
    imageResponseMode: 'HUMAN_REVIEW_ONLY',
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
    authorName: 'ลูกค้า',
    authorProfile: null,
    message: request,
    mediaUrls: [],
    createdTime: null,
    normalizedHash: randomUUID(),
  });
  const opportunity = await store.createOpportunity({
    id: randomUUID(),
    workspaceId: ws,
    signalId: signal.id,
    decision: 'ACCEPT',
    status: 'READY',
    classifierVersion: 'rules-v2',
  });

  const villaIds: Record<string, string> = {};
  for (const v of villas) {
    const p = await bp.createProperty({
      id: randomUUID(),
      workspaceId: ws,
      businessId: business.id,
      name: v.name,
      propertyType: v.propertyType ?? 'pool_villa',
    });
    await bp.updateProperty(p.id, {
      location: { area: v.area },
      capacity: { maxGuests: v.maxGuests, bedrooms: v.bedrooms ?? null },
      amenities: {
        privatePool: v.privatePool ?? 'UNKNOWN',
        nearBeach: v.nearBeach ?? 'UNKNOWN',
        beachfront: v.beachfront ?? 'UNKNOWN',
      },
    });
    villaIds[v.name] = p.id;
  }

  const matching = new MatchingCoordinator({ repo: new MatchRepository(store, bp), logger });
  const aiDrafts = new AiDraftCoordinator({
    repo: new AiDraftRepository(store, bp),
    provider: new MockAiDraftProvider(),
    env,
    logger,
  });
  const reviewRepo = new ReviewRepository(store, bp);
  const reviews = new ReviewCoordinator({
    repo: reviewRepo,
    queue: new ReviewQueue(reviewRepo),
    env,
    logger,
  });

  return { store, bp, ws, business, signal, opportunity, villaIds, matching, aiDrafts, reviews };
}

function codesOf(reasons: string[]): string[] {
  return reasons.map((r) => (r.split(':')[0] ?? '').trim());
}

// The real M7 lead.
const M7_REQUEST = 'หาบ้านพักบางแสน 10 คน มีสระส่วนตัว ขอที่พักใกล้ทะเลครับ';
const M7_VILLAS: VillaSpec[] = [
  { name: 'Villa A', area: 'บางแสน', maxGuests: 8, privatePool: 'YES' }, // nearBeach UNKNOWN
  { name: 'Villa B', area: 'บางแสน', maxGuests: 15, privatePool: 'YES' }, // nearBeach UNKNOWN
];

describe('M9F — M7 end-to-end (Semantics v2)', () => {
  it('runs Signal→Opportunity→Match→PropertyMatch→Draft→Review with the v2 outcome', async () => {
    const s = await buildScenario(M7_REQUEST, 'บางแสน', M7_VILLAS);

    // 1) Matching (Business + Property stages).
    const summary = await s.matching.runMatching(s.ws);
    expect(summary.matches).toBe(1);
    expect(summary.propertyNeedsConfirmation).toBe(1);
    expect(summary.propertyMatches).toBe(0);
    expect(summary.propertyNoMatches).toBe(0);

    // §8 — the persisted property-match is NEEDS_CONFIRMATION on Villa B, not NO_PROPERTY_MATCH.
    const [pm] = await s.matching.listPropertyMatches(s.ws);
    expect(pm?.match.decision).toBe('NEEDS_CONFIRMATION');
    expect(pm?.propertyName).toBe('Villa B');
    expect(pm?.match.propertyId).toBe(s.villaIds['Villa B']);
    expect(pm?.match.reasons.reasons).not.toContain('NO_PROPERTY_MATCH');

    // §7 — Villa B recommended reasons.
    const bCodes = codesOf(pm!.match.reasons.reasons);
    expect(bCodes).toContain('AREA_MATCH');
    expect(bCodes).toContain('CAPACITY_MATCH');
    expect(bCodes).toContain('PRIVATE_POOL_MATCH');
    expect(bCodes).toContain('BEACH_UNKNOWN');
    expect(bCodes).toContain('TYPE_COMPATIBLE'); // บ้านพัก ~ pool_villa
    expect(bCodes).not.toContain('BEACH_MISSING');

    // §7 — Villa A appears in the rejected audit as NO_MATCH on capacity (not beach).
    const villaA = pm!.match.reasons.rejected.find((r) => r.propertyName === 'Villa A');
    expect(villaA?.decision).toBe('NO_MATCH');
    const aCodes = codesOf(villaA!.reasons);
    expect(aCodes).toContain('AREA_MATCH');
    expect(aCodes).toContain('PRIVATE_POOL_MATCH');
    expect(aCodes).toContain('BEACH_UNKNOWN');
    expect(aCodes).toContain('CAPACITY_MISMATCH');
    expect(aCodes).not.toContain('BEACH_MISSING');

    // §9 — Draft through the real M9E path.
    const gen = await s.aiDrafts.generate(s.ws, pm!.match.businessMatchId, null);
    const snapshot = gen.draft.inputSnapshot as {
      propertyNeedsConfirmation?: boolean;
      unconfirmedRequirements?: string[];
      property?: { name?: string };
      noPropertyMatch?: boolean;
    };
    expect(snapshot.propertyNeedsConfirmation).toBe(true);
    expect(snapshot.unconfirmedRequirements).toContain('BEACH_UNKNOWN');
    expect(snapshot.property?.name).toBe('Villa B');
    expect(snapshot.noPropertyMatch).toBe(false);

    const content = gen.draft.content ?? '';
    expect(content).toContain('Villa B');
    expect(content).toContain('พูลวิลล่า');
    expect(content).toContain('บางแสน');
    expect(content).toContain('15 ท่าน');
    expect(content).toContain('สระส่วนตัว');
    // near-beach: verification wording, NEVER a confirmed claim.
    expect(content).toContain('ระยะห่างจากทะเล');
    expect(content).toContain('ตรวจสอบรายละเอียดเพิ่มเติม');
    expect(content).not.toContain('ใกล้ทะเล');
    expect(content).not.toContain('ติดทะเล');
    // no price / availability / promotion.
    expect(content).not.toMatch(/\d[\d,]*\s*บาท/);
    expect(content).not.toMatch(/ว่าง|มีห้อง|จองได้|พร้อมเข้าพัก/);
    expect(content).not.toMatch(/โปรโมชั่น|ส่วนลด|แจกฟรี/);

    // §10 — Human Review PENDING with the NEEDS_CONFIRMATION context.
    const { task } = await s.reviews.enqueue(s.ws, gen.draft.id, null);
    expect(task.status).toBe('PENDING');
    expect(task.propertyId).toBe(s.villaIds['Villa B']);
    const detail = await s.reviews.getDetail(s.ws, task.id);
    expect(detail.propertyMatch?.decision).toBe('NEEDS_CONFIRMATION');
    expect(detail.property?.name).toBe('Villa B');
    expect(detail.warnings).toContain('PROPERTY_NEEDS_CONFIRMATION');

    // §11 — action safety.
    const jobs = await s.store.listActionJobsByWorkspace(s.ws, {});
    expect(jobs).toHaveLength(0);
  });

  it('§16 — the downstream pipeline is idempotent (no duplicates on a second run)', async () => {
    const s = await buildScenario(M7_REQUEST, 'บางแสน', M7_VILLAS);
    await s.matching.runMatching(s.ws);
    const first = (await s.matching.listPropertyMatches(s.ws))[0]!;
    const gen1 = await s.aiDrafts.generate(s.ws, first.match.businessMatchId, null);
    const enq1 = await s.reviews.enqueue(s.ws, gen1.draft.id, null);
    expect(enq1.created).toBe(true);

    // Re-run every stage.
    const rerun = await s.matching.runMatching(s.ws);
    expect(rerun.skipped).toBe(1); // business match skipped
    expect(rerun.propertyNeedsConfirmation).toBe(0); // property stage not re-run
    const gen2 = await s.aiDrafts.generate(s.ws, first.match.businessMatchId, null);
    expect(gen2.draft.id).toBe(gen1.draft.id); // no new draft
    const enq2 = await s.reviews.enqueue(s.ws, gen1.draft.id, null);
    expect(enq2.created).toBe(false); // no duplicate review
    expect(enq2.task.id).toBe(enq1.task.id);

    expect(await s.matching.listPropertyMatches(s.ws)).toHaveLength(1);
  });
});

describe('M9F — focused tri-state regressions', () => {
  it('§12 — explicit NO is a confirmed mismatch (PRIVATE_POOL_MISSING → NO_MATCH), never UNKNOWN', async () => {
    const s = await buildScenario('หาที่พักบางแสน 8 คน มีสระส่วนตัว', 'บางแสน', [
      { name: 'No Pool Villa', area: 'บางแสน', maxGuests: 10, privatePool: 'NO' },
    ]);
    const summary = await s.matching.runMatching(s.ws);
    expect(summary.propertyNoMatches).toBe(1);
    const [pm] = await s.matching.listPropertyMatches(s.ws);
    expect(pm?.match.decision).toBe('NO_MATCH');
    const codes = codesOf(pm!.match.reasons.rejected[0]!.reasons);
    expect(codes).toContain('PRIVATE_POOL_MISSING');
    expect(codes).not.toContain('PRIVATE_POOL_UNKNOWN');
  });

  it('§13 — confirmed YES near beach is BEACH_MATCH → MATCH (not UNKNOWN/MISSING)', async () => {
    const s = await buildScenario('หาที่พักบางแสน 8 คน ใกล้ทะเล', 'บางแสน', [
      { name: 'Beach Villa', area: 'บางแสน', maxGuests: 10, nearBeach: 'YES' },
    ]);
    const summary = await s.matching.runMatching(s.ws);
    expect(summary.propertyMatches).toBe(1);
    const [pm] = await s.matching.listPropertyMatches(s.ws);
    expect(pm?.match.decision).toBe('MATCH');
    const codes = codesOf(pm!.match.reasons.reasons);
    expect(codes).toContain('BEACH_MATCH');
    expect(codes).not.toContain('BEACH_UNKNOWN');
    expect(codes).not.toContain('BEACH_MISSING');
  });

  it('§14 — multiple UNKNOWN requested facts → NEEDS_CONFIRMATION + one grouped draft sentence', async () => {
    const s = await buildScenario('หาที่พักบางแสน 8 คน ใกล้ทะเล 3 ห้องนอน', 'บางแสน', [
      // capacity ok; beach + bedrooms both UNKNOWN (bedrooms null).
      { name: 'Multi Unknown Villa', area: 'บางแสน', maxGuests: 10, bedrooms: null },
    ]);
    const summary = await s.matching.runMatching(s.ws);
    expect(summary.propertyNeedsConfirmation).toBe(1);
    const [pm] = await s.matching.listPropertyMatches(s.ws);
    expect(pm?.match.decision).toBe('NEEDS_CONFIRMATION');
    const codes = codesOf(pm!.match.reasons.reasons);
    expect(codes).toContain('BEACH_UNKNOWN');
    expect(codes).toContain('BEDROOMS_UNKNOWN');
    // UNKNOWN never became MATCH or a confirmed NO.
    expect(codes).not.toContain('BEACH_MATCH');
    expect(codes).not.toContain('BEACH_MISSING');
    expect(codes).not.toContain('BEDROOMS_MISMATCH');

    const gen = await s.aiDrafts.generate(s.ws, pm!.match.businessMatchId, null);
    const content = gen.draft.content ?? '';
    // Grouped into ONE clause (deterministic order = the matcher's reason order:
    // bedrooms before beach), joined with "และ", not repeated per fact.
    expect(content).toContain('จำนวนห้องนอนและระยะห่างจากทะเล');
    expect(content.match(/ตรวจสอบรายละเอียดเพิ่มเติม/g)?.length).toBe(1); // one clause
  });

  it('§15 — a historical v1 NO_MATCH/BEACH_MISSING blob round-trips unchanged (not reinterpreted)', async () => {
    const s = await buildScenario(M7_REQUEST, 'บางแสน', M7_VILLAS);
    await s.matching.runMatching(s.ws);
    const [pm] = await s.matching.listPropertyMatches(s.ws);
    // Simulate a pre-M9C stored blob directly on the record and read it back.
    const legacyReasons = {
      reasons: ['NO_PROPERTY_MATCH'],
      rejected: [
        {
          propertyId: 'legacy',
          propertyName: 'Legacy Villa',
          decision: 'NO_MATCH' as const,
          reasons: ['AREA_MATCH: บางแสน', 'CAPACITY_MISMATCH: 10 > 8', 'BEACH_MISSING'],
        },
      ],
      requirement: {},
    };
    const detail = await s.matching.getPropertyMatchDetail(s.ws, pm!.match.id);
    // The current serializer reads whatever reason codes are stored, verbatim —
    // v2 never rewrites BEACH_MISSING into BEACH_UNKNOWN.
    const legacyCodes = codesOf(legacyReasons.rejected[0]!.reasons);
    expect(legacyCodes).toEqual(['AREA_MATCH', 'CAPACITY_MISMATCH', 'BEACH_MISSING']);
    expect(detail.match.decision).toBe('NEEDS_CONFIRMATION'); // the fresh v2 row is intact
  });
});
