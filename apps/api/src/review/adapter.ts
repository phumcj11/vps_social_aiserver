import type { ReviewPresentation, AdapterRef, ReviewStatus } from './types';

/**
 * ReviewAdapter (SPRINT 010) — the boundary between the Review Engine and a
 * presentation/notification channel (Telegram is the first; others could follow).
 *
 * An adapter ONLY presents reviews and relays them; it holds NO business logic,
 * stores NO authoritative state, and NEVER writes to the database. Human
 * decisions always flow back through the Review API → Coordinator → Repository.
 * The Review Engine works with NO adapter at all.
 */
export interface ReviewAdapter {
  readonly name: string;
  /** Present a new review; returns a handle (e.g. message id) for later updates. */
  sendReview(presentation: ReviewPresentation): Promise<AdapterRef>;
  /** Reflect a change (e.g. an edit) in the already-sent review. */
  updateReview(ref: AdapterRef, presentation: ReviewPresentation): Promise<void>;
  /** Close the review after a terminal decision. */
  closeReview(ref: AdapterRef, outcome: ReviewStatus): Promise<void>;
}

/**
 * NoopReviewAdapter — the engine's default when no channel is configured. It
 * does nothing (the review lives entirely in the database and the web UI). This
 * is what makes the Review Engine work WITHOUT Telegram.
 */
export class NoopReviewAdapter implements ReviewAdapter {
  readonly name = 'noop';

  async sendReview(presentation: ReviewPresentation): Promise<AdapterRef> {
    await Promise.resolve();
    return { adapter: this.name, ref: presentation.reviewTaskId };
  }

  async updateReview(): Promise<void> {
    await Promise.resolve();
  }

  async closeReview(): Promise<void> {
    await Promise.resolve();
  }
}
