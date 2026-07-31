import { describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { InMemoryStore } from '../store/memory';
import { loadApiEnv } from '../lib/env';
import { createLogger } from '../lib/logger';
import { AiDraftRepository } from './repository';
import { AiDraftCoordinator } from './coordinator';
import { MockAiDraftProvider, type AiDraftProvider } from './provider';
import { AiDraftError } from './errors';
import type { DraftProviderInput, DraftProviderResult } from './types';

const env = loadApiEnv({});
const logger = createLogger('error');

function coordinator(store: InMemoryStore, provider: AiDraftProvider = new MockAiDraftProvider()) {
  return new AiDraftCoordinator({ repo: new AiDraftRepository(store), provider, env, logger });
}

async function seedMatch(
  store: InMemoryStore,
  ws: string,
  opts: { decision?: 'MATCH' | 'NO_MATCH'; message?: string } = {},
) {
  const group = await store.createFacebookGroup({
    id: randomUUID(),
    workspaceId: ws,
    facebookGroupId: '1',
    canonicalUrl: `https://www.facebook.com/groups/${randomUUID().slice(0, 8)}`,
    originalUrl: 'https://www.facebook.com/groups/1',
  });
  const business = await store.createBusiness(
    { id: randomUUID(), workspaceId: ws, name: 'ร้านช่างประปา', slug: randomUUID() },
    { id: randomUUID(), category: 'ประปา', description: 'บริการซ่อมประปา' },
  );
  await store.createRule({
    id: randomUUID(),
    businessId: business.id,
    ruleType: 'keyword',
    ruleValue: 'ประปา',
    priority: 10,
    status: 'active',
  });
  const signal = await store.createSignal({
    id: randomUUID(),
    workspaceId: ws,
    groupId: group.id,
    facebookPostId: null,
    postUrl: `https://www.facebook.com/groups/1/posts/${randomUUID().slice(0, 8)}`,
    authorName: 'A',
    authorProfile: null,
    message: opts.message ?? 'หาช่างประปาด่วน',
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
    decision: opts.decision ?? 'MATCH',
    reasons: [{ ruleType: 'keyword', ruleValue: 'ประปา', matched: true }],
    matcherVersion: 'rules-v1',
  });
  return { matchId: match.id, businessId: business.id, opportunityId: opp.id };
}

describe('AiDraftCoordinator', () => {
  it('generates version 1 from a MATCH with a PASS policy', async () => {
    const store = new InMemoryStore();
    const coord = coordinator(store);
    const ws = randomUUID();
    const { matchId } = await seedMatch(store, ws);

    const { draft, created } = await coord.generate(ws, matchId, 'user-1');
    expect(created).toBe(true);
    expect(draft.version).toBe(1);
    expect(draft.status).toBe('draft');
    expect(draft.policyResult?.decision).toBe('PASS');
    expect(draft.content).toContain('ร้านช่างประปา');
    expect(draft.provider).toBe('mock');

    const events = await new AiDraftRepository(store).listEvents(draft.id);
    expect(events.map((e) => e.event)).toContain('ai_draft_generation_started');
    expect(events.map((e) => e.event)).toContain('ai_draft_generated');
  });

  it('refuses to generate for a NO_MATCH', async () => {
    const store = new InMemoryStore();
    const coord = coordinator(store);
    const ws = randomUUID();
    const { matchId } = await seedMatch(store, ws, { decision: 'NO_MATCH' });
    await expect(coord.generate(ws, matchId, null)).rejects.toBeInstanceOf(AiDraftError);
  });

  it('does not overwrite an existing draft on duplicate generate', async () => {
    const store = new InMemoryStore();
    const coord = coordinator(store);
    const ws = randomUUID();
    const { matchId } = await seedMatch(store, ws);
    const first = await coord.generate(ws, matchId, null);
    const second = await coord.generate(ws, matchId, null);
    expect(second.created).toBe(false);
    expect(second.draft.id).toBe(first.draft.id);
    expect(await coord.listForMatch(ws, matchId)).toHaveLength(1);
  });

  it('regenerate creates version 2 and supersedes version 1', async () => {
    const store = new InMemoryStore();
    const coord = coordinator(store);
    const ws = randomUUID();
    const { matchId } = await seedMatch(store, ws);
    const v1 = await coord.generate(ws, matchId, null);
    const v2 = await coord.regenerate(ws, v1.draft.id, null);
    expect(v2.draft.version).toBe(2);

    const versions = await coord.listForMatch(ws, matchId);
    expect(versions).toHaveLength(2);
    const reloadedV1 = versions.find((d) => d.version === 1)!;
    expect(reloadedV1.status).toBe('superseded');

    const events = await new AiDraftRepository(store).listEvents(v1.draft.id);
    expect(events.map((e) => e.event)).toContain('ai_draft_superseded');
    const v2Events = await new AiDraftRepository(store).listEvents(v2.draft.id);
    expect(v2Events.map((e) => e.event)).toContain('ai_draft_regenerated');
  });

  it('enforces the unique (business_match, version) invariant (no overwrite)', async () => {
    const store = new InMemoryStore();
    const coord = coordinator(store);
    const ws = randomUUID();
    const { matchId } = await seedMatch(store, ws);
    const v1 = await coord.generate(ws, matchId, null);
    await coord.regenerate(ws, v1.draft.id, null);
    const versions = await coord.listForMatch(ws, matchId);
    expect(new Set(versions.map((d) => d.version)).size).toBe(versions.length);
  });

  it('enforces ownership (cross-workspace generate rejected)', async () => {
    const store = new InMemoryStore();
    const coord = coordinator(store);
    const ws = randomUUID();
    const { matchId } = await seedMatch(store, ws);
    await expect(coord.generate(randomUUID(), matchId, null)).rejects.toBeInstanceOf(AiDraftError);
  });

  it('records a provider failure safely (needs_review, BLOCK, failed event)', async () => {
    const store = new InMemoryStore();
    const failing: AiDraftProvider = {
      name: 'mock',
      generateDraft: async (_i: DraftProviderInput): Promise<DraftProviderResult> => {
        throw new Error('provider unavailable');
      },
    };
    const coord = coordinator(store, failing);
    const ws = randomUUID();
    const { matchId } = await seedMatch(store, ws);
    const { draft } = await coord.generate(ws, matchId, null);
    expect(draft.status).toBe('needs_review');
    expect(draft.policyResult?.decision).toBe('BLOCK');
    expect(draft.content).toBeNull();
    const events = await new AiDraftRepository(store).listEvents(draft.id);
    expect(events.map((e) => e.event)).toContain('ai_draft_generation_failed');
  });

  it('handles blocked output safely (needs_review, blocked event, never ready)', async () => {
    const store = new InMemoryStore();
    const blocking: AiDraftProvider = {
      name: 'mock',
      generateDraft: async (): Promise<DraftProviderResult> => ({
        content: 'ร้านช่างประปา ว่างแน่นอนทุกวันครับ',
        provider: 'mock',
        model: 'mock-draft-v1',
        promptVersion: 'rules-v1',
        policyMetadata: {},
      }),
    };
    const coord = coordinator(store, blocking);
    const ws = randomUUID();
    const { matchId } = await seedMatch(store, ws);
    const { draft } = await coord.generate(ws, matchId, null);
    expect(draft.status).toBe('needs_review');
    expect(draft.policyResult?.decision).toBe('BLOCK');
    const events = await new AiDraftRepository(store).listEvents(draft.id);
    expect(events.map((e) => e.event)).toContain('ai_draft_blocked');
  });

  it('rejects a draft (human decision — never approves or posts)', async () => {
    const store = new InMemoryStore();
    const coord = coordinator(store);
    const ws = randomUUID();
    const { matchId } = await seedMatch(store, ws);
    const { draft } = await coord.generate(ws, matchId, null);
    const rejected = await coord.reject(ws, draft.id);
    expect(rejected.status).toBe('rejected');
    const events = await new AiDraftRepository(store).listEvents(draft.id);
    expect(events.map((e) => e.event)).toContain('ai_draft_rejected');
  });
});
