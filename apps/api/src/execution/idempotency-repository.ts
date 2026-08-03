import type { Store, IdempotencyRecord, IdempotencyStatus, ActionType } from '../store/types';
import { newId } from '../lib/tokens';
import { ExecutionError, ExecutionErrorCode } from './errors';

/**
 * Deterministic idempotency key for the identity tuple
 * (workspace, business, target post, action type). Kept in one place so the
 * "reserve" write and the "look up live" read always agree.
 */
export function idempotencyKey(input: {
  workspaceId: string;
  businessId: string;
  targetPostKey: string;
  actionType: ActionType;
}): string {
  return `${input.workspaceId}:${input.businessId}:${input.targetPostKey}:${input.actionType}`;
}

/**
 * ActionIdempotencyRepository (SPRINT 012).
 *
 * Database-level guard (Architecture Review CRITICAL C1) against duplicate
 * successful comments on the same post. A `reserved` record holds a live
 * `idem_key` (unique index); it advances to `submitted` → `verified`, or is
 * `released` (key → NULL) on ambiguous/failed so a deliberate re-attempt is
 * possible. Two concurrent attempts for the same identity cannot both reserve —
 * the second hits the unique index.
 */
export class ActionIdempotencyRepository {
  constructor(private readonly store: Store) {}

  /** Find the current LIVE reservation for an identity tuple (if any). */
  getLive(input: {
    workspaceId: string;
    businessId: string;
    targetPostKey: string;
    actionType: ActionType;
  }): Promise<IdempotencyRecord | null> {
    return this.store.getIdempotencyRecord(
      input.workspaceId,
      input.businessId,
      input.targetPostKey,
      input.actionType,
    );
  }

  /**
   * Reserve the identity for an attempt. Throws IDEMPOTENCY_CONFLICT if a live
   * reservation already exists (the DB unique index is the source of truth).
   */
  async reserve(input: {
    workspaceId: string;
    businessId: string;
    targetPostKey: string;
    actionType: ActionType;
    actionJobId: string;
    executionSessionId: string | null;
  }): Promise<IdempotencyRecord> {
    try {
      return await this.store.createIdempotencyRecord({
        id: newId(),
        workspaceId: input.workspaceId,
        businessId: input.businessId,
        targetPostKey: input.targetPostKey,
        actionType: input.actionType,
        actionJobId: input.actionJobId,
        executionSessionId: input.executionSessionId,
        idemKey: idempotencyKey(input),
      });
    } catch (err) {
      throw new ExecutionError(
        ExecutionErrorCode.IDEMPOTENCY_CONFLICT,
        `A live idempotency reservation already exists for this post: ${(err as Error).message}`,
      );
    }
  }

  markSubmitted(id: string, facebookCommentId: string | null): Promise<IdempotencyRecord | null> {
    return this.store.updateIdempotencyRecord(id, { status: 'submitted', facebookCommentId });
  }

  /** Terminal success — keeps the live key so it permanently blocks duplicates. */
  markVerified(id: string, facebookCommentId: string | null): Promise<IdempotencyRecord | null> {
    return this.store.updateIdempotencyRecord(id, { status: 'verified', facebookCommentId });
  }

  /** Ambiguous outcome — record it but keep the key live pending human recovery. */
  markAmbiguous(id: string): Promise<IdempotencyRecord | null> {
    return this.store.updateIdempotencyRecord(id, { status: 'ambiguous' });
  }

  /**
   * Release the reservation (key → NULL) so a deliberate re-attempt is possible.
   * Used ONLY after a deterministic, no-write failure — never after ambiguity.
   */
  release(id: string): Promise<IdempotencyRecord | null> {
    return this.store.updateIdempotencyRecord(id, { status: 'released', idemKey: null });
  }

  updateStatus(id: string, status: IdempotencyStatus): Promise<IdempotencyRecord | null> {
    return this.store.updateIdempotencyRecord(id, { status });
  }
}
