import type { Store } from '../store/types';
import { newId } from './tokens';

/**
 * Minimal audit service (SPRINT 004).
 *
 * Appends safe, structured audit events. It defends against accidental secret
 * leakage: any forbidden key in a payload is redacted before storage, so
 * passwords, cookies, tokens, and absolute profile paths can never be recorded.
 */

const FORBIDDEN_KEYS = new Set([
  'password',
  'passwordhash',
  'password_hash',
  'token',
  'sessiontoken',
  'session_token',
  'sessiontokenhash',
  'cookie',
  'cookies',
  'authorization',
  'profilepath',
  'profile_path',
  'absolutepath',
  'absolute_path',
  'html',
  'screenshot',
  'screenshots',
]);

function sanitise(payload: Record<string, unknown> | null): Record<string, unknown> | null {
  if (!payload) return null;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(payload)) {
    out[k] = FORBIDDEN_KEYS.has(k.toLowerCase()) ? '[redacted]' : v;
  }
  return out;
}

export class AuditService {
  constructor(private readonly store: Store) {}

  async record(
    eventType: string,
    opts: {
      workspaceId?: string | null;
      userId?: string | null;
      payload?: Record<string, unknown> | null;
    } = {},
  ): Promise<void> {
    await this.store.createAuditEvent({
      id: newId(),
      workspaceId: opts.workspaceId ?? null,
      userId: opts.userId ?? null,
      eventType,
      payload: sanitise(opts.payload ?? null),
    });
  }
}

/** Canonical audit event type names used across the app. */
export const AuditEventTypes = {
  UserLogin: 'user_login',
  UserLogout: 'user_logout',
  WorkspaceUpdated: 'workspace_updated',
  FacebookConnectionStarted: 'facebook_connection_started',
  FacebookConnectionSucceeded: 'facebook_connection_succeeded',
  FacebookConnectionFailed: 'facebook_connection_failed',
  FacebookSessionValidated: 'facebook_session_validated',
  FacebookReconnectRequired: 'facebook_reconnect_required',
  FacebookCheckpointRequired: 'facebook_checkpoint_required',
  FacebookDisconnected: 'facebook_disconnected',
  FacebookProfileCleanupFailed: 'facebook_profile_cleanup_failed',
  // Facebook groups (SPRINT 005)
  FacebookGroupCreated: 'facebook_group_created',
  FacebookGroupUpdated: 'facebook_group_updated',
  FacebookGroupValidationStarted: 'facebook_group_validation_started',
  FacebookGroupAccessible: 'facebook_group_accessible',
  FacebookGroupInaccessible: 'facebook_group_inaccessible',
  FacebookGroupLoginRequired: 'facebook_group_login_required',
  FacebookGroupCheckpointRequired: 'facebook_group_checkpoint_required',
  FacebookGroupNotFound: 'facebook_group_not_found',
  FacebookGroupValidationFailed: 'facebook_group_validation_failed',
  FacebookGroupAssignedToBusiness: 'facebook_group_assigned_to_business',
  FacebookGroupUnassignedFromBusiness: 'facebook_group_unassigned_from_business',
} as const;
