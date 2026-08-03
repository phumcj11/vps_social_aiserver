import { describe, expect, it } from 'vitest';
import { ExecutionRecoveryPolicy } from './recovery';
import type { ExecutionSessionRecord, ExecutionSessionStatus } from '../store/types';

const policy = new ExecutionRecoveryPolicy();

function session(
  status: ExecutionSessionStatus,
  errorCode: string | null = null,
): ExecutionSessionRecord {
  const now = new Date('2026-01-01T00:00:00Z');
  return {
    id: 's',
    workspaceId: 'w',
    actionJobId: 'j',
    attemptNumber: 1,
    status,
    adapter: 'fake',
    browserProfileKey: null,
    startedAt: null,
    preflightVerifiedAt: null,
    submitStartedAt: null,
    submittedAt: null,
    verificationStartedAt: null,
    verifiedAt: null,
    ambiguousAt: null,
    failedAt: null,
    cancelledAt: null,
    finishedAt: null,
    errorCode,
    errorMessage: null,
    recoveryState: null,
    createdAt: now,
    updatedAt: now,
  };
}

describe('ExecutionRecoveryPolicy', () => {
  it('ambiguous → MANUAL_INVESTIGATION (NEVER a safe retry)', () => {
    const c = policy.classify(session('ambiguous'));
    expect(c.disposition).toBe('MANUAL_INVESTIGATION');
    expect(c.requiresHuman).toBe(true);
  });

  it.each<ExecutionSessionStatus>(['checkpoint_required', 'session_expired', 'account_restricted'])(
    'interrupt %s → MANUAL_INVESTIGATION',
    (status) => {
      expect(policy.classify(session(status)).disposition).toBe('MANUAL_INVESTIGATION');
    },
  );

  it('pre-submit deterministic failure → SAFE_RETRY (no write occurred)', () => {
    const c = policy.classify(session('failed', 'TYPED_CONTENT_MISMATCH'));
    expect(c.disposition).toBe('SAFE_RETRY');
    expect(c.requiresHuman).toBe(false);
  });

  it('unclassified failure → MANUAL_INVESTIGATION (no blind retry)', () => {
    expect(policy.classify(session('failed', 'SOMETHING_ODD')).disposition).toBe(
      'MANUAL_INVESTIGATION',
    );
  });

  it('verified → NO_RETRY', () => {
    expect(policy.classify(session('verified')).disposition).toBe('NO_RETRY');
  });

  it('a still-live session is not recoverable', () => {
    expect(policy.classify(session('submitting')).disposition).toBe('NO_RETRY');
  });
});
