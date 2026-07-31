import { describe, expect, it } from 'vitest';
import { buildActionIntent, type IntentBuilderInput } from './intent-builder';
import { ActionError } from './errors';
import type {
  ReviewTaskRecord,
  AiDraftRecord,
  OpportunityRecord,
  SignalRecord,
  BusinessMatchRecord,
  ReviewStatus,
} from '../store/types';

const WS = 'ws-1';
const d = (ms: number) => new Date(1_700_000_000_000 + ms);

function baseInput(
  overrides: {
    reviewStatus?: ReviewStatus;
    editedContent?: string | null;
    draftContent?: string | null;
    postUrl?: string;
    workspaceOverride?: Partial<Record<'review' | 'draft' | 'opp' | 'signal' | 'match', string>>;
  } = {},
): IntentBuilderInput {
  const wo = overrides.workspaceOverride ?? {};
  const review: ReviewTaskRecord = {
    id: 'rt-1',
    workspaceId: wo.review ?? WS,
    businessMatchId: 'm-1',
    draftId: 'd-1',
    status: overrides.reviewStatus ?? 'APPROVED',
    assignedTo: null,
    editedContent: overrides.editedContent ?? null,
    editor: null,
    editedAt: null,
    decidedBy: 'u-1',
    decidedAt: d(0),
    decisionReason: null,
    createdAt: d(0),
    updatedAt: d(0),
  };
  const draft: AiDraftRecord = {
    id: 'd-1',
    workspaceId: wo.draft ?? WS,
    businessMatchId: 'm-1',
    opportunityId: 'o-1',
    businessId: 'b-1',
    version: 1,
    status: 'draft',
    content:
      overrides.draftContent === undefined ? 'สวัสดีค่ะ ยินดีให้บริการ' : overrides.draftContent,
    provider: 'mock',
    model: 'mock-draft-v1',
    promptVersion: 'rules-v1',
    inputSnapshot: null,
    policyResult: null,
    createdBy: null,
    createdAt: d(0),
    updatedAt: d(0),
  };
  const opportunity: OpportunityRecord = {
    id: 'o-1',
    workspaceId: wo.opp ?? WS,
    signalId: 's-1',
    decision: 'ACCEPT',
    status: 'READY',
    classifierVersion: 'rules-v1',
    createdAt: d(0),
    updatedAt: d(0),
  };
  const signal: SignalRecord = {
    id: 's-1',
    workspaceId: wo.signal ?? WS,
    groupId: 'g-1',
    facebookPostId: null,
    postUrl: overrides.postUrl ?? 'https://www.facebook.com/groups/1/posts/abc',
    authorName: 'A',
    authorProfile: null,
    message: 'หาช่างประปา',
    mediaUrls: [],
    createdTime: null,
    normalizedHash: 'h',
    normalizedAt: d(0),
  };
  const match: BusinessMatchRecord = {
    id: 'm-1',
    workspaceId: wo.match ?? WS,
    businessId: 'b-1',
    opportunityId: 'o-1',
    decision: 'MATCH',
    reasons: [{ ruleType: 'keyword', ruleValue: 'ประปา', matched: true }],
    matcherVersion: 'rules-v1',
    matchedAt: d(0),
  };
  return {
    workspaceId: WS,
    reviewTask: review,
    draft,
    opportunity,
    signal,
    match,
    actionType: 'facebook_comment',
  };
}

describe('ActionIntentBuilder', () => {
  it('builds an intent from an APPROVED review using the draft content', () => {
    const intent = buildActionIntent(baseInput());
    expect(intent.actionType).toBe('facebook_comment');
    expect(intent.targetPlatform).toBe('facebook');
    expect(intent.approvedContent).toBe('สวัสดีค่ะ ยินดีให้บริการ');
    expect(intent.targetUrl).toContain('facebook.com');
  });

  it('prefers edited content over draft content', () => {
    const intent = buildActionIntent(baseInput({ editedContent: 'ข้อความที่แก้ไขแล้วค่ะ' }));
    expect(intent.approvedContent).toBe('ข้อความที่แก้ไขแล้วค่ะ');
  });

  it('falls back to draft content when there is no edit', () => {
    const intent = buildActionIntent(baseInput({ editedContent: null }));
    expect(intent.approvedContent).toBe('สวัสดีค่ะ ยินดีให้บริการ');
  });

  it('rejects a PENDING review', () => {
    expect(() => buildActionIntent(baseInput({ reviewStatus: 'PENDING' }))).toThrow(ActionError);
  });

  it('rejects a REJECTED review', () => {
    expect(() => buildActionIntent(baseInput({ reviewStatus: 'REJECTED' }))).toThrow(ActionError);
  });

  it('rejects an EXPIRED review', () => {
    expect(() => buildActionIntent(baseInput({ reviewStatus: 'EXPIRED' }))).toThrow(ActionError);
  });

  it('rejects empty content (no edit, no draft)', () => {
    expect(() => buildActionIntent(baseInput({ editedContent: '  ', draftContent: null }))).toThrow(
      ActionError,
    );
  });

  it('rejects an unsafe (non-Facebook) target URL', () => {
    expect(() => buildActionIntent(baseInput({ postUrl: 'https://evil.example.com/x' }))).toThrow(
      ActionError,
    );
  });

  it('rejects records spanning more than one workspace', () => {
    expect(() =>
      buildActionIntent(baseInput({ workspaceOverride: { signal: 'other-ws' } })),
    ).toThrow(ActionError);
  });
});
