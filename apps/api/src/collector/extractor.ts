import type { RawSignalCapture } from './types';

/**
 * Extractor (SPRINT 006) — PURE, no browser, no DOM, no SQL.
 *
 * Turns a Facebook Group page's HTML into raw signal captures. It parses only
 * (it never navigates, clicks, or writes) and contains NO business logic.
 * DOM-selector hardening for live Facebook happens when the reader is enabled
 * with a real session; this parser is best-effort and fully unit-tested on
 * synthetic HTML.
 */

const PERMALINK_RE = /\/groups\/(\d+)\/(?:posts|permalink)\/(\d+)/g;

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&nbsp;/g, ' ');
}

function stripTags(html: string): string {
  return decodeEntities(html.replace(/<[^>]*>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();
}

function firstGroup(re: RegExp, s: string): string | null {
  const m = re.exec(s);
  return m && m[1] !== undefined ? m[1] : null;
}

/** Canonical post URL from a group id + post id. */
function postUrlFor(groupId: string, postId: string): string {
  return `https://www.facebook.com/groups/${groupId}/posts/${postId}`;
}

/** Extract the message text from a post fragment (best effort). */
function extractMessage(fragment: string): string | null {
  // Preferred: Facebook's message preview container.
  const marked =
    /data-ad-comet-preview="message"[^>]*>([\s\S]*?)<\/div>/i.exec(fragment) ??
    /data-ad-preview="message"[^>]*>([\s\S]*?)<\/div>/i.exec(fragment) ??
    /data-collector="message"[^>]*>([\s\S]*?)<\/div>/i.exec(fragment);
  if (marked && marked[1]) {
    const text = stripTags(marked[1]);
    if (text.length > 0) return text;
  }
  // Text-on-background ("styled status") posts: the body lives neither in a
  // preview marker nor a `dir="auto"` block but inside a div whose INLINE STYLE
  // carries Facebook's background-text rendering (an explicit `font-size:` plus
  // a `text-align:`). This is a STRUCTURAL signal (the inline style), not an
  // obfuscated class name, and is scoped to the post fragment — so ordinary
  // chrome (cover updates, comment prompts, timestamps, buttons) is never a
  // styled text block and is not captured. This is the real DOM variant that
  // made genuine "หา…" seeking leads extract as NULL in the M7 pilot.
  const styled =
    /<div[^>]*\bstyle="[^"]*font-size:[^"]*text-align:[^"]*"[^>]*>([\s\S]*?)<\/div>/i.exec(
      fragment,
    );
  if (styled && styled[1]) {
    const text = stripTags(styled[1]);
    if (text.length > 0) return text;
  }
  // Fallback: the first auto-direction text block.
  const auto = /<div[^>]*\bdir="auto"[^>]*>([\s\S]*?)<\/div>/i.exec(fragment);
  if (auto && auto[1]) {
    const text = stripTags(auto[1]);
    if (text.length > 0) return text;
  }
  return null;
}

/** Extract author name + profile href (best effort). */
function extractAuthor(fragment: string): { name: string | null; profile: string | null } {
  // An anchor to a user profile.
  const profileAnchor =
    /<a[^>]*href="([^"]*(?:\/user\/|\/profile\.php|facebook\.com\/[^"?]+)[^"]*)"[^>]*>([\s\S]*?)<\/a>/i.exec(
      fragment,
    );
  if (profileAnchor) {
    const name = stripTags(profileAnchor[2] ?? '');
    const profile = decodeEntities(profileAnchor[1] ?? '');
    if (name.length > 0) return { name, profile: profile.length > 0 ? profile : null };
  }
  const strong = /<(?:strong|h3)[^>]*>([\s\S]*?)<\/(?:strong|h3)>/i.exec(fragment);
  if (strong && strong[1]) {
    const name = stripTags(strong[1]);
    if (name.length > 0) return { name, profile: null };
  }
  return { name: null, profile: null };
}

/** Extract media URLs (images / videos / cdn links). */
function extractMedia(fragment: string): string[] {
  const urls = new Set<string>();
  for (const m of fragment.matchAll(/<img[^>]*\bsrc="([^"]+)"/gi)) {
    if (m[1]) urls.add(decodeEntities(m[1]));
  }
  for (const m of fragment.matchAll(/<video[^>]*\bsrc="([^"]+)"/gi)) {
    if (m[1]) urls.add(decodeEntities(m[1]));
  }
  for (const m of fragment.matchAll(/href="([^"]*(?:scontent|fbcdn)[^"]*)"/gi)) {
    if (m[1]) urls.add(decodeEntities(m[1]));
  }
  return [...urls];
}

/** Extract a created-time hint (best effort). */
function extractCreatedTime(fragment: string): string | null {
  const utime = firstGroup(/\bdata-utime="(\d+)"/i, fragment);
  if (utime) return utime;
  const dt = firstGroup(/\bdatetime="([^"]+)"/i, fragment);
  if (dt) return dt;
  const abbr = firstGroup(/<abbr[^>]*\btitle="([^"]+)"/i, fragment);
  return abbr;
}

/** Build a capture for a known post from a fragment (fields extracted). */
function buildCapture(fragment: string, groupId: string, postId: string): RawSignalCapture {
  const author = extractAuthor(fragment);
  return {
    postUrl: postUrlFor(groupId, postId),
    facebookPostId: postId,
    rawHtml: fragment,
    rawJson: null,
    authorName: author.name,
    authorProfile: author.profile,
    message: extractMessage(fragment),
    mediaUrls: extractMedia(fragment),
    createdTime: extractCreatedTime(fragment),
  };
}

/** Extract one capture from a single post fragment; null if no permalink. */
export function extractCaptureFromFragment(fragment: string): RawSignalCapture | null {
  PERMALINK_RE.lastIndex = 0;
  const m = PERMALINK_RE.exec(fragment);
  if (!m || !m[1] || !m[2]) return null;
  return buildCapture(fragment, m[1], m[2]);
}

/**
 * Extract all unique post captures from a full page's HTML.
 *
 * Primary strategy: segment by `role="article"` containers (each post is one
 * article). Fallback: for pages without article containers, window each post
 * permalink (forcing the current post id so adjacent posts don't collide).
 * De-duplicates by post URL.
 */
export function extractPostsFromPage(pageHtml: string): RawSignalCapture[] {
  const byUrl = new Map<string, RawSignalCapture>();

  if (/<[a-z]+[^>]*role="article"/i.test(pageHtml)) {
    const parts = pageHtml.split(/(?=<[a-z]+[^>]*role="article")/i);
    for (const part of parts) {
      const capture = extractCaptureFromFragment(part);
      if (capture && !byUrl.has(capture.postUrl)) byUrl.set(capture.postUrl, capture);
    }
    if (byUrl.size > 0) return [...byUrl.values()];
  }

  PERMALINK_RE.lastIndex = 0;
  const seenIds = new Set<string>();
  let match: RegExpExecArray | null;
  while ((match = PERMALINK_RE.exec(pageHtml)) !== null) {
    const groupId = match[1];
    const postId = match[2];
    if (!groupId || !postId || seenIds.has(postId)) continue;
    seenIds.add(postId);
    const start = Math.max(0, match.index - 1500);
    const end = Math.min(pageHtml.length, match.index + 3000);
    const capture = buildCapture(pageHtml.slice(start, end), groupId, postId);
    if (!byUrl.has(capture.postUrl)) byUrl.set(capture.postUrl, capture);
  }
  return [...byUrl.values()];
}
