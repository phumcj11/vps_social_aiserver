/**
 * Collector error classification (SPRINT 006). Each pipeline stage has a
 * distinct code so failures are explicit and auditable (no silent failure).
 */
export const CollectorErrorCode = {
  NAVIGATION_ERROR: 'NAVIGATION_ERROR',
  EXTRACTION_ERROR: 'EXTRACTION_ERROR',
  NORMALIZATION_ERROR: 'NORMALIZATION_ERROR',
  REPOSITORY_ERROR: 'REPOSITORY_ERROR',
  CHECKPOINT_ERROR: 'CHECKPOINT_ERROR',
  BROWSER_ERROR: 'BROWSER_ERROR',
  // Safety / state guards
  READER_DISABLED: 'READER_DISABLED',
  SESSION_NOT_CONNECTED: 'SESSION_NOT_CONNECTED',
  ALREADY_RUNNING: 'ALREADY_RUNNING',
  INVALID_WORKSPACE: 'INVALID_WORKSPACE',
} as const;

export type CollectorErrorCodeType = (typeof CollectorErrorCode)[keyof typeof CollectorErrorCode];

export class CollectorError extends Error {
  constructor(
    public readonly code: CollectorErrorCodeType,
    message: string,
  ) {
    super(message);
    this.name = 'CollectorError';
  }
}
