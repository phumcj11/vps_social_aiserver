/**
 * Operations engine error classification (SPRINT 013).
 */
export const OperationsErrorCode = {
  OPERATIONS_DISABLED: 'OPERATIONS_DISABLED',
  NOT_OPERATOR: 'NOT_OPERATOR',
  MAINTENANCE_ACTIVE: 'MAINTENANCE_ACTIVE',
  LOCKDOWN_ACTIVE: 'LOCKDOWN_ACTIVE',
  CONFIRMATION_REQUIRED: 'CONFIRMATION_REQUIRED',
  REASON_REQUIRED: 'REASON_REQUIRED',
  STATE_WRITE_FAILED: 'STATE_WRITE_FAILED',
  INVALID_STATE: 'INVALID_STATE',
} as const;

export type OperationsErrorCodeType =
  (typeof OperationsErrorCode)[keyof typeof OperationsErrorCode];

export class OperationsError extends Error {
  constructor(
    public readonly code: OperationsErrorCodeType,
    message: string,
  ) {
    super(message);
    this.name = 'OperationsError';
  }
}
