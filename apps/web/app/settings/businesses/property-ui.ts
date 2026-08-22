import type { Property } from '../../../lib/api';
import { propertyTypeLabel } from './ui';

/**
 * Pure, testable building blocks for the Property setup screens (Property Setup
 * UX Corrective). No JSX lives here so every mapping — canonical price modes,
 * amenity keys, owner-safe save messages, list summaries — is unit-testable and
 * shared between the edit form and the Property list card.
 *
 * The persisted vocabulary (PriceDisplayMode enum, PropertyAmenities keys) is
 * the API's; this module only maps owner-facing Thai onto those canonical values
 * so the browser never sends a non-canonical token that fails Zod validation.
 */

// ---------------------------------------------------------------------------
// Pricing — canonical price-display modes (must equal the API enum exactly).
// ---------------------------------------------------------------------------

/** The ONLY values the API accepts (apps/api/.../types.ts PriceDisplayMode). */
export type PriceDisplayMode = 'DO_NOT_SHOW' | 'STARTING_FROM' | 'RANGE' | 'ON_REQUEST';

export const PRICE_DISPLAY_MODES: readonly PriceDisplayMode[] = [
  'DO_NOT_SHOW',
  'STARTING_FROM',
  'RANGE',
  'ON_REQUEST',
];

export interface PriceModeOption {
  value: PriceDisplayMode;
  label: string;
  description: string;
}

export const PRICE_MODE_QUESTION = 'คุณต้องการให้ระบบรู้ราคาแบบไหน?';

export const PRICE_MODE_OPTIONS: PriceModeOption[] = [
  {
    value: 'DO_NOT_SHOW',
    label: 'ไม่ระบุราคา',
    description: 'ระบบจะไม่เก็บราคาไว้ใช้ และจะไม่พูดถึงราคาให้ลูกค้า',
  },
  {
    value: 'STARTING_FROM',
    label: 'ราคาเริ่มต้น',
    description: 'ใช้ราคาเริ่มต้นที่คุณกรอกไว้ โดยยังต้องเป็นไปตามนโยบายราคาของธุรกิจ',
  },
  {
    value: 'RANGE',
    label: 'ช่วงราคา',
    description: 'ระบุราคาวันธรรมดาและวันสุดสัปดาห์เป็นช่วงราคา',
  },
  {
    value: 'ON_REQUEST',
    label: 'สอบถามราคา',
    description: 'ให้ลูกค้าสอบถามราคาเป็นรายกรณี ระบบจะไม่เสนอราคาเอง',
  },
];

/**
 * Map any legacy / non-canonical value that older data or the previous dropdown
 * may hold onto a canonical enum value, so a loaded Property always shows a valid
 * selection and always saves a value the API accepts.
 */
export function toCanonicalPriceMode(v: string | null | undefined): PriceDisplayMode {
  const s = String(v ?? '').trim();
  if ((PRICE_DISPLAY_MODES as readonly string[]).includes(s)) return s as PriceDisplayMode;
  const legacy: Record<string, PriceDisplayMode> = {
    hidden: 'DO_NOT_SHOW',
    do_not_show: 'DO_NOT_SHOW',
    starting_from: 'STARTING_FROM',
    fixed: 'STARTING_FROM',
    range: 'RANGE',
    on_request: 'ON_REQUEST',
  };
  return legacy[s.toLowerCase()] ?? 'STARTING_FROM';
}

/** Which numeric price fields are relevant for a given mode (mode-driven UI). */
export function priceFieldsForMode(mode: PriceDisplayMode): {
  startingPrice: boolean;
  range: boolean;
} {
  return {
    startingPrice: mode === 'STARTING_FROM',
    range: mode === 'RANGE',
  };
}

/** Format a numeric amount as Thai baht for display only ("9,500 บาท"). */
export function formatBaht(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return '';
  return `${n.toLocaleString('en-US')} บาท`;
}

// ---------------------------------------------------------------------------
// Amenities — common owner options mapped onto canonical PropertyAmenities keys.
// ---------------------------------------------------------------------------

/** Canonical boolean amenity keys the matcher/persistence understand. */
export type AmenityKey =
  | 'privatePool'
  | 'karaoke'
  | 'poolTable'
  | 'wifi'
  | 'airConditioning'
  | 'kitchen'
  | 'bbq'
  | 'parking'
  | 'petFriendly'
  | 'nearBeach';

export interface AmenityOption {
  key: AmenityKey;
  label: string;
}

/** Common options shown as chips, in owner-priority order. */
export const AMENITY_OPTIONS: AmenityOption[] = [
  { key: 'privatePool', label: 'สระว่ายน้ำส่วนตัว' },
  { key: 'karaoke', label: 'คาราโอเกะ' },
  { key: 'poolTable', label: 'โต๊ะพูล' },
  { key: 'wifi', label: 'Wi-Fi' },
  { key: 'airConditioning', label: 'เครื่องปรับอากาศ' },
  { key: 'kitchen', label: 'ครัว' },
  { key: 'bbq', label: 'เตาปิ้งย่าง' },
  { key: 'parking', label: 'ที่จอดรถ' },
  { key: 'petFriendly', label: 'สัตว์เลี้ยงเข้าได้' },
  { key: 'nearBeach', label: 'ใกล้ทะเล' },
];

/** Owner-facing label for a canonical amenity key (list cards, summaries). */
export const AMENITY_LABELS: Record<AmenityKey, string> = AMENITY_OPTIONS.reduce(
  (acc, o) => {
    acc[o.key] = o.label;
    return acc;
  },
  {} as Record<AmenityKey, string>,
);

/** Read the custom "other" amenities list off a Property amenities record. */
export function otherAmenities(amenities: Record<string, boolean | string[]>): string[] {
  const other = amenities.other;
  return Array.isArray(other)
    ? other.filter((s) => typeof s === 'string' && s.trim().length > 0)
    : [];
}

// ---------------------------------------------------------------------------
// Location & Capacity — labels, units, placeholders, helper text.
// ---------------------------------------------------------------------------

export const LOCATION_FIELDS: Array<{
  key: 'province' | 'district' | 'subdistrict' | 'area' | 'address';
  label: string;
  placeholder: string;
}> = [
  { key: 'province', label: 'จังหวัด', placeholder: 'ชลบุรี' },
  { key: 'district', label: 'อำเภอ/เขต', placeholder: 'เมืองชลบุรี' },
  { key: 'subdistrict', label: 'ตำบล/แขวง', placeholder: 'แสนสุข' },
  { key: 'area', label: 'พื้นที่/ย่าน', placeholder: 'บางแสน' },
  { key: 'address', label: 'ที่อยู่ (ไม่บังคับ)', placeholder: 'บ้านเลขที่ / ถนน' },
];

export const LOCATION_HELP = 'ช่วยให้ระบบเลือกที่พักให้ตรงพื้นที่ที่ลูกค้าต้องการ';

export const CAPACITY_FIELDS: Array<{
  key: 'maxGuests' | 'bedrooms' | 'bathrooms' | 'beds';
  label: string;
  unit: string;
}> = [
  { key: 'maxGuests', label: 'รองรับผู้เข้าพักสูงสุด', unit: 'คน' },
  { key: 'bedrooms', label: 'ห้องนอน', unit: 'ห้อง' },
  { key: 'bathrooms', label: 'ห้องน้ำ', unit: 'ห้อง' },
  { key: 'beds', label: 'เตียง', unit: 'เตียง' },
];

export const CAPACITY_HELP = 'ระบบใช้ข้อมูลนี้เพื่อไม่แนะนำบ้านที่รองรับจำนวนคนไม่พอ';

// ---------------------------------------------------------------------------
// Per-tab guidance (Phase J).
// ---------------------------------------------------------------------------

export const PROPERTY_TAB_GUIDANCE: Record<string, string> = {
  ที่ตั้ง: 'ช่วยให้ระบบเลือกที่พักให้ตรงพื้นที่ที่ลูกค้าต้องการ',
  ความจุ: 'ช่วยป้องกันการแนะนำบ้านที่รองรับจำนวนผู้เข้าพักไม่พอ',
  สิ่งอำนวยความสะดวก: 'ระบบใช้ข้อมูลนี้จับคู่ความต้องการ เช่น สระส่วนตัวหรือคาราโอเกะ',
  ราคา: 'ระบบใช้ราคาเฉพาะตามนโยบายที่คุณอนุญาต',
  เนื้อหา: 'ใช้สำหรับจุดเด่นและคำอธิบายที่พัก',
  นโยบายเฉพาะ: 'ใช้เฉพาะเมื่อที่พักหลังนี้แตกต่างจากนโยบายหลักของธุรกิจ',
};

// ---------------------------------------------------------------------------
// Owner-safe save feedback (Phase C) — never surface raw backend strings.
// ---------------------------------------------------------------------------

export const SAVE_MESSAGES = {
  noChanges: 'ยังไม่มีข้อมูลที่เปลี่ยนแปลง',
  saving: 'กำลังบันทึก...',
  saved: 'บันทึกเรียบร้อย',
  validation: 'กรุณาตรวจสอบข้อมูลด้านล่าง',
  serverError: 'ไม่สามารถบันทึกได้ กรุณาลองใหม่อีกครั้ง',
} as const;

/**
 * Map an API failure onto an owner-safe Thai message. A validation failure
 * (HTTP 400/422 or a validation_error code) asks the owner to check the form;
 * anything else is a generic retry message. The raw backend string (e.g.
 * "Nothing valid to update") is never shown.
 */
export function saveErrorMessage(err: unknown): string {
  const e = err as { status?: number; code?: string } | null;
  const status = e?.status;
  const code = e?.code;
  if (status === 400 || status === 422 || code === 'validation_error' || code === 'bad_request') {
    return SAVE_MESSAGES.validation;
  }
  return SAVE_MESSAGES.serverError;
}

// ---------------------------------------------------------------------------
// Property list summary (Phase I) — structured, no raw enums.
// ---------------------------------------------------------------------------

export interface PropertySummary {
  name: string;
  typeLabel: string;
  area: string | null;
  capacityLine: string | null;
  bedroomsLine: string | null;
  amenityLine: string | null;
  readiness: 'READY' | 'NOT_READY' | null;
}

/** Amenity chip labels a property card should show (canonical → Thai). */
export function amenityChips(amenities: Record<string, boolean | string[]>): string[] {
  const chips: string[] = [];
  // A curated, high-signal subset in priority order (not every toggle).
  const featured: AmenityKey[] = ['privatePool', 'karaoke', 'poolTable', 'nearBeach'];
  for (const key of featured) {
    if (amenities[key] === true) chips.push(AMENITY_LABELS[key]);
  }
  return chips;
}

/** Build the structured, enum-free summary shown on a Property list card. */
export function propertySummary(
  p: Property,
  readiness?: 'READY' | 'NOT_READY' | null,
): PropertySummary {
  const maxGuests = p.capacity.maxGuests;
  const bedrooms = p.capacity.bedrooms;
  return {
    name: p.name,
    typeLabel: propertyTypeLabel(p.propertyType),
    area: p.location.area ?? p.location.province ?? null,
    capacityLine: maxGuests != null ? `รองรับสูงสุด ${maxGuests} คน` : null,
    bedroomsLine: bedrooms != null ? `${bedrooms} ห้องนอน` : null,
    amenityLine: amenityChips(p.amenities).join(' · ') || null,
    readiness: readiness ?? null,
  };
}

// ---------------------------------------------------------------------------
// Change detection (Phase C "no changes").
// ---------------------------------------------------------------------------

/** Deep-equal by stable JSON — enough for detecting owner edits in the form. */
export function propertyChanged(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) !== JSON.stringify(b);
}
