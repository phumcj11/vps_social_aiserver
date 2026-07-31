import { describe, expect, it } from 'vitest';
import { normaliseGroupUrl } from './group-url';
import { FacebookError, FacebookErrorCode } from './errors';

describe('normaliseGroupUrl — accepted', () => {
  it('canonicalises a numeric group URL and extracts the id', () => {
    const r = normaliseGroupUrl('https://www.facebook.com/groups/123456789');
    expect(r.canonicalUrl).toBe('https://www.facebook.com/groups/123456789');
    expect(r.groupIdentifier).toBe('123456789');
  });

  it('canonicalises the host (facebook.com → www) for a slug group', () => {
    const r = normaliseGroupUrl('https://facebook.com/groups/my-cool-group');
    expect(r.canonicalUrl).toBe('https://www.facebook.com/groups/my-cool-group');
    expect(r.groupIdentifier).toBe('my-cool-group');
  });

  it('removes query parameters and canonicalises the mobile host', () => {
    const r = normaliseGroupUrl('https://m.facebook.com/groups/123?ref=share&mibextid=x');
    expect(r.canonicalUrl).toBe('https://www.facebook.com/groups/123');
  });

  it('accepts a URL without a scheme', () => {
    const r = normaliseGroupUrl('facebook.com/groups/123');
    expect(r.canonicalUrl).toBe('https://www.facebook.com/groups/123');
  });

  it('drops a trailing slash', () => {
    const r = normaliseGroupUrl('https://www.facebook.com/groups/123/');
    expect(r.canonicalUrl).toBe('https://www.facebook.com/groups/123');
  });

  it('canonicalises two different inputs of the same group identically (dedup)', () => {
    const a = normaliseGroupUrl('https://facebook.com/groups/123?ref=a');
    const b = normaliseGroupUrl('https://www.facebook.com/groups/123/');
    expect(a.canonicalUrl).toBe(b.canonicalUrl);
  });
});

describe('normaliseGroupUrl — rejected', () => {
  const bad: Array<[string, string]> = [
    ['profile URL', 'https://www.facebook.com/someprofile'],
    ['page URL', 'https://www.facebook.com/pages/foo/123'],
    ['post/permalink URL', 'https://www.facebook.com/groups/123/posts/456'],
    ['permalink URL', 'https://www.facebook.com/groups/123/permalink/456'],
    ['bare groups hub', 'https://www.facebook.com/groups/'],
    ['reserved token', 'https://www.facebook.com/groups/feed'],
    ['non-facebook domain', 'https://evil.example.com/groups/123'],
    ['lookalike domain', 'https://facebook.com.evil.com/groups/123'],
    ['javascript scheme', 'javascript:alert(1)'],
    ['data scheme', 'data:text/html,<h1>x</h1>'],
    ['file scheme', 'file:///etc/passwd'],
    ['malformed', 'not a url at all'],
    ['empty', ''],
  ];
  for (const [label, url] of bad) {
    it(`rejects ${label}`, () => {
      try {
        normaliseGroupUrl(url);
        throw new Error(`expected rejection for ${label}`);
      } catch (e) {
        expect(e).toBeInstanceOf(FacebookError);
        expect((e as FacebookError).code).toBe(FacebookErrorCode.INVALID_GROUP_URL);
      }
    });
  }
});
