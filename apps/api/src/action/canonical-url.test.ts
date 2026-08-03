import { describe, expect, it } from 'vitest';
import {
  parseCanonicalFacebookPostUrl,
  isCanonicalFacebookPostUrl,
  CanonicalUrlError,
} from './canonical-url';

describe('parseCanonicalFacebookPostUrl', () => {
  it('parses a group /posts/ URL and derives a stable identity', () => {
    const a = parseCanonicalFacebookPostUrl('https://www.facebook.com/groups/123/posts/456/');
    expect(a.canonicalUrl).toBe('https://www.facebook.com/groups/123/posts/456');
    expect(a.identity).toBe('group:123:post:456');
    // Deterministic and query/fragment-insensitive.
    const b = parseCanonicalFacebookPostUrl(
      'https://m.facebook.com/groups/123/posts/456?comment_id=9#x',
    );
    expect(b.targetPostKey).toBe(a.targetPostKey);
  });

  it('parses a group /permalink/ URL to the same identity as /posts/', () => {
    const posts = parseCanonicalFacebookPostUrl('https://www.facebook.com/groups/123/posts/456');
    const perma = parseCanonicalFacebookPostUrl(
      'https://www.facebook.com/groups/123/permalink/456',
    );
    expect(perma.targetPostKey).toBe(posts.targetPostKey);
  });

  it('parses a page /posts/ URL', () => {
    const r = parseCanonicalFacebookPostUrl('https://www.facebook.com/mypage/posts/789');
    expect(r.identity).toBe('page:mypage:post:789');
  });

  it('parses permalink.php with story_fbid and id', () => {
    const r = parseCanonicalFacebookPostUrl(
      'https://www.facebook.com/permalink.php?story_fbid=456&id=123',
    );
    expect(r.identity).toBe('owner:123:post:456');
  });

  it('gives different keys for different posts', () => {
    const a = parseCanonicalFacebookPostUrl('https://www.facebook.com/groups/1/posts/2');
    const b = parseCanonicalFacebookPostUrl('https://www.facebook.com/groups/1/posts/3');
    expect(a.targetPostKey).not.toBe(b.targetPostKey);
  });

  it.each([
    ['http (not https)', 'http://www.facebook.com/groups/1/posts/2'],
    ['javascript scheme', 'javascript:alert(1)//facebook.com/groups/1/posts/2'],
    ['non-facebook host', 'https://evil.com/groups/1/posts/2'],
    ['facebook redirector', 'https://l.facebook.com/l.php?u=https://x'],
    ['lookalike host', 'https://facebook.com.evil.com/groups/1/posts/2'],
    ['group root, no post', 'https://www.facebook.com/groups/123'],
    ['bare profile', 'https://www.facebook.com/zuck'],
    ['garbage', 'not a url'],
    ['empty', ''],
  ])('rejects %s', (_label, url) => {
    expect(() => parseCanonicalFacebookPostUrl(url)).toThrow(CanonicalUrlError);
    expect(isCanonicalFacebookPostUrl(url)).toBe(false);
  });
});
