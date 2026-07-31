import { FacebookError, FacebookErrorCode } from './errors';
import type { BrowserDriver } from './driver';
import type { ProfileService } from './profile';
import type { Store, FacebookAccountRecord } from '../store/types';
import type { ApiEnv } from '../lib/env';
import type { Logger } from '../lib/logger';
import { AuditService, AuditEventTypes } from '../lib/audit';
import { newId } from '../lib/tokens';

/** Safe, client-facing connection status — NO profile path, NO cookies. */
export interface SafeFacebookStatus {
  connected: boolean;
  status: 'active' | 'disconnected' | 'blocked' | 'none';
  connectionState: string;
  displayName: string | null;
  connectedAt: string | null;
  lastValidatedAt: string | null;
  sessionExpiresAt: string | null;
  lastErrorCode: string | null;
  lastErrorMessage: string | null;
  userActionRequired: string | null;
  cleanupRequired: boolean;
}

export interface FacebookServiceDeps {
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

export class FacebookConnectionService {
  // Global concurrency one: at most one active browser task across the service.
  private readonly active = new Set<string>();
  private readonly aborts = new Map<string, AbortController>();
  private readonly tasks = new Map<string, Promise<void>>();

  constructor(private readonly deps: FacebookServiceDeps) {}

  /** Await the in-flight background connection task for a workspace (if any). */
  async waitForIdle(workspaceId: string): Promise<void> {
    await this.tasks.get(workspaceId)?.catch(() => undefined);
  }

  /** Read-only safe status. */
  async getStatus(workspaceId: string): Promise<SafeFacebookStatus> {
    this.deps.profiles.assertWorkspaceId(workspaceId);
    const account = await this.deps.store.getFacebookAccountByWorkspace(workspaceId);
    return this.toSafeStatus(account);
  }

  /**
   * Begin an interactive connection. Creates/updates the record + profile dir,
   * acquires the lock, and runs the browser task in the background (returns
   * immediately with a `connecting` status). Enforces concurrency one.
   */
  async startConnection(workspaceId: string): Promise<SafeFacebookStatus> {
    this.deps.profiles.assertWorkspaceId(workspaceId);
    if (this.active.size > 0 || this.active.has(workspaceId)) {
      throw new FacebookError(
        FacebookErrorCode.CONNECTION_ALREADY_RUNNING,
        'A connection or validation process is already running',
      );
    }

    let account = await this.deps.store.getFacebookAccountByWorkspace(workspaceId);
    const relPath = this.deps.profiles.relativePath(workspaceId);
    if (!account) {
      account = await this.deps.store.createFacebookConnection({
        id: newId(),
        workspaceId,
        profilePath: relPath,
      });
    } else {
      await this.deps.store.updateFacebookConnectionState(account.id, 'connecting', {
        status: 'active',
        lastErrorCode: null,
        lastErrorMessage: null,
      });
    }

    await this.deps.profiles.ensureProfileDir(workspaceId);
    try {
      await this.deps.profiles.acquireLock(workspaceId);
    } catch (err) {
      await this.deps.store.updateFacebookConnectionState(account.id, 'not_connected');
      throw err;
    }

    this.active.add(workspaceId);
    const abort = new AbortController();
    this.aborts.set(workspaceId, abort);
    await this.deps.audit.record(AuditEventTypes.FacebookConnectionStarted, { workspaceId });

    // Background task — not awaited by the HTTP request, but tracked so callers
    // (CLI, tests) can await completion deterministically via waitForIdle().
    const task = this.runConnect(workspaceId, account.id, abort.signal);
    this.tasks.set(workspaceId, task);
    void task.finally(() => this.tasks.delete(workspaceId));

    return this.getStatus(workspaceId);
  }

  private async runConnect(
    workspaceId: string,
    accountId: string,
    signal: AbortSignal,
  ): Promise<void> {
    const { store, driver, profiles, audit, env } = this.deps;
    try {
      if (!env.FACEBOOK_LOGIN_ENABLED) {
        await store.updateFacebookConnectionState(accountId, 'validation_failed', {
          lastErrorCode: FacebookErrorCode.LOGIN_DISABLED,
          lastErrorMessage: LOGIN_DISABLED_MESSAGE,
        });
        await audit.record(AuditEventTypes.FacebookConnectionFailed, {
          workspaceId,
          payload: { code: FacebookErrorCode.LOGIN_DISABLED },
        });
        return;
      }

      const dir = await profiles.profileDirForDriver(workspaceId);
      const result = await withTimeout(
        driver.connectInteractive(dir, { timeoutMs: env.FACEBOOK_CONNECT_TIMEOUT_MS, signal }),
        env.FACEBOOK_CONNECT_TIMEOUT_MS + 5_000,
      );

      switch (result.outcome) {
        case 'connected':
          await store.updateFacebookIdentity(accountId, {
            displayName: result.identity?.displayName ?? null,
            facebookUserId: result.identity?.facebookUserId ?? null,
            sessionExpiresAt: result.sessionExpiresAt ?? null,
          });
          await audit.record(AuditEventTypes.FacebookConnectionSucceeded, { workspaceId });
          break;
        case 'checkpoint_required':
          await store.markFacebookCheckpointRequired(
            accountId,
            FacebookErrorCode.CHECKPOINT_REQUIRED,
            'Facebook presented a checkpoint. Human action is required.',
          );
          await audit.record(AuditEventTypes.FacebookCheckpointRequired, { workspaceId });
          break;
        case 'blocked':
          await store.updateFacebookConnectionState(accountId, 'validation_failed', {
            status: 'blocked',
            lastErrorCode: FacebookErrorCode.ACCOUNT_BLOCKED,
            lastErrorMessage: 'The Facebook account appears to be blocked.',
          });
          await audit.record(AuditEventTypes.FacebookConnectionFailed, {
            workspaceId,
            payload: { code: FacebookErrorCode.ACCOUNT_BLOCKED },
          });
          break;
        case 'timeout':
          await store.markFacebookReconnectRequired(
            accountId,
            FacebookErrorCode.LOGIN_TIMEOUT,
            'The login timed out. Please reconnect.',
          );
          await audit.record(AuditEventTypes.FacebookConnectionFailed, {
            workspaceId,
            payload: { code: FacebookErrorCode.LOGIN_TIMEOUT },
          });
          break;
        case 'login_required':
          await store.markFacebookReconnectRequired(
            accountId,
            FacebookErrorCode.LOGIN_REQUIRED,
            'Login is required. Please reconnect.',
          );
          await audit.record(AuditEventTypes.FacebookConnectionFailed, {
            workspaceId,
            payload: { code: FacebookErrorCode.LOGIN_REQUIRED },
          });
          break;
        default:
          await store.updateFacebookConnectionState(accountId, 'validation_failed', {
            lastErrorCode: FacebookErrorCode.VALIDATION_FAILED,
            lastErrorMessage: 'Could not validate the login.',
          });
          await audit.record(AuditEventTypes.FacebookConnectionFailed, {
            workspaceId,
            payload: { code: FacebookErrorCode.VALIDATION_FAILED },
          });
      }
    } catch (err) {
      const message = (err as Error).message;
      const code = /browser_launch_failed/.test(message)
        ? FacebookErrorCode.BROWSER_LAUNCH_FAILED
        : FacebookErrorCode.LOGIN_TIMEOUT;
      await store.updateFacebookConnectionState(accountId, 'validation_failed', {
        lastErrorCode: code,
        lastErrorMessage:
          code === FacebookErrorCode.BROWSER_LAUNCH_FAILED
            ? 'The browser failed to launch.'
            : 'The connection run timed out.',
      });
      await audit.record(AuditEventTypes.FacebookConnectionFailed, {
        workspaceId,
        payload: { code },
      });
    } finally {
      await profiles.releaseLock(workspaceId);
      this.active.delete(workspaceId);
      this.aborts.delete(workspaceId);
    }
  }

  /** Validate the persisted session (no scanning, no writing). */
  async validateSession(workspaceId: string): Promise<SafeFacebookStatus> {
    this.deps.profiles.assertWorkspaceId(workspaceId);
    const account = await this.deps.store.getFacebookAccountByWorkspace(workspaceId);
    if (!account) {
      throw new FacebookError(
        FacebookErrorCode.ACCOUNT_NOT_FOUND,
        'No Facebook account to validate',
      );
    }
    if (this.active.size > 0) {
      throw new FacebookError(
        FacebookErrorCode.CONNECTION_ALREADY_RUNNING,
        'A connection or validation process is already running',
      );
    }

    const { store, driver, profiles, audit, env } = this.deps;
    this.active.add(workspaceId);
    try {
      await profiles.acquireLock(workspaceId);
    } catch (err) {
      this.active.delete(workspaceId);
      throw err;
    }

    try {
      if (!env.FACEBOOK_LOGIN_ENABLED) {
        await store.updateFacebookConnectionState(account.id, 'validation_failed', {
          lastErrorCode: FacebookErrorCode.LOGIN_DISABLED,
          lastErrorMessage: LOGIN_DISABLED_MESSAGE,
        });
        await audit.record(AuditEventTypes.FacebookSessionValidated, {
          workspaceId,
          payload: { outcome: 'login_disabled' },
        });
        return this.getStatus(workspaceId);
      }

      const dir = await profiles.profileDirForDriver(workspaceId);
      const result = await withTimeout(
        driver.validate(dir, { timeoutMs: env.FACEBOOK_VALIDATE_TIMEOUT_MS }),
        env.FACEBOOK_VALIDATE_TIMEOUT_MS + 5_000,
      );

      switch (result.outcome) {
        case 'connected':
          await store.updateFacebookConnectionState(account.id, 'connected', {
            status: 'active',
            lastValidatedAt: new Date(),
            lastErrorCode: null,
            lastErrorMessage: null,
          });
          await audit.record(AuditEventTypes.FacebookSessionValidated, {
            workspaceId,
            payload: { outcome: 'connected' },
          });
          break;
        case 'login_required':
          await store.markFacebookReconnectRequired(
            account.id,
            FacebookErrorCode.SESSION_EXPIRED,
            'The session has expired. Please reconnect.',
          );
          await audit.record(AuditEventTypes.FacebookReconnectRequired, { workspaceId });
          break;
        case 'checkpoint_required':
          await store.markFacebookCheckpointRequired(
            account.id,
            FacebookErrorCode.CHECKPOINT_REQUIRED,
            'Facebook presented a checkpoint. Human action is required.',
          );
          await audit.record(AuditEventTypes.FacebookCheckpointRequired, { workspaceId });
          break;
        case 'blocked':
          await store.updateFacebookConnectionState(account.id, 'validation_failed', {
            status: 'blocked',
            lastErrorCode: FacebookErrorCode.ACCOUNT_BLOCKED,
            lastErrorMessage: 'The Facebook account appears to be blocked.',
          });
          await audit.record(AuditEventTypes.FacebookSessionValidated, {
            workspaceId,
            payload: { outcome: 'blocked' },
          });
          break;
        default:
          await store.updateFacebookConnectionState(account.id, 'validation_failed', {
            lastErrorCode: FacebookErrorCode.VALIDATION_FAILED,
            lastErrorMessage: 'Could not validate the session.',
          });
          await audit.record(AuditEventTypes.FacebookSessionValidated, {
            workspaceId,
            payload: { outcome: 'validation_failed' },
          });
      }
    } catch (err) {
      const code = /browser_launch_failed/.test((err as Error).message)
        ? FacebookErrorCode.BROWSER_LAUNCH_FAILED
        : FacebookErrorCode.VALIDATION_FAILED;
      await store.updateFacebookConnectionState(account.id, 'validation_failed', {
        lastErrorCode: code,
        lastErrorMessage: 'Session validation failed.',
      });
      await audit.record(AuditEventTypes.FacebookSessionValidated, {
        workspaceId,
        payload: { outcome: 'error', code },
      });
    } finally {
      await profiles.releaseLock(workspaceId);
      this.active.delete(workspaceId);
    }

    return this.getStatus(workspaceId);
  }

  /** Disconnect: stop any active run, mark disconnected, clean the profile. */
  async disconnect(
    workspaceId: string,
    confirm: boolean,
  ): Promise<{ status: SafeFacebookStatus; cleanupFailed: boolean }> {
    this.deps.profiles.assertWorkspaceId(workspaceId);
    if (!confirm) {
      throw new FacebookError(
        FacebookErrorCode.CONFIRMATION_REQUIRED,
        'Explicit confirmation is required to disconnect',
      );
    }
    const account = await this.deps.store.getFacebookAccountByWorkspace(workspaceId);
    if (!account) {
      throw new FacebookError(
        FacebookErrorCode.ACCOUNT_NOT_FOUND,
        'No Facebook account to disconnect',
      );
    }

    // Abort any in-flight run and prevent future browser use.
    this.aborts.get(workspaceId)?.abort();
    await this.deps.store.disconnectFacebookAccount(account.id);
    await this.deps.audit.record(AuditEventTypes.FacebookDisconnected, { workspaceId });
    await this.deps.profiles.releaseLock(workspaceId);
    this.active.delete(workspaceId);
    this.aborts.delete(workspaceId);

    let cleanupFailed = false;
    try {
      await this.deps.profiles.deleteProfile(workspaceId);
    } catch {
      cleanupFailed = true;
      await this.deps.store.updateFacebookConnectionState(account.id, 'disconnected', {
        lastErrorCode: FacebookErrorCode.PROFILE_CLEANUP_FAILED,
        lastErrorMessage: 'Browser profile cleanup failed. Manual cleanup is required.',
      });
      await this.deps.audit.record(AuditEventTypes.FacebookProfileCleanupFailed, {
        workspaceId,
        payload: { code: FacebookErrorCode.PROFILE_CLEANUP_FAILED },
      });
    }

    return { status: await this.getStatus(workspaceId), cleanupFailed };
  }

  private toSafeStatus(account: FacebookAccountRecord | null): SafeFacebookStatus {
    if (!account) {
      return {
        connected: false,
        status: 'none',
        connectionState: 'not_connected',
        displayName: null,
        connectedAt: null,
        lastValidatedAt: null,
        sessionExpiresAt: null,
        lastErrorCode: null,
        lastErrorMessage: null,
        userActionRequired: null,
        cleanupRequired: false,
      };
    }
    const userActionRequired = ((): string | null => {
      switch (account.connectionState) {
        case 'reconnect_required':
          return 'Reconnect required — your Facebook session needs to be re-established.';
        case 'checkpoint_required':
          return 'Facebook checkpoint required — complete it, then reconnect.';
        case 'validation_failed':
          return account.lastErrorCode === FacebookErrorCode.LOGIN_DISABLED
            ? 'Operator-assisted login is required in this environment.'
            : 'Connection could not be validated — please reconnect.';
        default:
          return account.status === 'blocked' ? 'The Facebook account appears blocked.' : null;
      }
    })();
    return {
      connected: account.connectionState === 'connected',
      status: account.status,
      connectionState: account.connectionState,
      displayName: account.displayName,
      connectedAt: account.connectedAt ? account.connectedAt.toISOString() : null,
      lastValidatedAt: account.lastValidatedAt ? account.lastValidatedAt.toISOString() : null,
      sessionExpiresAt: account.sessionExpiresAt ? account.sessionExpiresAt.toISOString() : null,
      lastErrorCode: account.lastErrorCode,
      lastErrorMessage: account.lastErrorMessage,
      userActionRequired,
      cleanupRequired: account.lastErrorCode === FacebookErrorCode.PROFILE_CLEANUP_FAILED,
    };
  }
}
