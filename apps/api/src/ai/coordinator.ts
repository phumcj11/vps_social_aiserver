import type { ApiEnv } from '../lib/env';
import type { Logger } from '../lib/logger';
import type {
  AiDraftRecord,
  AiDraftEventRecord,
  AiDraftStatus,
  AiDraftFilter,
  BusinessMatchRecord,
  BusinessRecord,
  OpportunityRecord,
  DraftPolicyResult,
} from '../store/types';
import type { AiDraftRepository } from './repository';
import type { AiDraftProvider } from './provider';
import { buildDraftContext } from './context-builder';
import { buildDraftPrompt } from './prompt-builder';
import { checkDraft } from './policy-checker';
import { AiDraftError, AiDraftErrorCode } from './errors';
import type { DraftContext } from './types';
import { DEFAULT_NO_PROPERTY_MATCH_STRATEGY } from '../business-property/types';

/** AI Draft lifecycle event names (safe payloads only). */
export const AiDraftEventType = {
  GenerationStarted: 'ai_draft_generation_started',
  Generated: 'ai_draft_generated',
  NeedsReview: 'ai_draft_needs_review',
  Blocked: 'ai_draft_blocked',
  Regenerated: 'ai_draft_regenerated',
  Rejected: 'ai_draft_rejected',
  Superseded: 'ai_draft_superseded',
  GenerationFailed: 'ai_draft_generation_failed',
} as const;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface GenerateResult {
  /** null when the Response Strategy suppressed drafting (DO_NOT_RESPOND). */
  draft: AiDraftRecord | null;
  created: boolean;
  /** Set when NO_PROPERTY_MATCH + DO_NOT_RESPOND stopped before drafting. */
  skipped?: 'DO_NOT_RESPOND';
}

export interface DraftDetail {
  draft: AiDraftRecord;
  events: AiDraftEventRecord[];
  match: BusinessMatchRecord | null;
  opportunity: OpportunityRecord | null;
  business: BusinessRecord | null;
}

export interface AiDraftCoordinatorDeps {
  repo: AiDraftRepository;
  provider: AiDraftProvider;
  env: ApiEnv;
  logger: Logger;
}

/**
 * AiDraftCoordinator (SPRINT 009) — runs the pipeline:
 *   Business Match → verify MATCH → build context → build prompt → provider
 *   → policy check → immutable Draft version → events → safe result.
 *
 * DRAFT ONLY: it never sends Telegram, never comments on Facebook, never
 * triggers a write action, and never auto-approves. Human approval remains
 * mandatory (docs/09-ai-design.md, ADR-017). Drafts are immutable and versioned
 * (ADR-016); a new version supersedes older ones and never overwrites.
 */
export class AiDraftCoordinator {
  constructor(private readonly deps: AiDraftCoordinatorDeps) {}

  private assertWorkspace(workspaceId: string): void {
    if (!UUID_RE.test(workspaceId)) {
      throw new AiDraftError(AiDraftErrorCode.INVALID_WORKSPACE, 'Invalid workspace');
    }
  }

  /** Generate the first Draft for a MATCH (idempotent: existing → returned, not overwritten). */
  generate(
    workspaceId: string,
    businessMatchId: string,
    createdBy: string | null,
  ): Promise<GenerateResult> {
    return this.produce(workspaceId, businessMatchId, createdBy, false);
  }

  /** Regenerate — always creates a NEW version and supersedes older ones. */
  regenerate(
    workspaceId: string,
    draftId: string,
    createdBy: string | null,
  ): Promise<GenerateResult> {
    return this.regenerateFromDraft(workspaceId, draftId, createdBy);
  }

  private async regenerateFromDraft(
    workspaceId: string,
    draftId: string,
    createdBy: string | null,
  ): Promise<GenerateResult> {
    this.assertWorkspace(workspaceId);
    const existing = await this.deps.repo.getDraftById(draftId);
    if (!existing || existing.workspaceId !== workspaceId) {
      throw new AiDraftError(AiDraftErrorCode.DRAFT_NOT_FOUND, 'Draft not found');
    }
    return this.produce(workspaceId, existing.businessMatchId, createdBy, true);
  }

  private async produce(
    workspaceId: string,
    businessMatchId: string,
    createdBy: string | null,
    isRegenerate: boolean,
  ): Promise<GenerateResult> {
    this.assertWorkspace(workspaceId);

    const match = await this.deps.repo.getMatchById(businessMatchId);
    if (!match || match.workspaceId !== workspaceId) {
      throw new AiDraftError(AiDraftErrorCode.MATCH_NOT_FOUND, 'Business match not found');
    }
    if (match.decision !== 'MATCH') {
      throw new AiDraftError(
        AiDraftErrorCode.NOT_A_MATCH,
        'Only MATCH decisions may generate drafts',
      );
    }

    const priorDrafts = await this.deps.repo.listDraftsForMatch(match.id);
    // Plain generate is idempotent — never overwrite an existing draft.
    if (!isRegenerate && priorDrafts.length > 0) {
      const latest = priorDrafts[priorDrafts.length - 1]!;
      return { draft: latest, created: false };
    }

    const context = await this.assembleContext(workspaceId, match);

    // Response Strategy (Business MATCH + NO_PROPERTY_MATCH). A response POLICY:
    // it decides WHETHER/HOW to draft, never turns a mismatch into a MATCH and
    // never adds Property facts (the context already has selectedProperty=null).
    let forceHumanReview = false;
    if (context.noPropertyMatch) {
      const pol = await this.deps.repo.getBusinessPolicies(match.businessId);
      const strategy = pol?.noPropertyMatchStrategy ?? DEFAULT_NO_PROPERTY_MATCH_STRATEGY;
      if (strategy === 'DO_NOT_RESPOND') {
        // Stop before drafting; nothing is created. The persisted NO_PROPERTY_MATCH
        // record already explains why to the operator.
        return { draft: null, created: false, skipped: 'DO_NOT_RESPOND' };
      }
      // DRAFT_BUSINESS_ONLY proceeds normally; HUMAN_REVIEW forces review below.
      forceHumanReview = strategy === 'HUMAN_REVIEW';
    }

    const maxLength = this.deps.env.AI_DRAFT_MAX_LENGTH;
    const prompt = buildDraftPrompt(context, maxLength);

    // Call the provider; a failure is recorded (never throws out of the pipeline).
    let content: string | null = null;
    let provider = this.deps.env.AI_PROVIDER;
    let model = this.deps.env.AI_MODEL;
    let promptVersion = prompt.promptVersion;
    let providerFailed = false;
    let failureDetail = '';
    try {
      const result = await this.deps.provider.generateDraft({ context, prompt, maxLength });
      content = result.content;
      provider = result.provider;
      model = result.model;
      promptVersion = result.promptVersion;
    } catch (err) {
      providerFailed = true;
      failureDetail = err instanceof Error ? err.message : 'provider error';
    }

    // Policy: a provider failure is a BLOCK; otherwise screen the content.
    const policyResult: DraftPolicyResult = providerFailed
      ? { decision: 'BLOCK', reasons: [{ code: 'PROVIDER_FAILED', detail: failureDetail }] }
      : checkDraft(content ?? '', context, maxLength);

    // BLOCK never yields a ready state; PASS → draft, NEEDS_REVIEW/BLOCK → needs_review.
    // A NO_PROPERTY_MATCH + HUMAN_REVIEW business-only draft is FORCED into review
    // even when the policy check passes (owner asked to see it first).
    const status: AiDraftStatus =
      policyResult.decision === 'PASS' && !forceHumanReview ? 'draft' : 'needs_review';
    const version = priorDrafts.length > 0 ? Math.max(...priorDrafts.map((d) => d.version)) + 1 : 1;

    const draft = await this.deps.repo.createDraft({
      workspaceId,
      businessMatchId: match.id,
      opportunityId: match.opportunityId,
      businessId: match.businessId,
      version,
      status,
      content,
      provider,
      model,
      promptVersion,
      inputSnapshot: context as unknown as Record<string, unknown>,
      policyResult,
      createdBy,
    });

    // Supersede older non-terminal versions.
    for (const prior of priorDrafts) {
      if (prior.status === 'draft' || prior.status === 'needs_review') {
        await this.deps.repo.updateStatus(prior.id, 'superseded');
        await this.deps.repo.createEvent(prior.id, AiDraftEventType.Superseded, {
          supersededByVersion: version,
        });
      }
    }

    // Event trail on the new draft (safe payloads only).
    await this.deps.repo.createEvent(draft.id, AiDraftEventType.GenerationStarted, {
      version,
      provider,
      model,
      promptVersion,
      isRegenerate,
    });
    if (isRegenerate) {
      await this.deps.repo.createEvent(draft.id, AiDraftEventType.Regenerated, { version });
    }
    const reasonCodes = policyResult.reasons.map((r) => r.code);
    if (providerFailed) {
      await this.deps.repo.createEvent(draft.id, AiDraftEventType.GenerationFailed, {
        version,
        reason: 'provider_failed',
      });
    } else if (policyResult.decision === 'PASS') {
      await this.deps.repo.createEvent(draft.id, AiDraftEventType.Generated, { version });
    } else if (policyResult.decision === 'NEEDS_REVIEW') {
      await this.deps.repo.createEvent(draft.id, AiDraftEventType.NeedsReview, {
        version,
        reasonCodes,
      });
    } else {
      await this.deps.repo.createEvent(draft.id, AiDraftEventType.Blocked, {
        version,
        reasonCodes,
      });
    }

    this.deps.logger.info('ai_draft.produced', {
      workspaceId,
      businessMatchId: match.id,
      version,
      status,
      policyDecision: policyResult.decision,
      providerFailed,
    });

    return { draft, created: true };
  }

  private async assembleContext(
    workspaceId: string,
    match: BusinessMatchRecord,
  ): Promise<DraftContext> {
    const [opportunity, business] = await Promise.all([
      this.deps.repo.getOpportunityById(match.opportunityId),
      this.deps.repo.getBusinessById(match.businessId),
    ]);
    if (!opportunity || !business) {
      throw new AiDraftError(AiDraftErrorCode.INVALID_STATE, 'Match references missing records');
    }
    const signal = await this.deps.repo.getSignalById(opportunity.signalId);
    if (!signal) {
      throw new AiDraftError(
        AiDraftErrorCode.INVALID_STATE,
        'Opportunity references missing signal',
      );
    }
    const [group, profile, knowledge, rules, oppEvents, propertyMatch, businessPolicies, contacts] =
      await Promise.all([
        this.deps.repo.getFacebookGroupById(signal.groupId),
        this.deps.repo.getProfileByBusiness(business.id),
        this.deps.repo.listKnowledge(business.id),
        this.deps.repo.listRules(business.id),
        this.deps.repo.listOpportunityEvents(opportunity.id),
        this.deps.repo.getPropertyMatchByBusinessMatch(match.id),
        this.deps.repo.getBusinessPolicies(business.id),
        this.deps.repo.listContactsByBusiness(business.id),
      ]);

    // SPRINT 016B / v2 (M9E) — resolve the recommended Property from the persisted
    // Property match. A MATCH and a NEEDS_CONFIRMATION both feed the recommended
    // Property into the draft; the difference is that NEEDS_CONFIRMATION also
    // carries the list of REQUIRED facts still awaiting confirmation, which the
    // draft phrases as "needs verification" (never as satisfied). A NO_MATCH (or
    // no property stage) keeps the draft strictly business-level.
    const recommendable =
      propertyMatch?.decision === 'MATCH' || propertyMatch?.decision === 'NEEDS_CONFIRMATION';
    let selectedProperty = null;
    if (recommendable && propertyMatch?.propertyId) {
      selectedProperty = await this.deps.repo.getPropertyById(propertyMatch.propertyId);
    }
    // NO_PROPERTY_MATCH only when the Property stage explicitly returned NO_MATCH
    // (unchanged from v1). A null Property stage (no property concept) is NOT a
    // no-property-match; a NEEDS_CONFIRMATION uses its recommended Property.
    const noPropertyMatch = propertyMatch?.decision === 'NO_MATCH';
    const propertyNeedsConfirmation =
      propertyMatch?.decision === 'NEEDS_CONFIRMATION' && selectedProperty != null;
    // The required facts still to confirm — the matcher's `*_UNKNOWN` codes on the
    // recommended result (present only for NEEDS_CONFIRMATION).
    const unconfirmedRequirements = propertyNeedsConfirmation
      ? (propertyMatch?.reasons.reasons ?? []).filter((r) =>
          (r.split(':')[0] ?? '').trim().endsWith('_UNKNOWN'),
        )
      : [];

    const creation = oppEvents.find(
      (e) => e.event === 'OpportunityCreated' || e.event === 'OpportunityRejected',
    );
    const rawReasons = creation?.payload?.reasons;
    const opportunityReasons = Array.isArray(rawReasons)
      ? (rawReasons as unknown[]).filter(
          (r): r is { code: string; passed: boolean } =>
            !!r &&
            typeof r === 'object' &&
            typeof (r as { code: unknown }).code === 'string' &&
            typeof (r as { passed: unknown }).passed === 'boolean',
        )
      : [];

    return buildDraftContext(
      {
        workspaceId,
        match,
        opportunity,
        opportunityReasons,
        signal,
        group,
        business,
        profile,
        knowledge,
        rules,
        selectedProperty,
        businessPolicies,
        contacts,
        noPropertyMatch,
        propertyNeedsConfirmation,
        unconfirmedRequirements,
      },
      {
        maxKnowledgeItems: this.deps.env.AI_CONTEXT_MAX_KNOWLEDGE_ITEMS,
        maxCharacters: this.deps.env.AI_CONTEXT_MAX_CHARACTERS,
      },
    );
  }

  async listDrafts(workspaceId: string, filter?: AiDraftFilter): Promise<AiDraftRecord[]> {
    this.assertWorkspace(workspaceId);
    return this.deps.repo.listDrafts(workspaceId, filter);
  }

  async listForMatch(workspaceId: string, businessMatchId: string): Promise<AiDraftRecord[]> {
    this.assertWorkspace(workspaceId);
    const match = await this.deps.repo.getMatchById(businessMatchId);
    if (!match || match.workspaceId !== workspaceId) {
      throw new AiDraftError(AiDraftErrorCode.MATCH_NOT_FOUND, 'Business match not found');
    }
    return this.deps.repo.listDraftsForMatch(businessMatchId);
  }

  async getDetail(workspaceId: string, draftId: string): Promise<DraftDetail> {
    this.assertWorkspace(workspaceId);
    const draft = await this.deps.repo.getDraftById(draftId);
    if (!draft || draft.workspaceId !== workspaceId) {
      throw new AiDraftError(AiDraftErrorCode.DRAFT_NOT_FOUND, 'Draft not found');
    }
    const [events, match, opportunity, business] = await Promise.all([
      this.deps.repo.listEvents(draft.id),
      this.deps.repo.getMatchById(draft.businessMatchId),
      this.deps.repo.getOpportunityById(draft.opportunityId),
      this.deps.repo.getBusinessById(draft.businessId),
    ]);
    return { draft, events, match, opportunity, business };
  }

  /** Reject a Draft (human decision) — never auto-approves, never posts. */
  async reject(workspaceId: string, draftId: string): Promise<AiDraftRecord> {
    this.assertWorkspace(workspaceId);
    const draft = await this.deps.repo.getDraftById(draftId);
    if (!draft || draft.workspaceId !== workspaceId) {
      throw new AiDraftError(AiDraftErrorCode.DRAFT_NOT_FOUND, 'Draft not found');
    }
    if (draft.status === 'rejected') {
      throw new AiDraftError(AiDraftErrorCode.INVALID_STATE, 'Draft is already rejected');
    }
    const updated = await this.deps.repo.updateStatus(draft.id, 'rejected');
    if (!updated) throw new AiDraftError(AiDraftErrorCode.DRAFT_NOT_FOUND, 'Draft not found');
    await this.deps.repo.createEvent(draft.id, AiDraftEventType.Rejected, {
      fromStatus: draft.status,
    });
    return updated;
  }
}
