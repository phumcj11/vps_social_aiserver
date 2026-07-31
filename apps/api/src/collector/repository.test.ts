import { describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { InMemoryStore } from '../store/memory';
import { CollectorRepository } from './repository';
import { normalize, contentHashOf } from './normalizer';
import type { RawSignalCapture } from './types';

function capture(postId: string): RawSignalCapture {
  return {
    postUrl: `https://www.facebook.com/groups/123/posts/${postId}`,
    facebookPostId: postId,
    rawHtml: '<div>x</div>',
    rawJson: null,
    authorName: 'Jane',
    authorProfile: null,
    message: `message ${postId}`,
    mediaUrls: [],
    createdTime: '1700000000',
  };
}

async function persist(repo: CollectorRepository, ws: string, groupId: string, postId: string) {
  const cap = capture(postId);
  const normalized = normalize(cap);
  await repo.persistSignal({
    workspaceId: ws,
    groupId,
    capture: cap,
    contentHash: contentHashOf(cap),
    normalized,
  });
  return { cap, normalized };
}

describe('CollectorRepository', () => {
  it('detects duplicates by url, then facebook_post_id, then hash', async () => {
    const repo = new CollectorRepository(new InMemoryStore());
    const ws = randomUUID();
    const groupId = randomUUID();
    const { cap, normalized } = await persist(repo, ws, groupId, '456');

    // Primary: same URL.
    expect(
      await repo.isDuplicate(ws, {
        postUrl: cap.postUrl,
        facebookPostId: 'different',
        normalizedHash: 'different',
      }),
    ).toBe(true);
    // Secondary: same facebook_post_id, different URL.
    expect(
      await repo.isDuplicate(ws, {
        postUrl: 'https://www.facebook.com/groups/123/posts/999',
        facebookPostId: '456',
        normalizedHash: 'different',
      }),
    ).toBe(true);
    // Third: same normalized hash, different URL and id.
    expect(
      await repo.isDuplicate(ws, {
        postUrl: 'https://www.facebook.com/groups/123/posts/998',
        facebookPostId: 'other',
        normalizedHash: normalized.normalizedHash,
      }),
    ).toBe(true);
    // Not a duplicate.
    expect(
      await repo.isDuplicate(ws, {
        postUrl: 'https://www.facebook.com/groups/123/posts/1000',
        facebookPostId: '1000',
        normalizedHash: 'brand-new',
      }),
    ).toBe(false);
  });

  it('persists raw + normalized signals and counts them', async () => {
    const repo = new CollectorRepository(new InMemoryStore());
    const ws = randomUUID();
    const g = randomUUID();
    await persist(repo, ws, g, '1');
    await persist(repo, ws, g, '2');
    expect(await repo.countSignals(ws)).toBe(2);
  });

  it('upserts and reads a checkpoint per group', async () => {
    const store = new InMemoryStore();
    const repo = new CollectorRepository(store);
    const ws = randomUUID();
    const g = randomUUID();
    await repo.saveCheckpoint({
      workspaceId: ws,
      groupId: g,
      lastPostId: '1',
      lastPostUrl: 'u1',
      lastScan: new Date(),
      lastCursor: '2',
    });
    let cp = await repo.getCheckpoint(g);
    expect(cp!.lastPostId).toBe('1');
    await repo.saveCheckpoint({
      workspaceId: ws,
      groupId: g,
      lastPostId: '5',
      lastPostUrl: 'u5',
      lastScan: new Date(),
      lastCursor: '4',
    });
    cp = await repo.getCheckpoint(g);
    expect(cp!.lastPostId).toBe('5'); // updated, not duplicated
  });

  it('creates, updates, and lists runs', async () => {
    const repo = new CollectorRepository(new InMemoryStore());
    const ws = randomUUID();
    const run = await repo.createRun(ws);
    expect(run.status).toBe('running');
    await repo.updateRun(run.id, { status: 'completed', postsCollected: 3, groupsProcessed: 1 });
    const latest = await repo.latestRun(ws);
    expect(latest!.status).toBe('completed');
    expect(latest!.postsCollected).toBe(3);
    expect(await repo.listRuns(ws)).toHaveLength(1);
  });

  it('only lists active groups', async () => {
    const store = new InMemoryStore();
    const repo = new CollectorRepository(store);
    const ws = randomUUID();
    await store.createFacebookGroup({
      id: randomUUID(),
      workspaceId: ws,
      facebookGroupId: '1',
      canonicalUrl: 'https://www.facebook.com/groups/1',
      originalUrl: 'https://www.facebook.com/groups/1',
    });
    const archived = await store.createFacebookGroup({
      id: randomUUID(),
      workspaceId: ws,
      facebookGroupId: '2',
      canonicalUrl: 'https://www.facebook.com/groups/2',
      originalUrl: 'https://www.facebook.com/groups/2',
    });
    await store.updateFacebookGroup(archived.id, { status: 'archived' });
    const active = await repo.listActiveGroups(ws);
    expect(active).toHaveLength(1);
    expect(active[0]!.facebookGroupId).toBe('1');
  });
});
