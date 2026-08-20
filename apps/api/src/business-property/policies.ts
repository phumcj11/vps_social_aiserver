import type { BusinessPolicies, PropertyPolicyOverrides, EffectivePropertyPolicies } from './types';

/**
 * Policy inheritance (SPRINT 015, Phases I/K).
 *
 * A Property inherits its Business's policies unless it explicitly overrides a
 * field. Inheritance avoids duplicating data: a null override = "use the
 * Business policy". Draft generation may never invent a value absent from the
 * resolved policy/data.
 */
export function resolvePropertyPolicies(
  business: BusinessPolicies,
  override: PropertyPolicyOverrides | null,
): EffectivePropertyPolicies {
  const inherited: string[] = [];
  const overridden: string[] = [];

  const pick = <T>(field: string, o: T | null, b: T): T => {
    if (o == null) {
      inherited.push(field);
      return b;
    }
    overridden.push(field);
    return o;
  };

  const o = override ?? {
    availabilityPolicy: null,
    pricingPolicy: null,
    promotionPolicy: null,
    bookingPolicy: null,
    prohibitedClaims: null,
  };

  const prohibited =
    o.prohibitedClaims == null
      ? (inherited.push('prohibitedClaims'), business.prohibitedClaims)
      : (overridden.push('prohibitedClaims'), o.prohibitedClaims);

  return {
    availabilityPolicy: pick(
      'availabilityPolicy',
      o.availabilityPolicy,
      business.availabilityPolicy,
    ),
    pricingPolicy: pick('pricingPolicy', o.pricingPolicy, business.pricingPolicy),
    promotionPolicy: pick('promotionPolicy', o.promotionPolicy, business.promotionPolicy),
    bookingPolicy: pick('bookingPolicy', o.bookingPolicy, business.bookingPolicy),
    prohibitedClaims: prohibited,
    inheritedFields: inherited,
    overriddenFields: overridden,
  };
}
