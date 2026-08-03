import { createHash } from 'node:crypto';

/**
 * Canonical Facebook post URL parsing (SPRINT 012).
 *
 * Replaces regex-only validation with strict `URL` parsing. Accepts ONLY the
 * canonical Facebook post forms the executor supports, and derives a
 * deterministic `targetPostKey` from the post *identity* (not the raw string).
 *
 * Rejected: non-HTTPS, non-Facebook hosts, javascript/data/file schemes,
 * redirector hosts (l.facebook.com / lm.facebook.com), profile URLs, group root
 * URLs without a post, malformed and arbitrary URLs.
 */

export class CanonicalUrlError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CanonicalUrlError';
  }
}

/** Hosts that are the real Facebook site (redirectors deliberately excluded). */
const ALLOWED_HOSTS = new Set([
  'facebook.com',
  'www.facebook.com',
  'm.facebook.com',
  'web.facebook.com',
  'mbasic.facebook.com',
]);

const SAFE_TOKEN = /^[A-Za-z0-9._-]+$/;

export interface CanonicalPost {
  /** A normalized, fixed canonical URL (query/fragment stripped). */
  canonicalUrl: string;
  /** Deterministic identity hash for idempotency (never the raw URL). */
  targetPostKey: string;
  /** Human-readable identity, e.g. "group:123:post:456" or "post:789". */
  identity: string;
}

function keyFrom(identity: string): string {
  return createHash('sha256').update(`fb:${identity}`).digest('hex');
}

/**
 * Parse and canonicalize a Facebook post URL, or throw CanonicalUrlError.
 */
export function parseCanonicalFacebookPostUrl(raw: string): CanonicalPost {
  const input = (raw ?? '').trim();
  if (input.length === 0) throw new CanonicalUrlError('Empty URL');

  let url: URL;
  try {
    url = new URL(input);
  } catch {
    throw new CanonicalUrlError('Malformed URL');
  }

  if (url.protocol !== 'https:') {
    throw new CanonicalUrlError(`Unsupported scheme "${url.protocol}" (https only)`);
  }
  const host = url.hostname.toLowerCase();
  if (!ALLOWED_HOSTS.has(host)) {
    throw new CanonicalUrlError(`Unsupported host "${host}"`);
  }

  // Path segments without empties.
  const segs = url.pathname.split('/').filter((s) => s.length > 0);

  // Form 1: /groups/<gid>/posts/<pid>  or  /groups/<gid>/permalink/<pid>
  if (segs[0] === 'groups') {
    const gid = segs[1];
    const kind = segs[2];
    const pid = segs[3];
    if (!gid || !SAFE_TOKEN.test(gid)) throw new CanonicalUrlError('Invalid group id');
    if (kind !== 'posts' && kind !== 'permalink') {
      throw new CanonicalUrlError('Group URL is not a post (missing /posts/ or /permalink/)');
    }
    if (!pid || !SAFE_TOKEN.test(pid)) throw new CanonicalUrlError('Invalid post id');
    const identity = `group:${gid}:post:${pid}`;
    return {
      canonicalUrl: `https://www.facebook.com/groups/${gid}/posts/${pid}`,
      targetPostKey: keyFrom(identity),
      identity,
    };
  }

  // Form 2: /permalink.php?story_fbid=<pid>&id=<uid>
  if (segs.length === 1 && segs[0] === 'permalink.php') {
    const pid = url.searchParams.get('story_fbid');
    const uid = url.searchParams.get('id');
    if (!pid || !SAFE_TOKEN.test(pid)) throw new CanonicalUrlError('Invalid story_fbid');
    const identity = uid && SAFE_TOKEN.test(uid) ? `owner:${uid}:post:${pid}` : `post:${pid}`;
    const canonical = uid
      ? `https://www.facebook.com/permalink.php?story_fbid=${pid}&id=${uid}`
      : `https://www.facebook.com/permalink.php?story_fbid=${pid}`;
    return { canonicalUrl: canonical, targetPostKey: keyFrom(identity), identity };
  }

  // Form 3: /<page>/posts/<pid>
  if (segs.length >= 3 && segs[segs.length - 2] === 'posts') {
    const page = segs[0];
    const pid = segs[segs.length - 1];
    if (!page || !SAFE_TOKEN.test(page)) throw new CanonicalUrlError('Invalid page');
    if (!pid || !SAFE_TOKEN.test(pid)) throw new CanonicalUrlError('Invalid post id');
    const identity = `page:${page}:post:${pid}`;
    return {
      canonicalUrl: `https://www.facebook.com/${page}/posts/${pid}`,
      targetPostKey: keyFrom(identity),
      identity,
    };
  }

  // Everything else (profile URLs, group roots, story.php redirectors, etc.).
  throw new CanonicalUrlError('URL is not a supported Facebook post URL');
}

/** True when the URL is a supported Facebook post URL. */
export function isCanonicalFacebookPostUrl(raw: string): boolean {
  try {
    parseCanonicalFacebookPostUrl(raw);
    return true;
  } catch {
    return false;
  }
}
