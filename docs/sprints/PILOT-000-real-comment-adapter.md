# PILOT 0 — Real Facebook Comment Adapter

- **Type:** Feature (real execution path behind existing safety gates). Supersedes the SPRINT 012 disabled boundary.
- **Date:** 2026-08-04
- **Branch:** `feature/pilot0-real-comment-adapter`
- **Base:** main `e6ebefff0082f644e52fb401189cce61c91fe6bc`
- **Owner:** Principal Architect / SRE

---

## Goal

Implement the real Facebook comment execution path behind the existing safety gates, so exactly one **supervised** Pilot write becomes *possible* — **without** enabling any write flag, posting any comment, or adding an Execute-Now surface. **No real comment was posted during implementation.**

## What shipped

- **Real gated adapter** — `apps/api/src/execution/playwright-adapter.ts` rewritten from a disabled boundary to the real, gated path with `prepare_only` / `submit_once` modes, explicit one-shot submit authorization, last-moment kill-switch recheck, profile-lock acquire/release, and a one-submit latch. The unconditional `REAL_WRITE_FORBIDDEN` is removed now that the complete gated path exists. Docs [87](../87-real-facebook-comment-adapter.md), ADR [031](../adr/ADR-031-real-facebook-comment-adapter.md).
- **Browser seam** — `apps/api/src/execution/comment-page.ts`: `FacebookCommentPage` interface + lazy `PlaywrightCommentPage` with the strict, container-scoped selector strategy. Docs [89](../89-facebook-comment-selector-strategy.md).
- **Coordinator/CLI** — `ExecutionCoordinator.prepareOnly` (read-only probe) and the real `submit_once` wiring in `prepareExecution` (browser page + exclusive lock factory); new read-only CLI `action:execution:prepare-live`. No submit command / no API/UI. Docs [88](../88-controlled-one-shot-execution.md), ADR [032](../adr/ADR-032-one-shot-submit-and-ambiguity.md).
- **Evidence** — redacted screenshot + hash + adapter version only; no session material; gitignored + permission-restricted. Docs [90](../90-facebook-comment-evidence.md).
- **Error codes** — added `SUBMIT_NOT_AUTHORIZED`, `PREPARE_ONLY_MODE`, and the pre-submit abort codes (login/checkpoint/captcha/restricted/not-visible/redirect/comments-disabled/multiple-inputs/no-input/duplicate/resource-guard).

## Tests

`apps/api/src/execution/playwright-adapter.test.ts` — 30 cases, all with a deterministic **fake page + fake lock** (no Chromium, no network): every hard gate required; `prepare_only` never types/submits; `submit_once` unavailable under defaults and without authorization; each abort (login/checkpoint/captcha/restricted/comments-disabled/duplicate/multiple-inputs/no-input/redirect/not-visible/lock-conflict/resource-guard); exact-content typing; kill-switch rechecked before submit; one submit only; verified / ambiguous / interrupt; no auto-retry; lock always released; browser always closed; evidence contains no secrets. Coordinator-level idempotency reserve/finalize and duplicate/in-flight refusal remain covered by the existing `coordinator`/`executor` suites (fake adapter). Full execution+action suites: 125 passing.

## Runtime verification

- **Unit-verified** end-to-end with the fake page.
- **Live `prepare_only` verified on the exact Pilot target (2026-08-04, operator-authorized, read-only).** First run reported a false `COMMENTS_DISABLED`; a read-only DOM diagnostic showed the composer is a single `div[role=textbox][contenteditable]` (aria-label `เขียนคำตอบ...`) sitting OUTSIDE every `[role=article]`, and it hydrates after `domcontentloaded`. Composer detection was hardened (layered resolution + bounded hydration wait; strict one-candidate preserved; not broadened globally — see [89](../89-facebook-comment-selector-strategy.md)). The same run exposed a browser-lifecycle defect (a persistent-context Chromium survived `context.close()` because FB unload handlers held it, and persistent contexts expose no browser handle to force-close); `close()` was hardened to close pages with `runBeforeUnload:false`, bound `context.close()`, and last-resort kill any Chromium holding this unique `--user-data-dir`. Re-run result: **ready=true**, target identity exact, comments available, exactly one unique composer, no typing, no submit, no state changes, browser closed, lock released, all write flags disabled. Command: `pnpm --filter @kmkt/api action:execution:prepare-live --workspace <ws> --action 53eca8fc-…` (cwd `apps/api`, non-root browser user). Business logic / policy / Action Queue unchanged.

## Acceptance

- [x] Real adapter implemented behind the existing interface; unconditional `REAL_WRITE_FORBIDDEN` removed only behind the complete gated path.
- [x] `prepare_only` and `submit_once` modes; one-shot authorization; no auto-retry; no Execute-Now surface.
- [x] All tests pass; no session material tracked; quality gates green.
- [x] No write flag changed; no comment posted; all flags safe; services stopped.
- [x] Live `prepare_only` verified on the exact Pilot target — ready=true after composer + close hardening (read-only; no write; PASS).
- No commit/push (operator-controlled).
