import { FacebookError, FacebookErrorCode } from './errors';
import type { BrowserDriver, GroupValidateResult } from './driver';
import type { ProfileService } from './profile';
import type { Store, FacebookGroupRecord, GroupAccessState } from '../store/types';
import type { ApiEnv } from '../lib/env';
import type { Logger } from '../lib/logger';
import { AuditService, AuditEventTypes } from '../lib/audit';

/** Safe, client-facing group status — never a profile path or cookies. */
export interface SafeGroupStatus {
  id: string;
  facebookGroupId: string | null;
  name: string | null;
  canonicalUrl: string;
  originalUrl: string;
  status: string;
  accessState: string;
  lastValidatedAt: string | null;
  lastErrorCode: string | null;
  lastErrorMessage: string | null;
  createdAt: string;
  updatedAt: string;
}

export function toSafeGroup(g: FacebookGroupRecord): SafeGroupStatus {
  return {
    id: g.id,
    facebookGroupId: g.facebookGroupId,
    name: g.name,
    canonicalUrl: g.canonicalUrl,
    originalUrl: g.originalUrl,
    status: g.status,
    accessState: g.accessState,
    lastValidatedAt: g.lastValidatedAt ? g.lastValidatedAt.toISOString() : null,
    lastErrorCode: g.lastErrorCode,
    lastErrorMessage: g.lastErrorMessage,
    createdAt: g.createdAt.toISOString(),
    updatedAt: g.updatedAt.toISOString(),
  };
}

export interface GroupValidationDeps {
  store: Store;
  profiles: ProfileService;
  driver: BrowserDriver;
  audit: AuditService;
  env: ApiEnv;
  logger: Logger;
}

const LOGIN_DISABLED_MESSAGE =
  'Facebook login is disabled in this environment (operator-assisted only). See the connection runbook.';

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolvePromise, rejectPromise) => {
    const timer = setTimeout(() => rejectPromise(new Error('run_timeout')), ms);
    promise.then(
      (v) => {
        clearTimeout(timer);
        resolvePromise(v);
      },
      (e) => {
        clearTimeout(timer);
        rejectPromise(e as Error);
      },
    );
  });
}

export class GroupValidationService {
  private readonly active = new Set<string>();

  constructor(private readonly deps: GroupValidationDeps) {}

  /**
   * Validate that the workspace's connected Facebook session can access a
   * group's landing page. Connection-only: no scrolling, no post reading, no
   * writes. Returns the safe group status.
   */
  async validateGroupAccess(workspaceId: string, groupId: string): Promise<SafeGroupStatus> {
    const { store, profiles, audit, env, logger } = this.deps;
    profiles.assertWorkspaceId(workspaceId);

    const group = await store.getFacebookGroupById(groupId);
    if (!group || group.workspaceId !== workspaceId) {
      throw new FacebookError(FacebookErrorCode.GROUP_NOT_FOUND, 'Group not found');
    }

    // A disconnected / expired session must prevent validation (no browser).
    const account = await store.getFacebookAccountByWorkspace(workspaceId);
    if (!account || account.connectionState !== 'connected') {
      const updated = await store.updateFacebookGroupAccessState(groupId, 'login_required', {
        lastErrorCode: FacebookErrorCode.SESSION_NOT_CONNECTED,
        lastErrorMessage: 'Connect your Facebook account before validating groups.',
      });
      await audit.record(AuditEventTypes.FacebookGroupLoginRequired, {
        workspaceId,
        payload: { groupId, code: FacebookErrorCode.SESSION_NOT_CONNECTED },
      });
      return toSafeGroup(updated ?? group);
    }

    // Concurrency one (per service) + cross-process filesystem lock.
    if (this.active.size > 0) {
      throw new FacebookError(
        FacebookErrorCode.CONNECTION_ALREADY_RUNNING,
        'A connection or validation process is already running',
      );
    }
    this.active.add(workspaceId);
    try {
      await profiles.acquireLock(workspaceId);
    } catch (err) {
      this.active.delete(workspaceId);
      throw err;
    }

    try {
      await store.updateFacebookGroupAccessState(groupId, 'validating');
      await audit.record(AuditEventTypes.FacebookGroupValidationStarted, {
        workspaceId,
        payload: { groupId },
      });

      if (!env.FACEBOOK_LOGIN_ENABLED) {
        const updated = await store.updateFacebookGroupAccessState(groupId, 'validation_failed', {
          lastErrorCode: FacebookErrorCode.LOGIN_DISABLED,
          lastErrorMessage: LOGIN_DISABLED_MESSAGE,
        });
        await audit.record(AuditEventTypes.FacebookGroupValidationFailed, {
          workspaceId,
          payload: { groupId, code: FacebookErrorCode.LOGIN_DISABLED },
        });
        return toSafeGroup(updated ?? group);
      }

      const dir = await profiles.profileDirForDriver(workspaceId);
      const result = await this.runWithOneRetry(dir, group.canonicalUrl);
      const updated = await this.applyOutcome(workspaceId, group, result);
      return toSafeGroup(updated);
    } catch (err) {
      const code = /browser_launch_failed/.test((err as Error).message)
        ? FacebookErrorCode.BROWSER_LAUNCH_FAILED
        : FacebookErrorCode.VALIDATION_FAILED;
      const updated = await store.updateFacebookGroupAccessState(groupId, 'validation_failed', {
        lastErrorCode: code,
        lastErrorMessage: 'Group validation failed.',
      });
      await audit.record(AuditEventTypes.FacebookGroupValidationFailed, {
        workspaceId,
        payload: { groupId, code },
      });
      logger.warn('facebook.group.validate_error', { workspaceId, code });
      return toSafeGroup(updated ?? group);
    } finally {
      await profiles.releaseLock(workspaceId);
      this.active.delete(workspaceId);
    }
  }

  /** One safe retry for a transient navigation failure (not a launch failure). */
  private async runWithOneRetry(dir: string, canonicalUrl: string): Promise<GroupValidateResult> {
    const timeoutMs = this.deps.env.FACEBOOK_VALIDATE_TIMEOUT_MS;
    try {
      return await withTimeout(
        this.deps.driver.validateGroupAccess(dir, canonicalUrl, { timeoutMs }),
        timeoutMs + 5_000,
      );
    } catch (err) {
      if (/browser_launch_failed/.test((err as Error).message)) throw err;
      // One retry for transient navigation/timeout issues.
      return withTimeout(
        this.deps.driver.validateGroupAccess(dir, canonicalUrl, { timeoutMs }),
        timeoutMs + 5_000,
      );
    }
  }

  private async applyOutcome(
    workspaceId: string,
    group: FacebookGroupRecord,
    result: GroupValidateResult,
  ): Promise<FacebookGroupRecord> {
    const { store, audit } = this.deps;
    const groupId = group.id;

    const mapping: Record<
      GroupValidateResult['outcome'],
      { state: GroupAccessState; code: string | null; event: string; message: string | null }
    > = {
      accessible: {
        state: 'accessible',
        code: null,
        event: AuditEventTypes.FacebookGroupAccessible,
        message: null,
      },
      inaccessible: {
        state: 'inaccessible',
        code: FacebookErrorCode.GROUP_NOT_ACCESSIBLE,
        event: AuditEventTypes.FacebookGroupInaccessible,
        message: 'The group is private or not accessible to this account.',
      },
      login_required: {
        state: 'login_required',
        code: FacebookErrorCode.SESSION_EXPIRED,
        event: AuditEventTypes.FacebookGroupLoginRequired,
        message: 'Login is required. Reconnect your Facebook account.',
      },
      checkpoint_required: {
        state: 'checkpoint_required',
        code: FacebookErrorCode.CHECKPOINT_REQUIRED,
        event: AuditEventTypes.FacebookGroupCheckpointRequired,
        message: 'Facebook presented a checkpoint. Human action is required.',
      },
      not_found: {
        state: 'not_found',
        code: FacebookErrorCode.GROUP_NOT_FOUND,
        event: AuditEventTypes.FacebookGroupNotFound,
        message: 'The group could not be found.',
      },
      validation_failed: {
        state: 'validation_failed',
        code: FacebookErrorCode.VALIDATION_FAILED,
        event: AuditEventTypes.FacebookGroupValidationFailed,
        message: 'The group access could not be validated.',
      },
    };

    const m = mapping[result.outcome];
    const updated = await store.updateFacebookGroupAccessState(groupId, m.state, {
      lastValidatedAt: result.outcome === 'accessible' ? new Date() : group.lastValidatedAt,
      lastErrorCode: m.code,
      lastErrorMessage: m.message,
      name: result.groupName ?? undefined,
      facebookGroupId: result.facebookGroupId ?? undefined,
    });
    await audit.record(m.event, { workspaceId, payload: { groupId, outcome: result.outcome } });
    return updated ?? group;
  }
}
