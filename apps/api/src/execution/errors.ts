/**
 * Execution engine error classification (SPRINT 012).
 */
export const ExecutionErrorCode = {
  // Ownership / lookup
  INVALID_WORKSPACE: 'INVALID_WORKSPACE',
  JOB_NOT_FOUND: 'JOB_NOT_FOUND',
  SESSION_NOT_FOUND: 'SESSION_NOT_FOUND',

  // Safety gates (execution refused — never a partial write)
  EXECUTION_DISABLED: 'EXECUTION_DISABLED',
  KILL_SWITCH_ON: 'KILL_SWITCH_ON',
  WRITE_NOT_ENABLED: 'WRITE_NOT_ENABLED',
  ADAPTER_DISABLED: 'ADAPTER_DISABLED',
  REAL_WRITE_FORBIDDEN: 'REAL_WRITE_FORBIDDEN',

  // Preconditions
  JOB_NOT_EXECUTABLE: 'JOB_NOT_EXECUTABLE',
  UNSUPPORTED_ACTION_TYPE: 'UNSUPPORTED_ACTION_TYPE',
  ACTIVE_SESSION_EXISTS: 'ACTIVE_SESSION_EXISTS',
  DUPLICATE_SUCCESS: 'DUPLICATE_SUCCESS',
  IDEMPOTENCY_CONFLICT: 'IDEMPOTENCY_CONFLICT',
  BROWSER_PROFILE_BUSY: 'BROWSER_PROFILE_BUSY',

  // Verification failures (safety-critical)
  TARGET_MISMATCH: 'TARGET_MISMATCH',
  TYPED_CONTENT_MISMATCH: 'TYPED_CONTENT_MISMATCH',
  POST_SUBMIT_VERIFICATION_FAILED: 'POST_SUBMIT_VERIFICATION_FAILED',

  // Recovery
  NOT_RECOVERABLE: 'NOT_RECOVERABLE',
  INVALID_SESSION_STATE: 'INVALID_SESSION_STATE',
  INVALID_TRANSITION: 'INVALID_TRANSITION',

  REPOSITORY_ERROR: 'REPOSITORY_ERROR',
} as const;

export type ExecutionErrorCodeType = (typeof ExecutionErrorCode)[keyof typeof ExecutionErrorCode];

export class ExecutionError extends Error {
  constructor(
    public readonly code: ExecutionErrorCodeType,
    message: string,
    public readonly detail?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'ExecutionError';
  }
}
