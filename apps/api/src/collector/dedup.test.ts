import { describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { InMemoryStore } from '../store/memory';
import { CollectorRepository } from './repository';
import { normalize, contentHashOf } from './normalizer';
import type { RawSignalCapture } from './types';
import type { CreateSignalInput, SignalRecord } from '../store/types';

function capture(postId: string, url?: string, message?: string): RawSignalCapture {
  return {
    postUrl: url ?? `https://www.facebook.com/groups/123/posts/${postId}`,
    facebookPostId: postId,
    rawHtml: '<div>x</div>',
    rawJson: null,
    authorName: null,
    authorProfile: null,
    message: message ?? `หาที่พักบางแสน ${postId}`,
    mediaUrls: [],
    createdTime: '1700000000',
  };
}

function persist(repo: CollectorRepository, ws: string, groupId: string, cap: RawSignalCapture) {
  const normalized = normalize(cap);
  return repo.persistSignal({
    workspaceId: ws,
    groupId,
    capture: cap,
    contentHash: contentHashOf(cap),
    normalized,
  });
}

describe('Collector duplicate handling (idempotent, no REPOSITORY_ERROR)', () => {
  it('inserts once, then skips the same post URL (pinned/re-run)', async () => {
    const repo = new CollectorRepository(new InMemoryStore());
    const ws = randomUUID();
    const g = randomUUID();
    const first = await persist(repo, ws, g, capture('456'));
    const second = await persist(repo, ws, g, capture('456'));
    expect(first.inserted).toBe(true);
    expect(second.inserted).toBe(false);
    expect(await repo.countSignals(ws)).toBe(1);
  });

  it('skips a duplicate by Facebook post id under different URL tracking params', async () => {
    const repo = new CollectorRepository(new InMemoryStore());
    const ws = randomUUID();
    const g = randomUUID();
    await persist(repo, ws, g, capture('789'));
    const dup = await persist(
      repo,
      ws,
      g,
      capture('789', 'https://www.facebook.com/groups/123/posts/789?ref=feed'),
    );
    expect(dup.inserted).toBe(false);
    expect(await repo.countSignals(ws)).toBe(1);
  });

  it('skips a duplicate (same URL + hash) when the Facebook post id is missing', async () => {
    const repo = new CollectorRepository(new InMemoryStore());
    const ws = randomUUID();
    const g = randomUUID();
    const url = 'https://www.facebook.com/groups/123/posts/111';
    const a = capture('111', url, 'หาที่พักชะอำ');
    a.facebookPostId = null;
    const b = capture('111', url, 'หาที่พักชะอำ'); // same identity, no post id
    b.facebookPostId = null;
    await persist(repo, ws, g, a);
    const dup = await persist(repo, ws, g, b);
    expect(dup.inserted).toBe(false);
    expect(await repo.countSignals(ws)).toBe(1);
  });

  it('a duplicate does not block a following valid new post', async () => {
    const repo = new CollectorRepository(new InMemoryStore());
    const ws = randomUUID();
    const g = randomUUID();
    await persist(repo, ws, g, capture('1'));
    const dupe = await persist(repo, ws, g, capture('1')); // duplicate
    const fresh = await persist(repo, ws, g, capture('2')); // still processes
    expect(dupe.inserted).toBe(false);
    expect(fresh.inserted).toBe(true);
    expect(await repo.countSignals(ws)).toBe(2);
  });

  it('never rewrites an existing Signal on a duplicate attempt', async () => {
    const store = new InMemoryStore();
    const repo = new CollectorRepository(store);
    const ws = randomUUID();
    const g = randomUUID();
    await persist(repo, ws, g, capture('9', undefined, 'หาที่พักบางแสน original'));
    const before =
      (await store.getSignalByUrl?.(ws, 'https://www.facebook.com/groups/123/posts/9')) ?? null;
    // Attempt to persist the same URL with different content — must be skipped, not overwritten.
    await persist(repo, ws, g, capture('9', undefined, 'DIFFERENT tampered content'));
    const after =
      (await store.getSignalByUrl?.(ws, 'https://www.facebook.com/groups/123/posts/9')) ?? null;
    if (before && after) expect(after.message).toBe(before.message);
    expect(await repo.countSignals(ws)).toBe(1);
  });

  it('converts a unique-constraint race into an idempotent skip (no REPOSITORY_ERROR)', async () => {
    // A store whose pre-checks say "not present" but whose insert throws a
    // duplicate-key error — the classic race. persistSignal must NOT throw.
    class RacyStore extends InMemoryStore {
      async signalExistsByUrl(): Promise<boolean> {
        return false;
      }
      async signalExistsByHash(): Promise<boolean> {
        return false;
      }
      async signalExistsByFacebookPostId(): Promise<boolean> {
        return false;
      }
      async createSignal(_input: CreateSignalInput): Promise<SignalRecord> {
        throw Object.assign(new Error('duplicate entry'), { code: 'ER_DUP_ENTRY', errno: 1062 });
      }
    }
    const repo = new CollectorRepository(new RacyStore());
    const res = await persist(repo, randomUUID(), randomUUID(), capture('42'));
    expect(res.inserted).toBe(false); // skipped, not thrown
  });
});
