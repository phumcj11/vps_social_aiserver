/**
 * Central Scanner cross-workspace routing error classification (MODEL C).
 */
export const RoutingErrorCode = {
  INVALID_WORKSPACE: 'INVALID_WORKSPACE',
  OPPORTUNITY_NOT_FOUND: 'OPPORTUNITY_NOT_FOUND',
  NOT_SOURCE_OPPORTUNITY: 'NOT_SOURCE_OPPORTUNITY',
  SIGNAL_NOT_FOUND: 'SIGNAL_NOT_FOUND',
} as const;

export type RoutingErrorCodeType = (typeof RoutingErrorCode)[keyof typeof RoutingErrorCode];

export class RoutingError extends Error {
  constructor(
    public readonly code: RoutingErrorCodeType,
    message: string,
  ) {
    super(message);
    this.name = 'RoutingError';
  }
}
