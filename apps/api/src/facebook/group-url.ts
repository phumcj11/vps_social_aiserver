import { FacebookError, FacebookErrorCode } from './errors';

/**
 * Strict Facebook Group URL normaliser (SPRINT 005).
 *
 * Accepts only Facebook Group landing URLs, e.g.
 *   https://www.facebook.com/groups/{id-or-slug}
 *   https://facebook.com/groups/{id-or-slug}          (canonicalised to www)
 *   https://m.facebook.com/groups/{id-or-slug}?ref=x  (host + query normalised)
 *
 * Rejects: non-Facebook domains, profile/page/post/permalink URLs, malformed
 * URLs, and unsafe schemes (javascript:/data:/file:). Performs NO network
 * resolution.
 */

export interface NormalisedGroup {
  canonicalUrl: string;
  groupIdentifier: string | null;
}

const ALLOWED_HOSTS = new Set([
  'facebook.com',
  'www.facebook.com',
  'm.facebook.com',
  'web.facebook.com',
  'mobile.facebook.com',
]);

// Facebook group hub/reserved paths that are not a specific group.
const RESERVED_TOKENS = new Set(['feed', 'discover', 'create', 'joins', 'your_groups', 'search']);

// A group token is a numeric id or a slug of safe characters.
const TOKEN_RE = /^[A-Za-z0-9._-]+$/;

function reject(message: string): never {
  throw new FacebookError(FacebookErrorCode.INVALID_GROUP_URL, message);
}

export function normaliseGroupUrl(input: string): NormalisedGroup {
  if (typeof input !== 'string') reject('A group URL is required');
  const raw = input.trim();
  if (raw.length === 0 || raw.length > 1000) reject('A valid group URL is required');

  // Determine a parseable candidate. Reject any explicit non-http(s) scheme.
  let candidate: string;
  if (/^https?:\/\//i.test(raw)) {
    candidate = raw;
  } else if (/^[a-z][a-z0-9+.-]*:/i.test(raw)) {
    // Has a scheme, but it is not http/https (e.g. javascript:, data:, file:).
    reject('Only http(s) Facebook Group URLs are allowed');
  } else {
    candidate = `https://${raw}`;
  }

  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    reject('The URL is malformed');
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    reject('Only http(s) Facebook Group URLs are allowed');
  }

  const host = url.hostname.toLowerCase();
  if (!ALLOWED_HOSTS.has(host)) {
    reject('Only Facebook Group URLs are allowed');
  }

  const segments = url.pathname.split('/').filter((s) => s.length > 0);
  if (segments.length !== 2) {
    // Rejects profile URLs, page URLs, post/permalink URLs (extra segments),
    // and the bare /groups hub.
    reject('The URL must be a Facebook Group landing page (/groups/<id>)');
  }
  const [first, rawToken] = segments as [string, string];
  if (first.toLowerCase() !== 'groups') {
    reject('The URL must be a Facebook Group landing page (/groups/<id>)');
  }

  const token = decodeURIComponent(rawToken);
  if (!TOKEN_RE.test(token) || RESERVED_TOKENS.has(token.toLowerCase())) {
    reject('The Facebook Group identifier is not valid');
  }

  // Query and fragment are dropped (harmless parameter removal).
  return {
    canonicalUrl: `https://www.facebook.com/groups/${token}`,
    // A purely-numeric token is Facebook's group id; a slug is a safe identifier.
    groupIdentifier: token,
  };
}
