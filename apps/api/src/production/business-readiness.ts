import type { ProductionBusinessInput, ReadinessVerdict, DraftMode } from './types';

/**
 * Production Business Readiness evaluator (SPRINT 014, Phase D).
 *
 * A test Business must NEVER be used for a production comment. This pure
 * evaluator returns NOT_READY unless the operator has supplied every required
 * real field — it never fabricates or substitutes data. If only the existing
 * test Businesses exist, production Business = NOT_READY.
 */

const REQUIRED_STRING_FIELDS: Array<[keyof ProductionBusinessInput, string]> = [
  ['realBusinessName', 'real Business name'],
  ['category', 'category'],
  ['serviceArea', 'service area'],
  ['verifiedDescription', 'verified description'],
  ['actualContactChannel', 'actual contact channel'],
  ['approvedResponseTone', 'approved response tone'],
  ['realAvailabilityPolicy', 'real availability policy'],
  ['realPricingPolicy', 'real pricing policy'],
  ['promotionPolicy', 'promotion policy'],
  ['bookingPolicy', 'booking policy'],
  ['escalationContactOwner', 'escalation / contact owner'],
  ['operatingHours', 'operating hours'],
];

export function evaluateProductionBusinessReadiness(
  input: ProductionBusinessInput,
): ReadinessVerdict {
  const missing: string[] = [];

  // A test Business can never be a production Business — hard stop.
  if (input.isTestBusiness) {
    missing.push('a real (non-test) Business — test Businesses must not post production comments');
  }

  for (const [field, label] of REQUIRED_STRING_FIELDS) {
    const v = input[field];
    if (typeof v !== 'string' || v.trim().length === 0) missing.push(label);
  }
  if (!input.verifiedSellingPoints || input.verifiedSellingPoints.length === 0) {
    missing.push('verified selling points');
  }
  if (!input.prohibitedClaims || input.prohibitedClaims.length === 0) {
    missing.push('prohibited claims');
  }
  if (input.contactChannelOwnerApproved !== true) {
    missing.push('contact channel owner approval');
  }
  if (typeof input.maxResponseSlaMinutes !== 'number' || input.maxResponseSlaMinutes <= 0) {
    missing.push('maximum response SLA');
  }

  const ready = missing.length === 0;
  return {
    ready,
    status: ready ? 'READY' : 'NOT_READY',
    missing,
    reasons: ready
      ? ['All required production Business fields supplied and approved.']
      : ['Production Business is NOT_READY until the operator supplies the missing fields.'],
  };
}

/**
 * Draft-mode requirements (Phase E). For Level 1 every production draft — in ANY
 * mode — must be human-reviewed; 'external_ai' is NOT configured this sprint, so
 * it is refused. mock/manual both require a mandatory human rewrite.
 */
export function evaluateDraftMode(mode: DraftMode): ReadinessVerdict {
  if (mode === 'external_ai') {
    return {
      ready: false,
      status: 'NOT_READY',
      missing: ['a configured + reviewed external AI provider'],
      reasons: [
        'external_ai draft mode is NOT configured or reviewed this sprint; use mock or manual.',
      ],
    };
  }
  // mock or manual: allowed for Level 1, but ALWAYS with mandatory human review.
  return {
    ready: true,
    status: 'READY',
    missing: [],
    reasons: [
      `Draft mode "${mode}" is allowed for Level 1 with MANDATORY human review`,
      mode === 'mock'
        ? 'mock drafts require EDIT_AND_APPROVE (human rewrite) — never posted as-is'
        : 'manual drafts are operator-authored and still human-reviewed',
      'No auto-approval; no Action Job may be created from unreviewed content.',
    ],
  };
}
