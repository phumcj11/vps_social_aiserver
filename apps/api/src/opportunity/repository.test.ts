import { describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { InMemoryStore } from '../store/memory';
import { OpportunityRepository } from './repository';
import type { CreateSignalInput } from '../store/types';

function seedSignal(
  overrides: Partial<CreateSignalInput> & { workspaceId: string },
): CreateSignalInput {
  return {
    id: randomUUID(),
    groupId: randomUUID(),
    facebookPostId: '456',
    postUrl: `https://www.facebook.com/groups/123/posts/${randomUUID().slice(0, 8)}`,
    authorName: 'Jane',
    authorProfile: null,
    message: 'a real message with enough length',
    mediaUrls: [],
    createdTime: null,
    normalizedHash: randomUUID(),
    ...overrides,
  };
}

describe('OpportunityRepository', () => {
  it('lists unclassified signals and stops listing them once an opportunity exists', async () => {
    const store = new InMemoryStore();
    const repo = new OpportunityRepository(store);
    const ws = randomUUID();
    const s1 = seedSignal({ workspaceId: ws });
    const s2 = seedSignal({ workspaceId: ws });
    await store.createSignal(s1);
    await store.createSignal(s2);
    expect(await repo.listUnclassifiedSignals(ws)).toHaveLength(2);

    await repo.createOpportunity({
      workspaceId: ws,
      signalId: s1.id,
      decision: 'ACCEPT',
      status: 'READY',
      classifierVersion: 'rules-v1',
    });
    const remaining = await repo.listUnclassifiedSignals(ws);
    expect(remaining.map((s) => s.id)).toEqual([s2.id]);
  });

  it('enforces one opportunity per signal', async () => {
    const store = new InMemoryStore();
    const repo = new OpportunityRepository(store);
    const ws = randomUUID();
    const s = seedSignal({ workspaceId: ws });
    await store.createSignal(s);
    await repo.createOpportunity({
      workspaceId: ws,
      signalId: s.id,
      decision: 'ACCEPT',
      status: 'READY',
      classifierVersion: 'rules-v1',
    });
    await expect(
      repo.createOpportunity({
        workspaceId: ws,
        signalId: s.id,
        decision: 'REJECT',
        status: 'ARCHIVED',
        classifierVersion: 'rules-v1',
      }),
    ).rejects.toMatchObject({ code: 'REPOSITORY_ERROR' });
  });

  it('detects a duplicate content hash across signals', async () => {
    const store = new InMemoryStore();
    const repo = new OpportunityRepository(store);
    const ws = randomUUID();
    const hash = randomUUID();
    const s1 = seedSignal({ workspaceId: ws, normalizedHash: hash });
    const s2 = seedSignal({ workspaceId: ws, normalizedHash: hash });
    await store.createSignal(s1);
    await store.createSignal(s2);
    expect(await repo.isDuplicateHash(ws, hash)).toBe(false);
    await repo.createOpportunity({
      workspaceId: ws,
      signalId: s1.id,
      decision: 'ACCEPT',
      status: 'READY',
      classifierVersion: 'rules-v1',
    });
    expect(await repo.isDuplicateHash(ws, hash)).toBe(true);
  });

  it('creates events, updates status, and computes statistics', async () => {
    const store = new InMemoryStore();
    const repo = new OpportunityRepository(store);
    const ws = randomUUID();
    const s = seedSignal({ workspaceId: ws });
    await store.createSignal(s);
    const opp = await repo.createOpportunity({
      workspaceId: ws,
      signalId: s.id,
      decision: 'ACCEPT',
      status: 'READY',
      classifierVersion: 'rules-v1',
    });
    await repo.createEvent(opp.id, 'OpportunityCreated', { decision: 'ACCEPT' });
    expect(await repo.listEvents(opp.id)).toHaveLength(1);

    await repo.updateStatus(opp.id, 'ARCHIVED');
    const stats = await repo.statistics(ws);
    expect(stats.total).toBe(1);
    expect(stats.accepted).toBe(1);
    expect(stats.archived).toBe(1);
    expect(stats.ready).toBe(0);
  });
});
