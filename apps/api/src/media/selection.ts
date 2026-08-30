import type { MediaAsset, MediaCategory, ImageResponseMode } from './types';

/**
 * Deterministic media selection — NO computer vision, NO external AI. An image
 * is chosen only to illustrate a fact that already exists (a matched Property, a
 * requested amenity that maps to a category). Selection NEVER turns an image
 * into evidence of an amenity, and NEVER picks a Property image on NO_PROPERTY_MATCH.
 */

export interface MediaSelectionContext {
  imageResponseMode: ImageResponseMode;
  /** The persisted Property match for this Business match, if any. */
  // v2 (M9C): decision may also be NEEDS_CONFIRMATION. Only a confirmed MATCH
  // (below) ever selects a property image — NEEDS_CONFIRMATION does not.
  propertyMatch: {
    decision: 'MATCH' | 'NEEDS_CONFIRMATION' | 'NO_MATCH';
    propertyId: string | null;
  } | null;
  /** Canonical requested amenity keys parsed from the Opportunity (e.g. karaoke). */
  requestedAmenities: string[];
  /**
   * Hard requirement signals from the parser. These add media RELEVANCE +
   * explainability only (e.g. a requested pool → prefer/explain a pool image);
   * they never make a Property match, never create an amenity fact, and never
   * change eligibility. Only needsPrivatePool maps to a canonical media category
   * (pool); beach/river have no clean category so they are intentionally ignored.
   */
  requirementFlags?: {
    needsPrivatePool?: boolean;
    needsBeach?: boolean;
    needsRiver?: boolean;
  };
}

/** Hard requirement signals → (category, reason code). Pool only. */
function hardRequirementCategories(
  flags: MediaSelectionContext['requirementFlags'],
): Array<{ category: MediaCategory; reason: string }> {
  const out: Array<{ category: MediaCategory; reason: string }> = [];
  if (flags?.needsPrivatePool)
    out.push({ category: 'pool', reason: 'REQUESTED_REQUIREMENT:private_pool' });
  return out;
}

export interface MediaSelectionResult {
  selected: MediaAsset | null;
  /** Stable reason codes (frontend maps to Thai). */
  reasons: string[];
}

/** Requested amenity → the media category that would illustrate it. */
const AMENITY_CATEGORY: Record<string, MediaCategory> = {
  privatePool: 'pool',
  sharedPool: 'pool',
  karaoke: 'karaoke',
  nearBeach: 'view',
  beachfront: 'view',
};

const PROPERTY_FALLBACK_ORDER: MediaCategory[] = ['cover', 'exterior', 'other'];
const BUSINESS_FALLBACK_ORDER: MediaCategory[] = ['cover', 'exterior', 'other'];

/** Only ACTIVE, owner-verified, draft-approved assets are ever eligible. */
function eligible(a: MediaAsset): boolean {
  return a.status === 'ACTIVE' && a.ownerVerified === true && a.approvedForDrafts === true;
}

/** Deterministic ordering within a category tier: oldest first, then id. */
function stableSort(list: MediaAsset[]): MediaAsset[] {
  return [...list].sort((x, y) => {
    const t = x.createdAt.getTime() - y.createdAt.getTime();
    return t !== 0 ? t : x.id < y.id ? -1 : x.id > y.id ? 1 : 0;
  });
}

/**
 * Pick the best asset given a prioritized category order. Returns the asset plus
 * the category tier that matched (for reason reporting).
 */
function pickByCategoryOrder(
  pool: MediaAsset[],
  order: MediaCategory[],
): { asset: MediaAsset; category: MediaCategory } | null {
  for (const cat of order) {
    const inCat = stableSort(pool.filter((a) => a.category === cat));
    if (inCat[0]) return { asset: inCat[0], category: cat };
  }
  // Nothing in the prioritized categories — fall back to any eligible asset, stably.
  const any = stableSort(pool)[0];
  return any ? { asset: any, category: any.category } : null;
}

/**
 * Select the most relevant approved image for a Draft/Human-Review suggestion.
 * `candidates` must already be scoped to the Business's workspace + business.
 */
export function selectMedia(
  candidates: MediaAsset[],
  ctx: MediaSelectionContext,
): MediaSelectionResult {
  if (ctx.imageResponseMode === 'OFF') return { selected: null, reasons: ['MODE_OFF'] };

  const pool = candidates.filter(eligible);
  const requestedCats = ctx.requestedAmenities
    .map((k) => AMENITY_CATEGORY[k])
    .filter((c): c is MediaCategory => Boolean(c));

  const isPropertyMatch =
    ctx.propertyMatch?.decision === 'MATCH' && Boolean(ctx.propertyMatch.propertyId);

  const hardReqs = hardRequirementCategories(ctx.requirementFlags);
  const hardCats = hardReqs.map((h) => h.category);

  if (isPropertyMatch) {
    const propertyId = ctx.propertyMatch!.propertyId!;
    const propertyPool = pool.filter((a) => a.propertyId === propertyId);
    // Hard-requirement categories first (e.g. requested pool → prefer a pool
    // image), then soft requested-amenity categories, then generic fallbacks.
    const order = [
      ...hardCats,
      ...requestedCats.filter((c) => !hardCats.includes(c)),
      ...PROPERTY_FALLBACK_ORDER.filter((c) => !hardCats.includes(c) && !requestedCats.includes(c)),
    ];
    const hit = pickByCategoryOrder(propertyPool, order);
    if (!hit) {
      // MATCHED_PROPERTY_ONLY forbids any fallback; others simply have no image.
      return { selected: null, reasons: ['PROPERTY_MATCH_NO_APPROVED_IMAGE'] };
    }
    const reasons = [
      'PROPERTY_MATCH_IMAGE',
      `CATEGORY:${hit.category}`,
      'OWNER_VERIFIED',
      'APPROVED_FOR_DRAFTS',
    ];
    // Explainability: why this category is relevant to the customer's request.
    const hardReason = hardReqs.find((h) => h.category === hit.category)?.reason;
    if (hardReason) reasons.splice(1, 0, hardReason);
    if (requestedCats.includes(hit.category)) {
      const amenity = ctx.requestedAmenities.find((k) => AMENITY_CATEGORY[k] === hit.category);
      if (amenity) reasons.splice(1, 0, `REQUESTED_AMENITY:${amenity}`);
    }
    return { selected: hit.asset, reasons };
  }

  // NO_PROPERTY_MATCH (or no property match record): NEVER a Property image.
  // Only Business-level images, and only when the mode permits a business fallback.
  const businessFallbackAllowed =
    ctx.imageResponseMode === 'BUSINESS_FALLBACK' || ctx.imageResponseMode === 'HUMAN_REVIEW_ONLY';
  if (!businessFallbackAllowed) {
    return { selected: null, reasons: ['NO_PROPERTY_MATCH_NO_BUSINESS_FALLBACK'] };
  }
  const businessPool = pool.filter((a) => a.propertyId === null);
  const hit = pickByCategoryOrder(businessPool, BUSINESS_FALLBACK_ORDER);
  if (!hit) return { selected: null, reasons: ['NO_APPROVED_BUSINESS_IMAGE'] };
  return {
    selected: hit.asset,
    reasons: [
      'BUSINESS_FALLBACK_NO_MATCH',
      `CATEGORY:${hit.category}`,
      'OWNER_VERIFIED',
      'APPROVED_FOR_DRAFTS',
    ],
  };
}
