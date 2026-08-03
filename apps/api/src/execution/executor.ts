import type { ApiEnv } from '../lib/env';
import type { Logger } from '../lib/logger';
import type { ExecutionSessionRecord } from '../store/types';
import type { ExecutionSessionRepository } from './session-repository';
import type { ExecutionEvidenceRepository } from './evidence-repository';
import { ExecutionVerificationService } from './verification';
import type {
  FacebookCommentAdapter,
  ExecutionContext,
  ExecutionResult,
  ExecutionInterrupt,
} from './types';

export interface ActionExecutorDeps {
  sessions: ExecutionSessionRepository;
  evidence: ExecutionEvidenceRepository;
  verification: ExecutionVerificationService;
  env: ApiEnv;
  logger: Logger;
}

/** Map a platform interrupt to the session status it pauses in. */
const INTERRUPT_STATUS: Record<
  ExecutionInterrupt,
  'checkpoint_required' | 'session_expired' | 'account_restricted'
> = {
  checkpoint_required: 'checkpoint_required',
  session_expired: 'session_expired',
  account_restricted: 'account_restricted',
  captcha: 'checkpoint_required', // CAPTCHA is a checkpoint we NEVER bypass
};

/**
 * ActionExecutor (SPRINT 012).
 *
 * Drives ONE execution attempt through the session state machine, delegating all
 * page interaction to the injected adapter and all safety judgments to the
 * verification service. It:
 *   - checks the kill switch before execution, before submit, and refuses if set;
 *   - runs preflight (target identity + exact typed-content equality) and aborts
 *     BEFORE submit on any mismatch — no partial write;
 *   - treats an unknown outcome as AMBIGUOUS (human recovery), never a success,
 *     never an auto-retry;
 *   - records append-only evidence at each step, knowing a screenshot alone is
 *     never proof of success.
 *
 * It NEVER decides duplicate-idempotency or job terminal state — the coordinator
 * owns those. The executor owns the session and its evidence.
 */
export class ActionExecutor {
  constructor(private readonly deps: ActionExecutorDeps) {}

  private killSwitchOn(): boolean {
    return this.deps.env.GLOBAL_KILL_SWITCH;
  }

  async execute(
    ctx: ExecutionContext,
    session: ExecutionSessionRecord,
    adapter: FacebookCommentAdapter,
  ): Promise<ExecutionResult> {
    const now = () => new Date();
    let current = session;

    try {
      // ── Kill switch (before any execution) ────────────────────────────────
      if (this.killSwitchOn()) {
        current = await this.deps.sessions.transition(current, 'failed', now(), {
          errorCode: 'KILL_SWITCH_ON',
          errorMessage: 'Global kill switch is on',
        });
        return this.result('blocked', current, null, 'KILL_SWITCH_ON', 'Global kill switch is on');
      }

      // ── Preflight ─────────────────────────────────────────────────────────
      current = await this.deps.sessions.transition(current, 'preflight', now());
      const target = await adapter.verifyTarget(ctx);
      await this.deps.evidence.record({
        workspaceId: ctx.workspaceId,
        actionJobId: ctx.actionJobId,
        executionSessionId: ctx.sessionId,
        evidenceType: 'pre_submit_snapshot',
        observedPostUrl: target.observedPostUrl,
        observedAt: now(),
        metadata: { targetOk: target.ok },
      });

      await adapter.prepareComment(ctx);
      const typed = await adapter.verifyTypedContent(ctx);
      await this.deps.evidence.record({
        workspaceId: ctx.workspaceId,
        actionJobId: ctx.actionJobId,
        executionSessionId: ctx.sessionId,
        evidenceType: 'typed_content_snapshot',
        observedContent: typed.typedContent,
        observedAt: now(),
      });

      const pre = this.deps.verification.preflight(ctx, target, typed);
      if (!pre.ok) {
        current = await this.deps.sessions.transition(current, 'failed', now(), {
          errorCode: pre.reasonCode,
          errorMessage: pre.reasonDetail,
        });
        await this.failureEvidence(
          ctx,
          pre.reasonCode ?? 'PREFLIGHT_FAILED',
          pre.reasonDetail ?? '',
        );
        return this.result('failed', current, null, pre.reasonCode, pre.reasonDetail);
      }

      // ── Kill switch (again, immediately before submit) ────────────────────
      if (this.killSwitchOn()) {
        current = await this.deps.sessions.transition(current, 'failed', now(), {
          errorCode: 'KILL_SWITCH_ON',
          errorMessage: 'Global kill switch turned on before submit',
        });
        return this.result(
          'blocked',
          current,
          null,
          'KILL_SWITCH_ON',
          'Kill switch on before submit',
        );
      }

      current = await this.deps.sessions.transition(current, 'ready_to_submit', now());
      current = await this.deps.sessions.transition(current, 'submitting', now());

      // ── Submit ────────────────────────────────────────────────────────────
      const submit = await adapter.submitComment(ctx);

      // Platform interrupt → pause for a human; never bypass, never retry.
      if (submit.interrupt) {
        const status = INTERRUPT_STATUS[submit.interrupt];
        current = await this.deps.sessions.transition(current, status, now(), {
          errorCode: submit.interrupt.toUpperCase(),
          errorMessage: submit.reason ?? submit.interrupt,
          recoveryState: 'MANUAL_INVESTIGATION',
        });
        await this.failureEvidence(ctx, submit.interrupt.toUpperCase(), submit.reason ?? '');
        return this.result(
          'ambiguous',
          current,
          null,
          submit.interrupt.toUpperCase(),
          submit.reason ?? null,
        );
      }

      if (submit.status === 'failed') {
        current = await this.deps.sessions.transition(current, 'failed', now(), {
          errorCode: 'SUBMIT_FAILED',
          errorMessage: submit.reason ?? 'Submit failed',
        });
        await this.failureEvidence(ctx, 'SUBMIT_FAILED', submit.reason ?? '');
        return this.result('failed', current, null, 'SUBMIT_FAILED', submit.reason ?? null);
      }

      if (submit.status === 'ambiguous') {
        current = await this.deps.sessions.transition(current, 'ambiguous', now(), {
          errorCode: 'SUBMIT_AMBIGUOUS',
          errorMessage: submit.reason ?? 'Outcome unknown after submit',
          recoveryState: 'MANUAL_INVESTIGATION',
        });
        await this.failureEvidence(ctx, 'SUBMIT_AMBIGUOUS', submit.reason ?? '');
        return this.result('ambiguous', current, null, 'SUBMIT_AMBIGUOUS', submit.reason ?? null);
      }

      // submit.status === 'submitted'
      current = await this.deps.sessions.transition(current, 'submitted', now());
      await this.deps.evidence.record({
        workspaceId: ctx.workspaceId,
        actionJobId: ctx.actionJobId,
        executionSessionId: ctx.sessionId,
        evidenceType: 'submit_snapshot',
        observedAt: now(),
      });

      // ── Post-submit verification ──────────────────────────────────────────
      current = await this.deps.sessions.transition(current, 'verifying', now());
      const observed = await adapter.verifySubmittedComment(ctx);
      await this.deps.evidence.record({
        workspaceId: ctx.workspaceId,
        actionJobId: ctx.actionJobId,
        executionSessionId: ctx.sessionId,
        evidenceType: 'comment_identity',
        facebookCommentId: observed.facebookCommentId,
        observedContent: observed.observedContent,
        observedAuthor: observed.observedAuthor,
        observedPostUrl: observed.observedPostUrl,
        observedAt: now(),
      });

      const verdict = this.deps.verification.verifySubmission(ctx, submit, observed);
      if (verdict.outcome === 'verified') {
        // Capture a corroborating screenshot — evidence, not the decision itself.
        const shot = await adapter.captureEvidence(ctx, 'post_submit_screenshot');
        await this.deps.evidence.record({
          workspaceId: ctx.workspaceId,
          actionJobId: ctx.actionJobId,
          executionSessionId: ctx.sessionId,
          evidenceType: 'verification_snapshot',
          storageKey: shot.storageKey,
          evidenceHash: shot.evidenceHash,
          facebookCommentId: observed.facebookCommentId,
          observedContent: observed.observedContent,
          observedAt: now(),
          metadata: shot.metadata ?? null,
        });
        current = await this.deps.sessions.transition(current, 'verified', now());
        return this.result('verified', current, observed.facebookCommentId, null, null);
      }

      if (verdict.outcome === 'ambiguous') {
        current = await this.deps.sessions.transition(current, 'ambiguous', now(), {
          errorCode: verdict.reasonCode,
          errorMessage: verdict.reasonDetail,
          recoveryState: 'MANUAL_INVESTIGATION',
        });
        await this.failureEvidence(
          ctx,
          verdict.reasonCode ?? 'AMBIGUOUS',
          verdict.reasonDetail ?? '',
        );
        return this.result(
          'ambiguous',
          current,
          observed.facebookCommentId,
          verdict.reasonCode,
          verdict.reasonDetail,
        );
      }

      current = await this.deps.sessions.transition(current, 'failed', now(), {
        errorCode: verdict.reasonCode,
        errorMessage: verdict.reasonDetail,
      });
      await this.failureEvidence(ctx, verdict.reasonCode ?? 'FAILED', verdict.reasonDetail ?? '');
      return this.result('failed', current, null, verdict.reasonCode, verdict.reasonDetail);
    } catch (err) {
      // A crash mid-flow must NOT silently retry. If the session is still live,
      // mark it ambiguous (we cannot prove no write happened) and hand to a human.
      this.deps.logger.error('execution.crashed', {
        sessionId: ctx.sessionId,
        actionJobId: ctx.actionJobId,
        error: (err as Error).message,
      });
      try {
        const live = await this.deps.sessions.getById(ctx.sessionId);
        if (live && !isTerminal(live.status)) {
          const to =
            live.status === 'submitting' ||
            live.status === 'submitted' ||
            live.status === 'verifying'
              ? 'ambiguous'
              : 'failed';
          current = await this.deps.sessions.transition(live, to, new Date(), {
            errorCode: 'EXECUTION_CRASHED',
            errorMessage: 'Execution crashed; outcome unknown',
            recoveryState: to === 'ambiguous' ? 'MANUAL_INVESTIGATION' : undefined,
          });
          return this.result(
            to === 'ambiguous' ? 'ambiguous' : 'failed',
            current,
            null,
            'EXECUTION_CRASHED',
            'Execution crashed',
          );
        }
      } catch {
        // fall through
      }
      return this.result('ambiguous', current, null, 'EXECUTION_CRASHED', 'Execution crashed');
    } finally {
      try {
        await adapter.close();
      } catch {
        // adapter cleanup best-effort
      }
    }
  }

  private async failureEvidence(
    ctx: ExecutionContext,
    reasonCode: string,
    reasonDetail: string,
  ): Promise<void> {
    await this.deps.evidence.record({
      workspaceId: ctx.workspaceId,
      actionJobId: ctx.actionJobId,
      executionSessionId: ctx.sessionId,
      evidenceType: 'failure_snapshot',
      observedAt: new Date(),
      metadata: { reasonCode, reasonDetail },
    });
  }

  private result(
    status: ExecutionResult['status'],
    session: ExecutionSessionRecord,
    facebookCommentId: string | null,
    reasonCode: string | null,
    reasonDetail: string | null,
  ): ExecutionResult {
    return {
      status,
      sessionId: session.id,
      actionJobId: session.actionJobId,
      facebookCommentId,
      reasonCode,
      reasonDetail,
    };
  }
}

function isTerminal(status: ExecutionSessionRecord['status']): boolean {
  return [
    'verified',
    'ambiguous',
    'failed',
    'cancelled',
    'checkpoint_required',
    'session_expired',
    'account_restricted',
  ].includes(status);
}
