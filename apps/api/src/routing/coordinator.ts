import type { Logger } from '../lib/logger';
import { matchBusiness, MATCHER_VERSION } from '../matching/matcher';
import type { RoutingRepository } from './repository';
import { ProjectionService, type ProjectionResult } from './projection';
import { RoutingError, RoutingErrorCode } from './errors';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface RoutingCoordinatorDeps {
  repo: RoutingRepository;
  logger: Logger;
}

export interface RouteRunSummary {
  /** Enabled subscriptions evaluated for the source Group. */
  subscriptionsEvaluated: number;
  /** New Business Matches created in customer workspaces (MATCH). */
  matches: number;
  /** Subscribed businesses whose rules did not match (no row created). */
  noMatches: number;
  /** Businesses already routed for this Opportunity (idempotent skip). */
  skipped: number;
  /** Customer-workspace projections created (one per new customer workspace). */
  projectionsCreated: number;
}

/**
 * RoutingCoordinator (MODEL C) — fans a central source Opportunity out to the
 * customer Businesses subscribed to its source Group.
 *
 * The source Opportunity/Signal live in the SYSTEM source tenant and remain the
 * single source-of-truth / audit record. For each subscribed Business the
 * existing deterministic `matchBusiness` runs; on MATCH a Business Match is
 * created IN THE CUSTOMER'S OWN WORKSPACE (`workspaceId = business.workspaceId`)
 * referencing the central Opportunity as an audit-only link. Nothing is copied
 * into the customer workspace beyond that Match, and NO Facebook session/browser
 * data is ever read. Idempotency reuses the existing
 * UNIQUE(opportunity_id, business_id) on business_matches.
 */
export class RoutingCoordinator {
  private readonly projection: ProjectionService;

  constructor(private readonly deps: RoutingCoordinatorDeps) {
    this.projection = new ProjectionService(deps.repo);
  }

  private assertWorkspace(workspaceId: string): void {
    if (!UUID_RE.test(workspaceId)) {
      throw new RoutingError(RoutingErrorCode.INVALID_WORKSPACE, 'Invalid source workspace');
    }
  }

  /**
   * Route ONE accepted central Opportunity to its subscribed customer Businesses.
   * Safe to call repeatedly: already-routed businesses are skipped.
   */
  async routeOpportunity(
    sourceWorkspaceId: string,
    opportunityId: string,
  ): Promise<RouteRunSummary> {
    this.assertWorkspace(sourceWorkspaceId);

    const opportunity = await this.deps.repo.getOpportunityById(opportunityId);
    if (!opportunity) {
      throw new RoutingError(RoutingErrorCode.OPPORTUNITY_NOT_FOUND, 'Opportunity not found');
    }
    // The Opportunity MUST belong to the source tenant we were asked to route
    // for — never route another workspace's Opportunity.
    if (opportunity.workspaceId !== sourceWorkspaceId) {
      throw new RoutingError(
        RoutingErrorCode.NOT_SOURCE_OPPORTUNITY,
        'Opportunity does not belong to the source workspace',
      );
    }

    const summary: RouteRunSummary = {
      subscriptionsEvaluated: 0,
      matches: 0,
      noMatches: 0,
      skipped: 0,
      projectionsCreated: 0,
    };

    // Only accepted Opportunities produce customer Matches. A non-accepted
    // Opportunity routes to nothing (safe no-op).
    if (opportunity.decision !== 'ACCEPT') {
      return summary;
    }

    const signal = await this.deps.repo.getSignalById(opportunity.signalId);
    if (!signal) {
      throw new RoutingError(
        RoutingErrorCode.SIGNAL_NOT_FOUND,
        'Opportunity references missing signal',
      );
    }

    const subscriptions = await this.deps.repo.listEnabledSubscriptionsForSourceGroup(
      signal.groupId,
    );

    // One customer-safe projection per customer workspace, reused across every
    // matching Business in that workspace (A1 + A2 → one projected Opportunity).
    const projectionByWorkspace = new Map<string, ProjectionResult>();

    for (const sub of subscriptions) {
      summary.subscriptionsEvaluated += 1;
      const business = await this.deps.repo.getBusinessById(sub.businessId);
      // A subscription to a missing/removed business routes to nothing.
      if (!business) continue;

      const rules = await this.deps.repo.listActiveRules(business.id);
      const result = matchBusiness({ message: signal.message }, rules);

      // NO_MATCH → do nothing (no projection, no customer-workspace row). Only a
      // MATCH projects the lead + creates a Business Match in the CUSTOMER space.
      if (result.decision !== 'MATCH') {
        summary.noMatches += 1;
        continue;
      }

      // Get-or-create the customer-safe projection for this Business's workspace.
      let projection = projectionByWorkspace.get(business.workspaceId);
      if (!projection) {
        projection = await this.projection.projectOpportunityForWorkspace(
          sourceWorkspaceId,
          opportunity.id,
          business.workspaceId,
        );
        projectionByWorkspace.set(business.workspaceId, projection);
        if (projection.created) summary.projectionsCreated += 1;
      }
      const projectedOpportunityId = projection.projectedOpportunity.id;

      // Idempotency: this Business was already routed (Match on the PROJECTED
      // Opportunity + business). Reuses the existing UNIQUE(opportunity_id,
      // business_id) on business_matches.
      if (await this.deps.repo.matchExists(projectedOpportunityId, business.id)) {
        summary.skipped += 1;
        continue;
      }

      await this.deps.repo.createMatch({
        workspaceId: business.workspaceId, // CUSTOMER workspace.
        businessId: business.id,
        // The CUSTOMER-workspace projected Opportunity — so match+opportunity+
        // signal+business all share one workspace and buildDraftContext passes.
        opportunityId: projectedOpportunityId,
        decision: result.decision,
        reasons: result.reasons,
        matcherVersion: MATCHER_VERSION,
      });
      summary.matches += 1;
    }

    this.deps.logger.info('routing.route_opportunity', {
      sourceWorkspaceId,
      opportunityId,
      subscriptionsEvaluated: summary.subscriptionsEvaluated,
      matches: summary.matches,
      noMatches: summary.noMatches,
      skipped: summary.skipped,
    });
    return summary;
  }
}
