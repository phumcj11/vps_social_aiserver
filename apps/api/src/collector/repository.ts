import type {
  Store,
  FacebookGroupRecord,
  CollectorCheckpointRecord,
  CollectorRunRecord,
  UpdateCollectorRunInput,
  FacebookAccountRecord,
} from '../store/types';
import { newId } from '../lib/tokens';
import { CollectorError, CollectorErrorCode } from './errors';
import type { RawSignalCapture, NormalizedSignalData } from './types';

/** True when an error is a database unique-constraint (duplicate key) conflict. */
function isDuplicateKeyError(err: unknown): boolean {
  const e = err as { code?: string; errno?: number; message?: string };
  return (
    e?.code === 'ER_DUP_ENTRY' || e?.errno === 1062 || /duplicate|unique/i.test(e?.message ?? '')
  );
}

/** Result of a persistence attempt — `inserted:false` means an idempotent skip. */
export interface PersistResult {
  inserted: boolean;
}

/**
 * CollectorRepository (SPRINT 006).
 *
 * The Collector NEVER touches SQL or the Store directly — it talks only to this
 * repository, and the repository talks to the database (via the Store). This is
 * the single persistence boundary for the pipeline.
 */
export class CollectorRepository {
  constructor(private readonly store: Store) {}

  /** Active Facebook Groups for a workspace (the Collector knows only groups). */
  async listActiveGroups(workspaceId: string): Promise<FacebookGroupRecord[]> {
    const groups = await this.store.listFacebookGroupsByWorkspace(workspaceId);
    return groups.filter((g) => g.status === 'active');
  }

  /** The workspace's Facebook account (for the connected-session check). */
  getFacebookAccount(workspaceId: string): Promise<FacebookAccountRecord | null> {
    return this.store.getFacebookAccountByWorkspace(workspaceId);
  }

  getCheckpoint(groupId: string): Promise<CollectorCheckpointRecord | null> {
    return this.store.getCheckpointByGroup(groupId);
  }

  async saveCheckpoint(input: {
    workspaceId: string;
    groupId: string;
    lastPostId: string | null;
    lastPostUrl: string | null;
    lastScan: Date | null;
    lastCursor: string | null;
  }): Promise<void> {
    try {
      await this.store.upsertCheckpoint({ id: newId(), ...input });
    } catch (err) {
      throw new CollectorError(
        CollectorErrorCode.CHECKPOINT_ERROR,
        `Checkpoint save failed: ${(err as Error).message}`,
      );
    }
  }

  /**
   * Duplicate detection, in priority order:
   *   1. Facebook post URL
   *   2. facebook_post_id
   *   3. normalized hash
   */
  async isDuplicate(
    workspaceId: string,
    keys: { postUrl: string; facebookPostId: string | null; normalizedHash: string },
  ): Promise<boolean> {
    if (await this.store.signalExistsByUrl(workspaceId, keys.postUrl)) return true;
    if (
      keys.facebookPostId &&
      (await this.store.signalExistsByFacebookPostId(workspaceId, keys.facebookPostId))
    )
      return true;
    if (await this.store.signalExistsByHash(workspaceId, keys.normalizedHash)) return true;
    return false;
  }

  /**
   * Persist the immutable raw capture and the normalized Signal — IDEMPOTENTLY.
   *
   * A duplicate post (same canonical URL, Facebook post id, or normalized hash)
   * is a normal, expected condition (pinned posts render twice; re-runs re-see
   * the same feed). It must NOT become a REPOSITORY_ERROR: we pre-check every
   * identity, and we also catch a unique-constraint (duplicate-key) race and
   * convert it into an idempotent skip. An existing Signal is NEVER rewritten.
   * Returns `{ inserted: false }` for a skip so the caller can count it.
   */
  async persistSignal(input: {
    workspaceId: string;
    groupId: string;
    capture: RawSignalCapture;
    contentHash: string;
    normalized: NormalizedSignalData;
  }): Promise<PersistResult> {
    const { workspaceId, groupId, capture, contentHash, normalized } = input;

    // Duplicate normalized Signal already exists (URL → post id → hash)?
    const exists =
      (await this.store.signalExistsByUrl(workspaceId, normalized.postUrl)) ||
      (normalized.facebookPostId
        ? await this.store.signalExistsByFacebookPostId(workspaceId, normalized.facebookPostId)
        : false) ||
      (await this.store.signalExistsByHash(workspaceId, normalized.normalizedHash));
    if (exists) return { inserted: false };

    try {
      // Raw capture: guarded insert; a duplicate-key race is an idempotent skip.
      if (!(await this.store.rawSignalExistsByUrl(workspaceId, capture.postUrl))) {
        try {
          await this.store.createRawSignal({
            id: newId(),
            workspaceId,
            groupId,
            facebookPostId: capture.facebookPostId,
            postUrl: capture.postUrl,
            rawHtml: capture.rawHtml,
            rawJson: capture.rawJson,
            contentHash,
          });
        } catch (err) {
          if (!isDuplicateKeyError(err)) throw err;
        }
      }

      await this.store.createSignal({
        id: newId(),
        workspaceId,
        groupId,
        facebookPostId: normalized.facebookPostId,
        postUrl: normalized.postUrl,
        authorName: normalized.authorName,
        authorProfile: normalized.authorProfile,
        message: normalized.message,
        mediaUrls: normalized.mediaUrls,
        createdTime: normalized.createdTime,
        normalizedHash: normalized.normalizedHash,
      });
      return { inserted: true };
    } catch (err) {
      // A duplicate-key conflict here is a race (another insert won) — skip it.
      if (isDuplicateKeyError(err)) return { inserted: false };
      // Surface only a SAFE DB error code (e.g. ER_DATA_TOO_LONG) — never the
      // offending value / post content.
      const dbCode = (err as { code?: string }).code;
      throw new CollectorError(
        CollectorErrorCode.REPOSITORY_ERROR,
        `Signal persistence failed${dbCode ? ` (${dbCode})` : ''}`,
      );
    }
  }

  countSignals(workspaceId: string): Promise<number> {
    return this.store.countSignalsByWorkspace(workspaceId);
  }

  createRun(workspaceId: string): Promise<CollectorRunRecord> {
    return this.store.createCollectorRun(newId(), workspaceId);
  }

  updateRun(id: string, input: UpdateCollectorRunInput): Promise<CollectorRunRecord | null> {
    return this.store.updateCollectorRun(id, input);
  }

  getRun(id: string): Promise<CollectorRunRecord | null> {
    return this.store.getCollectorRunById(id);
  }

  latestRun(workspaceId: string): Promise<CollectorRunRecord | null> {
    return this.store.getLatestCollectorRun(workspaceId);
  }

  listRuns(workspaceId: string, limit?: number): Promise<CollectorRunRecord[]> {
    return this.store.listCollectorRuns(workspaceId, limit);
  }
}
