/**
 * Collector Engine types (SPRINT 006).
 *
 * The Collector reads posts from Facebook Groups and stores them as SIGNALS.
 * A Signal is platform-independent: today a Facebook post; tomorrow a TikTok
 * video, Instagram reel, or LINE message. The Collector knows nothing about
 * Business, AI, Telegram, comments, approval, matching, or opportunities.
 */

export type CollectorState = 'idle' | 'running' | 'paused' | 'completed' | 'failed';

/** A raw capture extracted from the page — before normalization. */
export interface RawSignalCapture {
  postUrl: string;
  facebookPostId: string | null;
  rawHtml: string | null;
  rawJson: string | null;
  authorName: string | null;
  authorProfile: string | null;
  message: string | null;
  mediaUrls: string[];
  createdTime: string | null; // as found on the page
}

/** A normalized, platform-neutral Signal. */
export interface NormalizedSignalData {
  postUrl: string;
  facebookPostId: string | null;
  authorName: string | null;
  authorProfile: string | null;
  message: string | null;
  mediaUrls: string[];
  createdTime: Date | null;
  normalizedHash: string;
}

/** Options controlling a collection pass. */
export interface CollectOptions {
  maxScrolls: number;
  maxPosts: number;
  timeoutMs: number;
  signal?: AbortSignal;
}

/** Safe, client-facing run status (no post text, no secrets). */
export interface CollectorRunSummary {
  runId: string;
  status: CollectorState;
  startedAt: string;
  finishedAt: string | null;
  groupsProcessed: number;
  postsCollected: number;
  duplicatesSkipped: number;
  errors: number;
  errorSummary: string | null;
  durationMs: number | null;
}
