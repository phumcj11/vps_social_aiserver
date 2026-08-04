import { describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { InMemoryStore } from '../store/memory';
import { loadApiEnv } from '../lib/env';
import { createLogger } from '../lib/logger';
import { OpportunityRepository } from './repository';
import { OpportunityCoordinator } from './coordinator';
import type { CreateSignalInput } from '../store/types';

function seedSignal(ws: string, overrides: Partial<CreateSignalInput> = {}): CreateSignalInput {
  return {
    id: randomUUID(),
    workspaceId: ws,
    groupId: randomUUID(),
    facebookPostId: '456',
    postUrl: `https://www.facebook.com/groups/123/posts/${randomUUID().slice(0, 8)}`,
    authorName: 'Jane',
    authorProfile: null,
    message: 'หาที่พักบางแสน 4 คน ใกล้ทะเล เสาร์นี้', // customer intent → ACCEPT (rules-v2)
    mediaUrls: [],
    createdTime: null,
    normalizedHash: randomUUID(),
    ...overrides,
  };
}

function make() {
  const store = new InMemoryStore();
  const env = loadApiEnv({ APP_ENV: 'test', OPPORTUNITY_MIN_TEXT_LENGTH: '15' });
  const coordinator = new OpportunityCoordinator({
    repo: new OpportunityRepository(store),
    env,
    logger: createLogger('error'),
  });
  return { store, coordinator, ws: randomUUID() };
}

describe('OpportunityCoordinator', () => {
  it('classifies NEW signals: ACCEPT → READY, REJECT → ARCHIVED, with events', async () => {
    const { store, coordinator, ws } = make();
    const good = seedSignal(ws);
    const bad = seedSignal(ws, { message: 'help' }); // too short → REJECT
    await store.createSignal(good);
    await store.createSignal(bad);

    const summary = await coordinator.classifyAll(ws);
    expect(summary).toEqual({ processed: 2, accepted: 1, rejected: 1 });

    const acc = await store.getOpportunityBySignal(good.id);
    expect(acc!.decision).toBe('ACCEPT');
    expect(acc!.status).toBe('READY');
    const rej = await store.getOpportunityBySignal(bad.id);
    expect(rej!.decision).toBe('REJECT');
    expect(rej!.status).toBe('ARCHIVED');

    expect((await store.listOpportunityEvents(acc!.id))[0]!.event).toBe('OpportunityCreated');
    expect((await store.listOpportunityEvents(rej!.id))[0]!.event).toBe('OpportunityRejected');
  });

  it('is idempotent — a second run classifies nothing new', async () => {
    const { store, coordinator, ws } = make();
    await store.createSignal(seedSignal(ws));
    expect((await coordinator.classifyAll(ws)).processed).toBe(1);
    expect((await coordinator.classifyAll(ws)).processed).toBe(0);
  });

  it('rejects a duplicate-content signal (NOT_DUPLICATE)', async () => {
    const { store, coordinator, ws } = make();
    const hash = randomUUID();
    const a = seedSignal(ws, { normalizedHash: hash });
    const b = seedSignal(ws, { normalizedHash: hash });
    await store.createSignal(a);
    await store.createSignal(b);
    const summary = await coordinator.classifyAll(ws);
    // First accepted; the second is a duplicate → rejected.
    expect(summary.accepted).toBe(1);
    expect(summary.rejected).toBe(1);
  });

  it('computes statistics', async () => {
    const { store, coordinator, ws } = make();
    await store.createSignal(seedSignal(ws));
    await store.createSignal(seedSignal(ws, { message: 'no' }));
    await coordinator.classifyAll(ws);
    const stats = await coordinator.getStatistics(ws);
    expect(stats).toMatchObject({ total: 2, accepted: 1, rejected: 1, ready: 1, archived: 1 });
    expect(stats.unclassifiedSignals).toBe(0);
  });

  it('returns detail with signal + events, enforcing ownership', async () => {
    const { store, coordinator, ws } = make();
    const s = seedSignal(ws);
    await store.createSignal(s);
    await coordinator.classifyAll(ws);
    const opp = await store.getOpportunityBySignal(s.id);
    const detail = await coordinator.getDetail(ws, opp!.id);
    expect(detail.signal!.id).toBe(s.id);
    expect(detail.events.length).toBeGreaterThanOrEqual(1);
    await expect(coordinator.getDetail(randomUUID(), opp!.id)).rejects.toMatchObject({
      code: 'OPPORTUNITY_NOT_FOUND',
    });
  });

  it('transitions status and records OpportunityArchived; rejects invalid status', async () => {
    const { store, coordinator, ws } = make();
    const s = seedSignal(ws);
    await store.createSignal(s);
    await coordinator.classifyAll(ws);
    const opp = await store.getOpportunityBySignal(s.id);

    const updated = await coordinator.updateStatus(ws, opp!.id, 'ARCHIVED');
    expect(updated.status).toBe('ARCHIVED');
    const events = await store.listOpportunityEvents(opp!.id);
    expect(events.some((e) => e.event === 'OpportunityArchived')).toBe(true);

    await expect(coordinator.updateStatus(ws, opp!.id, 'BOGUS')).rejects.toMatchObject({
      code: 'INVALID_STATUS',
    });
  });

  it('rejects a concurrent classification run (concurrency one)', async () => {
    const { store, coordinator, ws } = make();
    await store.createSignal(seedSignal(ws));
    const first = coordinator.classifyAll(ws);
    await expect(coordinator.classifyAll(ws)).rejects.toMatchObject({ code: 'ALREADY_RUNNING' });
    await first;
  });
});
