import type { Property } from './types';
import { factIsPresentV1 } from './property-facts';

/**
 * Deterministic Property matcher foundation (SPRINT 015, Phase L).
 *
 * NO embeddings, NO vector DB, NO semantic AI — pure keyword/attribute logic
 * on area, accommodation type, guest capacity, bedrooms, and location/amenity
 * features, with recorded reasons. This is the matching FOUNDATION; wiring it
 * into the Opportunity→…→Draft pipeline is Sprint 016 (see docs/109).
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

export interface PropertyMatchResult {
  decision: 'MATCH' | 'NO_MATCH';
  reasons: string[];
}

const norm = (s: string | null): string => (s ?? '').toLowerCase().replace(/\s+/g, '');

export function matchProperty(property: Property, req: PropertyRequirement): PropertyMatchResult {
  const reasons: string[] = [];
  let disqualified = false;

  // Area — required when the requirement specifies one.
  if (req.area) {
    const areas = [
      property.location.area,
      property.location.district,
      property.location.province,
    ].map(norm);
    const wanted = norm(req.area);
    if (areas.some((a) => a.length > 0 && (a.includes(wanted) || wanted.includes(a)))) {
      reasons.push(`AREA_MATCH: ${req.area}`);
    } else {
      reasons.push(`AREA_MISMATCH: wanted ${req.area}`);
      disqualified = true;
    }
  }

  // Capacity — the property must fit the requested guests.
  if (req.guests != null && property.capacity.maxGuests != null) {
    if (req.guests <= property.capacity.maxGuests) {
      reasons.push(`CAPACITY_MATCH: ${req.guests} <= ${property.capacity.maxGuests}`);
    } else {
      reasons.push(`CAPACITY_MISMATCH: ${req.guests} > ${property.capacity.maxGuests}`);
      disqualified = true;
    }
  }

  if (req.bedrooms != null && property.capacity.bedrooms != null) {
    if (property.capacity.bedrooms >= req.bedrooms) reasons.push(`BEDROOMS_MATCH: ${req.bedrooms}`);
    else {
      reasons.push(`BEDROOMS_MISMATCH: wanted ${req.bedrooms}`);
      disqualified = true;
    }
  }

  // Accommodation type — a soft signal (contributes a reason, does not disqualify).
  if (req.accommodationType && property.propertyType) {
    if (norm(property.propertyType).includes(norm(req.accommodationType))) {
      reasons.push(`TYPE_MATCH: ${req.accommodationType}`);
    }
  }

  // Feature requirements — a required feature the property lacks disqualifies it.
  // M9B COMPATIBILITY: the amenity facts are now tri-state (YES/NO/UNKNOWN), but
  // v1 semantics are preserved EXACTLY — only a confirmed YES counts as present
  // (via factIsPresentV1); NO and UNKNOWN both behave as the old boolean `false`
  // did (disqualify a required feature). Matcher v2 (M9C) will distinguish them.
  // Never test the enum with truthiness — 'NO'/'UNKNOWN' are truthy strings.
  if (req.needsPrivatePool) {
    if (factIsPresentV1(property.amenities.privatePool)) reasons.push('PRIVATE_POOL_MATCH');
    else {
      reasons.push('PRIVATE_POOL_MISSING');
      disqualified = true;
    }
  }
  if (req.needsBeach) {
    if (
      factIsPresentV1(property.amenities.beachfront) ||
      factIsPresentV1(property.amenities.nearBeach)
    )
      reasons.push('BEACH_MATCH');
    else {
      reasons.push('BEACH_MISSING');
      disqualified = true;
    }
  }
  if (req.needsRiver) {
    if (factIsPresentV1(property.amenities.riverfront)) reasons.push('RIVER_MATCH');
    else {
      reasons.push('RIVER_MISSING');
      disqualified = true;
    }
  }

  // A match needs at least one positive signal and no disqualifier.
  const positive = reasons.some((r) => r.endsWith('_MATCH'));
  const decision = !disqualified && positive ? 'MATCH' : 'NO_MATCH';
  return { decision, reasons };
}
