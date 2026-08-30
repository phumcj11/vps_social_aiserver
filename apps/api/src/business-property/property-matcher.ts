import type { Property, PropertyFact } from './types';
import { factIsPresentV1 } from './property-facts';

/**
 * Deterministic Property matcher — Matching Semantics v2 (M9C).
 *
 * NO embeddings, NO vector DB, NO semantic AI — pure keyword/attribute logic on
 * area, accommodation type, guest capacity, bedrooms, and tri-state location/
 * amenity facts, with recorded reason codes.
 *
 * v2 introduces THREE result states and an explicit tri-state treatment of the
 * amenity/location facts (built on the M9B PropertyFact foundation):
 *
 *   MATCH              no confirmed hard failure AND no required fact is UNKNOWN
 *                      AND at least one required fact is confirmed present.
 *   NEEDS_CONFIRMATION no confirmed hard failure, but at least one REQUIRED fact
 *                      is UNKNOWN (owner has not told us) — surfaced for a human
 *                      to confirm; NEVER claimed as satisfied.
 *   NO_MATCH           at least one CONFIRMED hard failure (a fact the property
 *                      demonstrably does not satisfy).
 *
 * CRITICAL: UNKNOWN is never a failure. A required feature whose fact is UNKNOWN
 * yields a `*_UNKNOWN` reason (needs confirmation), NOT a `*_MISSING`. Only a
 * confirmed NO (or a known-but-different area / an over-capacity request) is a
 * hard failure. Truthiness of the fact enum is never used (see property-facts).
 */

/** What a customer opportunity is understood to require (deterministically parsed). */
export interface PropertyRequirement {
  area: string | null;
  accommodationType: string | null;
  guests: number | null;
  bedrooms: number | null;
  needsPrivatePool: boolean;
  needsBeach: boolean;
  needsRiver: boolean;
}

export type PropertyMatchState = 'MATCH' | 'NEEDS_CONFIRMATION' | 'NO_MATCH';

export interface PropertyMatchResult {
  decision: PropertyMatchState;
  reasons: string[];
}

const norm = (s: string | null): string => (s ?? '').toLowerCase().replace(/\s+/g, '');

/**
 * Minimal, DETERMINISTIC accommodation-type compatibility (M9C). Directional:
 * a BROAD customer term accepts specific whole-unit property types, never the
 * reverse. Kept intentionally narrow — no cross-family aliases (a รีสอร์ท
 * request never matches a hotel room, แพพัก never matches a house). A compatible
 * (non-exact) type is a SOFT positive (TYPE_COMPATIBLE) that only affects
 * ranking; type never disqualifies and never forces confirmation.
 *
 * Documented decision: "บ้านพัก" (broad "a house/place to stay", parsed as
 * `house`) IS compatible with `pool_villa` (and `villa`) for recommendation
 * purposes — a whole-unit villa satisfies a broad whole-house request.
 */
const TYPE_COMPATIBILITY: Record<string, string[]> = {
  house: ['house', 'pool_villa', 'villa'],
  villa: ['villa', 'pool_villa'],
};

function typeIsCompatible(requested: string, propertyType: string): boolean {
  const accepted = TYPE_COMPATIBILITY[norm(requested)];
  if (!accepted) return false;
  return accepted.some((t) => norm(propertyType).includes(norm(t)));
}

/** Tri-state outcome for a single required fact. */
function factReason(
  fact: PropertyFact,
  matchCode: string,
  missingCode: string,
  unknownCode: string,
): string {
  if (fact === 'YES') return matchCode;
  if (fact === 'NO') return missingCode;
  return unknownCode; // UNKNOWN — needs confirmation, NOT a failure
}

export function matchProperty(property: Property, req: PropertyRequirement): PropertyMatchResult {
  const reasons: string[] = [];

  // Area — a required area is a hard constraint ONLY when the property's
  // location is known and demonstrably different. An unknown location cannot be
  // a confirmed mismatch.
  if (req.area) {
    const known = [property.location.area, property.location.district, property.location.province]
      .map(norm)
      .filter((a) => a.length > 0);
    const wanted = norm(req.area);
    if (known.length === 0) {
      reasons.push(`AREA_UNKNOWN: ${req.area}`);
    } else if (known.some((a) => a.includes(wanted) || wanted.includes(a))) {
      reasons.push(`AREA_MATCH: ${req.area}`);
    } else {
      reasons.push(`AREA_MISMATCH: wanted ${req.area}`);
    }
  }

  // Capacity — a hard factual constraint. Over-capacity is a confirmed failure;
  // an unknown maxGuests cannot be a confirmed failure.
  if (req.guests != null) {
    if (property.capacity.maxGuests == null) {
      reasons.push(`CAPACITY_UNKNOWN: ${req.guests}`);
    } else if (req.guests <= property.capacity.maxGuests) {
      reasons.push(`CAPACITY_MATCH: ${req.guests} <= ${property.capacity.maxGuests}`);
    } else {
      reasons.push(`CAPACITY_MISMATCH: ${req.guests} > ${property.capacity.maxGuests}`);
    }
  }

  if (req.bedrooms != null) {
    if (property.capacity.bedrooms == null) {
      reasons.push(`BEDROOMS_UNKNOWN: ${req.bedrooms}`);
    } else if (property.capacity.bedrooms >= req.bedrooms) {
      reasons.push(`BEDROOMS_MATCH: ${req.bedrooms}`);
    } else {
      reasons.push(`BEDROOMS_MISMATCH: wanted ${req.bedrooms}`);
    }
  }

  // Accommodation type — a SOFT signal (never disqualifies). Exact/substring is
  // TYPE_MATCH; a documented compatible type is TYPE_COMPATIBLE (ranking only).
  if (req.accommodationType && property.propertyType) {
    if (norm(property.propertyType).includes(norm(req.accommodationType))) {
      reasons.push(`TYPE_MATCH: ${req.accommodationType}`);
    } else if (typeIsCompatible(req.accommodationType, property.propertyType)) {
      reasons.push(`TYPE_COMPATIBLE: ${req.accommodationType}~${property.propertyType}`);
    }
  }

  // Private pool — tri-state: YES match, NO confirmed missing (hard), UNKNOWN
  // needs confirmation.
  if (req.needsPrivatePool) {
    reasons.push(
      factReason(
        property.amenities.privatePool,
        'PRIVATE_POOL_MATCH',
        'PRIVATE_POOL_MISSING',
        'PRIVATE_POOL_UNKNOWN',
      ),
    );
  }

  // Beach — satisfied by beachfront OR nearBeach. A confirmed mismatch requires
  // BOTH facts to be a confirmed NO; if either is UNKNOWN (and neither is YES),
  // it needs confirmation — NOT BEACH_MISSING.
  if (req.needsBeach) {
    const bf = property.amenities.beachfront;
    const nb = property.amenities.nearBeach;
    if (bf === 'YES' || nb === 'YES') reasons.push('BEACH_MATCH');
    else if (bf === 'NO' && nb === 'NO') reasons.push('BEACH_MISSING');
    else reasons.push('BEACH_UNKNOWN');
  }

  if (req.needsRiver) {
    reasons.push(
      factReason(property.amenities.riverfront, 'RIVER_MATCH', 'RIVER_MISSING', 'RIVER_UNKNOWN'),
    );
  }

  return { decision: classify(reasons), reasons };
}

/** Reason-code classifiers (v2). A hard failure is a CONFIRMED miss/mismatch. */
function codeOf(reason: string): string {
  return (reason.split(':')[0] ?? '').trim();
}
export function isHardFailureCode(code: string): boolean {
  return code.endsWith('_MISMATCH') || code.endsWith('_MISSING');
}
export function isUnknownCode(code: string): boolean {
  return code.endsWith('_UNKNOWN');
}
/** A CONFIRMED positive on a REQUIRED fact (excludes soft TYPE_/AMENITY_). */
const CONFIRMED_MATCH_CODES = new Set([
  'AREA_MATCH',
  'CAPACITY_MATCH',
  'BEDROOMS_MATCH',
  'PRIVATE_POOL_MATCH',
  'BEACH_MATCH',
  'RIVER_MATCH',
]);
export function isConfirmedMatchCode(code: string): boolean {
  return CONFIRMED_MATCH_CODES.has(code);
}

/** Derive the 3-state decision from the required-fact reason codes. */
export function classify(reasons: string[]): PropertyMatchState {
  const codes = reasons.map(codeOf);
  if (codes.some(isHardFailureCode)) return 'NO_MATCH';
  if (codes.some(isUnknownCode)) return 'NEEDS_CONFIRMATION';
  if (codes.some(isConfirmedMatchCode)) return 'MATCH';
  return 'NO_MATCH';
}

// Re-export for callers that still probe a boolean "present" (M9B compat).
export { factIsPresentV1 };
