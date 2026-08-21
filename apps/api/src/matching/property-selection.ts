import type { Property, PropertyAmenities } from '../business-property/types';
import { matchProperty, type PropertyRequirement } from '../business-property/property-matcher';

/**
 * Property selection (SPRINT 016B) — the deterministic bridge between a Business
 * MATCH and a single persisted Property decision.
 *
 * Three pure stages, NO AI / embeddings / vector DB / inferred facts:
 *   1. parsePropertyRequirement — turn the Opportunity message into required facts.
 *   2. evaluatePropertyCandidate — hard-constraint MATCH/NO_MATCH (reuses the
 *      Sprint-015 matchProperty foundation) + soft requested-amenity coverage.
 *   3. selectBestProperty — deterministic ranking + stable tie-break over the
 *      MATCH candidates; or NO_PROPERTY_MATCH when none qualify (never fabricate).
 */

export const PROPERTY_MATCHER_VERSION = 'property-rules-v1';

/** Requested amenity keyword → the persisted PropertyAmenities boolean field. */
const REQUESTED_AMENITY_LEXICON: Array<{ key: keyof PropertyAmenities; terms: string[] }> = [
  { key: 'karaoke', terms: ['karaoke', 'คาราโอเกะ', 'คาราโอเกe'] },
  { key: 'bbq', terms: ['bbq', 'บาร์บีคิว', 'ปิ้งย่าง', 'บีบีคิว'] },
  { key: 'poolTable', terms: ['pooltable', 'โต๊ะพูล', 'สนุกเกอร์', 'snooker'] },
  { key: 'petFriendly', terms: ['petfriendly', 'สัตว์เลี้ยง', 'หมาแมว', 'pet'] },
  { key: 'wifi', terms: ['wifi', 'ไวไฟ', 'อินเทอร์เน็ต', 'internet'] },
  { key: 'parking', terms: ['parking', 'จอดรถ', 'ที่จอด'] },
  { key: 'kitchen', terms: ['kitchen', 'ครัว', 'ทำอาหาร'] },
  { key: 'airConditioning', terms: ['แอร์', 'เครื่องปรับอากาศ', 'aircon', 'airconditioning'] },
  { key: 'mountainView', terms: ['ภูเขา', 'วิวภูเขา', 'mountain'] },
];

const POOL_TERMS = ['สระ', 'pool', 'พูล', 'ว่ายน้ำ'];
const BEACH_TERMS = ['ทะเล', 'หาด', 'beach', 'ริมทะเล', 'ติดทะเล'];
const RIVER_TERMS = ['แม่น้ำ', 'ริมน้ำ', 'ริมแม่น้ำ', 'river', 'ริมคลอง'];
const TYPE_LEXICON: Array<{ type: string; terms: string[] }> = [
  { type: 'pool_villa', terms: ['พูลวิลล่า', 'poolvilla', 'poolvillar'] },
  { type: 'villa', terms: ['วิลล่า', 'villa'] },
  { type: 'resort', terms: ['รีสอร์ท', 'รีสอร์ต', 'resort'] },
  { type: 'homestay', terms: ['โฮมสเตย์', 'homestay'] },
  { type: 'condo', terms: ['คอนโด', 'condo'] },
  { type: 'hotel_room', terms: ['โรงแรม', 'hotel', 'ห้องพัก'] },
  { type: 'house', terms: ['บ้านพัก', 'บ้าน', 'house'] },
];

/**
 * A small seed lexicon of common Thai provinces / tourist areas so a requested
 * location is recognised even when NO candidate Property serves it (letting the
 * matcher correctly return AREA_MISMATCH instead of silently ignoring area).
 * It is UNIONed with the areas owners actually enter, so it never needs to be
 * exhaustive — it only seeds recognition and self-extends from real data.
 */
const BUILTIN_AREAS = [
  'บางแสน',
  'พัทยา',
  'จอมเทียน',
  'บางเสร่',
  'สัตหีบ',
  'ศรีราชา',
  'ชลบุรี',
  'ระยอง',
  'เกาะเสม็ด',
  'เกาะช้าง',
  'ตราด',
  'จันทบุรี',
  'ชะอำ',
  'หัวหิน',
  'เพชรบุรี',
  'ประจวบคีรีขันธ์',
  'ปราณบุรี',
  'ภูเก็ต',
  'กระบี่',
  'พังงา',
  'เกาะสมุย',
  'สมุย',
  'เกาะพะงัน',
  'สุราษฎร์ธานี',
  'เขาใหญ่',
  'ปากช่อง',
  'นครราชสีมา',
  'เชียงใหม่',
  'เชียงราย',
  'ปาย',
  'กาญจนบุรี',
  'สวนผึ้ง',
  'ราชบุรี',
  'อัมพวา',
  'สมุทรสงคราม',
  'กรุงเทพ',
  'กรุงเทพมหานคร',
  'นนทบุรี',
  'อยุธยา',
];

const norm = (s: string | null | undefined): string => (s ?? '').toLowerCase().replace(/\s+/g, '');

/** Deterministically parsed requirement + the requested-amenity keys (soft signals). */
export interface ParsedPropertyRequirement extends PropertyRequirement {
  requestedAmenities: Array<keyof PropertyAmenities>;
}

/**
 * Parse a customer Opportunity message into required Property facts.
 *
 * `knownAreas` is the set of area/district/province tokens the workspace's
 * candidate Properties actually use — the parser recognises a requested area
 * only if it is an area some Property serves, so no hard-coded geography lexicon
 * is needed and the parser self-adapts to owner data.
 */
export function parsePropertyRequirement(
  message: string | null,
  knownAreas: string[],
): ParsedPropertyRequirement {
  const raw = message ?? '';
  const n = norm(raw);

  // Area: the longest area token (owner-served areas ∪ the seed lexicon)
  // contained in the message (deterministic — longest wins).
  let area: string | null = null;
  const areaCandidates = [...knownAreas, ...BUILTIN_AREAS]
    .map((a) => ({ original: a, n: norm(a) }))
    .filter((a) => a.n.length > 0 && n.includes(a.n))
    .sort((a, b) => b.n.length - a.n.length);
  if (areaCandidates[0]) area = areaCandidates[0].original;

  // Guests: first "<number> คน/ท่าน/people/pax/guests" occurrence.
  let guests: number | null = null;
  const guestMatch = raw.match(/(\d+)\s*(?:คน|ท่าน|people|pax|persons?|guests?)/i);
  if (guestMatch && guestMatch[1]) guests = Number(guestMatch[1]);

  // Bedrooms: "<number> ห้องนอน/bedroom(s)".
  let bedrooms: number | null = null;
  const bedMatch = raw.match(/(\d+)\s*(?:ห้องนอน|bedrooms?|bed\s*rooms?)/i);
  if (bedMatch && bedMatch[1]) bedrooms = Number(bedMatch[1]);

  // Accommodation type: first matching type lexicon entry.
  let accommodationType: string | null = null;
  for (const entry of TYPE_LEXICON) {
    if (entry.terms.some((t) => n.includes(norm(t)))) {
      accommodationType = entry.type;
      break;
    }
  }

  const needsPrivatePool = POOL_TERMS.some((t) => n.includes(norm(t)));
  const needsBeach = BEACH_TERMS.some((t) => n.includes(norm(t)));
  const needsRiver = RIVER_TERMS.some((t) => n.includes(norm(t)));

  const requestedAmenities: Array<keyof PropertyAmenities> = [];
  for (const entry of REQUESTED_AMENITY_LEXICON) {
    if (entry.terms.some((t) => n.includes(norm(t)))) requestedAmenities.push(entry.key);
  }

  return {
    area,
    accommodationType,
    guests,
    bedrooms,
    needsPrivatePool,
    needsBeach,
    needsRiver,
    requestedAmenities,
  };
}

export interface CandidateEvaluation {
  property: Property;
  decision: 'MATCH' | 'NO_MATCH';
  reasons: string[];
  /** Deterministic ranking signals (all higher = better). */
  rank: {
    areaExact: number; // 1 if the Property area token equals the requested area
    typeExact: number; // 1 if the Property type matches the requested type
    capacityCloseness: number; // higher = snugger fit (least excess capacity)
    coverage: number; // count of requested amenities/features the Property has
  };
}

function requestedAmenityReasons(
  property: Property,
  requested: Array<keyof PropertyAmenities>,
): { reasons: string[]; matched: number } {
  const reasons: string[] = [];
  let matched = 0;
  for (const key of requested) {
    if (property.amenities[key] === true) {
      reasons.push(`AMENITY_MATCH: ${key}`);
      matched += 1;
    } else {
      // Soft: a missing requested amenity is a warning, never a disqualifier.
      reasons.push(`AMENITY_MISSING: ${key}`);
    }
  }
  return { reasons, matched };
}

/** Evaluate ONE Property against the requirement (hard constraints + soft coverage). */
export function evaluatePropertyCandidate(
  property: Property,
  req: ParsedPropertyRequirement,
): CandidateEvaluation {
  const base = matchProperty(property, req);
  const amenity = requestedAmenityReasons(property, req.requestedAmenities);
  const reasons = [...base.reasons, ...amenity.reasons];

  // The Sprint-015 matchProperty foundation only counts a bare "_MATCH" reason as
  // positive, but its area/capacity/type reasons carry a ": detail" suffix — so a
  // property matching on area + capacity alone (no requested feature) would read
  // as NO_MATCH there. The wiring layer computes the pipeline decision from the
  // reason CODES: a hard mismatch/missing disqualifies; any "_MATCH" code (area,
  // capacity, bedrooms, type, pool/beach/river) is a positive signal.
  const hardCodes = base.reasons.map((r) => (r.split(':')[0] ?? '').trim());
  const disqualified = hardCodes.some((c) => c.endsWith('_MISMATCH') || c.endsWith('_MISSING'));
  const positive = hardCodes.some((c) => c.endsWith('_MATCH'));
  const decision: 'MATCH' | 'NO_MATCH' = !disqualified && positive ? 'MATCH' : 'NO_MATCH';

  const areaExact =
    req.area != null &&
    [property.location.area, property.location.district, property.location.province]
      .map(norm)
      .some((a) => a.length > 0 && a === norm(req.area));
  const typeExact =
    req.accommodationType != null &&
    property.propertyType != null &&
    norm(property.propertyType).includes(norm(req.accommodationType));

  // Capacity closeness: prefer the snuggest sufficient Property. When guests or
  // maxGuests is unknown, closeness is neutral (0).
  let capacityCloseness = 0;
  if (req.guests != null && property.capacity.maxGuests != null) {
    capacityCloseness = -(property.capacity.maxGuests - req.guests);
  }

  // Feature coverage: requested pool/beach/river satisfied + requested amenities matched.
  let coverage = amenity.matched;
  if (req.needsPrivatePool && property.amenities.privatePool) coverage += 1;
  if (req.needsBeach && (property.amenities.beachfront || property.amenities.nearBeach))
    coverage += 1;
  if (req.needsRiver && property.amenities.riverfront) coverage += 1;

  return {
    property,
    decision,
    reasons,
    rank: {
      areaExact: areaExact ? 1 : 0,
      typeExact: typeExact ? 1 : 0,
      capacityCloseness,
      coverage,
    },
  };
}

export interface PropertySelection {
  decision: 'MATCH' | 'NO_MATCH';
  /** The winning Property when decision is MATCH; null for NO_PROPERTY_MATCH. */
  selected: CandidateEvaluation | null;
  /** Reasons for the persisted decision. */
  reasons: string[];
  /** Every evaluated candidate (winner first when MATCH). */
  evaluations: CandidateEvaluation[];
  candidatesEvaluated: number;
}

/**
 * Deterministic ranking (Phase E): higher wins, in strict priority order —
 *   1. area exact
 *   2. requested type exact
 *   3. capacity fit (snuggest sufficient)
 *   4. requested feature/amenity coverage
 *   5. stable tie-break on Property id (never random)
 */
function compareCandidates(a: CandidateEvaluation, b: CandidateEvaluation): number {
  if (a.rank.areaExact !== b.rank.areaExact) return b.rank.areaExact - a.rank.areaExact;
  if (a.rank.typeExact !== b.rank.typeExact) return b.rank.typeExact - a.rank.typeExact;
  if (a.rank.capacityCloseness !== b.rank.capacityCloseness)
    return b.rank.capacityCloseness - a.rank.capacityCloseness;
  if (a.rank.coverage !== b.rank.coverage) return b.rank.coverage - a.rank.coverage;
  return a.property.id.localeCompare(b.property.id);
}

export function selectBestProperty(
  properties: Property[],
  req: ParsedPropertyRequirement,
): PropertySelection {
  const evaluations = properties.map((p) => evaluatePropertyCandidate(p, req));
  const matches = evaluations.filter((e) => e.decision === 'MATCH').sort(compareCandidates);

  if (matches.length === 0) {
    return {
      decision: 'NO_MATCH',
      selected: null,
      reasons: ['NO_PROPERTY_MATCH'],
      evaluations,
      candidatesEvaluated: evaluations.length,
    };
  }

  const winner = matches[0]!;
  // Winner first, then the rest for auditability.
  const ordered = [winner, ...evaluations.filter((e) => e !== winner)];
  return {
    decision: 'MATCH',
    selected: winner,
    reasons: winner.reasons,
    evaluations: ordered,
    candidatesEvaluated: evaluations.length,
  };
}
