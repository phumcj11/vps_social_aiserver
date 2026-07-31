/**
 * Human Review engine error classification (SPRINT 010).
 */
export const ReviewErrorCode = {
  INVALID_WORKSPACE: 'INVALID_WORKSPACE',
  DRAFT_NOT_FOUND: 'DRAFT_NOT_FOUND',
  DRAFT_NOT_REVIEWABLE: 'DRAFT_NOT_REVIEWABLE',
  REVIEW_NOT_FOUND: 'REVIEW_NOT_FOUND',
  INVALID_STATE: 'INVALID_STATE',
  INVALID_EDIT: 'INVALID_EDIT',
  ADAPTER_DISABLED: 'ADAPTER_DISABLED',
  REPOSITORY_ERROR: 'REPOSITORY_ERROR',
} as const;

export type ReviewErrorCodeType = (typeof ReviewErrorCode)[keyof typeof ReviewErrorCode];

export class ReviewError extends Error {
  constructor(
    public readonly code: ReviewErrorCodeType,
    message: string,
  ) {
    super(message);
    this.name = 'ReviewError';
  }
}
