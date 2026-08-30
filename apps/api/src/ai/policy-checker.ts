import type { DraftContext, DraftPolicyResult, DraftPolicyDecision } from './types';

/**
 * DraftPolicyChecker (SPRINT 009) — PURE and DETERMINISTIC.
 *
 * Screens generated draft content against safety rules and returns PASS,
 * NEEDS_REVIEW, or BLOCK with structured reasons. BLOCK content must never
 * reach a ready/approved state; NEEDS_REVIEW is stored as `needs_review`;
 * PASS may be stored as `draft`. It performs no I/O and never auto-approves.
 */

const AVAILABILITY_GUARANTEES = [
  'รับประกันว่าง',
  'ว่างแน่นอน',
  'ว่าง 100%',
  'การันตีว่าง',
  'มีคิวแน่นอน',
  'guarantee available',
  'guaranteed availability',
  'definitely available',
  'always available',
];

const PRICE_GUARANTEES = [
  'รับประกันราคา',
  'ราคาถูกที่สุด',
  'ถูกที่สุดรับประกัน',
  'การันตีราคา',
  'guaranteed price',
  'lowest price guaranteed',
  'cheapest guaranteed',
  'price guarantee',
  'best price guaranteed',
];

const UNSAFE_TERMS = ['เหี้ย', 'สัส', 'ไอ้', 'idiot', 'stupid', 'damn', 'shit', 'fuck'];

const PROMOTION_TERMS = [
  'โปรโมชั่น',
  'ลดราคา',
  'แจกฟรี',
  'ส่วนลด',
  'discount',
  'promotion',
  ' sale',
  ' free',
];

const EMAIL_RE = /[\w.+-]+@[\w-]+\.[\w.-]+/g;
const URL_RE = /https?:\/\/\S+/gi;
const PHONE_RE = /\+?\d[\d\s-]{6,}\d/g;

function includesAny(haystack: string, needles: string[]): string | null {
  for (const n of needles) {
    if (haystack.includes(n.toLowerCase())) return n;
  }
  return null;
}

function digitsOnly(s: string): string {
  return s.replace(/\D/g, '');
}

export function checkDraft(
  content: string,
  context: DraftContext,
  maxLength: number,
): DraftPolicyResult {
  const reasons: { code: string; detail: string; severity: 'BLOCK' | 'NEEDS_REVIEW' }[] = [];
  const trimmed = (content ?? '').trim();
  const lower = trimmed.toLowerCase();

  // ── BLOCK-level checks ──────────────────────────────────────────────────
  if (trimmed.length === 0) {
    reasons.push({ code: 'EMPTY_OUTPUT', detail: 'Draft content is empty', severity: 'BLOCK' });
  }
  if (trimmed.length > maxLength) {
    reasons.push({
      code: 'EXCESSIVE_LENGTH',
      detail: `Draft is ${trimmed.length} chars (max ${maxLength})`,
      severity: 'BLOCK',
    });
  }
  for (const claim of context.prohibitedClaims) {
    const c = claim.trim().toLowerCase();
    if (c.length > 0 && lower.includes(c)) {
      reasons.push({
        code: 'PROHIBITED_CLAIM',
        detail: `Contains prohibited claim: "${claim}"`,
        severity: 'BLOCK',
      });
    }
  }
  const avail = includesAny(lower, AVAILABILITY_GUARANTEES);
  if (avail) {
    reasons.push({
      code: 'GUARANTEED_AVAILABILITY',
      detail: `Asserts guaranteed availability: "${avail}"`,
      severity: 'BLOCK',
    });
  }
  const price = includesAny(lower, PRICE_GUARANTEES);
  if (price) {
    reasons.push({
      code: 'GUARANTEED_PRICE',
      detail: `Asserts guaranteed price: "${price}"`,
      severity: 'BLOCK',
    });
  }
  const unsafe = includesAny(lower, UNSAFE_TERMS);
  if (unsafe) {
    reasons.push({
      code: 'UNSAFE_LANGUAGE',
      detail: 'Contains unsafe or abusive language',
      severity: 'BLOCK',
    });
  }

  // ── NEEDS_REVIEW-level checks ───────────────────────────────────────────
  if (trimmed.length > 0 && context.business.name.trim().length > 0) {
    if (!trimmed.includes(context.business.name.trim())) {
      reasons.push({
        code: 'MISSING_BUSINESS_NAME',
        detail: 'Draft does not mention the business name',
        severity: 'NEEDS_REVIEW',
      });
    }
  }

  // Contact details present in content but NOT among the APPROVED channels.
  // SPRINT 016B — the allow-list is the structured draft-approved contacts plus
  // the legacy free-text contact string; nothing else may appear in a draft.
  const approvedContactText = context.approvedContacts.map((c) => c.value).join(' ');
  const allowedContact =
    `${context.business.contactInformation ?? ''} ${approvedContactText}`.toLowerCase();
  const allowedDigits = context.approvedContacts
    .map((c) => digitsOnly(c.value))
    .concat(digitsOnly((context.business.contactInformation ?? '').toLowerCase()))
    .join(' ');
  const found = [...(trimmed.match(EMAIL_RE) ?? []), ...(trimmed.match(URL_RE) ?? [])];
  for (const token of found) {
    if (!allowedContact.includes(token.toLowerCase())) {
      reasons.push({
        code: 'UNSUPPORTED_CONTACT',
        detail: 'Contains contact information not present in the business context',
        severity: 'NEEDS_REVIEW',
      });
      break;
    }
  }
  const phones = trimmed.match(PHONE_RE) ?? [];
  for (const p of phones) {
    const d = digitsOnly(p);
    if (d.length >= 7 && !(allowedDigits.length > 0 && allowedDigits.includes(d))) {
      reasons.push({
        code: 'UNSUPPORTED_CONTACT',
        detail: 'Contains a phone number not present in the business context',
        severity: 'NEEDS_REVIEW',
      });
      break;
    }
  }

  // Promotion wording not backed by the business context.
  const supported = [
    ...context.business.sellingPoints,
    context.business.description ?? '',
    ...context.knowledge.map((k) => `${k.title} ${k.content}`),
  ]
    .join(' ')
    .toLowerCase();
  const promo = includesAny(lower, PROMOTION_TERMS);
  if (promo && !supported.includes(promo.trim())) {
    reasons.push({
      code: 'UNSUPPORTED_PROMOTION',
      detail: `Mentions a promotion not supported by the business context: "${promo.trim()}"`,
      severity: 'NEEDS_REVIEW',
    });
  }

  // ── SPRINT 016B: effective-policy "must not claim" enforcement ────────────
  const mustNot = new Set(context.mustNotClaim.map((c) => c.toLowerCase()));
  const PRICE_MENTION_RE = /\d[\d,.]*\s*(บาท|฿|baht|thb|\/\s*คืน|per\s*night)/i;
  const AVAILABILITY_TERMS = ['ว่าง', 'ห้องว่าง', 'มีห้อง', 'จองได้', 'available', 'vacant'];
  const CAPACITY_MENTION_RE = /\d+\s*(คน|ท่าน|pax|persons?|guests?)/i;

  if (mustNot.has('price') && PRICE_MENTION_RE.test(trimmed)) {
    reasons.push({
      code: 'MUSTNOTCLAIM_PRICE',
      detail: 'Mentions a price but the effective pricing policy forbids stating one',
      severity: 'NEEDS_REVIEW',
    });
  }
  // Availability may be ASSERTED only under a self-serve/calendar policy; under
  // MANUAL_CONFIRMATION or DO_NOT_MENTION a bare vacancy claim needs review.
  const availabilityPolicy = context.policies?.availabilityPolicy;
  const availabilityForbidden =
    mustNot.has('availability') ||
    availabilityPolicy === 'MANUAL_CONFIRMATION' ||
    availabilityPolicy === 'DO_NOT_MENTION';
  if (availabilityForbidden && includesAny(lower, AVAILABILITY_TERMS)) {
    reasons.push({
      code: 'MUSTNOTCLAIM_AVAILABILITY',
      detail: 'Asserts availability but the effective availability policy forbids it',
      severity: 'NEEDS_REVIEW',
    });
  }
  if (mustNot.has('promotion') && promo) {
    reasons.push({
      code: 'MUSTNOTCLAIM_PROMOTION',
      detail: 'Mentions a promotion but the effective promotion policy is NONE',
      severity: 'NEEDS_REVIEW',
    });
  }
  if (mustNot.has('capacity') && CAPACITY_MENTION_RE.test(trimmed)) {
    reasons.push({
      code: 'MUSTNOTCLAIM_CAPACITY',
      detail: 'States a guest capacity that is not stored for the property',
      severity: 'NEEDS_REVIEW',
    });
  }

  // A Business MATCH with NO Property MATCH always needs a human to confirm the
  // response makes no property-specific claim (documented NO_PROPERTY_MATCH policy).
  if (context.noPropertyMatch && trimmed.length > 0) {
    reasons.push({
      code: 'NO_PROPERTY_MATCH',
      detail: 'No property matched this request — verify the reply makes no property claim',
      severity: 'NEEDS_REVIEW',
    });
  }

  // v2 (M9E): a NEEDS_CONFIRMATION recommendation names a Property with a required
  // fact the owner has not confirmed — a human must verify the reply does not
  // assert that unconfirmed fact before it goes anywhere.
  if (context.propertyNeedsConfirmation && trimmed.length > 0) {
    reasons.push({
      code: 'PROPERTY_NEEDS_CONFIRMATION',
      detail: 'Recommended property has an unconfirmed required fact — verify before sending',
      severity: 'NEEDS_REVIEW',
    });
  }

  let decision: DraftPolicyDecision = 'PASS';
  if (reasons.some((r) => r.severity === 'BLOCK')) decision = 'BLOCK';
  else if (reasons.some((r) => r.severity === 'NEEDS_REVIEW')) decision = 'NEEDS_REVIEW';

  return {
    decision,
    reasons: reasons.map((r) => ({ code: r.code, detail: r.detail })),
  };
}
