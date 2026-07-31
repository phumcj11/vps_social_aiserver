/**
 * Human Review Engine types (SPRINT 010).
 *
 * The Review Engine is the CORE human-in-the-loop step: an AI Draft becomes a
 * Review Task a human approves, rejects, or edits. Telegram is ONLY the first
 * Review Adapter (presentation) — it is never the source of truth, never writes
 * to the database, and the engine works without it (docs/11-telegram-design.md).
 *
 * This sprint records human decisions only. There is NO Facebook comment/message/
 * write, NO Action Engine, and NO auto-approval.
 */

import type { ReviewStatus } from '../store/types';

export type { ReviewStatus };

/** The three human review decisions. */
export type ReviewDecision = 'APPROVE' | 'REJECT' | 'EDIT';

/**
 * A SAFE, channel-agnostic presentation of a review, handed to a Review Adapter.
 * Contains only reviewable content — no secrets, no session data, no internal
 * database metadata, no chain-of-thought.
 */
export interface ReviewPresentation {
  reviewTaskId: string;
  status: ReviewStatus;
  business: { name: string };
  opportunity: { decision: string; message: string | null };
  draft: { content: string | null; version: number; status: string };
  editedContent: string | null;
  links: { facebookPostUrl: string | null; businessUrl: string | null };
}

/** A handle a Review Adapter returns for a delivered review (e.g. a message id). */
export interface AdapterRef {
  adapter: string;
  ref: string;
}
