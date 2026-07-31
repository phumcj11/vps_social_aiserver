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

/**
 * A supported Facebook post URL — https, on facebook.com, with a real path.
 * We deliberately accept only Facebook post/group URLs (the Signal's post URL),
 * never arbitrary or non-https links.
 */
const FACEBOOK_POST_URL_RE = /^https:\/\/(?:www\.|m\.|web\.|mbasic\.)?facebook\.com\/[^\s]+$/i;

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

  // Safe target URL — the Signal's Facebook post URL only.
  const targetUrl = signal.postUrl?.trim() ?? '';
  if (!FACEBOOK_POST_URL_RE.test(targetUrl)) {
    throw new ActionError(
      ActionErrorCode.UNSAFE_TARGET_URL,
      'Target URL is not a supported Facebook post URL',
    );
  }

  return {
    workspaceId,
    reviewTaskId: reviewTask.id,
    aiDraftId: draft.id,
    businessMatchId: match.id,
    actionType,
    targetPlatform: 'facebook',
    targetUrl,
    approvedContent,
  };
}
