/**
 * Pure, testable owner-facing labels for the Human Review page (commercial P0).
 * The page renders in plain Thai for accommodation owners; internal codes and
 * developer terms stay out of the primary flow (behind "ข้อมูลขั้นสูง").
 */

export const REVIEW_PAGE_TITLE = 'ตรวจสอบก่อนตอบลูกค้า';
export const REVIEW_QUEUE_TITLE = 'รายการรอตรวจสอบ';

export const REVIEW_SAFETY_NOTICE =
  'หน้านี้เป็นขั้นตอนตรวจสอบเท่านั้น การกดอนุมัติในหน้านี้ยังไม่โพสต์หรือคอมเมนต์บน Facebook';

/** Owner-facing section titles, in the P0 top-to-bottom order. */
export const REVIEW_SECTIONS = {
  customerRequest: 'ลูกค้ากำลังหาอะไร?',
  selectedProperty: 'ที่พักที่ระบบแนะนำ',
  propertyReasons: 'ทำไมระบบเลือกที่พักนี้?',
  contact: 'ช่องทางที่ระบบจะใช้ตอบ',
  suggestedImage: 'รูปที่แนะนำ',
  imageReasons: 'ทำไมระบบแนะนำรูปนี้?',
  imagePermission: 'สิทธิ์ของรูปภาพ',
  draft: 'ข้อความที่ระบบเตรียมให้',
  decision: 'การตัดสินใจ',
  history: 'ประวัติการตรวจสอบ',
  advanced: 'ข้อมูลขั้นสูง',
} as const;

/** The P0 hierarchy order (customer request precedes the property recommendation). */
export const REVIEW_SECTION_ORDER: Array<keyof typeof REVIEW_SECTIONS> = [
  'customerRequest',
  'selectedProperty',
  'propertyReasons',
  'contact',
  'suggestedImage',
  'imageReasons',
  'imagePermission',
  'draft',
  'decision',
  'history',
  'advanced',
];

export const REVIEW_SAVE_LABEL = 'บันทึกข้อความ';
export const REVIEW_SAVE_OK = 'บันทึกข้อความเรียบร้อย';
export const REVIEW_SAVE_ERROR = 'ไม่สามารถบันทึกข้อความได้ กรุณาลองใหม่อีกครั้ง';
export const REVIEW_APPROVE_LABEL = 'อนุมัติข้อความ';
export const REVIEW_REJECT_LABEL = 'ไม่อนุมัติ';
export const REVIEW_DECISION_REMINDER = 'การอนุมัติในขั้นตอนนี้ยังไม่โพสต์หรือคอมเมนต์บน Facebook';
export const TEST_DATA_BADGE = 'ข้อมูลทดสอบ';

/** Owner-facing status label (never surfaces raw PENDING/EXPIRED prominently). */
export function reviewStatusThai(status: string): string {
  switch (status) {
    case 'PENDING':
      return 'รอตรวจสอบ';
    case 'APPROVED':
      return 'อนุมัติแล้ว';
    case 'REJECTED':
      return 'ไม่อนุมัติ';
    case 'EXPIRED':
      return 'หมดเวลา';
    default:
      return status;
  }
}

/** Owner-facing review-event label. Unknown events fall back to the raw code
 * (which is only shown inside the advanced section). */
export function reviewEventThai(event: string): string {
  const map: Record<string, string> = {
    review_created: 'สร้างรายการตรวจสอบ',
    review_sent: 'ส่งให้ตรวจสอบ',
    review_edited: 'แก้ไขข้อความ',
    review_approved: 'อนุมัติ',
    review_rejected: 'ไม่อนุมัติ',
    review_expired: 'หมดเวลา',
  };
  return map[event] ?? event;
}

/** Map a deterministic Property-match reason code to plain Thai (no codes). */
export function propertyReasonThai(reason: string): string {
  const [code, detail] = reason.split(':').map((s) => s.trim());
  const label: Record<string, string> = {
    AREA_MATCH: 'อยู่ในพื้นที่ที่ลูกค้าต้องการ',
    CAPACITY_MATCH: 'รองรับจำนวนคนได้',
    BEDROOMS_MATCH: 'จำนวนห้องนอนเพียงพอ',
    TYPE_MATCH: 'ตรงประเภทที่พักที่ลูกค้าหา',
    PRIVATE_POOL_MATCH: 'มีสระส่วนตัว',
    BEACH_MATCH: 'ติด/ใกล้ทะเล',
    RIVER_MATCH: 'ริมแม่น้ำ',
    AMENITY_MATCH: 'มีสิ่งที่ลูกค้าต้องการ',
    CAPACITY_MISMATCH: 'รองรับจำนวนคนไม่พอ',
    AREA_MISMATCH: 'อยู่นอกพื้นที่ที่ลูกค้าต้องการ',
    BEDROOMS_MISMATCH: 'ห้องนอนไม่พอ',
    PRIVATE_POOL_MISSING: 'ไม่มีสระส่วนตัว',
    BEACH_MISSING: 'ไม่ติด/ใกล้ทะเล',
    RIVER_MISSING: 'ไม่ริมแม่น้ำ',
  };
  // Keep a human number when present (e.g. "12 <= 15"), but never a raw code.
  const base = label[code ?? ''];
  if (!base) return ''; // unknown/internal code → not shown in the owner flow
  const num = detail && /\d/.test(detail) ? ` (${detail})` : '';
  return `${base}${num}`;
}

// ── NO_PROPERTY_MATCH explanation (owner-facing) ─────────────────────────────

export const NO_PROPERTY_MATCH_SUMMARY = 'ยังไม่มีที่พักที่ตรงครบทุกเงื่อนไข';
export const NO_PROPERTY_MATCH_EXPLANATION =
  'ระบบจึงยังไม่เลือกที่พักให้อัตโนมัติ และส่งมาให้เจ้าของตรวจสอบ';
export const NO_PROPERTY_MATCH_SAFE_NOTE =
  'ข้อความที่เตรียมให้จะตอบระดับธุรกิจเท่านั้น ไม่ระบุที่พักเฉพาะ ไม่บอกราคา และไม่ยืนยันห้องว่าง';
export const CUSTOMER_NEEDS_TITLE = 'สิ่งที่ลูกค้าต้องการ';
export const CANDIDATE_CLOSEST_BADGE = 'ใกล้เคียงที่สุด';

/** Accommodation-type code → plain Thai (owner-facing). */
function accommodationTypeThai(t: string): string {
  const map: Record<string, string> = {
    house: 'บ้านพัก',
    pool_villa: 'พูลวิลล่า',
    villa: 'วิลล่า',
    hotel: 'โรงแรม',
    resort: 'รีสอร์ท',
    condo: 'คอนโด',
    apartment: 'อพาร์ตเมนต์',
    homestay: 'โฮมสเตย์',
  };
  return map[t] ?? t;
}

function amenityThai(a: string): string {
  const map: Record<string, string> = {
    karaoke: 'คาราโอเกะ',
    privatePool: 'สระส่วนตัว',
    sharedPool: 'สระรวม',
    nearBeach: 'ใกล้ทะเล',
    beachfront: 'ติดทะเล',
  };
  return map[a] ?? a;
}

export interface RequirementLine {
  label: string;
  value: string;
}

/** Parse the stored requirement blob into owner-facing Thai lines (no codes). */
export function requirementLinesThai(
  req: Record<string, unknown> | null | undefined,
): RequirementLine[] {
  if (!req) return [];
  const out: RequirementLine[] = [];
  if (typeof req.area === 'string' && req.area.trim())
    out.push({ label: 'พื้นที่', value: req.area.trim() });
  if (typeof req.guests === 'number' && req.guests > 0)
    out.push({ label: 'จำนวนผู้เข้าพัก', value: `${req.guests} คน` });
  if (typeof req.bedrooms === 'number' && req.bedrooms > 0)
    out.push({ label: 'ห้องนอน', value: `${req.bedrooms} ห้อง` });
  if (req.needsPrivatePool === true) out.push({ label: 'สระส่วนตัว', value: 'ต้องการ' });
  if (req.needsBeach === true) out.push({ label: 'ใกล้ทะเล', value: 'ต้องการ' });
  if (req.needsRiver === true) out.push({ label: 'ริมแม่น้ำ', value: 'ต้องการ' });
  if (typeof req.accommodationType === 'string' && req.accommodationType.trim())
    out.push({ label: 'ประเภทที่พัก', value: accommodationTypeThai(req.accommodationType.trim()) });
  if (Array.isArray(req.requestedAmenities) && req.requestedAmenities.length > 0)
    out.push({
      label: 'สิ่งอำนวยความสะดวก',
      value: (req.requestedAmenities as string[]).map(amenityThai).join(', '),
    });
  return out;
}

export interface CandidateReasonLine {
  /** ✓ satisfied · ✗ not satisfied (hard) · △ note/soft. */
  mark: '✓' | '✗' | '△';
  text: string;
}

/** Map a per-candidate matcher reason code to a plain-Thai ✓/✗/△ line. */
export function candidateReasonThai(reason: string): CandidateReasonLine | null {
  const [code, detail] = reason.split(':').map((s) => s.trim());
  const num = detail && /\d/.test(detail) ? ` (${detail})` : '';
  const map: Record<string, CandidateReasonLine> = {
    AREA_MATCH: { mark: '✓', text: 'พื้นที่ตรงกับที่ลูกค้าต้องการ' },
    CAPACITY_MATCH: { mark: '✓', text: 'รองรับจำนวนคนได้' },
    BEDROOMS_MATCH: { mark: '✓', text: 'ห้องนอนเพียงพอ' },
    TYPE_MATCH: { mark: '✓', text: 'ตรงประเภทที่พักที่ลูกค้าหา' },
    PRIVATE_POOL_MATCH: { mark: '✓', text: 'มีสระส่วนตัว' },
    BEACH_MATCH: { mark: '✓', text: 'ติด/ใกล้ทะเล' },
    RIVER_MATCH: { mark: '✓', text: 'ริมแม่น้ำ' },
    AMENITY_MATCH: { mark: '✓', text: 'มีสิ่งที่ลูกค้าต้องการ' },
    CAPACITY_MISMATCH: { mark: '✗', text: 'รองรับจำนวนคนไม่พอ' },
    AREA_MISMATCH: { mark: '✗', text: 'อยู่นอกพื้นที่ที่ลูกค้าต้องการ' },
    BEDROOMS_MISMATCH: { mark: '✗', text: 'ห้องนอนไม่พอ' },
    TYPE_MISMATCH: { mark: '△', text: 'ประเภทที่พักในระบบไม่ตรงกับที่ลูกค้าระบุ' },
    PRIVATE_POOL_MISSING: { mark: '✗', text: 'ยังไม่ผ่านเงื่อนไขสระส่วนตัว' },
    BEACH_MISSING: { mark: '✗', text: 'ยังไม่ผ่านเงื่อนไขใกล้ทะเล' },
    RIVER_MISSING: { mark: '✗', text: 'ยังไม่ผ่านเงื่อนไขริมแม่น้ำ' },
    AMENITY_MISSING: { mark: '△', text: 'อาจไม่มีสิ่งอำนวยความสะดวกที่ลูกค้าต้องการบางอย่าง' },
  };
  const base = map[code ?? ''];
  if (!base) return null; // unknown/internal code → hidden from the owner flow
  return { mark: base.mark, text: base.mark === '✓' ? `${base.text}${num}` : base.text };
}

/** Count of hard failures (✗) in a candidate's reasons — lower is closer. */
function candidateFailCount(reasons: string[]): number {
  return reasons.filter((r) => candidateReasonThai(r)?.mark === '✗').length;
}

/**
 * The property that came closest to a full match — the fewest hard failures
 * (ties broken by the most ✓). Returns null when there are no candidates.
 */
export function closestCandidateName(
  rejected: Array<{ propertyName: string | null; reasons: string[] }>,
): string | null {
  let best: { name: string | null; fails: number; oks: number } | null = null;
  for (const c of rejected) {
    const fails = candidateFailCount(c.reasons);
    const oks = c.reasons.filter((r) => candidateReasonThai(r)?.mark === '✓').length;
    if (!best || fails < best.fails || (fails === best.fails && oks > best.oks)) {
      best = { name: c.propertyName, fails, oks };
    }
  }
  return best?.name ?? null;
}

export function contactTypeThai(type: string): string {
  const map: Record<string, string> = {
    PHONE: 'โทรศัพท์',
    LINE_ID: 'LINE ID',
    LINE_OA: 'LINE OA',
    FACEBOOK_PAGE: 'เพจ Facebook',
    WEBSITE: 'เว็บไซต์',
    EMAIL: 'อีเมล',
    OTHER: 'ช่องทาง',
  };
  return map[type] ?? type;
}

/** Image permission lines — public MUST read clearly false when it is false. */
export function draftPermissionLabel(): string {
  return '✓ ใช้ประกอบ Draft ได้';
}
export function publicPermissionLabel(approved: boolean): string {
  return approved ? '✓ อนุญาตให้ใช้ตอบสาธารณะ' : '✗ ยังไม่อนุญาตให้ใช้ตอบสาธารณะ';
}
