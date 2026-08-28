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
    expect(REVIEW_APPROVE_LABEL).toBe('อนุมัติ');
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
