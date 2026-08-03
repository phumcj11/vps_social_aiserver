import type {
  ReviewTaskRecord,
  AiDraftRecord,
  OpportunityRecord,
  SignalRecord,
  BusinessMatchRecord,
  ActionType,
} from '../store/types';
import type { ActionIntent } from './types';
import { ActionError, ActionErrorCode } from './errors';
import { parseCanonicalFacebookPostUrl, CanonicalUrlError } from './canonical-url';

export interface IntentBuilderInput {
  workspaceId: string;
  reviewTask: ReviewTaskRecord;
  draft: AiDraftRecord;
  opportunity: OpportunityRecord;
  signal: SignalRecord;
  match: BusinessMatchRecord;
  actionType: ActionType;
}

/**
 * ActionIntentBuilder (SPRINT 011) — PURE.
 *
 * Builds an IMMUTABLE Action intent from an APPROVED Review Task. It uses the
 * edited content when present, otherwise the Draft content; it rejects missing
 * content, an unsafe target URL, a non-approved review, or cross-workspace
 * records. The intent carries NO Facebook credentials and NO browser metadata.
 */
export function buildActionIntent(input: IntentBuilderInput): ActionIntent {
  const { workspaceId, reviewTask, draft, opportunity, signal, match, actionType } = input;

  // Ownership — every record must belong to the same workspace.
  if (
    reviewTask.workspaceId !== workspaceId ||
    draft.workspaceId !== workspaceId ||
    opportunity.workspaceId !== workspaceId ||
    signal.workspaceId !== workspaceId ||
    match.workspaceId !== workspaceId
  ) {
    throw new ActionError(
      ActionErrorCode.INVALID_WORKSPACE,
      'Records span more than one workspace',
    );
  }

  // Only APPROVED reviews may create an Action intent (rules 1–2).
  if (reviewTask.status !== 'APPROVED') {
    throw new ActionError(
      ActionErrorCode.REVIEW_NOT_APPROVED,
      `Review is ${reviewTask.status}; only APPROVED reviews create actions`,
    );
  }

  // Approved content: edited text when present, otherwise the draft content.
  const edited = reviewTask.editedContent?.trim() ?? '';
  const draftContent = draft.content?.trim() ?? '';
  const approvedContent = edited.length > 0 ? edited : draftContent;
  if (approvedContent.length === 0) {
    throw new ActionError(ActionErrorCode.MISSING_CONTENT, 'Approved content is empty');
  }

  // Safe target URL — the Signal's Facebook post URL only. Strict `URL` parsing
  // (SPRINT 012) replaces the old regex; it also derives the deterministic
  // targetPostKey used for database-level idempotency.
  const rawUrl = signal.postUrl?.trim() ?? '';
  let canonicalUrl: string;
  let targetPostKey: string;
  try {
    const parsed = parseCanonicalFacebookPostUrl(rawUrl);
    canonicalUrl = parsed.canonicalUrl;
    targetPostKey = parsed.targetPostKey;
  } catch (err) {
    if (err instanceof CanonicalUrlError) {
      throw new ActionError(
        ActionErrorCode.UNSAFE_TARGET_URL,
        `Target URL is not a supported Facebook post URL: ${err.message}`,
      );
    }
    throw err;
  }

  return {
    workspaceId,
    reviewTaskId: reviewTask.id,
    aiDraftId: draft.id,
    businessMatchId: match.id,
    actionType,
    targetPlatform: 'facebook',
    targetUrl: canonicalUrl,
    targetPostKey,
    approvedContent,
  };
}
