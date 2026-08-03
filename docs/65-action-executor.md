# 65 — Action Executor

The **ActionExecutor** (`apps/api/src/execution/executor.ts`) drives ONE execution attempt through the [execution session state machine](66-execution-session-lifecycle.md), delegating all page interaction to the adapter and all safety judgments to the [verification service](68-execution-verification.md).

## Ordered flow

1. **Kill switch** — checked before any execution. If on → session `failed` (`KILL_SWITCH_ON`), result `blocked`.
2. **Preflight** — `verifyTarget`, then `prepareComment` + `verifyTypedContent`. The verification service checks the observed post identity equals `targetPostKey` and the typed content **exactly** equals the approved content. Any mismatch → `failed` **before submit**; no partial write.
3. **Kill switch again** — re-checked immediately before submit (a mid-flight flip aborts).
4. **Submit** — `ready_to_submit` → `submitting` → `submitComment`.
   - A platform **interrupt** (checkpoint / session_expired / account_restricted / captcha) pauses the session in the matching state and returns `ambiguous`; never bypassed, never retried.
   - `failed` → session `failed`.
   - `ambiguous` → session `ambiguous` (outcome unknown → human recovery).
   - `submitted` → continue.
5. **Post-submit verification** — `submitted` → `verifying` → `verifySubmittedComment`. The verdict is `verified` (the ONLY success), `ambiguous`, or `failed`.

## Guarantees

- **A screenshot alone is never proof.** The verified path requires an observed comment id **and** exact content match; the screenshot is corroborating evidence, captured *after* the decision.
- **Crash safety.** A crash while `submitting`/`submitted`/`verifying` marks the session `ambiguous` (we cannot prove no write happened) — never a silent retry.
- **Append-only evidence** is recorded at each step (pre-submit, typed-content, submit, comment-identity, verification/failure snapshots).

The executor owns the **session and its evidence only**. Duplicate-idempotency and the Action Job's terminal state are owned by the [ExecutionCoordinator](71-safe-execution-runbook.md).
