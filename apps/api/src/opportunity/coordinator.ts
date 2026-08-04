import type { ApiEnv } from '../lib/env';
import type { Logger } from '../lib/logger';
import type {
  OpportunityRecord,
  OpportunityEventRecord,
  OpportunityStatistics,
  OpportunityStatus,
  OpportunityDecision,
  SignalRecord,
} from '../store/types';
import type { OpportunityRepository } from './repository';
import { classifySignal, CLASSIFIER_VERSION } from './classifier';
import { OpportunityError, OpportunityErrorCode } from './errors';

/** Opportunity lifecycle event names. */
export const OpportunityEventType = {
  OpportunityCreated: 'OpportunityCreated',
  OpportunityRejected: 'OpportunityRejected',
  OpportunityArchived: 'OpportunityArchived',
  // Pilot 0 fix: a deterministic re-evaluation changed the decision. The prior
  // decision is preserved in the payload and earlier events are never rewritten.
  OpportunityReclassified: 'OpportunityReclassified',
} as const;

export interface ReclassifyRunSummary {
  processed: number;
  changed: number;
  accepted: number;
  rejected: number;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const VALID_STATUSES: OpportunityStatus[] = ['NEW', 'READY', 'ARCHIVED'];

export interface ClassifyRunSummary {
  processed: number;
  accepted: number;
  rejected: number;
}

export interface OpportunityDetail {
  opportunity: OpportunityRecord;
  signal: SignalRecord | null;
  events: OpportunityEventRecord[];
}

export interface OpportunityCoordinatorDeps {
  repo: OpportunityRepository;
  env: ApiEnv;
  logger: Logger;
}

/**
 * OpportunityCoordinator (SPRINT 007) — runs the pipeline:
 *   Signal → Classifier → Repository
 *
 * State machine: ACCEPT → Opportunity → READY; REJECT → ARCHIVED. It knows
 * nothing about Business, AI, Telegram, comments, or matching.
 */
export class OpportunityCoordinator {
  private readonly active = new Set<string>();

  constructor(private readonly deps: OpportunityCoordinatorDeps) {}

  private assertWorkspace(workspaceId: string): void {
    if (!UUID_RE.test(workspaceId)) {
      throw new OpportunityError(OpportunityErrorCode.INVALID_WORKSPACE, 'Invalid workspace');
    }
  }

  /** Classify all NEW (unclassified) Signals in the workspace. */
  async classifyAll(workspaceId: string): Promise<ClassifyRunSummary> {
    this.assertWorkspace(workspaceId);
    if (this.active.has(workspaceId)) {
      throw new OpportunityError(
        OpportunityErrorCode.ALREADY_RUNNING,
        'A classification run is already in progress',
      );
    }
    this.active.add(workspaceId);
    try {
      const signals = await this.deps.repo.listUnclassifiedSignals(workspaceId);
      let accepted = 0;
      let rejected = 0;

      for (const signal of signals) {
        const isDuplicate = await this.deps.repo.isDuplicateHash(
          workspaceId,
          signal.normalizedHash,
        );
        const result = classifySignal(
          { message: signal.message, authorName: signal.authorName, postUrl: signal.postUrl },
          { minTextLength: this.deps.env.OPPORTUNITY_MIN_TEXT_LENGTH, isDuplicate },
        );
        const status: OpportunityStatus = result.decision === 'ACCEPT' ? 'READY' : 'ARCHIVED';
        const opportunity = await this.deps.repo.createOpportunity({
          workspaceId,
          signalId: signal.id,
          decision: result.decision,
          status,
          classifierVersion: CLASSIFIER_VERSION,
        });
        if (result.decision === 'ACCEPT') {
          await this.deps.repo.createEvent(
            opportunity.id,
            OpportunityEventType.OpportunityCreated,
            {
              decision: result.decision,
              reasons: result.reasons,
            },
          );
          accepted += 1;
        } else {
          await this.deps.repo.createEvent(
            opportunity.id,
            OpportunityEventType.OpportunityRejected,
            {
              decision: result.decision,
              reasons: result.reasons,
            },
          );
          rejected += 1;
        }
      }

      this.deps.logger.info('opportunity.classify_run', {
        workspaceId,
        processed: signals.length,
        accepted,
        rejected,
      });
      return { processed: signals.length, accepted, rejected };
    } finally {
      this.active.delete(workspaceId);
    }
  }

  /**
   * Re-evaluate EXISTING Opportunities with the current classifier (Pilot 0
   * fix). One Opportunity per Signal is preserved — a changed decision updates
   * that Opportunity in place and records an OpportunityReclassified event that
   * retains the prior decision. Earlier events are never rewritten. Idempotent:
   * running again with no rule change makes no further changes.
   */
  async reclassifyAll(workspaceId: string): Promise<ReclassifyRunSummary> {
    this.assertWorkspace(workspaceId);
    const opps = await this.deps.repo.listOpportunities(workspaceId, { limit: 100000 });
    let changed = 0;
    let accepted = 0;
    let rejected = 0;
    for (const opp of opps) {
      const signal = await this.deps.repo.getSignalById(opp.signalId);
      if (!signal) continue;
      const result = classifySignal(
        { message: signal.message, authorName: signal.authorName, postUrl: signal.postUrl },
        { minTextLength: this.deps.env.OPPORTUNITY_MIN_TEXT_LENGTH, isDuplicate: false },
      );
      if (result.decision === 'ACCEPT') accepted += 1;
      else rejected += 1;

      const decisionChanged = result.decision !== opp.decision;
      const versionChanged = opp.classifierVersion !== CLASSIFIER_VERSION;
      if (!decisionChanged && !versionChanged) continue;

      const status: OpportunityStatus = result.decision === 'ACCEPT' ? 'READY' : 'ARCHIVED';
      await this.deps.repo.updateDecision(opp.id, {
        decision: result.decision,
        status,
        classifierVersion: CLASSIFIER_VERSION,
      });
      await this.deps.repo.createEvent(opp.id, OpportunityEventType.OpportunityReclassified, {
        from: opp.decision,
        to: result.decision,
        fromVersion: opp.classifierVersion,
        toVersion: CLASSIFIER_VERSION,
        reasons: result.reasons,
      });
      if (decisionChanged) changed += 1;
    }
    this.deps.logger.info('opportunity.reclassify_run', {
      workspaceId,
      processed: opps.length,
      changed,
      accepted,
      rejected,
    });
    return { processed: opps.length, changed, accepted, rejected };
  }

  getStatistics(workspaceId: string): Promise<OpportunityStatistics> {
    this.assertWorkspace(workspaceId);
    return this.deps.repo.statistics(workspaceId);
  }

  async listOpportunities(
    workspaceId: string,
    filter?: { status?: OpportunityStatus; decision?: OpportunityDecision },
  ): Promise<OpportunityRecord[]> {
    this.assertWorkspace(workspaceId);
    return this.deps.repo.listOpportunities(workspaceId, filter);
  }

  /** Load an owned opportunity with its signal and events (404 if not owned). */
  async getDetail(workspaceId: string, id: string): Promise<OpportunityDetail> {
    this.assertWorkspace(workspaceId);
    const opportunity = await this.deps.repo.getOpportunityById(id);
    if (!opportunity || opportunity.workspaceId !== workspaceId) {
      throw new OpportunityError(
        OpportunityErrorCode.OPPORTUNITY_NOT_FOUND,
        'Opportunity not found',
      );
    }
    const [signal, events] = await Promise.all([
      this.deps.repo.getSignalById(opportunity.signalId),
      this.deps.repo.listEvents(opportunity.id),
    ]);
    return { opportunity, signal, events };
  }

  /** Transition an owned opportunity's status; archive emits an event. */
  async updateStatus(workspaceId: string, id: string, status: string): Promise<OpportunityRecord> {
    this.assertWorkspace(workspaceId);
    if (!VALID_STATUSES.includes(status as OpportunityStatus)) {
      throw new OpportunityError(OpportunityErrorCode.INVALID_STATUS, 'Invalid status');
    }
    const existing = await this.deps.repo.getOpportunityById(id);
    if (!existing || existing.workspaceId !== workspaceId) {
      throw new OpportunityError(
        OpportunityErrorCode.OPPORTUNITY_NOT_FOUND,
        'Opportunity not found',
      );
    }
    const next = status as OpportunityStatus;
    const updated = await this.deps.repo.updateStatus(id, next);
    if (!updated) {
      throw new OpportunityError(
        OpportunityErrorCode.OPPORTUNITY_NOT_FOUND,
        'Opportunity not found',
      );
    }
    if (next === 'ARCHIVED' && existing.status !== 'ARCHIVED') {
      await this.deps.repo.createEvent(id, OpportunityEventType.OpportunityArchived, {
        from: existing.status,
        to: next,
      });
    }
    return updated;
  }
}
