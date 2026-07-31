import { describe, expect, it } from 'vitest';
import { extractPostsFromPage, extractCaptureFromFragment } from './extractor';

const POST = `
<div role="article">
  <a href="/user/100/">Jane Doe</a>
  <a href="/groups/123/posts/456/">2h</a>
  <abbr data-utime="1700000000" title="Nov 14, 2023"></abbr>
  <div data-ad-comet-preview="message"><div dir="auto">Looking for a plumber in Bangkok</div></div>
  <img src="https://scontent.xx.fbcdn.net/img1.jpg" />
</div>`;

const POST2 = `
<div role="article">
  <a href="/user/200/">Somchai</a>
  <a href="/groups/123/permalink/789/">1h</a>
  <div data-ad-preview="message"><div dir="auto">Need a caterer for 40 people</div></div>
</div>`;

describe('extractor', () => {
  it('extracts a single post capture from a fragment', () => {
    const cap = extractCaptureFromFragment(POST);
    expect(cap).not.toBeNull();
    expect(cap!.postUrl).toBe('https://www.facebook.com/groups/123/posts/456');
    expect(cap!.facebookPostId).toBe('456');
    expect(cap!.authorName).toBe('Jane Doe');
    expect(cap!.authorProfile).toContain('/user/100');
    expect(cap!.message).toBe('Looking for a plumber in Bangkok');
    expect(cap!.mediaUrls).toContain('https://scontent.xx.fbcdn.net/img1.jpg');
    expect(cap!.createdTime).toBe('1700000000');
  });

  it('handles permalink form and returns a canonical /posts/ URL', () => {
    const cap = extractCaptureFromFragment(POST2);
    expect(cap!.postUrl).toBe(
      'https://www.facebook.com/groups/123/permalink/789'.replace('permalink', 'posts'),
    );
    expect(cap!.facebookPostId).toBe('789');
    expect(cap!.message).toBe('Need a caterer for 40 people');
  });

  it('extracts multiple unique posts from a page', () => {
    const page = `<html><body>${POST}${POST2}</body></html>`;
    const caps = extractPostsFromPage(page);
    expect(caps).toHaveLength(2);
    expect(caps.map((c) => c.facebookPostId).sort()).toEqual(['456', '789']);
  });

  it('de-duplicates repeated permalinks to the same post', () => {
    const page = `${POST}${POST}`;
    const caps = extractPostsFromPage(page);
    expect(caps).toHaveLength(1);
  });

  it('returns nothing when there is no group permalink', () => {
    expect(extractCaptureFromFragment('<div>no permalink here</div>')).toBeNull();
    expect(extractPostsFromPage('<html><body>nothing</body></html>')).toEqual([]);
  });
});
