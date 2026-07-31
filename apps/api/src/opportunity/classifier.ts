import {
  ReasonCode,
  type ClassifierSignal,
  type ClassifierContext,
  type ClassificationResult,
  type Reason,
} from './types';

/**
 * OpportunityClassifier (SPRINT 007) — PURE and DETERMINISTIC.
 *
 * Input: a Signal (+ context). Output: a Decision (ACCEPT | REJECT) and Reasons.
 * NO AI, NO machine learning, NO embeddings, NO vector search, NO confidence,
 * NO score. No database access, no business logic, no Telegram, no comments.
 *
 * A Signal is ACCEPTed only when EVERY rule passes; otherwise it is REJECTed.
 */

/** The version of the deterministic rule set (stored on each Opportunity). */
export const CLASSIFIER_VERSION = 'rules-v1';

/** Messages that indicate removed/unavailable content (treated as "deleted"). */
const DELETED_MARKERS = [
  'this content isn',
  'content is no longer available',
  'this post is no longer available',
  'no longer available',
  '[deleted]',
  '[removed]',
];

function hasText(message: string | null): boolean {
  return typeof message === 'string' && message.trim().length > 0;
}

function isNotDeleted(message: string | null): boolean {
  if (!hasText(message)) return false;
  const lower = (message as string).toLowerCase();
  return !DELETED_MARKERS.some((m) => lower.includes(m));
}

/**
 * Supported-language check — deterministic, NOT language detection ML. The
 * message must contain at least one letter in a supported script (Latin or
 * Thai), which covers the product's current markets.
 */
function isSupportedLanguage(message: string | null): boolean {
  if (!hasText(message)) return false;
  return /[A-Za-z฀-๿]/u.test(message as string);
}

export function classifySignal(
  signal: ClassifierSignal,
  ctx: ClassifierContext,
): ClassificationResult {
  const messageLen = hasText(signal.message) ? (signal.message as string).trim().length : 0;

  const reasons: Reason[] = [
    { code: ReasonCode.HAS_TEXT, passed: hasText(signal.message) },
    { code: ReasonCode.TEXT_MIN_LENGTH, passed: messageLen >= ctx.minTextLength },
    { code: ReasonCode.HAS_AUTHOR, passed: hasText(signal.authorName) },
    { code: ReasonCode.HAS_URL, passed: hasText(signal.postUrl) },
    { code: ReasonCode.NOT_DELETED, passed: isNotDeleted(signal.message) },
    { code: ReasonCode.SUPPORTED_LANGUAGE, passed: isSupportedLanguage(signal.message) },
    { code: ReasonCode.NOT_DUPLICATE, passed: !ctx.isDuplicate },
  ];

  const decision = reasons.every((r) => r.passed) ? 'ACCEPT' : 'REJECT';
  return { decision, reasons };
}
