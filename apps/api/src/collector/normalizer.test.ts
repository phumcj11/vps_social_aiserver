import { describe, expect, it } from 'vitest';
import { normalize, contentHashOf } from './normalizer';
import type { RawSignalCapture } from './types';

function capture(overrides: Partial<RawSignalCapture> = {}): RawSignalCapture {
  return {
    postUrl: 'https://www.facebook.com/groups/123/posts/456',
    facebookPostId: '456',
    rawHtml: '<div>x</div>',
    rawJson: null,
    authorName: '  Jane   Doe ',
    authorProfile: 'https://www.facebook.com/user/100',
    message: '  Looking   for a\nplumber  ',
    mediaUrls: ['a.jpg', 'a.jpg', ' b.jpg '],
    createdTime: '1700000000',
    ...overrides,
  };
}

describe('normalizer', () => {
  it('cleans whitespace and de-duplicates media', () => {
    const n = normalize(capture());
    expect(n.authorName).toBe('Jane Doe');
    expect(n.message).toBe('Looking for a plumber');
    expect(n.mediaUrls).toEqual(['a.jpg', 'b.jpg']);
  });

  it('parses a unix-seconds created time to a Date', () => {
    const n = normalize(capture());
    expect(n.createdTime).toBeInstanceOf(Date);
    expect(n.createdTime!.getUTCFullYear()).toBe(2023);
  });

  it('parses an ISO created time and tolerates invalid ones', () => {
    expect(normalize(capture({ createdTime: '2023-11-14T00:00:00Z' })).createdTime).toBeInstanceOf(
      Date,
    );
    expect(normalize(capture({ createdTime: 'not-a-date' })).createdTime).toBeNull();
    expect(normalize(capture({ createdTime: null })).createdTime).toBeNull();
  });

  it('produces a stable normalized hash (same input → same hash)', () => {
    expect(normalize(capture()).normalizedHash).toBe(normalize(capture()).normalizedHash);
  });

  it('changes the normalized hash when the message changes', () => {
    const a = normalize(capture()).normalizedHash;
    const b = normalize(capture({ message: 'different' })).normalizedHash;
    expect(a).not.toBe(b);
  });

  it('content hash is deterministic and 64 hex chars', () => {
    const h = contentHashOf(capture());
    expect(h).toMatch(/^[0-9a-f]{64}$/);
    expect(h).toBe(contentHashOf(capture()));
  });
});
