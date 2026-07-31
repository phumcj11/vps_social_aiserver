/**
 * Opportunity engine error classification (SPRINT 007).
 */
export const OpportunityErrorCode = {
  INVALID_WORKSPACE: 'INVALID_WORKSPACE',
  ALREADY_RUNNING: 'ALREADY_RUNNING',
  OPPORTUNITY_NOT_FOUND: 'OPPORTUNITY_NOT_FOUND',
  INVALID_STATUS: 'INVALID_STATUS',
  REPOSITORY_ERROR: 'REPOSITORY_ERROR',
} as const;

export type OpportunityErrorCodeType =
  (typeof OpportunityErrorCode)[keyof typeof OpportunityErrorCode];

export class OpportunityError extends Error {
  constructor(
    public readonly code: OpportunityErrorCodeType,
    message: string,
  ) {
    super(message);
    this.name = 'OpportunityError';
  }
}
