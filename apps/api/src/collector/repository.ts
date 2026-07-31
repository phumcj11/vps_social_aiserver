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

  /** Persist the immutable raw capture and the normalized Signal. */
  async persistSignal(input: {
    workspaceId: string;
    groupId: string;
    capture: RawSignalCapture;
    contentHash: string;
    normalized: NormalizedSignalData;
  }): Promise<void> {
    const { workspaceId, groupId, capture, contentHash, normalized } = input;
    try {
      if (!(await this.store.rawSignalExistsByUrl(workspaceId, capture.postUrl))) {
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
    } catch (err) {
      throw new CollectorError(
        CollectorErrorCode.REPOSITORY_ERROR,
        `Signal persistence failed: ${(err as Error).message}`,
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
