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
export const REVIEW_APPROVE_LABEL = 'อนุมัติ';
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
