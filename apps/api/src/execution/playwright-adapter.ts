import type { ApiEnv } from '../lib/env';
import type { EvidenceType } from '../store/types';
import type {
  FacebookCommentAdapter,
  ExecutionContext,
  TargetVerification,
  PreparedComment,
  TypedContentObservation,
  SubmitOutcome,
  SubmittedCommentObservation,
  EvidenceCapture,
} from './types';
import type { ExecutionInterrupt } from './types';
import type { FacebookCommentPage, PageInterrupt } from './comment-page';
import { buildEvidenceStorageKey } from './evidence-storage';
import { parseCanonicalFacebookPostUrl } from '../action/canonical-url';
import { ExecutionError, ExecutionErrorCode } from './errors';

/**
 * The five independent enablement flags a real Facebook comment write requires,
 * ALL of which must be intentionally set. Any one in its safe state means a real
 * submit is refused. Checked here as the adapter's own gate, in addition to the
 * executor's kill-switch check and the coordinator's policy/idempotency gates.
 */
export function playwrightGateBlockers(env: ApiEnv): string[] {
  const blockers: string[] = [];
  if (!env.ACTION_ENGINE_ENABLED) blockers.push('ACTION_ENGINE_ENABLED must be true');
  if (!env.FACEBOOK_WRITE_ACTION_ENABLED)
    blockers.push('FACEBOOK_WRITE_ACTION_ENABLED must be true');
  if (!env.FACEBOOK_COMMENT_ENABLED) blockers.push('FACEBOOK_COMMENT_ENABLED must be true');
  if (env.GLOBAL_KILL_SWITCH) blockers.push('GLOBAL_KILL_SWITCH must be false');
  if (env.FACEBOOK_COMMENT_ADAPTER !== 'playwright') {
    blockers.push('FACEBOOK_COMMENT_ADAPTER must be playwright');
  }
  return blockers;
}

/** Exclusive browser-profile lock (one Chromium per workspace, ever). */
export interface ProfileLock {
  acquire(): Promise<void>;
  release(): Promise<void>;
}

/** Optional host-resource guard (low RAM / disk warning aborts before write). */
export interface ResourceGuard {
  check(): { ok: boolean; reason?: string };
}

/** prepare_only never types/submits; submit_once may, if fully authorized. */
export type AdapterMode = 'prepare_only' | 'submit_once';

export interface PlaywrightAdapterDeps {
  env: ApiEnv;
  /** Operating mode. prepare_only is the read-only readiness probe. */
  mode: AdapterMode;
  /** Explicit one-shot submit authorization from the executor. */
  submitAuthorized: boolean;
  /** Injected browser seam (real PlaywrightCommentPage or a test fake). */
  page: FacebookCommentPage;
  /** Injected exclusive profile lock (acquired before browsing). */
  lock: ProfileLock;
  /** Optional host-resource guard, evaluated before typing and before submit. */
  resourceGuard?: ResourceGuard;
}

/** Map a page interrupt to a safe pre-submit abort code. */
const INTERRUPT_CODE: Record<PageInterrupt, string> = {
  login_required: ExecutionErrorCode.LOGIN_REQUIRED,
  checkpoint: ExecutionErrorCode.CHECKPOINT_REQUIRED,
  captcha: ExecutionErrorCode.CAPTCHA_PRESENT,
  account_restricted: ExecutionErrorCode.ACCOUNT_RESTRICTED,
};

/**
 * PlaywrightFacebookCommentAdapter (PILOT 0 real comment adapter) — the REAL,
 * gated Facebook comment execution path behind the existing adapter interface.
 *
 * It replaces the former disabled boundary. Real typing/submitting is refused
 * unless EVERY gate passes together:
 *   1. all five enablement flags set (playwrightGateBlockers),
 *   2. mode === 'submit_once',
 *   3. an explicit one-shot submit authorization from the executor,
 *   4. the global kill switch is OFF, re-checked immediately before submit.
 * Under the mandated safe defaults, submit is always refused with a safe code
 * and NOTHING is typed. `prepare_only` is a strictly read-only probe: it opens
 * the target, verifies identity/availability, locates the composer, and checks
 * for a duplicate — but NEVER focuses, types, reacts, likes, messages, joins, or
 * submits.
 *
 * The adapter OBSERVES and ACTS on the page and manages the profile lock; all
 * success/mismatch/verification JUDGMENTS live in the verification service, and
 * all policy/state/idempotency/authorization live in the coordinator/executor.
 */
export class PlaywrightFacebookCommentAdapter implements FacebookCommentAdapter {
  readonly name = 'playwright' as const;
  private lockHeld = false;
  private submitted = false;
  private opened = false;

  constructor(private readonly deps: PlaywrightAdapterDeps) {}

  private get env(): ApiEnv {
    return this.deps.env;
  }

  /** Blockers preventing a real submit right now (empty ⇒ a submit may proceed). */
  submitBlockers(): { code: string; reasons: string[] } {
    if (this.deps.mode !== 'submit_once') {
      return {
        code: ExecutionErrorCode.PREPARE_ONLY_MODE,
        reasons: ['adapter mode is not submit_once'],
      };
    }
    if (!this.deps.submitAuthorized) {
      return {
        code: ExecutionErrorCode.SUBMIT_NOT_AUTHORIZED,
        reasons: ['no explicit one-shot submit authorization'],
      };
    }
    const gate = playwrightGateBlockers(this.env);
    if (gate.length > 0) return { code: ExecutionErrorCode.ADAPTER_DISABLED, reasons: gate };
    // Re-check the kill switch at the last possible moment.
    if (this.env.GLOBAL_KILL_SWITCH) {
      return { code: ExecutionErrorCode.KILL_SWITCH_ON, reasons: ['GLOBAL_KILL_SWITCH is on'] };
    }
    return { code: '', reasons: [] };
  }

  private assertMayWrite(): void {
    const { code, reasons } = this.submitBlockers();
    if (code) {
      throw new ExecutionError(
        code as (typeof ExecutionErrorCode)[keyof typeof ExecutionErrorCode],
        `Real comment write refused: ${reasons.join('; ')}`,
        { reasons },
      );
    }
  }

  private resourceOk(): { ok: boolean; reason?: string } {
    return this.deps.resourceGuard ? this.deps.resourceGuard.check() : { ok: true };
  }

  private async ensureLock(): Promise<boolean> {
    if (this.lockHeld) return true;
    try {
      await this.deps.lock.acquire();
      this.lockHeld = true;
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Open the target and run every read-only pre-submit check. Returns ok:false
   * (never throws) with a safe code as `reason` on ANY abort condition, so the
   * verification service turns it into a clean pre-submit failure — no write.
   */
  async verifyTarget(ctx: ExecutionContext): Promise<TargetVerification> {
    const res = this.resourceOk();
    if (!res.ok) return unverified(ExecutionErrorCode.RESOURCE_GUARD, res.reason);

    if (!(await this.ensureLock())) {
      return unverified(ExecutionErrorCode.BROWSER_PROFILE_BUSY, 'Browser profile is locked');
    }

    const obs = await this.deps.page.open(ctx.targetUrl);
    this.opened = true;

    if (obs.interrupt) {
      return unverified(INTERRUPT_CODE[obs.interrupt], `Platform interrupt: ${obs.interrupt}`);
    }
    if (!obs.postVisible) {
      return unverified(ExecutionErrorCode.POST_NOT_VISIBLE, 'Target post is not visible');
    }
    if (obs.redirected) {
      return unverified(ExecutionErrorCode.UNEXPECTED_REDIRECT, 'Navigation left the target post');
    }

    // Identity: derive the observed post key the SAME way the intent did.
    let observedPostKey: string | null = null;
    if (obs.observedUrl) {
      try {
        observedPostKey = parseCanonicalFacebookPostUrl(obs.observedUrl).targetPostKey;
      } catch {
        observedPostKey = null;
      }
    }

    if (!obs.commentsAvailable) {
      return {
        ok: false,
        observedPostUrl: obs.observedUrl,
        observedPostKey,
        reason: ExecutionErrorCode.COMMENTS_DISABLED,
      };
    }

    const dup = await this.deps.page.findExistingComment(ctx.approvedContent);
    if (dup.matchFound) {
      return {
        ok: false,
        observedPostUrl: obs.observedUrl,
        observedPostKey,
        reason: ExecutionErrorCode.DUPLICATE_COMMENT_EXISTS,
      };
    }

    const input = await this.deps.page.locateCommentInput();
    if (input.candidateCount === 0) {
      return {
        ok: false,
        observedPostUrl: obs.observedUrl,
        observedPostKey,
        reason: ExecutionErrorCode.COMMENT_INPUT_NOT_FOUND,
      };
    }
    if (input.candidateCount > 1) {
      return {
        ok: false,
        observedPostUrl: obs.observedUrl,
        observedPostKey,
        reason: ExecutionErrorCode.MULTIPLE_INPUT_CANDIDATES,
      };
    }

    return { ok: true, observedPostUrl: obs.observedUrl, observedPostKey };
  }

  /**
   * Type the approved content — ONLY on a fully-authorized submit_once path.
   * In prepare_only, or without authorization, this refuses BEFORE typing.
   */
  async prepareComment(ctx: ExecutionContext): Promise<PreparedComment> {
    this.assertMayWrite();
    const res = this.resourceOk();
    if (!res.ok) {
      throw new ExecutionError(ExecutionErrorCode.RESOURCE_GUARD, res.reason ?? 'Resource guard');
    }
    await this.deps.page.typeIntoCommentInput(ctx.approvedContent);
    return { ok: true, typedContent: ctx.approvedContent };
  }

  async verifyTypedContent(_ctx: ExecutionContext): Promise<TypedContentObservation> {
    const typedContent = await this.deps.page.readCommentInput();
    return { typedContent };
  }

  /**
   * Submit exactly once — the single real Facebook write. Every gate is
   * re-checked here (including the kill switch), and a second submit after any
   * outcome is structurally impossible (`submitted` latch).
   */
  async submitComment(_ctx: ExecutionContext): Promise<SubmitOutcome> {
    this.assertMayWrite();
    const res = this.resourceOk();
    if (!res.ok) {
      throw new ExecutionError(ExecutionErrorCode.RESOURCE_GUARD, res.reason ?? 'Resource guard');
    }
    if (this.submitted) {
      // Never submit twice — an ambiguous first outcome routes to human recovery.
      return { status: 'ambiguous', reason: 'Submit already attempted once' };
    }
    this.submitted = true;
    try {
      await this.deps.page.submitComment();
      return { status: 'submitted' };
    } catch (err) {
      const interrupt = interruptFromError(err);
      if (interrupt) {
        return { status: 'ambiguous', reason: `Interrupt during submit: ${interrupt}`, interrupt };
      }
      // Outcome unknown — NEVER a blind retry; hand to human recovery.
      return { status: 'ambiguous', reason: `Submit outcome unknown: ${(err as Error).message}` };
    }
  }

  async verifySubmittedComment(ctx: ExecutionContext): Promise<SubmittedCommentObservation> {
    return this.deps.page.findSubmittedComment(ctx.approvedContent);
  }

  async captureEvidence(
    ctx: ExecutionContext,
    evidenceType: EvidenceType,
  ): Promise<EvidenceCapture> {
    const bytes = await this.deps.page.screenshot().catch(() => null);
    const { storageKey, evidenceHash } = buildEvidenceStorageKey({
      workspaceId: ctx.workspaceId,
      actionJobId: ctx.actionJobId,
      sessionId: ctx.sessionId,
      label: evidenceType,
      bytes: bytes ?? undefined,
    });
    // Only a redacted image + its hash + adapter version — never HTML/cookies.
    return {
      evidenceType,
      storageKey,
      evidenceHash,
      metadata: { adapter: 'playwright', captured: bytes != null, adapterVersion: ADAPTER_VERSION },
    };
  }

  /** Close Chromium and ALWAYS release the profile lock (idempotent). */
  async close(): Promise<void> {
    try {
      if (this.opened) await this.deps.page.close();
    } finally {
      this.opened = false;
      if (this.lockHeld) {
        await this.deps.lock.release().catch(() => undefined);
        this.lockHeld = false;
      }
    }
  }
}

export const ADAPTER_VERSION = 'playwright-fb-comment-v1';

function unverified(code: string, detail?: string): TargetVerification {
  return {
    ok: false,
    observedPostUrl: null,
    observedPostKey: null,
    reason: detail ? `${code}: ${detail}` : code,
  };
}

/**
 * Best-effort classification of a mid-submit error into an execution interrupt.
 * These pause for human recovery and NEVER auto-retry. A mid-submit login/
 * session loss maps to `session_expired`.
 */
function interruptFromError(err: unknown): ExecutionInterrupt | null {
  const m = (err as Error)?.message?.toLowerCase() ?? '';
  if (m.includes('checkpoint')) return 'checkpoint_required';
  if (m.includes('captcha')) return 'captcha';
  if (m.includes('login') || m.includes('session')) return 'session_expired';
  if (m.includes('restrict')) return 'account_restricted';
  return null;
}
