/**
 * Deterministic Thai accommodation-intent analysis (Pilot 0 corrective fix).
 *
 * PURE and DETERMINISTIC — NO AI, NO ML, NO score, NO confidence. Given a post
 * message it reports whether the text shows genuine CUSTOMER demand for
 * accommodation versus ADVERTISER / owner / agent listing language. The
 * OpportunityClassifier consumes this to decide ACCEPT / REJECT.
 *
 * Distinctions that matter (learned from the Pilot):
 *   - A customer SEEKS ("หาที่พัก…", "ขอที่พัก…", "…ว่างไหม") → demand.
 *   - An advertiser BROADCASTS a listing ("รหัสที่พัก DV-1952", "จองด่วน",
 *     "ว่างวันนี้ ทักจอง") → not a customer.
 *   - An agent seeks on behalf of others ("หาที่พักให้ลูกค้า", "มีลูกค้า…") →
 *     not an end customer.
 */

/** Customer search verbs / phrases (first-person demand). */
const CUSTOMER_SEARCH = [
  'หาที่พัก',
  'หาบ้านพัก',
  'หาพูลวิลล่า',
  'หาบ้าน',
  'ตามหา',
  'ขอที่พัก',
  'ขอบ้านพัก',
  'ขอพูลวิลล่า',
  'ต้องการที่พัก',
  'ต้องการบ้านพัก',
  'อยากได้ที่พัก',
  'มองหาที่พัก',
  'พักที่ไหนดี',
  'มีที่ไหนแนะนำ',
  'ขอคำแนะนำ',
];
/** A bare "หา" near an accommodation noun also counts as search. */
const BARE_SEARCH = /หา\s*(ที่พัก|บ้าน|พูลวิลล่า|วิลล่า|รีสอร์ท|โรงแรม|ที่)/;

/** Question particles + an accommodation noun ⇒ a customer asking (not a broadcast). */
const QUESTION_PARTICLE = /(ไหม|มั้ย|รึเปล่า|หรือเปล่า)/;
const ACCOMMODATION_NOUN = /(ว่าง|ที่พัก|บ้านพัก|บ้าน|พูลวิลล่า|วิลล่า|ห้อง|รีสอร์ท)/;

/** Agent / on-behalf context — NOT an end customer. */
const AGENT_CONTEXT = [
  'ให้ลูกค้า',
  'มีลูกค้า',
  'รับลูกค้า',
  'ลูกค้าหา',
  'นายหน้า',
  'รับตัวแทน',
  'ตัวแทน',
  'ค่าคอม',
  'ค่าคอมมิช',
];

/** Strong advertiser / listing markers — REJECT even alongside quoted intent. */
const STRONG_ADVERTISER = [
  'รหัสที่พัก',
  'รหัสบ้าน',
  'จองด่วน',
  'เปิดรับจอง',
  'ว่างวันนี้',
  'ทักจอง',
  'ทักแชท',
  'สนใจทัก',
  'เจ้าของบ้าน',
  'เจ้าของเอง',
  'ลงเอง',
  'รับตัวแทน',
  'นายหน้า',
  'inbox',
  'รับลูกค้า',
  'ค่าคอม',
  'เปิดใหม่',
  'โปรโมชั่น',
  'ราคาพิเศษ',
  'ราคาโปร',
];
/** Booking-promotion markers (a subset that reads as a promotion). */
const BOOKING_PROMO = ['จองด่วน', 'โปรโมชั่น', 'ราคาพิเศษ', 'ราคาโปร', 'ว่างวันนี้', 'เปิดรับจอง'];
// NOTE: soft advertiser words like "โปร"/"จอง" are deliberately NOT in
// STRONG_ADVERTISER, so a genuine seeker who mentions "โปร" is still ACCEPTed.

/** Requirement / date / guest / location signals that corroborate customer demand. */
const REQUIREMENT = /(งบ|ราคาไม่เกิน|ไม่เกิน|สไตล์|มินิมอล|มีสระ|สระว่ายน้ำ|ห้องนอน|ต้องมี)/;
const DATE =
  /(คืนนี้|พรุ่งนี้|วันที่\s*\d+|วันเสาร์|วันอาทิตย์|เสาร์อาทิตย์|\d+\s*-\s*\d+\s*(ส\.?ค\.?|สิงหา|ก\.?ค\.?|กรกฎา)|เข้าพัก)/;
const GUEST_COUNT = /(สำหรับ\s*\d+\s*คน|\d+\s*คน|\d+\s*ท่าน|กลุ่ม\s*\d+|ครอบครัว)/;
const LOCATION = /(ใกล้หาด|ใกล้ทะเล|ติดทะเล|ติดหาด|บางแสน|พัทยา|ชะอำ|ชลบุรี|เพชรบุรี|หัวหิน)/;

/** Property-code-only text (Latin/number codes, no Thai demand). */
const CODE_ONLY = /^[\s]*([A-Za-z]{1,6}[-\s]?\d{1,7}[A-Za-z0-9-]*[\s]*)+$/;

export interface IntentAnalysis {
  firstPersonDemand: boolean;
  agentContext: boolean;
  strongAdvertiser: boolean;
  bookingPromotion: boolean;
  propertyCodeOnly: boolean;
  hasRequirement: boolean;
  hasDate: boolean;
  hasGuestCount: boolean;
  hasLocation: boolean;
  matchedAdvertiser: string[];
}

function includesAny(hay: string, needles: string[]): string[] {
  return needles.filter((n) => hay.includes(n.toLowerCase()));
}

export function analyzeIntent(message: string): IntentAnalysis {
  const raw = message ?? '';
  const lower = raw.toLowerCase();

  const agentContext = includesAny(lower, AGENT_CONTEXT).length > 0;
  const matchedAdvertiser = includesAny(lower, STRONG_ADVERTISER);
  const strongAdvertiser = matchedAdvertiser.length > 0;
  const bookingPromotion = includesAny(lower, BOOKING_PROMO).length > 0;

  const hasSearchPhrase =
    CUSTOMER_SEARCH.some((p) => lower.includes(p.toLowerCase())) || BARE_SEARCH.test(raw);
  // A question ("…ว่างไหม", "มี…ไหม") is a customer asking — but "ว่างวันนี้" is
  // an availability BROADCAST by an advertiser, not a question.
  const isQuestion =
    QUESTION_PARTICLE.test(raw) && ACCOMMODATION_NOUN.test(raw) && !/ว่างวันนี้/.test(raw);
  const firstPersonDemand = (hasSearchPhrase || isQuestion) && !agentContext;

  const propertyCodeOnly = CODE_ONLY.test(raw.trim()) && !hasSearchPhrase;

  return {
    firstPersonDemand,
    agentContext,
    strongAdvertiser,
    bookingPromotion,
    propertyCodeOnly,
    hasRequirement: REQUIREMENT.test(raw),
    hasDate: DATE.test(raw),
    hasGuestCount: GUEST_COUNT.test(raw),
    hasLocation: LOCATION.test(raw),
    matchedAdvertiser,
  };
}
