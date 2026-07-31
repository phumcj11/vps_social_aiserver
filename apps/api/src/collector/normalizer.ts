import { createHash } from 'node:crypto';
import type { RawSignalCapture, NormalizedSignalData } from './types';

/**
 * Normalizer (SPRINT 006) — PURE. Converts a raw capture into a normalized,
 * platform-neutral Signal. Contains NO business logic, NO matching, NO AI.
 */

function cleanText(value: string | null): string | null {
  if (value === null) return null;
  const cleaned = value.replace(/\s+/g, ' ').trim();
  return cleaned.length > 0 ? cleaned : null;
}

function normaliseMedia(urls: string[]): string[] {
  const out = new Set<string>();
  for (const u of urls) {
    const trimmed = u.trim();
    if (trimmed.length > 0) out.add(trimmed);
  }
  return [...out];
}

/** Parse a created-time hint into a Date, tolerating unix seconds or ISO. */
function parseCreatedTime(value: string | null): Date | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (/^\d{9,10}$/.test(trimmed)) {
    const d = new Date(Number(trimmed) * 1000);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const d = new Date(trimmed);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Stable content hash of the RAW capture (used for third-tier dedup). */
export function contentHashOf(capture: RawSignalCapture): string {
  const basis = JSON.stringify({
    postUrl: capture.postUrl,
    facebookPostId: capture.facebookPostId,
    message: capture.message,
    author: capture.authorName,
    media: [...capture.mediaUrls].sort(),
  });
  return createHash('sha256').update(basis).digest('hex');
}

/** Normalize a raw capture into a platform-neutral Signal. */
export function normalize(capture: RawSignalCapture): NormalizedSignalData {
  const postUrl = capture.postUrl.trim();
  const message = cleanText(capture.message);
  const authorName = cleanText(capture.authorName);
  const authorProfile = cleanText(capture.authorProfile);
  const mediaUrls = normaliseMedia(capture.mediaUrls);
  const createdTime = parseCreatedTime(capture.createdTime);

  const normalizedHash = createHash('sha256')
    .update(
      JSON.stringify({
        postUrl,
        facebookPostId: capture.facebookPostId,
        authorName,
        message,
        media: [...mediaUrls].sort(),
      }),
    )
    .digest('hex');

  return {
    postUrl,
    facebookPostId: capture.facebookPostId,
    authorName,
    authorProfile,
    message,
    mediaUrls,
    createdTime,
    normalizedHash,
  };
}
