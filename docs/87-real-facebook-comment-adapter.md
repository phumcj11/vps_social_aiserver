# 87 — Real Facebook Comment Adapter

**Status:** PILOT 0 — Real Comment Adapter. Supersedes the disabled boundary of [SPRINT 012](sprints/SPRINT-012-facebook-comment-adapter.md) / [ADR-026](adr/ADR-026-playwright-adapter-disabled-boundary.md).
**Applies to:** KMKT Social AI

Until now the `PlaywrightFacebookCommentAdapter` was a **disabled boundary**: every method refused, and even a fully-flagged build hit an unconditional `REAL_WRITE_FORBIDDEN`. This change implements the **real** Facebook comment execution path **behind the existing safety gates**, and removes the unconditional refusal — replacing it with a complete, gated path. **Real writes remain disabled by default.** No real comment was posted during implementation.

---

## What changed

- **Real adapter** (`apps/api/src/execution/playwright-adapter.ts`) implements the unchanged `FacebookCommentAdapter` interface with real Playwright-driven observation and interaction, delegating all judgments to the verification service and all policy/state/idempotency/authorization to the coordinator/executor.
- **Browser seam** (`apps/api/src/execution/comment-page.ts`): a narrow `FacebookCommentPage` interface (open / locate / find-existing / type / read / submit / find-submitted / screenshot / close), a real lazy `PlaywrightCommentPage`, and the selector strategy ([89](89-facebook-comment-selector-strategy.md)). Mirrors the Collector's `CollectorBrowser` seam so the adapter is fully unit-tested with a deterministic fake page and **no Chromium**.
- **Two modes**: `prepare_only` (read-only readiness probe) and `submit_once` (the single gated write). See [88](88-controlled-one-shot-execution.md).
- **No new surface**: no Execute-Now API/UI. The only new operator entry point is a read-only CLI probe (`action:execution:prepare-live`).

---

## The adapter is a narrow actor, not the authority

| Concern | Owner |
| --- | --- |
| Policy (BLOCK/ALLOW), job state machine, idempotency reservation, **submit authorization** | Coordinator / Executor |
| Exact-content equality, target-identity match, verified-vs-ambiguous verdict | Verification service |
| Page observation + interaction, profile-lock acquire/release, one-submit latch | **Adapter** |
| Raw DOM navigation + strict, target-scoped selectors | `PlaywrightCommentPage` |

The adapter contains **no business rules**. It never decides success; it reports observations.

---

## Hard enablement gates (a real submit requires ALL)

1. `ACTION_ENGINE_ENABLED=true`
2. `FACEBOOK_WRITE_ACTION_ENABLED=true`
3. `FACEBOOK_COMMENT_ENABLED=true`
4. `FACEBOOK_COMMENT_ADAPTER=playwright`
5. `GLOBAL_KILL_SWITCH=false` (re-checked immediately before submit)

**and** the executor grants an **explicit one-shot submit authorization**, **and** the adapter is in `submit_once` mode. The coordinator additionally requires: job `queued`, review `APPROVED`, draft policy `PASS`, match `MATCH`, opportunity `ACCEPT`, exactly one active job, one execution session, the profile lock acquired, no ambiguous idempotency record, and no verified-success record.

If any condition fails the adapter **does not type, does not submit, creates no success evidence**, and returns a safe refusal code (`ADAPTER_DISABLED`, `SUBMIT_NOT_AUTHORIZED`, `PREPARE_ONLY_MODE`, or `KILL_SWITCH_ON`). Under the mandated safe defaults this is **always** the outcome.

---

## Abort-before-write conditions

`verifyTarget` returns `ok:false` with a safe code (never throws, so the executor records a clean pre-submit **failure** — no partial write) on: `LOGIN_REQUIRED`, `CHECKPOINT_REQUIRED`, `CAPTCHA_PRESENT`, `ACCOUNT_RESTRICTED`, `POST_NOT_VISIBLE`, `UNEXPECTED_REDIRECT`, `COMMENTS_DISABLED`, `DUPLICATE_COMMENT_EXISTS`, `MULTIPLE_INPUT_CANDIDATES`, `COMMENT_INPUT_NOT_FOUND`, `BROWSER_PROFILE_BUSY`, and `RESOURCE_GUARD` (low RAM / disk). See [Phase F abort matrix](88-controlled-one-shot-execution.md#abort-conditions).

---

## Safety invariants

- **Never two Chromium** for a workspace: the exclusive profile lock (acquired by the adapter, released on `close()` — always, even on abort) plus `PLAYWRIGHT_CONCURRENCY=1` and the coordinator's single-active-session guard.
- **Submit exactly once**: a `submitted` latch makes a second submit structurally impossible; a repeat call returns `ambiguous`, never a re-post.
- **No auto-retry on ambiguity**: an unknown outcome keeps the idempotency reservation **live** and routes to human recovery — never a blind retry.
- **No secrets ever leave**: the adapter/page return only structured observations and a redacted screenshot — never cookies, localStorage, tokens, a profile path, or raw HTML. See [90](90-facebook-comment-evidence.md).

See also [ADR-031](adr/ADR-031-real-facebook-comment-adapter.md), [ADR-032](adr/ADR-032-one-shot-submit-and-ambiguity.md), and the sprint record [PILOT-000-real-comment-adapter](sprints/PILOT-000-real-comment-adapter.md).
