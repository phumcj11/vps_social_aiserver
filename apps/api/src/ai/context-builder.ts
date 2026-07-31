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
  };
}
