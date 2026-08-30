import type {
  BusinessRecord,
  BusinessProfileRecord,
  BusinessKnowledgeRecord,
  BusinessMatchingRuleRecord,
  BusinessMatchRecord,
  OpportunityRecord,
  SignalRecord,
  FacebookGroupRecord,
} from '../store/types';
import type { DraftContext } from './types';
import type { Property, ContactChannel, BusinessPolicies } from '../business-property/types';
import { buildPropertyDraftContext } from '../business-property/draft-context';
import { resolvePropertyPolicies } from '../business-property/policies';
import { approvedDraftChannels } from '../business-property/contacts';
import { AiDraftError, AiDraftErrorCode } from './errors';

export interface ContextBuilderInput {
  workspaceId: string;
  match: BusinessMatchRecord;
  opportunity: OpportunityRecord;
  /** Reasons extracted from the Opportunity's creation event (safe). */
  opportunityReasons: { code: string; passed: boolean }[];
  signal: SignalRecord;
  group: FacebookGroupRecord | null;
  business: BusinessRecord;
  profile: BusinessProfileRecord | null;
  knowledge: BusinessKnowledgeRecord[];
  rules: BusinessMatchingRuleRecord[];
  // SPRINT 016B — Property-match context (optional; wired by the coordinator).
  selectedProperty?: Property | null;
  businessPolicies?: BusinessPolicies | null;
  contacts?: ContactChannel[];
  /** True when the Business MATCH produced NO Property MATCH. */
  noPropertyMatch?: boolean;
  /** v2 (M9E) — recommended property is NEEDS_CONFIRMATION + its unconfirmed facts. */
  propertyNeedsConfirmation?: boolean;
  unconfirmedRequirements?: string[];
}

export interface ContextBuilderConfig {
  maxKnowledgeItems: number;
  maxCharacters: number;
}

/**
 * BusinessContextBuilder (SPRINT 009) — PURE.
 *
 * Assembles a SAFE, structured context from already-fetched records. It:
 *   - enforces single-workspace ownership across every record;
 *   - excludes archived/disabled knowledge and disabled rules;
 *   - bounds the knowledge list (count and total characters);
 *   - orders knowledge deterministically (createdAt asc, then id);
 *   - preserves Thai text unchanged;
 *   - emits NO secrets, session data, cookies, absolute paths, or DB metadata.
 *
 * It performs no I/O and calls no model.
 */
export function buildDraftContext(
  input: ContextBuilderInput,
  config: ContextBuilderConfig,
): DraftContext {
  const { workspaceId, match, opportunity, signal, business } = input;

  // Ownership: every record must belong to the same workspace.
  if (
    match.workspaceId !== workspaceId ||
    opportunity.workspaceId !== workspaceId ||
    signal.workspaceId !== workspaceId ||
    business.workspaceId !== workspaceId
  ) {
    throw new AiDraftError(
      AiDraftErrorCode.INVALID_WORKSPACE,
      'Context records span more than one workspace',
    );
  }
  // Profile/knowledge/rules must belong to this business.
  if (input.profile && input.profile.businessId !== business.id) {
    throw new AiDraftError(
      AiDraftErrorCode.INVALID_WORKSPACE,
      'Profile does not belong to business',
    );
  }

  // Active knowledge only, deterministic order, bounded by count then characters.
  const activeKnowledge = input.knowledge
    .filter((k) => k.businessId === business.id && k.status === 'active')
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime() || (a.id < b.id ? -1 : 1))
    .slice(0, Math.max(0, config.maxKnowledgeItems));

  const knowledge: { title: string; content: string }[] = [];
  let charBudget = config.maxCharacters;
  for (const k of activeKnowledge) {
    const content = k.content ?? '';
    const cost = k.title.length + content.length;
    if (cost > charBudget) break; // stop once the budget is exhausted
    charBudget -= cost;
    knowledge.push({ title: k.title, content });
  }

  const activeRules = input.rules
    .filter((r) => r.businessId === business.id && r.status === 'active')
    .map((r) => ({ ruleType: r.ruleType, ruleValue: r.ruleValue }));

  // ── SPRINT 016B: selected Property + effective policies + approved contacts ──
  // A selected Property must belong to this Business + Workspace (no cross leak).
  if (
    input.selectedProperty &&
    (input.selectedProperty.workspaceId !== workspaceId ||
      input.selectedProperty.businessId !== business.id)
  ) {
    throw new AiDraftError(
      AiDraftErrorCode.INVALID_WORKSPACE,
      'Selected property does not belong to the matched business/workspace',
    );
  }

  let property: DraftContext['property'] = null;
  let policies: DraftContext['policies'] = null;
  let approvedContacts: DraftContext['approvedContacts'] = [];
  let mustNotClaim: string[] = [...(input.profile?.prohibitedClaims ?? [])];

  if (input.businessPolicies) {
    const effective = input.selectedProperty
      ? resolvePropertyPolicies(input.businessPolicies, input.selectedProperty.policyOverrides)
      : null;
    const bp = buildPropertyDraftContext({
      businessName: business.name,
      serviceArea: input.profile?.serviceArea ?? null,
      responseTone: input.profile?.responseTone ?? null,
      businessPolicies: input.businessPolicies,
      contacts: input.contacts ?? [],
      property: input.selectedProperty ?? null,
      effectivePolicies: effective,
    });
    property = bp.property;
    policies = {
      availabilityPolicy: bp.policies.availabilityPolicy,
      pricingPolicy: bp.policies.pricingPolicy,
      promotionPolicy: bp.policies.promotionPolicy,
      bookingPolicy: bp.policies.bookingPolicy,
    };
    approvedContacts = bp.approvedContacts.map((c) => ({
      type: c.type,
      value: c.value,
      label: c.label,
    }));
    mustNotClaim = Array.from(new Set([...mustNotClaim, ...bp.mustNotClaim]));
  } else {
    // No policies configured yet — expose only draft-approved contacts, and make
    // no Property claims (property stays null; mustNotClaim keeps prohibited).
    approvedContacts = approvedDraftChannels(input.contacts ?? []).map((c) => ({
      type: c.type,
      value: c.value,
      label: c.label,
    }));
  }

  return {
    business: {
      name: business.name,
      category: input.profile?.category ?? null,
      description: input.profile?.description ?? null,
      sellingPoints: input.profile?.sellingPoints ?? [],
      serviceArea: input.profile?.serviceArea ?? null,
      contactInformation: input.profile?.contactInformation ?? null,
      responseTone: input.profile?.responseTone ?? null,
    },
    prohibitedClaims: input.profile?.prohibitedClaims ?? [],
    knowledge,
    matchingRules: activeRules,
    matchingReasons: match.reasons.map((r) => ({
      ruleType: r.ruleType,
      ruleValue: r.ruleValue,
      matched: r.matched,
    })),
    opportunity: {
      decision: opportunity.decision,
      reasons: input.opportunityReasons.map((r) => ({ code: r.code, passed: r.passed })),
    },
    signal: {
      message: signal.message,
      sourceUrl: signal.postUrl,
      group: {
        name: input.group?.name ?? null,
        url: input.group?.canonicalUrl ?? '',
      },
    },
    property,
    policies,
    approvedContacts,
    mustNotClaim,
    noPropertyMatch: input.noPropertyMatch ?? false,
    propertyNeedsConfirmation: input.propertyNeedsConfirmation ?? false,
    unconfirmedRequirements: input.unconfirmedRequirements ?? [],
  };
}
