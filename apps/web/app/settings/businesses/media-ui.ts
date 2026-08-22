/**
 * Pure, testable owner-facing labels for the Media Library. Canonical category /
 * mode values stay internal; the owner only ever sees Thai.
 */

export const MEDIA_CATEGORIES = [
  'cover',
  'exterior',
  'pool',
  'bedroom',
  'bathroom',
  'living_room',
  'karaoke',
  'kitchen',
  'view',
  'other',
] as const;
export type MediaCategory = (typeof MEDIA_CATEGORIES)[number];

export const MEDIA_CATEGORY_LABELS: Record<MediaCategory, string> = {
  cover: 'รูปปก',
  exterior: 'ภายนอก',
  pool: 'สระว่ายน้ำ',
  bedroom: 'ห้องนอน',
  bathroom: 'ห้องน้ำ',
  living_room: 'ห้องนั่งเล่น',
  karaoke: 'คาราโอเกะ',
  kitchen: 'ครัว',
  view: 'วิว',
  other: 'อื่น ๆ',
};

export function mediaCategoryLabel(c: string): string {
  return (MEDIA_CATEGORY_LABELS as Record<string, string>)[c] ?? c;
}

export type ImageResponseMode =
  'OFF' | 'MATCHED_PROPERTY_ONLY' | 'BUSINESS_FALLBACK' | 'HUMAN_REVIEW_ONLY';

export const IMAGE_RESPONSE_OPTIONS: {
  value: ImageResponseMode;
  label: string;
  description: string;
  recommended?: boolean;
}[] = [
  { value: 'OFF', label: 'ไม่แนบรูป', description: 'ระบบจะไม่แนบรูปกับคำตอบ' },
  {
    value: 'MATCHED_PROPERTY_ONLY',
    label: 'เฉพาะที่พักที่ตรง',
    description: 'แนบเฉพาะรูปของที่พักที่ตรงกับความต้องการเท่านั้น',
  },
  {
    value: 'BUSINESS_FALLBACK',
    label: 'ใช้รูปธุรกิจเมื่อไม่มีที่พักตรง',
    description: 'ถ้าไม่มีที่พักที่ตรง อนุญาตให้ใช้รูประดับธุรกิจ',
  },
  {
    value: 'HUMAN_REVIEW_ONLY',
    label: 'ให้ฉันตรวจก่อน',
    description: 'ระบบแนะนำรูปได้ แต่ต้องให้คุณตรวจสอบก่อนทุกครั้ง',
    recommended: true,
  },
];

/** Map a deterministic selection reason code to a Thai owner-facing line. */
export function mediaReasonThai(code: string): string {
  const [head, arg] = code.split(':');
  switch (head) {
    case 'PROPERTY_MATCH_IMAGE':
      return 'เป็นรูปของที่พักที่ตรงกับความต้องการ';
    case 'BUSINESS_FALLBACK_NO_MATCH':
      return 'ใช้รูปของธุรกิจ เพราะไม่มีที่พักที่ตรงทั้งหมด';
    case 'OWNER_VERIFIED':
      return 'เจ้าของยืนยันรูปแล้ว';
    case 'APPROVED_FOR_DRAFTS':
      return 'อนุญาตให้ใช้ประกอบข้อความ';
    case 'REQUESTED_AMENITY':
      return arg === 'karaoke'
        ? 'ลูกค้าระบุว่าต้องการคาราโอเกะ'
        : arg === 'privatePool' || arg === 'sharedPool'
          ? 'ลูกค้าระบุว่าต้องการสระว่ายน้ำ'
          : 'ตรงกับสิ่งที่ลูกค้าต้องการ';
    case 'CATEGORY':
      return `หมวด: ${mediaCategoryLabel(arg ?? '')}`;
    default:
      return code;
  }
}

/** Human-readable Thai for why NO image was chosen (draft still valid). */
export function noMediaReasonThai(code: string): string {
  switch (code) {
    case 'MODE_OFF':
      return 'ปิดการแนบรูปไว้';
    case 'NO_APPROVED_BUSINESS_IMAGE':
      return 'ยังไม่มีรูปธุรกิจที่อนุมัติ';
    case 'PROPERTY_MATCH_NO_APPROVED_IMAGE':
      return 'ที่พักที่ตรงยังไม่มีรูปที่อนุมัติ';
    case 'NO_PROPERTY_MATCH_NO_BUSINESS_FALLBACK':
      return 'ไม่มีที่พักที่ตรง และการตั้งค่าไม่อนุญาตให้ใช้รูปธุรกิจ';
    default:
      return 'ไม่มีรูปที่เหมาะสม (ข้อความยังใช้งานได้ตามปกติ)';
  }
}
