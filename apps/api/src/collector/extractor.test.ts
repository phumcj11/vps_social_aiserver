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

  // ── M8A — text-on-background ("styled status") posts (real M7 DOM variant) ──
  // The body sits in a div whose INLINE STYLE carries font-size + text-align,
  // nested under aria-hidden — not a preview marker and not a dir="auto" block.

  // CASE A — the exact M7 controlled seeking lead (post 1021432287601285).
  const BG_SEEK_10 = `
<div role="article">
  <a href="/user/300/">ลูกค้า</a>
  <a href="/groups/1013703265040854/posts/1021432287601285/">10h</a>
  <div aria-hidden="true" class="xh8yej3">
    <div class="xj87blo"></div>
    <div class="xlshs6z">
      <div class="x1yx25j4" style="color:rgba(255,255,255,1);font-size:30px;font-style:NORMAL;font-weight:bold;text-align:CENTER">
        <div class="xdj266r x14z9mp xat24cr">หาบ้านพักบางแสน 10 คน มีสระส่วนตัว ขอที่พักใกล้ทะเลครับ</div>
      </div>
    </div>
  </div>
</div>`;

  // CASE B — the second real seeking post (post 1013706061707241) — also a
  // styled status; it SHOULD now be extractable.
  const BG_SEEK_2 = `
<div role="article">
  <a href="/groups/1013703265040854/posts/1013706061707241/">1h</a>
  <div aria-hidden="true">
    <div style="font-size:24px;text-align:CENTER">
      <div class="xdj266r">หาที่พักบางแสน 2 คน วันนี้ มีสระว่ายน้ำ</div>
    </div>
  </div>
</div>`;

  // CASE C — group cover/admin chrome (post 1013705371707310) — NO styled body,
  // must NOT surface chrome text as the customer message.
  const CHROME = `
<div role="article">
  <a href="/groups/1013703265040854/posts/1013705371707310/">2h</a>
  <span>อัพเดตรูปภาพหน้าปกของกลุ่ม</span>
  <span>แชร์กับ กลุ่มสาธารณะ</span>
  <div dir="auto"></div>
</div>`;

  // An advert with the standard preview marker (mirrors the two real adverts) —
  // must keep extracting via the preferred marker, not the styled path.
  const ADVERT = `
<div role="article">
  <a href="/groups/1013703265040854/posts/1013712478373266/">3h</a>
  <div data-ad-comet-preview="message"><div dir="auto" style="text-align: start;">ที่พักบางแสน ราคาถูก | โรงแรม รีสอร์ท พูลวิลล่า ที่พักติดทะเล</div></div>
</div>`;

  // Image-only post — no real body text → NULL.
  const IMAGE_ONLY = `
<div role="article">
  <a href="/groups/1013703265040854/posts/999000111/">5m</a>
  <img src="https://scontent.xx.fbcdn.net/only.jpg" />
</div>`;

  it('CASE A — extracts a text-on-background seeking lead (M7 post 1021432287601285)', () => {
    const cap = extractCaptureFromFragment(BG_SEEK_10);
    expect(cap!.facebookPostId).toBe('1021432287601285');
    expect(cap!.message).toBe('หาบ้านพักบางแสน 10 คน มีสระส่วนตัว ขอที่พักใกล้ทะเลครับ');
  });

  it('CASE B — the second styled seeking post is now extractable (post 1013706061707241)', () => {
    const cap = extractCaptureFromFragment(BG_SEEK_2);
    expect(cap!.message).toBe('หาที่พักบางแสน 2 คน วันนี้ มีสระว่ายน้ำ');
  });

  it('CASE C — group cover/admin chrome does NOT become the message', () => {
    const cap = extractCaptureFromFragment(CHROME);
    expect(cap).not.toBeNull();
    expect(cap!.message).toBeNull();
  });

  it('advert with a preview marker still extracts via the marker (no regression)', () => {
    const cap = extractCaptureFromFragment(ADVERT);
    expect(cap!.message).toBe('ที่พักบางแสน ราคาถูก | โรงแรม รีสอร์ท พูลวิลล่า ที่พักติดทะเล');
  });

  it('image-only post produces a NULL message (no invented body)', () => {
    const cap = extractCaptureFromFragment(IMAGE_ONLY);
    expect(cap).not.toBeNull();
    expect(cap!.message).toBeNull();
    expect(cap!.mediaUrls).toContain('https://scontent.xx.fbcdn.net/only.jpg');
  });

  it('a preview marker still wins over a styled block in the same post', () => {
    const both = `
<div role="article">
  <a href="/groups/123/posts/777/">1h</a>
  <div data-ad-comet-preview="message"><div dir="auto">the real message</div></div>
  <div aria-hidden="true"><div style="font-size:30px;text-align:CENTER"><div>decorative banner</div></div></div>
</div>`;
    expect(extractCaptureFromFragment(both)!.message).toBe('the real message');
  });
});
