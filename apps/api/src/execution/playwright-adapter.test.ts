import { describe, expect, it } from 'vitest';
import { loadApiEnv, type ApiEnv } from '../lib/env';
import {
  PlaywrightFacebookCommentAdapter,
  playwrightGateBlockers,
  type ProfileLock,
  type ResourceGuard,
  type AdapterMode,
} from './playwright-adapter';
import { ExecutionErrorCode } from './errors';
import { isSafeEvidenceStorageKey } from './evidence-storage';
import type { ExecutionContext } from './types';
import type {
  FacebookCommentPage,
  PageTargetObservation,
  CommentInputObservation,
  ExistingCommentObservation,
} from './comment-page';
import type { SubmittedCommentObservation } from './types';

// ── Fakes (no Playwright, no network) ───────────────────────────────────────

const TARGET = 'https://www.facebook.com/groups/852200259424175/posts/1746038523373673';

const ctx: ExecutionContext = {
  workspaceId: 'a08bbd1f-9836-4c15-857e-065277fb1399',
  actionJobId: '53eca8fc-29b6-44aa-9bd7-c4b3807e3aa4',
  sessionId: '14ec3b18-449b-4e86-9e2b-b63382652097',
  attemptNumber: 1,
  targetUrl: TARGET,
  targetPostKey: 'k',
  approvedContent: 'สวัสดีค่ะ hello',
  adapter: 'playwright',
};

interface FakePageConfig {
  open?: Partial<PageTargetObservation>;
  inputCandidates?: number;
  existing?: boolean;
  readBack?: string;
  submitThrows?: Error;
  submittedFound?: boolean;
}

class FakePage implements FacebookCommentPage {
  openCalls = 0;
  typeCalls: string[] = [];
  submitCalls = 0;
  closeCalls = 0;
  constructor(private readonly cfg: FakePageConfig = {}) {}
  async open(): Promise<PageTargetObservation> {
    this.openCalls += 1;
    return {
      loaded: true,
      interrupt: null,
      observedUrl: TARGET,
      groupId: '852200259424175',
      postId: '1746038523373673',
      postVisible: true,
      commentsAvailable: true,
      redirected: false,
      ...this.cfg.open,
    };
  }
  async locateCommentInput(): Promise<CommentInputObservation> {
    const n = this.cfg.inputCandidates ?? 1;
    return { candidateCount: n, located: n === 1 };
  }
  async findExistingComment(): Promise<ExistingCommentObservation> {
    return { matchFound: this.cfg.existing ?? false };
  }
  async typeIntoCommentInput(content: string): Promise<void> {
    this.typeCalls.push(content);
  }
  async readCommentInput(): Promise<string> {
    return this.cfg.readBack ?? this.typeCalls[this.typeCalls.length - 1] ?? '';
  }
  async submitComment(): Promise<void> {
    this.submitCalls += 1;
    if (this.cfg.submitThrows) throw this.cfg.submitThrows;
  }
  async findSubmittedComment(needle: string): Promise<SubmittedCommentObservation> {
    const found = this.cfg.submittedFound ?? true;
    return {
      found,
      facebookCommentId: found ? 'c-1' : null,
      observedContent: found ? needle : null,
      observedAuthor: 'Test Page',
      observedPostUrl: TARGET,
    };
  }
  async screenshot(): Promise<Buffer | null> {
    return Buffer.from('redacted-png-bytes');
  }
  async close(): Promise<void> {
    this.closeCalls += 1;
  }
}

class FakeLock implements ProfileLock {
  acquireCalls = 0;
  releaseCalls = 0;
  throwOnAcquire = false;
  async acquire(): Promise<void> {
    this.acquireCalls += 1;
    if (this.throwOnAcquire) throw new Error('profile locked');
  }
  async release(): Promise<void> {
    this.releaseCalls += 1;
  }
}

const safeEnv = (): ApiEnv => loadApiEnv({});
const fullEnv = (over: Record<string, string> = {}): ApiEnv =>
  loadApiEnv({
    ACTION_ENGINE_ENABLED: 'true',
    FACEBOOK_WRITE_ACTION_ENABLED: 'true',
    FACEBOOK_COMMENT_ENABLED: 'true',
    GLOBAL_KILL_SWITCH: 'false',
    FACEBOOK_COMMENT_ADAPTER: 'playwright',
    ...over,
  });

function build(
  env: ApiEnv,
  mode: AdapterMode,
  submitAuthorized: boolean,
  page = new FakePage(),
  lock = new FakeLock(),
  resourceGuard?: ResourceGuard,
): { adapter: PlaywrightFacebookCommentAdapter; page: FakePage; lock: FakeLock } {
  const adapter = new PlaywrightFacebookCommentAdapter({
    env,
    mode,
    submitAuthorized,
    page,
    lock,
    resourceGuard,
  });
  return { adapter, page, lock };
}

// ── Gates ───────────────────────────────────────────────────────────────────

describe('playwrightGateBlockers', () => {
  it('lists every closed gate under the safe defaults', () => {
    expect(playwrightGateBlockers(safeEnv())).toEqual(
      expect.arrayContaining([
        'ACTION_ENGINE_ENABLED must be true',
        'FACEBOOK_WRITE_ACTION_ENABLED must be true',
        'FACEBOOK_COMMENT_ENABLED must be true',
        'GLOBAL_KILL_SWITCH must be false',
        'FACEBOOK_COMMENT_ADAPTER must be playwright',
      ]),
    );
  });
  it('is empty only when all five flags are intentionally set', () => {
    expect(playwrightGateBlockers(fullEnv())).toHaveLength(0);
  });
});

describe('submit is refused unless every hard gate passes', () => {
  it('refuses submit_once under the safe defaults (ADAPTER_DISABLED)', async () => {
    const { adapter, page } = build(safeEnv(), 'submit_once', true);
    await expect(adapter.submitComment(ctx)).rejects.toMatchObject({
      code: ExecutionErrorCode.ADAPTER_DISABLED,
    });
    expect(page.submitCalls).toBe(0);
  });

  it('refuses submit when authorization is absent even if fully flagged', async () => {
    const { adapter, page } = build(fullEnv(), 'submit_once', false);
    await expect(adapter.submitComment(ctx)).rejects.toMatchObject({
      code: ExecutionErrorCode.SUBMIT_NOT_AUTHORIZED,
    });
    expect(page.submitCalls).toBe(0);
  });

  it('refuses submit if ANY single flag is missing', async () => {
    const flags = [
      'ACTION_ENGINE_ENABLED',
      'FACEBOOK_WRITE_ACTION_ENABLED',
      'FACEBOOK_COMMENT_ENABLED',
    ];
    for (const missing of flags) {
      const { adapter, page } = build(fullEnv({ [missing]: 'false' }), 'submit_once', true);
      await expect(adapter.submitComment(ctx)).rejects.toMatchObject({
        code: ExecutionErrorCode.ADAPTER_DISABLED,
      });
      expect(page.submitCalls).toBe(0);
    }
  });

  it('re-checks the kill switch immediately before submit', async () => {
    // Fully flagged EXCEPT the kill switch is on → submit must not happen.
    const { adapter, page } = build(fullEnv({ GLOBAL_KILL_SWITCH: 'true' }), 'submit_once', true);
    await expect(adapter.submitComment(ctx)).rejects.toBeTruthy();
    expect(page.submitCalls).toBe(0);
  });
});

// ── prepare_only: never types or submits ────────────────────────────────────

describe('prepare_only mode', () => {
  it('opens the target read-only but never types or submits', async () => {
    const { adapter, page } = build(fullEnv(), 'prepare_only', false);
    const target = await adapter.verifyTarget(ctx);
    expect(target.ok).toBe(true);

    await expect(adapter.prepareComment(ctx)).rejects.toMatchObject({
      code: ExecutionErrorCode.PREPARE_ONLY_MODE,
    });
    await expect(adapter.submitComment(ctx)).rejects.toMatchObject({
      code: ExecutionErrorCode.PREPARE_ONLY_MODE,
    });
    expect(page.typeCalls).toHaveLength(0);
    expect(page.submitCalls).toBe(0);
  });
});

// ── verifyTarget aborts (all return ok:false, never throw) ───────────────────

describe('verifyTarget aborts before typing', () => {
  const cases: Array<[string, FakePageConfig, string]> = [
    [
      'login required',
      { open: { interrupt: 'login_required', postVisible: false, commentsAvailable: false } },
      ExecutionErrorCode.LOGIN_REQUIRED,
    ],
    [
      'checkpoint',
      { open: { interrupt: 'checkpoint', postVisible: false, commentsAvailable: false } },
      ExecutionErrorCode.CHECKPOINT_REQUIRED,
    ],
    [
      'captcha',
      { open: { interrupt: 'captcha', postVisible: false, commentsAvailable: false } },
      ExecutionErrorCode.CAPTCHA_PRESENT,
    ],
    [
      'account restricted',
      { open: { interrupt: 'account_restricted', postVisible: false, commentsAvailable: false } },
      ExecutionErrorCode.ACCOUNT_RESTRICTED,
    ],
    ['post not visible', { open: { postVisible: false } }, ExecutionErrorCode.POST_NOT_VISIBLE],
    [
      'redirected / wrong post',
      { open: { redirected: true } },
      ExecutionErrorCode.UNEXPECTED_REDIRECT,
    ],
    [
      'comments disabled',
      { open: { commentsAvailable: false } },
      ExecutionErrorCode.COMMENTS_DISABLED,
    ],
    ['duplicate comment exists', { existing: true }, ExecutionErrorCode.DUPLICATE_COMMENT_EXISTS],
    [
      'multiple input candidates',
      { inputCandidates: 2 },
      ExecutionErrorCode.MULTIPLE_INPUT_CANDIDATES,
    ],
    ['no input found', { inputCandidates: 0 }, ExecutionErrorCode.COMMENT_INPUT_NOT_FOUND],
  ];
  for (const [label, cfg, code] of cases) {
    it(`aborts on: ${label}`, async () => {
      const { adapter, page } = build(fullEnv(), 'submit_once', true, new FakePage(cfg));
      const target = await adapter.verifyTarget(ctx);
      expect(target.ok).toBe(false);
      expect(target.reason).toContain(code);
      expect(page.typeCalls).toHaveLength(0);
      expect(page.submitCalls).toBe(0);
    });
  }

  it('verifies a clean target and returns the observed identity', async () => {
    const { adapter } = build(fullEnv(), 'submit_once', true);
    const target = await adapter.verifyTarget(ctx);
    expect(target.ok).toBe(true);
    expect(target.observedPostUrl).toBe(TARGET);
    // Observed key is derived the SAME way the intent-builder derives it.
    expect(target.observedPostKey).toMatch(/^[0-9a-f]{64}$/);
  });

  it('aborts on a profile-lock conflict without opening the browser', async () => {
    const lock = new FakeLock();
    lock.throwOnAcquire = true;
    const { adapter, page } = build(fullEnv(), 'submit_once', true, new FakePage(), lock);
    const target = await adapter.verifyTarget(ctx);
    expect(target.ok).toBe(false);
    expect(target.reason).toContain(ExecutionErrorCode.BROWSER_PROFILE_BUSY);
    expect(page.openCalls).toBe(0);
  });

  it('aborts under a resource guard (low memory / disk)', async () => {
    const guard: ResourceGuard = { check: () => ({ ok: false, reason: 'low memory' }) };
    const { adapter, page } = build(
      fullEnv(),
      'submit_once',
      true,
      new FakePage(),
      new FakeLock(),
      guard,
    );
    const target = await adapter.verifyTarget(ctx);
    expect(target.ok).toBe(false);
    expect(target.reason).toContain(ExecutionErrorCode.RESOURCE_GUARD);
    expect(page.openCalls).toBe(0);
  });
});

// ── submit_once: typing, one-submit, verified/failed/ambiguous ───────────────

describe('authorized submit_once flow', () => {
  it('types the EXACT approved content', async () => {
    const { adapter, page } = build(fullEnv(), 'submit_once', true);
    const prep = await adapter.prepareComment(ctx);
    expect(prep.typedContent).toBe(ctx.approvedContent);
    expect(page.typeCalls).toEqual([ctx.approvedContent]);
    const typed = await adapter.verifyTypedContent(ctx);
    expect(typed.typedContent).toBe(ctx.approvedContent);
  });

  it('reads back a corrupted composer verbatim (mismatch is judged upstream)', async () => {
    const { adapter } = build(
      fullEnv(),
      'submit_once',
      true,
      new FakePage({ readBack: 'tampered' }),
    );
    const typed = await adapter.verifyTypedContent(ctx);
    expect(typed.typedContent).toBe('tampered');
  });

  it('submits exactly once and reports submitted', async () => {
    const { adapter, page } = build(fullEnv(), 'submit_once', true);
    const out = await adapter.submitComment(ctx);
    expect(out.status).toBe('submitted');
    expect(page.submitCalls).toBe(1);
  });

  it('never submits twice — a second call is ambiguous, not a re-submit', async () => {
    const { adapter, page } = build(fullEnv(), 'submit_once', true);
    await adapter.submitComment(ctx);
    const second = await adapter.submitComment(ctx);
    expect(second.status).toBe('ambiguous');
    expect(page.submitCalls).toBe(1); // still one — no auto retry
  });

  it('classifies an unknown submit outcome as ambiguous (no auto retry)', async () => {
    const page = new FakePage({ submitThrows: new Error('navigation lost') });
    const { adapter } = build(fullEnv(), 'submit_once', true, page);
    const out = await adapter.submitComment(ctx);
    expect(out.status).toBe('ambiguous');
    expect(out.interrupt).toBeUndefined();
  });

  it('maps a checkpoint during submit to an ambiguous interrupt', async () => {
    const page = new FakePage({ submitThrows: new Error('checkpoint interstitial appeared') });
    const { adapter } = build(fullEnv(), 'submit_once', true, page);
    const out = await adapter.submitComment(ctx);
    expect(out.status).toBe('ambiguous');
    expect(out.interrupt).toBe('checkpoint_required');
  });

  it('verifies the submitted comment via the page observation', async () => {
    const { adapter } = build(fullEnv(), 'submit_once', true);
    const observed = await adapter.verifySubmittedComment(ctx);
    expect(observed.found).toBe(true);
    expect(observed.observedContent).toBe(ctx.approvedContent);
  });
});

// ── Lock + browser lifecycle, evidence safety ───────────────────────────────

describe('lifecycle and evidence', () => {
  it('always releases the lock and closes the browser on close', async () => {
    const { adapter, page, lock } = build(fullEnv(), 'submit_once', true);
    await adapter.verifyTarget(ctx);
    await adapter.close();
    expect(lock.acquireCalls).toBe(1);
    expect(lock.releaseCalls).toBe(1);
    expect(page.closeCalls).toBe(1);
  });

  it('releases the lock even when verifyTarget aborted', async () => {
    const { adapter, lock } = build(
      fullEnv(),
      'submit_once',
      true,
      new FakePage({ open: { interrupt: 'checkpoint', postVisible: false } }),
    );
    await adapter.verifyTarget(ctx);
    await adapter.close();
    expect(lock.releaseCalls).toBe(1);
  });

  it('captures evidence with a safe key and no session material', async () => {
    const { adapter } = build(fullEnv(), 'submit_once', true);
    const ev = await adapter.captureEvidence(ctx, 'post_submit_screenshot');
    expect(ev.storageKey).not.toBeNull();
    expect(isSafeEvidenceStorageKey(ev.storageKey!)).toBe(true);
    expect(ev.evidenceHash).toMatch(/^[0-9a-f]{64}$/);
    const keys = Object.keys(ev.metadata ?? {});
    for (const forbidden of ['cookie', 'token', 'password', 'profile', 'session', 'html']) {
      expect(keys.some((k) => k.toLowerCase().includes(forbidden))).toBe(false);
    }
  });
});
