/**
 * Facebook connection error classification (SPRINT 004).
 * There are no infinite retries anywhere in the connection flow; each terminal
 * outcome maps to one of these codes and a safe, human-readable message.
 */
export const FacebookErrorCode = {
  CONNECTION_ALREADY_RUNNING: 'CONNECTION_ALREADY_RUNNING',
  LOGIN_TIMEOUT: 'LOGIN_TIMEOUT',
  LOGIN_REQUIRED: 'LOGIN_REQUIRED',
  SESSION_EXPIRED: 'SESSION_EXPIRED',
  CHECKPOINT_REQUIRED: 'CHECKPOINT_REQUIRED',
  ACCOUNT_BLOCKED: 'ACCOUNT_BLOCKED',
  BROWSER_LAUNCH_FAILED: 'BROWSER_LAUNCH_FAILED',
  PROFILE_LOCKED: 'PROFILE_LOCKED',
  PROFILE_CLEANUP_FAILED: 'PROFILE_CLEANUP_FAILED',
  VALIDATION_FAILED: 'VALIDATION_FAILED',
  // Safety gate: real browser login is disabled in this environment (default).
  LOGIN_DISABLED: 'LOGIN_DISABLED',
  // Input / state guards
  INVALID_WORKSPACE: 'INVALID_WORKSPACE',
  ACCOUNT_NOT_FOUND: 'ACCOUNT_NOT_FOUND',
  CONFIRMATION_REQUIRED: 'CONFIRMATION_REQUIRED',
  // Group-specific (SPRINT 005)
  INVALID_GROUP_URL: 'INVALID_GROUP_URL',
  GROUP_NOT_FOUND: 'GROUP_NOT_FOUND',
  GROUP_NOT_ACCESSIBLE: 'GROUP_NOT_ACCESSIBLE',
  SESSION_NOT_CONNECTED: 'SESSION_NOT_CONNECTED',
} as const;

export type FacebookErrorCodeType = (typeof FacebookErrorCode)[keyof typeof FacebookErrorCode];

export class FacebookError extends Error {
  constructor(
    public readonly code: FacebookErrorCodeType,
    message: string,
  ) {
    super(message);
    this.name = 'FacebookError';
  }
}
