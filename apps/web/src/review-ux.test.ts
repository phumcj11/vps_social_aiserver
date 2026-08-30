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
  PROPERTY_STATE_LABELS,
  propertyStateLabelThai,
  NEEDS_CONFIRMATION_SUMMARY,
  DRAFT_NEEDS_CONFIRMATION_NOTE,
  REVIEW_APPROVE_SEMANTIC_NOTE,
  needsConfirmationSummaryLines,
  ownerGuidanceThai,
  REVIEW_QUEUE_PAGE_TITLE,
  REVIEW_QUEUE_SUBTITLE,
  REVIEW_QUEUE_CTA,
  REVIEW_QUEUE_TABS,
  reviewQueueEmptyThai,
  REVIEW_OPEN_FB_POST_LABEL,
  REVIEW_OPEN_FB_POST_HINT,
  REVIEW_COPY_LABEL,
  REVIEW_COPY_OK,
  REVIEW_WORKFLOW_STEPS,
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
    // v2 (M9D): a confirmed mismatch uses strong "ยืนยันแล้วว่า" language.
    expect(candidateReasonThai('BEACH_MISSING')).toEqual({
      mark: '✗',
      text: 'ยืนยันแล้วว่าไม่ตรงเงื่อนไขใกล้ทะเล',
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

// ── Matching Semantics v2 Human Review UX (M9D) ──────────────────────────────
// M7 v2 reference: both บางแสน pool villas have nearBeach UNKNOWN. Villa B is a
// NEEDS_CONFIRMATION recommendation; Villa A is a NO_MATCH on capacity.
describe('property state presentation (M9D)', () => {
  it('state labels are owner-facing Thai, no raw enum names', () => {
    expect(PROPERTY_STATE_LABELS.MATCH).toBe('ตรงเงื่อนไข');
    expect(PROPERTY_STATE_LABELS.NEEDS_CONFIRMATION).toBe('แนะนำ แต่ต้องตรวจสอบเพิ่มเติม');
    expect(PROPERTY_STATE_LABELS.NO_MATCH).toBe('ไม่ตรงเงื่อนไข');
    for (const label of Object.values(PROPERTY_STATE_LABELS)) {
      expect(label).not.toMatch(/MATCH|NEEDS_CONFIRMATION|NO_MATCH/);
    }
    expect(propertyStateLabelThai('NEEDS_CONFIRMATION')).toBe('แนะนำ แต่ต้องตรวจสอบเพิ่มเติม');
    expect(propertyStateLabelThai('unknown-state')).toBe('');
  });
});

describe('candidate reason classes (M9D)', () => {
  it('*_MATCH → ✓ confirmed, positive language', () => {
    expect(candidateReasonThai('AREA_MATCH: บางแสน')?.mark).toBe('✓');
    expect(candidateReasonThai('PRIVATE_POOL_MATCH')).toEqual({ mark: '✓', text: 'มีสระส่วนตัว' });
    expect(candidateReasonThai('BEACH_MATCH')).toEqual({
      mark: '✓',
      text: 'ข้อมูลยืนยันว่าใกล้ทะเล',
    });
    expect(candidateReasonThai('CAPACITY_MATCH: 10 <= 15')).toEqual({
      mark: '✓',
      text: 'รองรับลูกค้า 10 คนได้ (สูงสุด 15 คน)',
    });
  });

  it('*_UNKNOWN → △ needs confirmation, never phrased as a failure', () => {
    const beach = candidateReasonThai('BEACH_UNKNOWN');
    expect(beach).toEqual({ mark: '△', text: 'ยังไม่มีข้อมูลยืนยันเรื่องใกล้ทะเล' });
    // Reads as "not yet confirmed", never as a confirmed failure.
    expect(beach!.text).toContain('ยังไม่');
    expect(beach!.text).not.toContain('ยืนยันแล้ว');
    expect(candidateReasonThai('PRIVATE_POOL_UNKNOWN')).toEqual({
      mark: '△',
      text: 'ยังไม่ได้ระบุข้อมูลสระส่วนตัว',
    });
    expect(candidateReasonThai('CAPACITY_UNKNOWN')?.mark).toBe('△');
    expect(candidateReasonThai('AREA_UNKNOWN')?.mark).toBe('△');
  });

  it('*_MISMATCH / *_MISSING → ✗ confirmed mismatch, strong language', () => {
    expect(candidateReasonThai('CAPACITY_MISMATCH: 10 > 8')).toEqual({
      mark: '✗',
      text: 'รองรับได้สูงสุด 8 คน แต่ลูกค้าต้องการ 10 คน',
    });
    expect(candidateReasonThai('BEACH_MISSING')).toEqual({
      mark: '✗',
      text: 'ยืนยันแล้วว่าไม่ตรงเงื่อนไขใกล้ทะเล',
    });
    expect(candidateReasonThai('PRIVATE_POOL_MISSING')?.text).toContain('ยืนยันแล้วว่าไม่มีสระ');
  });

  it('TYPE_COMPATIBLE → ✓ owner-friendly, no alias-graph jargon', () => {
    const line = candidateReasonThai('TYPE_COMPATIBLE: house~pool_villa');
    expect(line?.mark).toBe('✓');
    expect(line?.text).toBe('ลูกค้าระบุ "บ้านพัก" และที่พักประเภท "พูลวิลล่า" ถือว่าเข้ากันได้');
    expect(line?.text).not.toMatch(/TYPE_COMPATIBLE|~|alias/);
  });
});

describe('M7 v2 candidate UI (M9D)', () => {
  const villaB = [
    'AREA_MATCH: บางแสน',
    'CAPACITY_MATCH: 10 <= 15',
    'PRIVATE_POOL_MATCH',
    'TYPE_COMPATIBLE: house~pool_villa',
    'BEACH_UNKNOWN',
  ];
  const villaA = [
    'AREA_MATCH: บางแสน',
    'CAPACITY_MISMATCH: 10 > 8',
    'PRIVATE_POOL_MATCH',
    'BEACH_UNKNOWN',
  ];

  it('Villa B: BEACH_UNKNOWN shows as △, never ✗, and pool/area/capacity as ✓', () => {
    const lines = villaB.map(candidateReasonThai).filter(Boolean);
    const beach = lines.find((l) => l!.text.includes('ใกล้ทะเล'));
    expect(beach!.mark).toBe('△');
    expect(lines.filter((l) => l!.mark === '✓').length).toBeGreaterThanOrEqual(3);
    expect(lines.some((l) => l!.mark === '✗')).toBe(false);
  });

  it('Villa A: capacity mismatch is the ✗; BEACH_UNKNOWN stays △ (not the failure)', () => {
    const lines = villaA.map(candidateReasonThai).filter(Boolean);
    const cap = lines.find((l) => l!.text.includes('รองรับได้สูงสุด'));
    expect(cap!.mark).toBe('✗');
    const beach = lines.find((l) => l!.text.includes('ใกล้ทะเล'));
    expect(beach!.mark).toBe('△');
  });

  it('NEEDS_CONFIRMATION summary counts pass + items-to-confirm', () => {
    const summary = needsConfirmationSummaryLines(villaB);
    expect(summary).toContainEqual({ mark: '✓', text: 'ผ่านเงื่อนไขหลัก' });
    expect(summary).toContainEqual({ mark: '△', text: 'ต้องตรวจสอบเพิ่มเติม 1 รายการ' });
    expect(NEEDS_CONFIRMATION_SUMMARY).toBe('พบที่พักที่น่าแนะนำ แต่มีข้อมูลบางอย่างที่ต้องยืนยัน');
  });

  it('owner guidance names the property, its strengths, and the item to verify', () => {
    const g = ownerGuidanceThai('Villa B', villaB);
    expect(g).toContain('Villa B');
    expect(g).toContain('มีสระส่วนตัว');
    expect(g).toContain('ยังไม่มีข้อมูลยืนยันเรื่องใกล้ทะเล');
    expect(g).toContain('กรุณาตรวจสอบก่อนตอบลูกค้า');
    // Never claims the unknown as satisfied.
    expect(g).not.toContain('ข้อมูลยืนยันว่าใกล้ทะเล');
  });
});

describe('draft + approve wording (M9D)', () => {
  it('draft warning tells the owner not to confirm unverified data', () => {
    expect(DRAFT_NEEDS_CONFIRMATION_NOTE).toBe(
      'ข้อความนี้ยังไม่ควรยืนยันข้อมูลที่ระบบระบุว่าต้องตรวจสอบ',
    );
  });
  it('approve semantic note is explicit that nothing is posted to Facebook', () => {
    expect(REVIEW_APPROVE_SEMANTIC_NOTE).toContain('ยังไม่ได้โพสต์หรือคอมเมนต์บน Facebook');
    expect(REVIEW_APPROVE_SEMANTIC_NOTE).toContain('ยืนยันข้อความสำหรับขั้นตอนถัดไป');
  });
});

describe('historical v1 compatibility (M9D)', () => {
  it('an old v1 blob (BEACH_MISSING, no *_UNKNOWN) still renders', () => {
    // Old M7 v1 rejection reasons — must degrade gracefully.
    const v1 = ['AREA_MATCH: บางแสน', 'CAPACITY_MISMATCH: 10 > 8', 'BEACH_MISSING'];
    const lines = v1.map(candidateReasonThai).filter(Boolean);
    expect(lines).toHaveLength(3);
    expect(lines.find((l) => l!.text.includes('ใกล้ทะเล'))!.mark).toBe('✗');
    // No *_UNKNOWN in the blob → no △ invented.
    expect(lines.some((l) => l!.mark === '△')).toBe(false);
  });
});

// ── Owner daily-operation UX (M10B) ──────────────────────────────────────────
describe('Thai review queue (M10B)', () => {
  it('queue title/subtitle/CTA are owner-facing Thai (no English/enums)', () => {
    expect(REVIEW_QUEUE_PAGE_TITLE).toBe('รายการรอตรวจสอบ');
    expect(REVIEW_QUEUE_SUBTITLE).toContain('ตรวจสอบข้อความ');
    expect(REVIEW_QUEUE_CTA).toBe('ตรวจสอบ');
    for (const s of [REVIEW_QUEUE_PAGE_TITLE, REVIEW_QUEUE_SUBTITLE, REVIEW_QUEUE_CTA]) {
      expect(s).not.toMatch(/Review Queue|PENDING|APPROVED|AI Draft/i);
    }
  });

  it('filter tabs map Thai labels to API statuses (PENDING/APPROVED/REJECTED/all)', () => {
    const byLabel = Object.fromEntries(REVIEW_QUEUE_TABS.map((t) => [t.label, t.status]));
    expect(byLabel['รอตรวจสอบ']).toBe('PENDING');
    expect(byLabel['อนุมัติแล้ว']).toBe('APPROVED');
    expect(byLabel['ไม่อนุมัติ']).toBe('REJECTED');
    expect(byLabel['ทั้งหมด']).toBeUndefined(); // all
    expect(reviewStatusThai('PENDING')).toBe('รอตรวจสอบ');
  });

  it('empty states are Thai and never mention AI Drafts / operator tooling', () => {
    const pending = reviewQueueEmptyThai('PENDING');
    const approved = reviewQueueEmptyThai('APPROVED');
    const rejected = reviewQueueEmptyThai('REJECTED');
    expect(pending.title).toBe('ยังไม่มีรายการที่รอตรวจสอบ');
    expect(approved.title).toBe('ยังไม่มีรายการที่อนุมัติแล้ว');
    expect(rejected.title).toBe('ยังไม่มีรายการที่ไม่อนุมัติ');
    for (const s of [pending.title, pending.hint, approved.title, rejected.title]) {
      expect(s).not.toMatch(/AI Draft|Enqueue|operator/i);
    }
  });
});

describe('manual Facebook reply workflow (M10B)', () => {
  it('exposes a Thai open-Facebook-post CTA + hint', () => {
    expect(REVIEW_OPEN_FB_POST_LABEL).toBe('เปิดโพสต์ลูกค้าบน Facebook');
    expect(REVIEW_OPEN_FB_POST_HINT).toContain('เปิดโพสต์ต้นฉบับ');
  });
  it('exposes a Thai copy-message action', () => {
    expect(REVIEW_COPY_LABEL).toBe('คัดลอกข้อความ');
    expect(REVIEW_COPY_OK).toBe('คัดลอกข้อความแล้ว');
  });
  it('workflow steps end with the manual Facebook reply and never claim auto-posting', () => {
    expect(REVIEW_WORKFLOW_STEPS.length).toBeGreaterThanOrEqual(5);
    expect(REVIEW_WORKFLOW_STEPS[3]).toBe('อนุมัติข้อความ');
    expect(REVIEW_WORKFLOW_STEPS.at(-1)).toContain('ตอบลูกค้าด้วยตนเอง');
    expect(REVIEW_WORKFLOW_STEPS.join(' ')).not.toMatch(/โพสต์อัตโนมัติ|auto/i);
  });
});
