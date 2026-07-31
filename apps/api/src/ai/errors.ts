/**
 * AI Draft engine error classification (SPRINT 009).
 */
export const AiDraftErrorCode = {
  INVALID_WORKSPACE: 'INVALID_WORKSPACE',
  MATCH_NOT_FOUND: 'MATCH_NOT_FOUND',
  NOT_A_MATCH: 'NOT_A_MATCH',
  DRAFT_NOT_FOUND: 'DRAFT_NOT_FOUND',
  PROVIDER_DISABLED: 'PROVIDER_DISABLED',
  PROVIDER_FAILED: 'PROVIDER_FAILED',
  INVALID_STATE: 'INVALID_STATE',
  REPOSITORY_ERROR: 'REPOSITORY_ERROR',
} as const;

export type AiDraftErrorCodeType = (typeof AiDraftErrorCode)[keyof typeof AiDraftErrorCode];

export class AiDraftError extends Error {
  constructor(
    public readonly code: AiDraftErrorCodeType,
    message: string,
  ) {
    super(message);
    this.name = 'AiDraftError';
  }
}
