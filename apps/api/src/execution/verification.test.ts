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
