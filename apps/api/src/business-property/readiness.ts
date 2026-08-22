import type {
  BusinessReadinessSnapshot,
  ReadinessVerdict,
  Property,
  EffectivePropertyPolicies,
} from './types';
import { approvedDraftChannels, ownerApprovedChannels } from './contacts';

/**
 * Production readiness evaluators (SPRINT 015, Phases H/I) wired to PERSISTED
 * data. A test-environment Business can NEVER be production-ready; a production
 * Business additionally needs at least one active production Property. Nothing
 * is fabricated — every requirement maps to stored data.
 */
export function evaluateBusinessReadiness(s: BusinessReadinessSnapshot): ReadinessVerdict {
  const missing: string[] = [];

  if (s.business.environment !== 'production') missing.push('production environment');
  if (s.business.status !== 'active') missing.push('active status');
  if (!nonEmpty(s.displayName)) missing.push('real Business name');
  if (!nonEmpty(s.serviceArea)) missing.push('valid service area');
  if (approvedDraftChannels(s.contacts).length === 0)
    missing.push('at least one approved contact channel');
  if (ownerApprovedChannels(s.contacts).length === 0)
    missing.push('contact channel owner approval');
  if (!nonEmpty(s.responseTone)) missing.push('response tone');

  const p = s.policies;
  if (!p) {
    missing.push(
      'prohibited claims',
      'pricing policy',
      'availability policy',
      'promotion policy',
      'booking policy',
      'responsible owner',
      'operating hours',
      'response SLA',
    );
  } else {
    if (p.prohibitedClaims.length === 0) missing.push('prohibited claims');
    if (!p.pricingPolicy) missing.push('pricing policy');
    if (!p.availabilityPolicy) missing.push('availability policy');
    if (!p.promotionPolicy) missing.push('promotion policy');
    if (!p.bookingPolicy) missing.push('booking policy');
    if (!nonEmpty(p.responsibleOwner)) missing.push('responsible owner');
    if (!nonEmpty(p.operatingHours)) missing.push('operating hours');
    if (!(typeof p.responseSlaMinutes === 'number' && p.responseSlaMinutes > 0))
      missing.push('response SLA');
  }

  if (s.activeProductionPropertyCount < 1) missing.push('at least one active Property');
  if (s.activeMatchingRuleCount < 1) missing.push('customer matching configuration');

  const ready = missing.length === 0;
  return { ready, status: ready ? 'READY' : 'NOT_READY', missing };
}

/** Property readiness — booking/pricing/availability/prohibited come via inheritance. */
export function evaluatePropertyReadiness(
  property: Property,
  effective: EffectivePropertyPolicies,
): ReadinessVerdict {
  const missing: string[] = [];
  if (property.status !== 'active') missing.push('active status');
  if (!nonEmpty(property.name)) missing.push('property name');
  if (!nonEmpty(property.propertyType)) missing.push('property type');
  if (!nonEmpty(property.location.area) && !nonEmpty(property.location.province))
    missing.push('service location');
  if (!(typeof property.capacity.maxGuests === 'number' && property.capacity.maxGuests > 0))
    missing.push('maximum guests');
  if (!nonEmpty(property.description) || (property.description ?? '').trim().length < 10)
    missing.push('meaningful description');
  if (!effective.bookingPolicy) missing.push('booking policy (own or inherited)');
  if (!effective.pricingPolicy) missing.push('pricing policy (own or inherited)');
  if (!effective.availabilityPolicy) missing.push('availability policy (own or inherited)');
  if (effective.prohibitedClaims.length === 0) missing.push('prohibited claims (own or inherited)');

  const ready = missing.length === 0;
  return { ready, status: ready ? 'READY' : 'NOT_READY', missing };
}

function nonEmpty(v: string | null | undefined): boolean {
  return typeof v === 'string' && v.trim().length > 0;
}
