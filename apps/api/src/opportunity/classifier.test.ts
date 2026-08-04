import { describe, expect, it } from 'vitest';
import { classifySignal, CLASSIFIER_VERSION } from './classifier';
import { ReasonCode, type ClassifierSignal, type ClassifierContext } from './types';

const CTX: ClassifierContext = { minTextLength: 15, isDuplicate: false };
const URL = 'https://www.facebook.com/groups/123/posts/456';

function sig(message: string, over: Partial<ClassifierSignal> = {}): ClassifierSignal {
  return { message, authorName: null, postUrl: URL, ...over };
}
function has(r: ReturnType<typeof classifySignal>, code: string): boolean {
  return r.reasons.some((x) => x.code === code && x.passed);
}

describe('OpportunityClassifier rules-v2 (deterministic, no AI)', () => {
  it('uses the rules-v2 version tag', () => {
    expect(CLASSIFIER_VERSION).toBe('rules-v2');
  });

  // ── Customer intent → ACCEPT (even without author, even when short) ────────
  const ACCEPT_CASES = [
    'หาที่พัก บางแสน มีสระว่ายน้ำ',
    'หาที่พักบางแสน มีสระว่ายน้ำ สำหรับครอบครัว',
    'หาที่พัก 7 คน ใกล้หาด',
    'หาที่พัก 7 คน ใกล้หาด พัทยา',
    'หาพูลวิลล่าพัทยา 10 คน',
    'ขอที่พักชะอำคืนนี้',
    'ขอที่พักบางแสนคืนนี้',
    'หาบ้านพักชะอำ สำหรับครอบครัว',
    'มีบ้านพักว่างวันที่ 10 ไหม',
    'มีพูลวิลล่าพัทยาว่างไหม',
    'ตามหาบ้านพักใกล้ทะเลชะอำ',
    '  หาที่พัก   บางแสน 🌊  ',
  ];
  it.each(ACCEPT_CASES)('ACCEPTs genuine customer intent: %s', (msg) => {
    const r = classifySignal(sig(msg), CTX);
    expect(r.decision).toBe('ACCEPT');
    expect(has(r, ReasonCode.CUSTOMER_SEARCH_INTENT)).toBe(true);
  });

  it('records corroborating reasons (guest count / location) when present', () => {
    const r = classifySignal(sig('หาที่พัก 7 คน ใกล้หาด พัทยา'), CTX);
    expect(has(r, ReasonCode.CUSTOMER_GUEST_COUNT_PRESENT)).toBe(true);
    expect(has(r, ReasonCode.CUSTOMER_LOCATION_PRESENT)).toBe(true);
  });

  // ── Advertiser / listing → REJECT ─────────────────────────────────────────
  it('REJECTs a property-code-only post', () => {
    const r = classifySignal(sig('ZA37 MY-5072'), CTX);
    expect(r.decision).toBe('REJECT');
    expect(has(r, ReasonCode.PROPERTY_CODE_ONLY)).toBe(true);
  });
  it('REJECTs a property-code listing with Thai marker', () => {
    const r = classifySignal(sig('รหัสที่พัก DV-1952'), CTX);
    expect(r.decision).toBe('REJECT');
  });
  it('REJECTs a booking promotion', () => {
    const r = classifySignal(sig('พูลวิลล่าพัทยา โปรแรง จองด่วน'), CTX);
    expect(r.decision).toBe('REJECT');
    expect(has(r, ReasonCode.BOOKING_PROMOTION)).toBe(true);
  });
  it('REJECTs an owner/agent-recruitment listing', () => {
    const r = classifySignal(sig('บ้านพักเปิดใหม่ รับตัวแทน'), CTX);
    expect(r.decision).toBe('REJECT');
  });
  it('REJECTs an owner-listing with special price', () => {
    const r = classifySignal(sig('เจ้าของบ้านลงเอง ราคาพิเศษ'), CTX);
    expect(r.decision).toBe('REJECT');
  });
  it('REJECTs an available-now broadcast with CTA', () => {
    const r = classifySignal(sig('ว่างวันนี้ ทักจองได้เลย'), CTX);
    expect(r.decision).toBe('REJECT');
  });

  // ── Conflict cases ────────────────────────────────────────────────────────
  it('REJECTs an agent seeking on behalf of customers ("หาที่พักให้ลูกค้า")', () => {
    const r = classifySignal(sig('หาที่พักให้ลูกค้า พัทยา'), CTX);
    expect(r.decision).toBe('REJECT');
    expect(has(r, ReasonCode.OWNER_OR_AGENT_LISTING)).toBe(true);
  });
  it('REJECTs "มีลูกค้าหาที่พัก" posted by an agent', () => {
    const r = classifySignal(sig('มีลูกค้าหาที่พักบางแสน สนใจติดต่อ'), CTX);
    expect(r.decision).toBe('REJECT');
  });
  it('REJECTs a customer sentence quoted inside an advertisement', () => {
    const r = classifySignal(sig('รับจองด่วน! ลูกค้าบอก "หาที่พักบางแสน" ทักเลย'), CTX);
    expect(r.decision).toBe('REJECT');
  });
  it('ACCEPTs a genuine customer post that merely contains the word "โปร"', () => {
    const r = classifySignal(sig('หาที่พักบางแสน 4 คน งบไม่เกิน 3000 รับโปรได้'), CTX);
    expect(r.decision).toBe('ACCEPT');
  });

  // ── Structural gates ──────────────────────────────────────────────────────
  it('REJECTs empty / media-only post', () => {
    const r = classifySignal(sig('   '), CTX);
    expect(r.decision).toBe('REJECT');
    expect(has(r, ReasonCode.HAS_TEXT)).toBe(false);
  });
  it('REJECTs a deleted post', () => {
    const r = classifySignal(sig('This content isn’t available right now'), CTX);
    expect(r.decision).toBe('REJECT');
  });
  it('REJECTs when there is no URL', () => {
    const r = classifySignal(sig('หาที่พักบางแสน', { postUrl: null }), CTX);
    expect(r.decision).toBe('REJECT');
    expect(has(r, ReasonCode.HAS_URL)).toBe(false);
  });

  // ── Idempotency ───────────────────────────────────────────────────────────
  it('is deterministic (same input → same output)', () => {
    const a = classifySignal(sig('หาที่พักบางแสน 2 คน'), CTX);
    const b = classifySignal(sig('หาที่พักบางแสน 2 คน'), CTX);
    expect(a).toEqual(b);
  });
});
