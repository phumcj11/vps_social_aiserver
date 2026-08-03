import type { ExecutionSessionStatus } from '../store/types';
import { ExecutionError, ExecutionErrorCode } from './errors';

/**
 * Execution Session state machine (SPRINT 012).
 *
 * The happy path is strictly ordered:
 *   created → preflight → ready_to_submit → submitting → submitted → verifying →
 *   verified
 *
 * Off-ramps at every step: `failed` (deterministic failure), `cancelled`
 * (operator), `ambiguous` (unknown outcome — human recovery, NEVER auto-retry),
 * and the interrupt states `checkpoint_required` / `session_expired` /
 * `account_restricted` (platform blocked us; pause for a human).
 *
 * `verified` is the ONLY success. Ambiguity and interrupts are terminal for the
 * session and hand off to recovery — they never silently loop.
 */
const TRANSITIONS: Record<ExecutionSessionStatus, ExecutionSessionStatus[]> = {
  created: ['preflight', 'failed', 'cancelled'],
  preflight: [
    'ready_to_submit',
    'failed',
    'cancelled',
    'checkpoint_required',
    'session_expired',
    'account_restricted',
  ],
  ready_to_submit: [
    'submitting',
    'failed',
    'cancelled',
    'checkpoint_required',
    'session_expired',
    'account_restricted',
  ],
  submitting: [
    'submitted',
    'failed',
    'ambiguous',
    'checkpoint_required',
    'session_expired',
    'account_restricted',
  ],
  submitted: ['verifying', 'ambiguous', 'failed'],
  verifying: ['verified', 'ambiguous', 'failed'],
  // Terminal states — no further transitions.
  verified: [],
  ambiguous: [],
  failed: [],
  cancelled: [],
  checkpoint_required: [],
  session_expired: [],
  account_restricted: [],
};

/** Session statuses from which nothing else may happen. */
export const TERMINAL_EXECUTION_STATUSES: ExecutionSessionStatus[] = [
  'verified',
  'ambiguous',
  'failed',
  'cancelled',
  'checkpoint_required',
  'session_expired',
  'account_restricted',
];

export function isTerminalExecutionStatus(status: ExecutionSessionStatus): boolean {
  return TERMINAL_EXECUTION_STATUSES.includes(status);
}

export function canTransition(from: ExecutionSessionStatus, to: ExecutionSessionStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

export function assertExecutionTransition(
  from: ExecutionSessionStatus,
  to: ExecutionSessionStatus,
): void {
  if (!canTransition(from, to)) {
    throw new ExecutionError(
      ExecutionErrorCode.INVALID_TRANSITION,
      `Invalid execution session transition ${from} → ${to}`,
    );
  }
}
