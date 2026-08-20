import { describe, expect, it } from 'vitest';
import { ExecutionVerificationService } from './verification';
import type { ExecutionContext, SubmitOutcome, SubmittedCommentObservation } from './types';

const svc = new ExecutionVerificationService();
const ctx: ExecutionContext = {
  workspaceId: 'w',
  actionJobId: 'j',
  sessionId: 's',
  attemptNumber: 1,
  targetUrl: 'https://www.facebook.com/groups/1/posts/2',
  targetPostKey: 'post-key',
  approvedContent: 'สวัสดีค่ะ',
  adapter: 'fake',
};

describe('preflight', () => {
  it('passes when target identity and typed content exactly match', () => {
    const v = svc.preflight(
      ctx,
      { ok: true, observedPostUrl: ctx.targetUrl, observedPostKey: 'post-key' },
      { typedContent: 'สวัสดีค่ะ' },
    );
    expect(v.ok).toBe(true);
  });

  it('fails on target identity mismatch', () => {
    const v = svc.preflight(
      ctx,
      { ok: true, observedPostUrl: ctx.targetUrl, observedPostKey: 'other' },
      { typedContent: 'สวัสดีค่ะ' },
    );
    expect(v).toMatchObject({ ok: false, reasonCode: 'TARGET_MISMATCH' });
  });

  it('fails when typed content is not EXACTLY the approved content', () => {
    const v = svc.preflight(
      ctx,
      { ok: true, observedPostUrl: ctx.targetUrl, observedPostKey: 'post-key' },
      { typedContent: 'สวัสดีค่ะ ' }, // trailing space differs
    );
    expect(v).toMatchObject({ ok: false, reasonCode: 'TYPED_CONTENT_MISMATCH' });
  });
});

describe('verifySubmission', () => {
  const submitted: SubmitOutcome = { status: 'submitted' };
  const good: SubmittedCommentObservation = {
    found: true,
    facebookCommentId: 'c1',
    observedContent: 'สวัสดีค่ะ',
    observedAuthor: 'Page',
    observedPostUrl: ctx.targetUrl,
  };

  it('verified only with id + exact content match', () => {
    expect(svc.verifySubmission(ctx, submitted, good).outcome).toBe('verified');
  });

  it('ambiguous when the submit outcome is unknown', () => {
    expect(svc.verifySubmission(ctx, { status: 'ambiguous' }, good).outcome).toBe('ambiguous');
  });

  it('ambiguous when the comment cannot be observed after a claimed submit', () => {
    expect(svc.verifySubmission(ctx, submitted, { ...good, found: false }).outcome).toBe(
      'ambiguous',
    );
  });

  it('ambiguous when there is no comment id (a screenshot is not enough)', () => {
    expect(svc.verifySubmission(ctx, submitted, { ...good, facebookCommentId: null }).outcome).toBe(
      'ambiguous',
    );
  });

  it('ambiguous when observed content does not exactly match', () => {
    expect(
      svc.verifySubmission(ctx, submitted, { ...good, observedContent: 'สวัสดี' }).outcome,
    ).toBe('ambiguous');
  });

  it('failed when the submit itself failed', () => {
    expect(svc.verifySubmission(ctx, { status: 'failed' }, good).outcome).toBe('failed');
  });
});

describe('verifySubmission — normalized match-count path (real adapter)', () => {
  const submitted: SubmitOutcome = { status: 'submitted' };
  const base: SubmittedCommentObservation = {
    found: true,
    facebookCommentId: null, // id is OPTIONAL on this path
    observedContent: 'สวัสดีค่ะ',
    observedAuthor: null,
    observedPostUrl: ctx.targetUrl,
  };

  it('verified with exactly one normalized match and NO comment id', () => {
    expect(svc.verifySubmission(ctx, submitted, { ...base, matchCount: 1 }).outcome).toBe(
      'verified',
    );
  });

  it('verified when the observed text differs only cosmetically (em-dash/emoji)', () => {
    const ctx2 = { ...ctx, approvedContent: 'ทดสอบ — ค่ะ 😊' };
    const obs: SubmittedCommentObservation = {
      ...base,
      matchCount: 1,
      observedContent: 'ทดสอบ - ค่ะ 😊️',
    };
    expect(svc.verifySubmission(ctx2, submitted, obs).outcome).toBe('verified');
  });

  it('ambiguous (DUPLICATE_OBSERVED) when more than one match exists', () => {
    const v = svc.verifySubmission(ctx, submitted, { ...base, matchCount: 2 });
    expect(v).toMatchObject({ outcome: 'ambiguous', reasonCode: 'DUPLICATE_OBSERVED' });
  });

  it('ambiguous (COMMENT_NOT_OBSERVED) when zero matches', () => {
    const v = svc.verifySubmission(ctx, submitted, { ...base, found: true, matchCount: 0 });
    expect(v).toMatchObject({ outcome: 'ambiguous', reasonCode: 'COMMENT_NOT_OBSERVED' });
  });

  it('ambiguous when the single match content does not normalize-equal', () => {
    const obs: SubmittedCommentObservation = {
      ...base,
      matchCount: 1,
      observedContent: 'ข้อความอื่นโดยสิ้นเชิง',
    };
    expect(svc.verifySubmission(ctx, submitted, obs).outcome).toBe('ambiguous');
  });
});
