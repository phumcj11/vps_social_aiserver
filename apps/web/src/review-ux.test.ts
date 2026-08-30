import { describe, expect, it } from 'vitest';
import {
  REVIEW_PAGE_TITLE,
  REVIEW_SAFETY_NOTICE,
  REVIEW_SECTION_ORDER,
  REVIEW_SECTIONS,
  REVIEW_SAVE_LABEL,
  REVIEW_APPROVE_LABEL,
  REVIEW_REJECT_LABEL,
  REVIEW_DECISION_REMINDER,
  TEST_DATA_BADGE,
  reviewStatusThai,
  reviewEventThai,
  propertyReasonThai,
  publicPermissionLabel,
  draftPermissionLabel,
  NO_PROPERTY_MATCH_SUMMARY,
  NO_PROPERTY_MATCH_EXPLANATION,
  requirementLinesThai,
  candidateReasonThai,
  closestCandidateName,
} from '../app/settings/reviews/review-ui';
import { mediaReasonThai } from '../app/settings/businesses/media-ui';

describe('human review commercial UX (owner-facing Thai)', () => {
  it('1. page title is owner-facing Thai, not "Review"', () => {
    expect(REVIEW_PAGE_TITLE).toBe('ตรวจสอบก่อนตอบลูกค้า');
    expect(REVIEW_PAGE_TITLE).not.toMatch(/review/i);
  });

  it('2. safety notice is the verified Thai statement (approval never posts)', () => {
    expect(REVIEW_SAFETY_NOTICE).toContain('ยังไม่โพสต์หรือคอมเมนต์บน Facebook');
    expect(REVIEW_SAFETY_NOTICE).not.toMatch(/A decision is recorded/i);
  });

  it('3. PENDING renders as รอตรวจสอบ (raw state not surfaced)', () => {
    expect(reviewStatusThai('PENDING')).toBe('รอตรวจสอบ');
    expect(reviewStatusThai('APPROVED')).toBe('อนุมัติแล้ว');
    expect(reviewStatusThai('REJECTED')).toBe('ไม่อนุมัติ');
  });

  it('4. customer request appears before the property recommendation', () => {
    expect(REVIEW_SECTION_ORDER.indexOf('customerRequest')).toBeLessThan(
      REVIEW_SECTION_ORDER.indexOf('selectedProperty'),
    );
    expect(REVIEW_SECTIONS.customerRequest).toBe('ลูกค้ากำลังหาอะไร?');
  });

  it('5. property reasons are simple Thai', () => {
    expect(propertyReasonThai('AREA_MATCH: บางแสน')).toContain('พื้นที่');
    expect(propertyReasonThai('CAPACITY_MATCH: 12 <= 15')).toContain('รองรับจำนวนคนได้');
    expect(propertyReasonThai('TYPE_MATCH: pool_villa')).toBe('ตรงประเภทที่พักที่ลูกค้าหา');
    expect(propertyReasonThai('PRIVATE_POOL_MATCH')).toBe('มีสระส่วนตัว');
  });

  it('6. internal codes are NOT exposed by the reason mapper', () => {
    for (const code of ['AREA_MATCH: บางแสน', 'TYPE_MATCH: pool_villa', 'PRIVATE_POOL_MATCH']) {
      const out = propertyReasonThai(code);
      expect(out).not.toMatch(/_MATCH|pool_villa|property-rules|REQUESTED_REQUIREMENT|CATEGORY/);
    }
    // An unknown/internal code produces no owner-facing line (hidden from the flow).
    expect(propertyReasonThai('SOME_INTERNAL_CODE: x')).toBe('');
  });

  it('7. pool image reason reads "ลูกค้าต้องการสระ"', () => {
    expect(mediaReasonThai('REQUESTED_REQUIREMENT:private_pool')).toBe('ลูกค้าต้องการสระ');
  });

  it('8. public media permission = false renders clearly false (✗)', () => {
    expect(publicPermissionLabel(false)).toBe('✗ ยังไม่อนุญาตให้ใช้ตอบสาธารณะ');
    expect(publicPermissionLabel(false).startsWith('✗')).toBe(true);
    expect(publicPermissionLabel(true).startsWith('✓')).toBe(true);
    expect(draftPermissionLabel()).toContain('Draft');
  });

  it('9. there is ONE draft section — no separate "Edited Draft"', () => {
    const draftSections = REVIEW_SECTION_ORDER.filter((k) => k === 'draft');
    expect(draftSections).toHaveLength(1);
    expect(REVIEW_SECTION_ORDER).not.toContain('editedDraft');
    expect(REVIEW_SECTIONS.draft).toBe('ข้อความที่ระบบเตรียมให้');
  });

  it('10. saving text is distinct from approval (labels differ)', () => {
    expect(REVIEW_SAVE_LABEL).toBe('บันทึกข้อความ');
    // The approve button says "อนุมัติข้อความ" — approving the message, making it
    // explicit that a decision is recorded and nothing is posted to Facebook.
    expect(REVIEW_APPROVE_LABEL).toBe('อนุมัติข้อความ');
    expect(REVIEW_SAVE_LABEL).not.toBe(REVIEW_APPROVE_LABEL);
  });

  it('11. approval reminder states nothing is posted to Facebook', () => {
    expect(REVIEW_DECISION_REMINDER).toContain('ยังไม่โพสต์');
    expect(REVIEW_REJECT_LABEL).toBe('ไม่อนุมัติ');
  });

  it('12. test/synthetic badge label is present', () => {
    expect(TEST_DATA_BADGE).toBe('ข้อมูลทดสอบ');
  });

  it('13. review event labels are Thai (raw codes only in advanced)', () => {
    expect(reviewEventThai('review_approved')).toBe('อนุมัติ');
    expect(reviewEventThai('review_created')).toBe('สร้างรายการตรวจสอบ');
    // Unknown events fall back to the raw code (shown only in the advanced block).
    expect(reviewEventThai('weird_event')).toBe('weird_event');
  });

  it('14. the P0 hierarchy has decision after the draft and history near the end', () => {
    expect(REVIEW_SECTION_ORDER.indexOf('draft')).toBeLessThan(
      REVIEW_SECTION_ORDER.indexOf('decision'),
    );
    expect(REVIEW_SECTION_ORDER.indexOf('decision')).toBeLessThan(
      REVIEW_SECTION_ORDER.indexOf('history'),
    );
    expect(REVIEW_SECTION_ORDER.at(-1)).toBe('advanced');
  });
});

// ── NO_PROPERTY_MATCH owner-facing explanation (M8C) ─────────────────────────
// Modelled on the live M7 review: customer wants บางแสน / 10 คน / สระส่วนตัว /
// ใกล้ทะเล / บ้านพัก; Villa A fails on capacity, Villa B fails on near-sea only.
describe('NO_PROPERTY_MATCH explanation (owner-facing Thai)', () => {
  const M7_REQUIREMENT = {
    area: 'บางแสน',
    guests: 10,
    needsPrivatePool: true,
    needsBeach: true,
    accommodationType: 'house',
  };

  it('15. summary + explanation are plain Thai (no codes)', () => {
    expect(NO_PROPERTY_MATCH_SUMMARY).toBe('ยังไม่มีที่พักที่ตรงครบทุกเงื่อนไข');
    expect(NO_PROPERTY_MATCH_EXPLANATION).toBe(
      'ระบบจึงยังไม่เลือกที่พักให้อัตโนมัติ และส่งมาให้เจ้าของตรวจสอบ',
    );
    expect(NO_PROPERTY_MATCH_SUMMARY).not.toMatch(/NO_PROPERTY_MATCH|_MATCH|_MISSING/);
  });

  it('16. requirement lines render the M7 needs in plain Thai', () => {
    const lines = requirementLinesThai(M7_REQUIREMENT);
    const map = Object.fromEntries(lines.map((l) => [l.label, l.value]));
    expect(map['พื้นที่']).toBe('บางแสน');
    expect(map['จำนวนผู้เข้าพัก']).toBe('10 คน');
    expect(map['สระส่วนตัว']).toBe('ต้องการ');
    expect(map['ใกล้ทะเล']).toBe('ต้องการ');
    // accommodationType 'house' → บ้านพัก (never the raw code).
    expect(map['ประเภทที่พัก']).toBe('บ้านพัก');
    for (const l of lines) expect(l.value).not.toMatch(/house|_MATCH|true/);
  });

  it('17. candidate reasons map to ✓ / ✗ marks in plain Thai', () => {
    expect(candidateReasonThai('CAPACITY_MISMATCH: 8 < 10')).toEqual({
      mark: '✗',
      text: 'รองรับจำนวนคนไม่พอ',
    });
    expect(candidateReasonThai('BEACH_MISSING')).toEqual({
      mark: '✗',
      text: 'ยังไม่ผ่านเงื่อนไขใกล้ทะเล',
    });
    const cap = candidateReasonThai('CAPACITY_MATCH: 10 <= 15');
    expect(cap?.mark).toBe('✓');
    // Unknown/internal codes are hidden from the owner flow.
    expect(candidateReasonThai('SOME_INTERNAL_CODE')).toBeNull();
  });

  it('18. the closest candidate is the one with the fewest hard failures', () => {
    // Villa B fails only near-sea; Villa A fails capacity → Villa B is closest.
    const rejected = [
      { propertyName: 'Villa A', reasons: ['CAPACITY_MISMATCH: 8 < 10', 'AREA_MATCH: บางแสน'] },
      {
        propertyName: 'Villa B',
        reasons: [
          'AREA_MATCH: บางแสน',
          'CAPACITY_MATCH: 10 <= 15',
          'PRIVATE_POOL_MATCH',
          'BEACH_MISSING',
        ],
      },
    ];
    expect(closestCandidateName(rejected)).toBe('Villa B');
    expect(closestCandidateName([])).toBeNull();
  });
});
