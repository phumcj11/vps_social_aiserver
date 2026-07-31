import type { Logger } from '../lib/logger';
import type {
  BusinessMatchRecord,
  BusinessMatchFilter,
  BusinessRecord,
  OpportunityRecord,
} from '../store/types';
import type { MatchRepository } from './repository';
import { selectCandidates } from './candidate-generator';
import { matchBusiness, MATCHER_VERSION } from './matcher';
import { MatchingError, MatchingErrorCode } from './errors';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface MatchRunSummary {
  processedOpportunities: number;
  candidates: number;
  matches: number;
  noMatches: number;
  skipped: number;
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
          await this.deps.repo.createMatch({
            workspaceId,
            businessId: business.id,
            opportunityId: opportunity.id,
            decision: result.decision,
            reasons: result.reasons,
            matcherVersion: MATCHER_VERSION,
          });
          if (result.decision === 'MATCH') summary.matches += 1;
          else summary.noMatches += 1;
        }
      }

      this.deps.logger.info('matching.run', { workspaceId, ...summary });
      return summary;
    } finally {
      this.active.delete(workspaceId);
    }
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
}
