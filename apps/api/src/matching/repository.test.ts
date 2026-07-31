import { describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { InMemoryStore } from '../store/memory';
import { MatchRepository } from './repository';
import { MatchingError } from './errors';

async function seedBusiness(store: InMemoryStore, workspaceId: string, name: string) {
  return store.createBusiness(
    { id: randomUUID(), workspaceId, name, slug: `${name}-${randomUUID().slice(0, 6)}` },
    { id: randomUUID(), category: null, description: null },
  );
}

async function seedOpportunity(
  store: InMemoryStore,
  workspaceId: string,
  decision: 'ACCEPT' | 'REJECT',
) {
  const signal = await store.createSignal({
    id: randomUUID(),
    workspaceId,
    groupId: randomUUID(),
    facebookPostId: null,
    postUrl: `https://www.facebook.com/groups/1/posts/${randomUUID().slice(0, 8)}`,
    authorName: 'A',
    authorProfile: null,
    message: 'hello',
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

describe('MatchRepository', () => {
  it('creates and reads a match, round-tripping the reasons array', async () => {
    const store = new InMemoryStore();
    const repo = new MatchRepository(store);
    const ws = randomUUID();
    const biz = await seedBusiness(store, ws, 'Biz');
    const opp = await seedOpportunity(store, ws, 'ACCEPT');

    const created = await repo.createMatch({
      workspaceId: ws,
      businessId: biz.id,
      opportunityId: opp.id,
      decision: 'MATCH',
      reasons: [{ ruleType: 'keyword', ruleValue: 'plumber', matched: true }],
      matcherVersion: 'rules-v1',
    });
    const fetched = await repo.getMatchById(created.id);
    expect(fetched?.reasons).toEqual([
      { ruleType: 'keyword', ruleValue: 'plumber', matched: true },
    ]);
    expect(await repo.matchExists(opp.id, biz.id)).toBe(true);
  });

  it('wraps a duplicate (opportunity, business) match as a MatchingError', async () => {
    const store = new InMemoryStore();
    const repo = new MatchRepository(store);
    const ws = randomUUID();
    const biz = await seedBusiness(store, ws, 'Biz');
    const opp = await seedOpportunity(store, ws, 'ACCEPT');
    const input = {
      workspaceId: ws,
      businessId: biz.id,
      opportunityId: opp.id,
      decision: 'NO_MATCH' as const,
      reasons: [],
      matcherVersion: 'rules-v1',
    };
    await repo.createMatch(input);
    await expect(repo.createMatch(input)).rejects.toBeInstanceOf(MatchingError);
  });

  it('listActiveRules returns only active rules', async () => {
    const store = new InMemoryStore();
    const repo = new MatchRepository(store);
    const ws = randomUUID();
    const biz = await seedBusiness(store, ws, 'Biz');
    await store.createRule({
      id: randomUUID(),
      businessId: biz.id,
      ruleType: 'keyword',
      ruleValue: 'active-kw',
      priority: 10,
      status: 'active',
    });
    await store.createRule({
      id: randomUUID(),
      businessId: biz.id,
      ruleType: 'keyword',
      ruleValue: 'disabled-kw',
      priority: 5,
      status: 'disabled',
    });
    const rules = await repo.listActiveRules(biz.id);
    expect(rules).toEqual([{ ruleType: 'keyword', ruleValue: 'active-kw' }]);
  });

  it('listAcceptedOpportunities returns only ACCEPT decisions', async () => {
    const store = new InMemoryStore();
    const repo = new MatchRepository(store);
    const ws = randomUUID();
    await seedOpportunity(store, ws, 'ACCEPT');
    await seedOpportunity(store, ws, 'REJECT');
    const accepted = await repo.listAcceptedOpportunities(ws);
    expect(accepted).toHaveLength(1);
    expect(accepted[0]?.decision).toBe('ACCEPT');
  });
});
