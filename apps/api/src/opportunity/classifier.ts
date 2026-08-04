import {
  ReasonCode,
  type ClassifierSignal,
  type ClassifierContext,
  type ClassificationResult,
  type Reason,
} from './types';
import { analyzeIntent } from './intent';

/**
 * OpportunityClassifier (SPRINT 007; rules-v2 Pilot 0 correction) — PURE and
 * DETERMINISTIC. NO AI, NO ML, NO embeddings, NO confidence, NO score.
 *
 * rules-v2 decides on CUSTOMER DEMAND, not structural completeness:
 *   - Structural gates first: real, textual, not-deleted, actionable (has URL).
 *   - Then intent: a customer SEEKING accommodation → ACCEPT; a property
 *     advertisement / owner-agent listing / promotion / bare property code →
 *     REJECT; an agent seeking on behalf of others → REJECT. Author presence and
 *     minimum length NO LONGER gate ACCEPT (the Pilot showed genuine intent
 *     posts often lack a visible author and are short).
 */

/** The version of the deterministic rule set (stored on each Opportunity). */
export const CLASSIFIER_VERSION = 'rules-v2';

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
  const message = signal.message ?? '';

  // ── Structural gates (fail → REJECT, regardless of intent) ────────────────
  const structural: Reason[] = [
    { code: ReasonCode.HAS_TEXT, passed: hasText(signal.message) },
    { code: ReasonCode.HAS_URL, passed: hasText(signal.postUrl) },
    { code: ReasonCode.NOT_DELETED, passed: isNotDeleted(signal.message) },
    { code: ReasonCode.SUPPORTED_LANGUAGE, passed: isSupportedLanguage(signal.message) },
    // Duplicate content is not a fresh opportunity (dedup is also enforced by
    // the Collector; here it only informs the decision).
    { code: ReasonCode.NOT_DUPLICATE, passed: !ctx.isDuplicate },
  ];
  if (!structural.every((r) => r.passed)) {
    return { decision: 'REJECT', reasons: structural };
  }

  // ── Intent classification (rules-v2) ──────────────────────────────────────
  const a = analyzeIntent(message);
  const reasons: Reason[] = [...structural];
  const add = (code: (typeof ReasonCode)[keyof typeof ReasonCode], passed: boolean) =>
    reasons.push({ code, passed });

  // 2. Property-code-only text → REJECT.
  if (a.propertyCodeOnly) {
    add(ReasonCode.PROPERTY_CODE_ONLY, true);
    return { decision: 'REJECT', reasons };
  }
  // 4a. Agent / on-behalf listing → REJECT even if a search verb is present.
  if (a.agentContext) {
    add(ReasonCode.OWNER_OR_AGENT_LISTING, true);
    return { decision: 'REJECT', reasons };
  }

  if (a.firstPersonDemand) {
    // 4b. Clear customer demand quoted alongside a hard advertiser marker →
    // conflict, prefer REJECT (a customer never writes "รหัสที่พัก"/"จองด่วน").
    if (a.strongAdvertiser) {
      add(ReasonCode.INTENT_AD_CONFLICT, true);
      return { decision: 'REJECT', reasons };
    }
    // 1. Strong customer intent → ACCEPT (even when short). Soft ad words (โปร)
    // do NOT block a genuine seeker.
    add(ReasonCode.CUSTOMER_SEARCH_INTENT, true);
    if (a.hasRequirement) add(ReasonCode.CUSTOMER_REQUIREMENT_PRESENT, true);
    if (a.hasDate) add(ReasonCode.CUSTOMER_DATE_PRESENT, true);
    if (a.hasGuestCount) add(ReasonCode.CUSTOMER_GUEST_COUNT_PRESENT, true);
    if (a.hasLocation) add(ReasonCode.CUSTOMER_LOCATION_PRESENT, true);
    return { decision: 'ACCEPT', reasons };
  }

  // 3. Advertiser language without any customer demand → REJECT.
  if (a.strongAdvertiser) {
    add(a.bookingPromotion ? ReasonCode.BOOKING_PROMOTION : ReasonCode.ADVERTISER_LANGUAGE, true);
    return { decision: 'REJECT', reasons };
  }

  // Neither demand nor a clear advertisement → not an opportunity.
  add(ReasonCode.NO_CUSTOMER_INTENT, true);
  return { decision: 'REJECT', reasons };
}
