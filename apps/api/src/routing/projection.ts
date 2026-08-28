import { newId } from '../lib/tokens';
import { RoutingError, RoutingErrorCode } from './errors';
import type { RoutingRepository } from './repository';
import type { OpportunityRecord, SignalRecord } from '../store/types';

export interface ProjectionResult {
  projectedSignal: SignalRecord;
  projectedOpportunity: OpportunityRecord;
  /** true when this call created the projection; false when it reused an existing one. */
  created: boolean;
}

/**
 * ProjectionService (MODEL C, M2b) — creates an IMMUTABLE, customer-safe
 * projection of a central source Opportunity (and its Signal) into a customer
 * workspace so the existing single-workspace pipeline (buildDraftContext guard
 * included) runs UNCHANGED.
 *
 * SECURITY: only approved, customer-safe lead facts are copied — post identity,
 * group reference, post URL, customer-visible text, author display name, the
 * observed timestamp, and the classifier reasons. NO Facebook account id,
 * cookie, browser-profile path, session metadata, or scanner token is ever read
 * or copied (those live only on disk / in the source facebook_accounts row,
 * neither of which this service touches). The projected Opportunity keeps the
 * source Opportunity id ONLY as a server/operator audit pointer.
 *
 * Idempotent per (source Opportunity, customer workspace): repeated calls — and
 * multiple matching Businesses in the SAME workspace — reuse the one projection.
 */
export class ProjectionService {
  constructor(private readonly repo: RoutingRepository) {}

  async projectOpportunityForWorkspace(
    sourceWorkspaceId: string,
    sourceOpportunityId: string,
    targetWorkspaceId: string,
  ): Promise<ProjectionResult> {
    // Reuse an existing projection (idempotency) — this is the common path when
    // a second Business in the same workspace matches the same Opportunity.
    const existing = await this.repo.getProjectedOpportunity(
      sourceOpportunityId,
      targetWorkspaceId,
    );
    if (existing) {
      const signal = await this.repo.getSignalById(existing.signalId);
      if (!signal) {
        throw new RoutingError(
          RoutingErrorCode.SIGNAL_NOT_FOUND,
          'Projected opportunity references missing signal',
        );
      }
      return { projectedSignal: signal, projectedOpportunity: existing, created: false };
    }

    // Validate the source records (must belong to the source tenant).
    const sourceOpp = await this.repo.getOpportunityById(sourceOpportunityId);
    if (!sourceOpp || sourceOpp.workspaceId !== sourceWorkspaceId) {
      throw new RoutingError(
        RoutingErrorCode.NOT_SOURCE_OPPORTUNITY,
        'Source opportunity not found in the source workspace',
      );
    }
    const sourceSignal = await this.repo.getSignalById(sourceOpp.signalId);
    if (!sourceSignal) {
      throw new RoutingError(
        RoutingErrorCode.SIGNAL_NOT_FOUND,
        'Source opportunity references missing signal',
      );
    }

    // Project ONLY customer-safe lead facts into the target workspace. The
    // group is referenced by id (audit only) — never re-owned or duplicated;
    // buildDraftContext reads only its name/url, so no group row is copied.
    const projectedSignal = await this.repo.createSignal({
      id: newId(),
      workspaceId: targetWorkspaceId,
      groupId: sourceSignal.groupId,
      facebookPostId: sourceSignal.facebookPostId,
      postUrl: sourceSignal.postUrl,
      authorName: sourceSignal.authorName,
      authorProfile: sourceSignal.authorProfile,
      message: sourceSignal.message,
      mediaUrls: [...sourceSignal.mediaUrls],
      createdTime: sourceSignal.createdTime,
      normalizedHash: sourceSignal.normalizedHash,
    });

    const projectedOpportunity = await this.repo.createOpportunity({
      id: newId(),
      workspaceId: targetWorkspaceId,
      signalId: projectedSignal.id,
      decision: sourceOpp.decision,
      status: sourceOpp.status,
      classifierVersion: sourceOpp.classifierVersion,
      sourceOpportunityId: sourceOpp.id, // audit-only linkage.
    });

    // Carry the classifier reasons forward so the customer Review can explain
    // "why" — copied from the source OpportunityCreated event's payload.
    const sourceEvents = await this.repo.listOpportunityEvents(sourceOpp.id);
    const creation = sourceEvents.find(
      (e) => e.event === 'OpportunityCreated' || e.event === 'OpportunityRejected',
    );
    if (creation) {
      await this.repo.createOpportunityEvent({
        id: newId(),
        opportunityId: projectedOpportunity.id,
        event: creation.event,
        payload: creation.payload,
      });
    }

    return { projectedSignal, projectedOpportunity, created: true };
  }
}
