/**
 * Action Queue engine error classification (SPRINT 011).
 */
export const ActionErrorCode = {
  INVALID_WORKSPACE: 'INVALID_WORKSPACE',
  REVIEW_NOT_FOUND: 'REVIEW_NOT_FOUND',
  REVIEW_NOT_APPROVED: 'REVIEW_NOT_APPROVED',
  MISSING_CONTENT: 'MISSING_CONTENT',
  UNSAFE_TARGET_URL: 'UNSAFE_TARGET_URL',
  UNSUPPORTED_TYPE: 'UNSUPPORTED_TYPE',
  CONTENT_TOO_LONG: 'CONTENT_TOO_LONG',
  DUPLICATE_ACTIVE_JOB: 'DUPLICATE_ACTIVE_JOB',
  ACTION_NOT_FOUND: 'ACTION_NOT_FOUND',
  INVALID_TRANSITION: 'INVALID_TRANSITION',
  RETRY_LIMIT_REACHED: 'RETRY_LIMIT_REACHED',
  INVALID_STATE: 'INVALID_STATE',
  REPOSITORY_ERROR: 'REPOSITORY_ERROR',
} as const;

export type ActionErrorCodeType = (typeof ActionErrorCode)[keyof typeof ActionErrorCode];

export class ActionError extends Error {
  constructor(
    public readonly code: ActionErrorCodeType,
    message: string,
    /** Optional structured reasons (safe — no secrets). */
    public readonly reasons?: { code: string; detail: string }[],
  ) {
    super(message);
    this.name = 'ActionError';
  }
}
