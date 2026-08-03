import type {
  Store,
  ExecutionSessionRecord,
  ExecutionSessionStatus,
  UpdateExecutionSessionInput,
  ExecutionAdapterName,
} from '../store/types';
import { newId } from '../lib/tokens';
import { ExecutionError, ExecutionErrorCode } from './errors';
import { assertExecutionTransition, isTerminalExecutionStatus } from './session-state';

/**
 * ExecutionSessionRepository (SPRINT 012).
 *
 * Owns the lifecycle of Execution Sessions and enforces, at the repository
 * boundary, the two invariants that keep execution safe:
 *   - AT MOST ONE active session per Action Job (DB unique on active_key).
 *   - Only state-machine-legal transitions are persisted.
 *
 * Terminal transitions release the active key (→ NULL) so a future, deliberate
 * attempt is possible without ever having two live sessions at once.
 */
export class ExecutionSessionRepository {
  constructor(private readonly store: Store) {}

  async create(input: {
    workspaceId: string;
    actionJobId: string;
    attemptNumber: number;
    adapter: ExecutionAdapterName;
    browserProfileKey: string | null;
  }): Promise<ExecutionSessionRecord> {
    try {
      return await this.store.createExecutionSession({ id: newId(), ...input });
    } catch (err) {
      // The DB active-key unique index rejects a second live session.
      throw new ExecutionError(
        ExecutionErrorCode.ACTIVE_SESSION_EXISTS,
        `Could not open an execution session: ${(err as Error).message}`,
      );
    }
  }

  getById(id: string): Promise<ExecutionSessionRecord | null> {
    return this.store.getExecutionSessionById(id);
  }

  listForJob(actionJobId: string): Promise<ExecutionSessionRecord[]> {
    return this.store.listExecutionSessionsForJob(actionJobId);
  }

  getActiveForJob(actionJobId: string): Promise<ExecutionSessionRecord | null> {
    return this.store.getActiveExecutionSessionForJob(actionJobId);
  }

  /**
   * Persist a state-machine transition. Timestamps for the target state are
   * stamped automatically; terminal states release the active key.
   */
  async transition(
    session: ExecutionSessionRecord,
    to: ExecutionSessionStatus,
    at: Date,
    extra: UpdateExecutionSessionInput = {},
  ): Promise<ExecutionSessionRecord> {
    assertExecutionTransition(session.status, to);
    const patch: UpdateExecutionSessionInput = { status: to, ...stamp(to, at), ...extra };
    if (isTerminalExecutionStatus(to)) {
      patch.finishedAt = at;
      // Release the active-key so the DB no longer counts this as live.
      patch.activeKey = null;
    }
    const updated = await this.store.updateExecutionSession(session.id, patch);
    if (!updated) {
      throw new ExecutionError(ExecutionErrorCode.SESSION_NOT_FOUND, 'Execution session not found');
    }
    return updated;
  }

  update(id: string, input: UpdateExecutionSessionInput): Promise<ExecutionSessionRecord | null> {
    return this.store.updateExecutionSession(id, input);
  }
}

/** Map a target status to the timestamp column it sets. */
function stamp(to: ExecutionSessionStatus, at: Date): UpdateExecutionSessionInput {
  switch (to) {
    case 'preflight':
      return { startedAt: at };
    case 'ready_to_submit':
      return { preflightVerifiedAt: at };
    case 'submitting':
      return { submitStartedAt: at };
    case 'submitted':
      return { submittedAt: at };
    case 'verifying':
      return { verificationStartedAt: at };
    case 'verified':
      return { verifiedAt: at };
    case 'ambiguous':
      return { ambiguousAt: at };
    case 'failed':
      return { failedAt: at };
    case 'cancelled':
      return { cancelledAt: at };
    default:
      return {};
  }
}
