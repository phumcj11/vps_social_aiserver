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

  // Contact details present in content but NOT in the business-provided contact.
  const allowedContact = (context.business.contactInformation ?? '').toLowerCase();
  const allowedDigits = digitsOnly(allowedContact);
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

  let decision: DraftPolicyDecision = 'PASS';
  if (reasons.some((r) => r.severity === 'BLOCK')) decision = 'BLOCK';
  else if (reasons.some((r) => r.severity === 'NEEDS_REVIEW')) decision = 'NEEDS_REVIEW';

  return {
    decision,
    reasons: reasons.map((r) => ({ code: r.code, detail: r.detail })),
  };
}
