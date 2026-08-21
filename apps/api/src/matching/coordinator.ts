import type { Logger } from '../lib/logger';
import type {
  BusinessMatchRecord,
  BusinessMatchFilter,
  BusinessRecord,
  OpportunityRecord,
  PropertyMatchRecord,
  PropertyMatchFilter,
  MatchingFunnelCounts,
} from '../store/types';
import type { Property } from '../business-property/types';
import type { MatchRepository } from './repository';
import { selectCandidates } from './candidate-generator';
import { matchBusiness, MATCHER_VERSION } from './matcher';
import {
  parsePropertyRequirement,
  selectBestProperty,
  PROPERTY_MATCHER_VERSION,
} from './property-selection';
import { MatchingError, MatchingErrorCode } from './errors';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface MatchRunSummary {
  processedOpportunities: number;
  candidates: number;
  matches: number;
  noMatches: number;
  skipped: number;
  // SPRINT 016B — Property stage (runs after each Business MATCH).
  propertyCandidates: number;
  propertyMatches: number;
  propertyNoMatches: number;
  propertySkipped: number;
}

/** A Business Match plus the (denormalised) business name, for API/UI. */
export interface EnrichedMatch {
  match: BusinessMatchRecord;
  businessName: string | null;
}

export interface MatchDetail {
  match: BusinessMatchRecord;
  business: BusinessRecord | null;
  opportunity: OpportunityRecord | null;
}

/** A Property Match plus the (denormalised) property + business name, for API/UI. */
export interface EnrichedPropertyMatch {
  match: PropertyMatchRecord;
  propertyName: string | null;
  businessName: string | null;
}

export interface PropertyMatchDetail {
  match: PropertyMatchRecord;
  property: Property | null;
  business: BusinessRecord | null;
  opportunity: OpportunityRecord | null;
}

export interface MatchingCoordinatorDeps {
  repo: MatchRepository;
  logger: Logger;
}

/**
 * MatchingCoordinator (SPRINT 008) — runs the pipeline:
 *   Opportunity → Candidate Generator → Business Matcher → Business Match
 *
 * Deterministic. It reads accepted Opportunities, generates candidate
 * businesses (those assigned to the Signal's group), runs the pure matcher
 * against each candidate's active rules, and stores a Business Match. It knows
 * nothing about AI, Telegram, comments, or Facebook writes. One (Opportunity,
 * Business) pair yields at most one match (idempotent — existing pairs skipped).
 */
export class MatchingCoordinator {
  private readonly active = new Set<string>();

  constructor(private readonly deps: MatchingCoordinatorDeps) {}

  private assertWorkspace(workspaceId: string): void {
    if (!UUID_RE.test(workspaceId)) {
      throw new MatchingError(MatchingErrorCode.INVALID_WORKSPACE, 'Invalid workspace');
    }
  }

  /** Run deterministic matching across all accepted Opportunities. */
  async runMatching(workspaceId: string): Promise<MatchRunSummary> {
    this.assertWorkspace(workspaceId);
    if (this.active.has(workspaceId)) {
      throw new MatchingError(
        MatchingErrorCode.ALREADY_RUNNING,
        'A matching run is already in progress',
      );
    }
    this.active.add(workspaceId);
    try {
      const opportunities = await this.deps.repo.listAcceptedOpportunities(workspaceId);
      const summary: MatchRunSummary = {
        processedOpportunities: 0,
        candidates: 0,
        matches: 0,
        noMatches: 0,
        skipped: 0,
        propertyCandidates: 0,
        propertyMatches: 0,
        propertyNoMatches: 0,
        propertySkipped: 0,
      };

      for (const opportunity of opportunities) {
        summary.processedOpportunities += 1;
        const signal = await this.deps.repo.getSignalById(opportunity.signalId);
        if (!signal) continue;

        const pool = await this.deps.repo.listBusinessesForGroup(signal.groupId);
        const candidates = selectCandidates(
          pool.map((b) => ({ id: b.id, name: b.name, status: b.status })),
        );

        for (const business of candidates) {
          summary.candidates += 1;
          if (await this.deps.repo.matchExists(opportunity.id, business.id)) {
            summary.skipped += 1;
            continue;
          }
          const rules = await this.deps.repo.listActiveRules(business.id);
          const result = matchBusiness({ message: signal.message }, rules);
          const businessMatch = await this.deps.repo.createMatch({
            workspaceId,
            businessId: business.id,
            opportunityId: opportunity.id,
            decision: result.decision,
            reasons: result.reasons,
            matcherVersion: MATCHER_VERSION,
          });
          if (result.decision === 'MATCH') {
            summary.matches += 1;
            // Property stage — only for a Business MATCH.
            await this.runPropertyStage(
              workspaceId,
              opportunity.id,
              business.id,
              businessMatch.id,
              signal.message,
              summary,
            );
          } else {
            summary.noMatches += 1;
          }
        }
      }

      this.deps.logger.info('matching.run', { workspaceId, ...summary });
      return summary;
    } finally {
      this.active.delete(workspaceId);
    }
  }

  /**
   * Property stage (SPRINT 016B): after a Business MATCH, evaluate the Business's
   * own active Properties and persist ONE deterministic result — the selected
   * Property (MATCH) or a single NO_PROPERTY_MATCH row. Idempotent per Business
   * Match. Never fabricates a Property; never touches another Business's data.
   */
  private async runPropertyStage(
    workspaceId: string,
    opportunityId: string,
    businessId: string,
    businessMatchId: string,
    message: string | null,
    summary: MatchRunSummary,
  ): Promise<void> {
    if (await this.deps.repo.propertyMatchExists(businessMatchId)) {
      summary.propertySkipped += 1;
      return;
    }
    const properties = await this.deps.repo.listActivePropertiesForBusiness(
      businessId,
      workspaceId,
    );
    const knownAreas = properties
      .flatMap((p) => [p.location.area, p.location.district, p.location.province])
      .filter((a): a is string => !!a && a.trim().length > 0);
    const requirement = parsePropertyRequirement(message, knownAreas);
    const selection = selectBestProperty(properties, requirement);
    summary.propertyCandidates += selection.candidatesEvaluated;

    const rejected = selection.evaluations
      .filter((e) => e !== selection.selected)
      .map((e) => ({
        propertyId: e.property.id,
        propertyName: e.property.name,
        decision: e.decision,
        reasons: e.reasons,
      }));

    await this.deps.repo.createPropertyMatch({
      workspaceId,
      opportunityId,
      businessMatchId,
      businessId,
      propertyId: selection.selected?.property.id ?? null,
      decision: selection.decision,
      reasons: {
        reasons: selection.reasons,
        rejected,
        requirement: requirement as unknown as Record<string, unknown>,
      },
      matcherVersion: PROPERTY_MATCHER_VERSION,
      candidatesEvaluated: selection.candidatesEvaluated,
    });
    if (selection.decision === 'MATCH') summary.propertyMatches += 1;
    else summary.propertyNoMatches += 1;
  }

  /** List matches (optionally filtered), enriched with business names. */
  async listMatches(workspaceId: string, filter?: BusinessMatchFilter): Promise<EnrichedMatch[]> {
    this.assertWorkspace(workspaceId);
    const matches = await this.deps.repo.listMatches(workspaceId, filter);
    const names = new Map<string, string | null>();
    const enriched: EnrichedMatch[] = [];
    for (const match of matches) {
      if (!names.has(match.businessId)) {
        const b = await this.deps.repo.getBusinessById(match.businessId);
        names.set(match.businessId, b ? b.name : null);
      }
      enriched.push({ match, businessName: names.get(match.businessId) ?? null });
    }
    return enriched;
  }

  /** Load one owned Business Match with its business and opportunity (404 if not owned). */
  async getDetail(workspaceId: string, id: string): Promise<MatchDetail> {
    this.assertWorkspace(workspaceId);
    const match = await this.deps.repo.getMatchById(id);
    if (!match || match.workspaceId !== workspaceId) {
      throw new MatchingError(MatchingErrorCode.MATCH_NOT_FOUND, 'Business match not found');
    }
    const [business, opportunity] = await Promise.all([
      this.deps.repo.getBusinessById(match.businessId),
      this.deps.repo.getOpportunityById(match.opportunityId),
    ]);
    return { match, business, opportunity };
  }

  // ── Property matches (SPRINT 016B) ─────────────────────────────────────────

  /** List Property matches (optionally filtered), enriched with names. */
  async listPropertyMatches(
    workspaceId: string,
    filter?: PropertyMatchFilter,
  ): Promise<EnrichedPropertyMatch[]> {
    this.assertWorkspace(workspaceId);
    const matches = await this.deps.repo.listPropertyMatches(workspaceId, filter);
    const propertyNames = new Map<string, string | null>();
    const businessNames = new Map<string, string | null>();
    const out: EnrichedPropertyMatch[] = [];
    for (const match of matches) {
      if (match.propertyId && !propertyNames.has(match.propertyId)) {
        const p = await this.deps.repo.getPropertyById(match.propertyId);
        propertyNames.set(match.propertyId, p ? p.name : null);
      }
      if (!businessNames.has(match.businessId)) {
        const b = await this.deps.repo.getBusinessById(match.businessId);
        businessNames.set(match.businessId, b ? b.name : null);
      }
      out.push({
        match,
        propertyName: match.propertyId ? (propertyNames.get(match.propertyId) ?? null) : null,
        businessName: businessNames.get(match.businessId) ?? null,
      });
    }
    return out;
  }

  /** Load one owned Property Match with its property, business, and opportunity. */
  async getPropertyMatchDetail(workspaceId: string, id: string): Promise<PropertyMatchDetail> {
    this.assertWorkspace(workspaceId);
    const match = await this.deps.repo.getPropertyMatchById(id);
    if (!match || match.workspaceId !== workspaceId) {
      throw new MatchingError(MatchingErrorCode.MATCH_NOT_FOUND, 'Property match not found');
    }
    const [property, business, opportunity] = await Promise.all([
      match.propertyId ? this.deps.repo.getPropertyById(match.propertyId) : Promise.resolve(null),
      this.deps.repo.getBusinessById(match.businessId),
      this.deps.repo.getOpportunityById(match.opportunityId),
    ]);
    return { match, property, business, opportunity };
  }

  /** The Property-match funnel aggregate for operations. */
  async getFunnel(workspaceId: string): Promise<MatchingFunnelCounts> {
    this.assertWorkspace(workspaceId);
    return this.deps.repo.getFunnelCounts(workspaceId);
  }
}
