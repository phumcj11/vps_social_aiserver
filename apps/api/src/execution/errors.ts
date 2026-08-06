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
  // Real-adapter authorization (SPRINT: real comment adapter). A real submit
  // requires prepare-vs-submit MODE + an explicit one-shot authorization from
  // the executor. Absent either, the adapter refuses BEFORE typing/submitting.
  SUBMIT_NOT_AUTHORIZED: 'SUBMIT_NOT_AUTHORIZED',
  PREPARE_ONLY_MODE: 'PREPARE_ONLY_MODE',

  // Pre-submit page aborts (real adapter). Each aborts BEFORE any type/submit —
  // no write ever happens on these paths.
  LOGIN_REQUIRED: 'LOGIN_REQUIRED',
  CHECKPOINT_REQUIRED: 'CHECKPOINT_REQUIRED',
  CAPTCHA_PRESENT: 'CAPTCHA_PRESENT',
  ACCOUNT_RESTRICTED: 'ACCOUNT_RESTRICTED',
  POST_NOT_VISIBLE: 'POST_NOT_VISIBLE',
  POST_DELETED: 'POST_DELETED',
  COMMENTS_DISABLED: 'COMMENTS_DISABLED',
  UNEXPECTED_REDIRECT: 'UNEXPECTED_REDIRECT',
  AMBIGUOUS_DOM: 'AMBIGUOUS_DOM',
  MULTIPLE_INPUT_CANDIDATES: 'MULTIPLE_INPUT_CANDIDATES',
  COMMENT_INPUT_NOT_FOUND: 'COMMENT_INPUT_NOT_FOUND',
  DUPLICATE_COMMENT_EXISTS: 'DUPLICATE_COMMENT_EXISTS',
  SUBMIT_CONFIRMATION_UNAVAILABLE: 'SUBMIT_CONFIRMATION_UNAVAILABLE',
  RESOURCE_GUARD: 'RESOURCE_GUARD',

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
