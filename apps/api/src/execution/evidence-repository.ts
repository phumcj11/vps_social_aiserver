import type { Store, ExecutionEvidenceRecord, EvidenceType } from '../store/types';
import { newId } from '../lib/tokens';

/**
 * ExecutionEvidenceRepository (SPRINT 012).
 *
 * Append-only trail of what each execution attempt OBSERVED — pre-submit
 * snapshots, the typed-content read-back, the post-submit screenshot, the
 * comment identity, verification snapshots, failures. Evidence stores an opaque
 * storage KEY (never an absolute path) and a content hash, never secrets.
 *
 * A screenshot alone is never proof of success — evidence is corroborating, and
 * the verified-success decision lives in the verification service.
 */
export class ExecutionEvidenceRepository {
  constructor(private readonly store: Store) {}

  record(input: {
    workspaceId: string;
    actionJobId: string;
    executionSessionId: string;
    evidenceType: EvidenceType;
    storageKey?: string | null;
    evidenceHash?: string | null;
    facebookCommentId?: string | null;
    observedContent?: string | null;
    observedAuthor?: string | null;
    observedPostUrl?: string | null;
    observedAt?: Date | null;
    metadata?: Record<string, unknown> | null;
  }): Promise<ExecutionEvidenceRecord> {
    return this.store.createExecutionEvidence({
      id: newId(),
      workspaceId: input.workspaceId,
      actionJobId: input.actionJobId,
      executionSessionId: input.executionSessionId,
      evidenceType: input.evidenceType,
      storageKey: input.storageKey ?? null,
      evidenceHash: input.evidenceHash ?? null,
      facebookCommentId: input.facebookCommentId ?? null,
      observedContent: input.observedContent ?? null,
      observedAuthor: input.observedAuthor ?? null,
      observedPostUrl: input.observedPostUrl ?? null,
      observedAt: input.observedAt ?? null,
      metadata: input.metadata ?? null,
    });
  }

  listForSession(sessionId: string): Promise<ExecutionEvidenceRecord[]> {
    return this.store.listExecutionEvidenceForSession(sessionId);
  }
}
