/**
 * Business matching engine error classification (SPRINT 008).
 */
export const MatchingErrorCode = {
  INVALID_WORKSPACE: 'INVALID_WORKSPACE',
  ALREADY_RUNNING: 'ALREADY_RUNNING',
  MATCH_NOT_FOUND: 'MATCH_NOT_FOUND',
  REPOSITORY_ERROR: 'REPOSITORY_ERROR',
} as const;

export type MatchingErrorCodeType = (typeof MatchingErrorCode)[keyof typeof MatchingErrorCode];

export class MatchingError extends Error {
  constructor(
    public readonly code: MatchingErrorCodeType,
    message: string,
  ) {
    super(message);
    this.name = 'MatchingError';
  }
}
