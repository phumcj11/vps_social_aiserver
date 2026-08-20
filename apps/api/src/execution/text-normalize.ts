import { createHash } from 'node:crypto';

/**
 * Post-submit comment-text normalization (PILOT write-verification recovery fix).
 *
 * Facebook re-renders a posted comment with cosmetic differences from what was
 * typed — emoji presentation/variation selectors, emoji rendered as images (their
 * codepoints absent from innerText), em-dash vs hyphen, collapsed or added
 * whitespace and line breaks, NBSP, and Unicode composition. A raw exact-string
 * compare therefore misses a genuinely-posted comment (observed live: a real
 * success was classified AMBIGUOUS / COMMENT_NOT_OBSERVED).
 *
 * This normalizer makes the post-submit compare robust to those cosmetic
 * differences ONLY. It is deliberately NOT used by the pre-submit preflight,
 * which keeps an EXACT typed-content check ("what a human approved is what gets
 * typed"). It never does partial/substring acceptance — callers still require a
 * full normalized-equal match, and exactly one of it.
 *
 * The character classes are built from numeric code points so no literal
 * invisible/whitespace characters appear in source.
 */

const hex = (n: number): string => '\\u' + n.toString(16).padStart(4, '0');

/** Build a global RegExp character class from inclusive code-point ranges. */
function classFromRanges(ranges: Array<[number, number]>): RegExp {
  const body = ranges.map(([a, b]) => (a === b ? hex(a) : `${hex(a)}-${hex(b)}`)).join('');
  return new RegExp(`[${body}]`, 'g');
}

// Variation selectors (emoji VS1-VS16 U+FE00-U+FE0F), zero-width marks
// (U+200B-U+200D), word joiner (U+2060), BOM (U+FEFF), soft hyphen (U+00AD).
const INVISIBLE = classFromRanges([
  [0xfe00, 0xfe0f],
  [0x200b, 0x200d],
  [0x2060, 0x2060],
  [0xfeff, 0xfeff],
  [0x00ad, 0x00ad],
]);
// Dash-family (hyphen U+2010 … horizontal bar U+2015) plus minus sign (U+2212).
const DASHES = classFromRanges([
  [0x2010, 0x2015],
  [0x2212, 0x2212],
]);
// Non-breaking / exotic spaces normalized before the whitespace collapse.
const NBSP = classFromRanges([
  [0x00a0, 0x00a0],
  [0x2000, 0x200a],
  [0x202f, 0x202f],
  [0x205f, 0x205f],
  [0x3000, 0x3000],
]);
// Emoji (Extended_Pictographic) + skin-tone modifiers (U+1F3FB-U+1F3FF).
const EMOJI = /\p{Extended_Pictographic}/gu;
const SKIN_TONE = /[\u{1F3FB}-\u{1F3FF}]/gu;

/** Normalize comment text for a cosmetic-difference-tolerant compare. */
export function normalizeCommentText(input: string): string {
  return (
    (input ?? '')
      .normalize('NFC') // consistent Unicode composition
      .replace(INVISIBLE, '') // drop variation selectors / zero-width / soft hyphen
      // Facebook renders emoji as images whose codepoints are ABSENT from the
      // comment's innerText (observed live), so a genuine success must tolerate
      // emoji being missing. Cosmetic normalization applied to BOTH sides — never a
      // partial acceptance (the full remaining content must still match).
      .replace(EMOJI, '')
      .replace(SKIN_TONE, '')
      .replace(DASHES, '-') // unify en/em/figure/minus dashes → "-"
      .replace(NBSP, ' ') // exotic spaces → normal space
      .replace(/\s+/g, ' ') // collapse ALL whitespace (incl. line breaks) to one space
      .trim()
  );
}

/** SHA-256 of the normalized text — a stable identity for evidence. */
export function commentTextHash(input: string): string {
  return createHash('sha256').update(normalizeCommentText(input)).digest('hex');
}

/** True when two texts are equal after cosmetic normalization. */
export function commentTextEquals(a: string, b: string): boolean {
  return normalizeCommentText(a) === normalizeCommentText(b);
}

/**
 * Count NON-OVERLAPPING occurrences of the full `needle` inside `haystack`,
 * both normalized. This is a WHOLE-content match (the entire approved comment
 * appears contiguously), never a partial/truncated acceptance. Used to require
 * EXACTLY ONE matching comment on the verified target post.
 */
export function countNormalizedOccurrences(haystack: string, needle: string): number {
  const h = normalizeCommentText(haystack);
  const n = normalizeCommentText(needle);
  if (n.length === 0) return 0;
  let count = 0;
  let from = 0;
  for (;;) {
    const idx = h.indexOf(n, from);
    if (idx < 0) break;
    count += 1;
    from = idx + n.length; // non-overlapping
  }
  return count;
}
