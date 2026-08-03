import { existsSync } from 'node:fs';
import { mkdir, rm, writeFile, unlink, stat, chmod } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import { FacebookError, FacebookErrorCode } from './errors';

/**
 * Controlled browser-profile storage service (SPRINT 004).
 *
 * SECURITY GUARANTEES:
 *  - Profile paths are SERVER-GENERATED from the workspace id only; the frontend
 *    never supplies a path.
 *  - The workspace id must be a valid UUID, which structurally cannot contain
 *    path separators or `..` — this is the primary path-traversal defence. A
 *    second defence asserts the resolved path stays under the profile root.
 *  - One profile directory per workspace; created with restrictive (0700) perms.
 *  - Absolute paths are never exposed outside this service.
 *  - Deletion happens ONLY through `deleteProfile` (explicit disconnect).
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class ProfileService {
  private readonly root: string;

  constructor(rootDir: string) {
    this.root = resolve(rootDir);
  }

  /** Validate a workspace id (UUID). Throws INVALID_WORKSPACE otherwise. */
  assertWorkspaceId(workspaceId: string): void {
    if (!UUID_RE.test(workspaceId)) {
      throw new FacebookError(FacebookErrorCode.INVALID_WORKSPACE, 'Invalid workspace id');
    }
  }

  /** Relative profile path stored in the DB (never absolute). */
  relativePath(workspaceId: string): string {
    this.assertWorkspaceId(workspaceId);
    return `${workspaceId}/facebook`;
  }

  /** Server-side absolute path — never returned to clients. */
  private absolutePath(workspaceId: string): string {
    this.assertWorkspaceId(workspaceId);
    const abs = resolve(this.root, workspaceId, 'facebook');
    // Defence in depth: the resolved path must stay within the root.
    if (abs !== this.root && !abs.startsWith(this.root + sep)) {
      throw new FacebookError(FacebookErrorCode.INVALID_WORKSPACE, 'Path outside profile root');
    }
    return abs;
  }

  /** The workspace's top-level directory (removed entirely on disconnect). */
  private workspaceDir(workspaceId: string): string {
    this.assertWorkspaceId(workspaceId);
    return resolve(this.root, workspaceId);
  }

  private lockPath(workspaceId: string): string {
    return resolve(this.workspaceDir(workspaceId), 'facebook.lock');
  }

  /** Create the profile directory with restrictive permissions. */
  async ensureProfileDir(workspaceId: string): Promise<string> {
    const abs = this.absolutePath(workspaceId);
    await mkdir(abs, { recursive: true, mode: 0o700 });
    try {
      await chmod(this.workspaceDir(workspaceId), 0o700);
      await chmod(abs, 0o700);
    } catch {
      /* best-effort permissions; directory already created */
    }
    return abs;
  }

  /** The absolute profile path for the browser driver (server-side only). */
  async profileDirForDriver(workspaceId: string): Promise<string> {
    return this.absolutePath(workspaceId);
  }

  async profileExists(workspaceId: string): Promise<boolean> {
    return existsSync(this.absolutePath(workspaceId));
  }

  /**
   * Acquire an exclusive lock so a profile is never used by two browser
   * processes concurrently (covers API + CLI). Stale locks (older than
   * staleMs) are reclaimed. Throws PROFILE_LOCKED if actively held.
   */
  async acquireLock(workspaceId: string, staleMs = 10 * 60_000): Promise<void> {
    await mkdir(this.workspaceDir(workspaceId), { recursive: true, mode: 0o700 });
    const lock = this.lockPath(workspaceId);
    try {
      await writeFile(lock, `${process.pid}:${Date.now()}`, { flag: 'wx', mode: 0o600 });
      return;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'EEXIST') throw err;
    }
    // Lock exists — reclaim if stale.
    try {
      const info = await stat(lock);
      if (Date.now() - info.mtimeMs > staleMs) {
        await unlink(lock);
        await writeFile(lock, `${process.pid}:${Date.now()}`, { flag: 'wx', mode: 0o600 });
        return;
      }
    } catch {
      /* fall through to locked error */
    }
    throw new FacebookError(
      FacebookErrorCode.PROFILE_LOCKED,
      'A connection process is already running',
    );
  }

  async releaseLock(workspaceId: string): Promise<void> {
    try {
      await unlink(this.lockPath(workspaceId));
    } catch {
      /* already released */
    }
  }

  /**
   * SAFE diagnostic status for a workspace's browser profile (SPRINT 013).
   * Reports ONLY whether the profile exists and whether it is locked (with the
   * lock's age). It NEVER returns the path, cookies, localStorage, or any
   * session material — those must never leave this service.
   */
  async profileStatus(
    workspaceId: string,
  ): Promise<{ exists: boolean; locked: boolean; lockAgeSeconds: number | null }> {
    const exists = existsSync(this.absolutePath(workspaceId));
    let locked = false;
    let lockAgeSeconds: number | null = null;
    try {
      const info = await stat(this.lockPath(workspaceId));
      locked = true;
      lockAgeSeconds = Math.round((Date.now() - info.mtimeMs) / 1000);
    } catch {
      locked = false;
    }
    return { exists, locked, lockAgeSeconds };
  }

  /**
   * Delete the entire workspace profile directory (explicit disconnect only).
   * Throws PROFILE_CLEANUP_FAILED if removal fails, so the caller can mark
   * cleanup-required and surface it (no silent failure).
   */
  async deleteProfile(workspaceId: string): Promise<void> {
    const dir = this.workspaceDir(workspaceId);
    try {
      await rm(dir, { recursive: true, force: true });
    } catch (err) {
      throw new FacebookError(
        FacebookErrorCode.PROFILE_CLEANUP_FAILED,
        `Failed to remove browser profile: ${(err as Error).message}`,
      );
    }
  }
}
