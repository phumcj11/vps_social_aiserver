import { describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { InMemoryStore } from '../store/memory';
import { AiDraftRepository } from './repository';
import type { CreateAiDraftInput } from '../store/types';

function draftInput(ws: string, matchId: string, version: number): Omit<CreateAiDraftInput, 'id'> {
  return {
    workspaceId: ws,
    businessMatchId: matchId,
    opportunityId: randomUUID(),
    businessId: randomUUID(),
    version,
    status: 'draft',
    content: `draft v${version}`,
    provider: 'mock',
    model: 'mock-draft-v1',
    promptVersion: 'rules-v1',
    inputSnapshot: { business: { name: 'x' } },
    policyResult: { decision: 'PASS', reasons: [] },
    createdBy: null,
  };
}

describe('AiDraftRepository', () => {
  it('persists a draft and round-trips snapshot + policy result', async () => {
    const store = new InMemoryStore();
    const repo = new AiDraftRepository(store);
    const ws = randomUUID();
    const matchId = randomUUID();
    const created = await repo.createDraft(draftInput(ws, matchId, 1));
    const fetched = await repo.getDraftById(created.id);
    expect(fetched?.policyResult?.decision).toBe('PASS');
    expect(fetched?.inputSnapshot).toEqual({ business: { name: 'x' } });
  });

  it('enforces unique (business_match_id, version)', async () => {
    const store = new InMemoryStore();
    const repo = new AiDraftRepository(store);
    const ws = randomUUID();
    const matchId = randomUUID();
    await repo.createDraft(draftInput(ws, matchId, 1));
    await expect(repo.createDraft(draftInput(ws, matchId, 1))).rejects.toBeTruthy();
  });

  it('lists versions for a match in ascending version order', async () => {
    const store = new InMemoryStore();
    const repo = new AiDraftRepository(store);
    const ws = randomUUID();
    const matchId = randomUUID();
    await repo.createDraft(draftInput(ws, matchId, 1));
    await repo.createDraft(draftInput(ws, matchId, 2));
    await repo.createDraft(draftInput(ws, matchId, 3));
    const versions = await repo.listDraftsForMatch(matchId);
    expect(versions.map((d) => d.version)).toEqual([1, 2, 3]);
    const latest = await repo.getLatestDraftForMatch(matchId);
    expect(latest?.version).toBe(3);
  });

  it('persists events in insertion order', async () => {
    const store = new InMemoryStore();
    const repo = new AiDraftRepository(store);
    const created = await repo.createDraft(draftInput(randomUUID(), randomUUID(), 1));
    await repo.createEvent(created.id, 'ai_draft_generation_started', { version: 1 });
    await repo.createEvent(created.id, 'ai_draft_generated', { version: 1 });
    const events = await repo.listEvents(created.id);
    expect(events.map((e) => e.event)).toEqual([
      'ai_draft_generation_started',
      'ai_draft_generated',
    ]);
  });
});
