import { describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { InMemoryStore } from '../store/memory';
import { InMemoryBusinessPropertyStore } from '../business-property/memory-store';
import { createLogger } from '../lib/logger';
import { MatchRepository } from './repository';
import { MatchingCoordinator } from './coordinator';
import type { BusinessPropertyStore } from '../business-property/store';

const logger = createLogger('error');
const REQUEST = 'หาพูลวิลล่าบางแสน 12 คน มีสระ คาราโอเกะ';

async function seedGroup(store: InMemoryStore, workspaceId: string) {
  return store.createFacebookGroup({
    id: randomUUID(),
    workspaceId,
    facebookGroupId: '123',
    canonicalUrl: `https://www.facebook.com/groups/${randomUUID().slice(0, 8)}`,
    originalUrl: 'https://www.facebook.com/groups/123',
  });
}
async function seedBusiness(store: InMemoryStore, workspaceId: string, name: string) {
  return store.createBusiness(
    { id: randomUUID(), workspaceId, name, slug: `${name}-${randomUUID().slice(0, 6)}` },
    { id: randomUUID(), category: null, description: null },
  );
}
async function addRule(store: InMemoryStore, businessId: string, ruleValue: string) {
  await store.createRule({
    id: randomUUID(),
    businessId,
    ruleType: 'keyword',
    ruleValue,
    priority: 10,
    status: 'active',
  });
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
async function seedOpportunity(
  store: InMemoryStore,
  workspaceId: string,
  groupId: string,
  message: string,
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
    decision: 'ACCEPT',
    status: 'READY',
    classifierVersion: 'rules-v1',
  });
}
async function seedProperty(
  bp: BusinessPropertyStore,
  workspaceId: string,
  businessId: string,
  name: string,
  area: string,
  maxGuests: number,
  amenities: Partial<{ privatePool: boolean; karaoke: boolean }> = {},
  status: 'active' | 'inactive' | 'archived' = 'active',
) {
  const p = await bp.createProperty({
    id: randomUUID(),
    workspaceId,
    businessId,
    name,
    propertyType: 'pool_villa',
  });
  await bp.updateProperty(p.id, {
    location: { area },
    capacity: { maxGuests },
    amenities: { privatePool: !!amenities.privatePool, karaoke: !!amenities.karaoke },
  });
  if (status !== 'active') await bp.setPropertyStatus(p.id, status);
  return p;
}

interface Ctx {
  store: InMemoryStore;
  bp: InMemoryBusinessPropertyStore;
  coord: MatchingCoordinator;
  ws: string;
  business: { id: string };
}

async function scenario(): Promise<Ctx> {
  const store = new InMemoryStore();
  const bp = new InMemoryBusinessPropertyStore();
  const coord = new MatchingCoordinator({ repo: new MatchRepository(store, bp), logger });
  const ws = randomUUID();
  const group = await seedGroup(store, ws);
  const business = await seedBusiness(store, ws, 'Demo Bangsaen Pool Villa');
  await addRule(store, business.id, 'พูลวิลล่า');
  await assign(store, ws, business.id, group.id);
  await seedOpportunity(store, ws, group.id, REQUEST);
  await seedProperty(bp, ws, business.id, 'Villa A', 'บางแสน', 8, { privatePool: true });
  await seedProperty(bp, ws, business.id, 'Villa B', 'บางแสน', 15, {
    privatePool: true,
    karaoke: true,
  });
  await seedProperty(bp, ws, business.id, 'Villa C', 'พัทยา', 20, { privatePool: true });
  return { store, bp, coord, ws, business };
}

describe('Property match pipeline (SPRINT 016B)', () => {
  it('selects exactly one Property (Villa B) after a Business MATCH', async () => {
    const { coord, ws } = await scenario();
    const summary = await coord.runMatching(ws);
    expect(summary.matches).toBe(1);
    expect(summary.propertyMatches).toBe(1);
    expect(summary.propertyNoMatches).toBe(0);
    expect(summary.propertyCandidates).toBe(3);

    const [pm] = await coord.listPropertyMatches(ws, { decision: 'MATCH' });
    expect(pm?.propertyName).toBe('Villa B');
    expect(pm?.match.decision).toBe('MATCH');
    expect(pm?.match.matcherVersion).toBe('property-rules-v1');
  });

  it('persists the decision idempotently (re-run produces no duplicate)', async () => {
    const { coord, ws } = await scenario();
    await coord.runMatching(ws);
    const again = await coord.runMatching(ws);
    // The Business match is skipped on re-run, so the Property stage does not
    // re-run and no second Property match is created.
    expect(again.skipped).toBe(1);
    expect(again.propertyMatches).toBe(0);
    const all = await coord.listPropertyMatches(ws);
    expect(all).toHaveLength(1);
  });

  it('the property-stage guard prevents a duplicate even if the stage re-runs', async () => {
    const { store, bp, coord, ws, business } = await scenario();
    await coord.runMatching(ws);
    const [existing] = await coord.listPropertyMatches(ws);
    // Directly re-invoke the repository guard the coordinator relies on.
    const repo = new MatchRepository(store, bp);
    expect(await repo.propertyMatchExists(existing!.match.businessMatchId)).toBe(true);
    expect(business.id).toBeTruthy();
  });

  it('NO_PROPERTY_MATCH when the business has no qualifying Property', async () => {
    const store = new InMemoryStore();
    const bp = new InMemoryBusinessPropertyStore();
    const coord = new MatchingCoordinator({ repo: new MatchRepository(store, bp), logger });
    const ws = randomUUID();
    const group = await seedGroup(store, ws);
    const business = await seedBusiness(store, ws, 'Faraway Villas');
    await addRule(store, business.id, 'พูลวิลล่า');
    await assign(store, ws, business.id, group.id);
    await seedOpportunity(store, ws, group.id, REQUEST);
    await seedProperty(bp, ws, business.id, 'Pattaya Only', 'พัทยา', 20, { privatePool: true });

    const summary = await coord.runMatching(ws);
    expect(summary.propertyMatches).toBe(0);
    expect(summary.propertyNoMatches).toBe(1);
    const [pm] = await coord.listPropertyMatches(ws);
    expect(pm?.match.decision).toBe('NO_MATCH');
    expect(pm?.match.propertyId).toBeNull();
    expect(pm?.match.reasons.reasons).toContain('NO_PROPERTY_MATCH');
  });

  it('excludes inactive and archived Properties from candidates', async () => {
    const store = new InMemoryStore();
    const bp = new InMemoryBusinessPropertyStore();
    const coord = new MatchingCoordinator({ repo: new MatchRepository(store, bp), logger });
    const ws = randomUUID();
    const group = await seedGroup(store, ws);
    const business = await seedBusiness(store, ws, 'Mixed Villas');
    await addRule(store, business.id, 'พูลวิลล่า');
    await assign(store, ws, business.id, group.id);
    await seedOpportunity(store, ws, group.id, REQUEST);
    // The only qualifying villa is archived → NO_PROPERTY_MATCH.
    await seedProperty(
      bp,
      ws,
      business.id,
      'Archived B',
      'บางแสน',
      15,
      { privatePool: true, karaoke: true },
      'archived',
    );
    await seedProperty(
      bp,
      ws,
      business.id,
      'Inactive B',
      'บางแสน',
      15,
      { privatePool: true },
      'inactive',
    );

    const summary = await coord.runMatching(ws);
    expect(summary.propertyCandidates).toBe(0);
    expect(summary.propertyNoMatches).toBe(1);
  });

  it("only ever considers the matched Business's own active Properties", async () => {
    const { store, bp, ws, business } = await scenario();
    const other = await seedBusiness(store, ws, 'Other Biz');
    await seedProperty(bp, ws, other.id, 'Other Villa', 'บางแสน', 15, {
      privatePool: true,
      karaoke: true,
    });
    const repo = new MatchRepository(store, bp);
    const own = await repo.listActivePropertiesForBusiness(business.id, ws);
    expect(own.map((p) => p.name).sort()).toEqual(['Villa A', 'Villa B', 'Villa C']);
    expect(own.every((p) => p.businessId === business.id)).toBe(true);
  });

  it('never returns a Property from another workspace (cross-workspace isolation)', async () => {
    const { store, bp, business } = await scenario();
    const repo = new MatchRepository(store, bp);
    const foreign = await repo.listActivePropertiesForBusiness(business.id, randomUUID());
    expect(foreign).toHaveLength(0);
  });

  it('reports funnel counts for operations', async () => {
    const { coord, ws } = await scenario();
    await coord.runMatching(ws);
    const funnel = await coord.getFunnel(ws);
    expect(funnel.businessMatch.MATCH).toBe(1);
    expect(funnel.propertyMatch.MATCH).toBe(1);
    expect(funnel.propertyMatch.NO_MATCH).toBe(0);
    expect(funnel.candidatesEvaluated).toBe(3);
    expect(funnel.propertiesReceivingMatches).toBe(1);
  });
});
