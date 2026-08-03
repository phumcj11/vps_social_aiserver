# Current Sprint

## Current Sprint

**SPRINT 012 — Facebook Comment Adapter and Safe Execution Foundation**

## Objectives

**Safe Execution Foundation (NO real Facebook write).**

Build the foundation for executing a single Facebook comment safely — a narrow adapter, a deterministic fake, an executor, execution sessions, evidence, verification, recovery, and database-level idempotency — **without performing any real Facebook write**. Real execution stays disabled after this sprint. Concretely:

- Database: migration `0010` — `action_jobs` execution columns + `action_execution_sessions`, `action_execution_evidence`, `action_idempotency_records`, with nullable-unique keys emulating partial-unique indexes.
- Execution module: narrow `FacebookCommentAdapter`, deterministic `FakeFacebookCommentAdapter`, disabled `PlaywrightFacebookCommentAdapter` boundary, session/evidence/idempotency repositories, pure verification + recovery, `ActionExecutor`, `ExecutionCoordinator`, session state machine, controlled evidence storage keys.
- Verified-only success; exact typed-content equality; ambiguity never auto-retries; kill switch checked before execution and submit; Playwright refuses even when fully flagged.
- API, Action Detail execution section + `/settings/action-executions/[id]`, `action:execution:*` CLI, per-route rate limits.
- Architecture Review remediation: doctor safety checks, production weak-DB-credential guard, strict URL parsing, doc hygiene.
- Documentation ([64](64-facebook-comment-adapter.md)–[71](71-safe-execution-runbook.md)) and [ADR-023](adr/ADR-023-facebook-comment-adapter-boundary.md)–[ADR-026](adr/ADR-026-playwright-adapter-disabled-boundary.md).

## Scope

**In scope**

- Queued `facebook_comment` job → ExecutionCoordinator (five safety gates) → Session → Executor → Fake Adapter → Verify → Evidence.
- Execution session state machine; pre/post-submit verification; recovery classification (SAFE_RETRY / NO_RETRY / MANUAL_INVESTIGATION); database-level idempotency (one active job/session, one verified success per identity).
- The disabled Playwright boundary (structure only, refuses to run); strict canonical Facebook post URL parsing + `targetPostKey`.

**Out of scope**

- Real Facebook comment/write execution, Playwright submit, a generic Platform Adapter Framework, Facebook Message.
- TikTok/Instagram/LINE, auto-comment, concurrent browser executions, CAPTCHA/checkpoint bypass, proxy rotation, stealth, browser farm.
- n8n execution, real Telegram/AI, billing, subscription, teams.

The full exclusion list is in [not-doing.md](not-doing.md).

## Status

**Complete (not committed).**

The Safe Execution Foundation is built and exercised entirely through the deterministic fake adapter. A queued `facebook_comment` job flows through the ExecutionCoordinator — which enforces the five safety gates, single-active-session, and duplicate-success — into an Execution Session driven by the ActionExecutor: preflight (target identity + exact typed-content equality), submit, and post-submit verification. **Verified is the only success**, requiring an observed comment id and exact content match; a screenshot alone is never sufficient. Ambiguous outcomes and platform interrupts (checkpoint / expired / restricted / captcha) never auto-retry and route to human recovery; a crash mid-submit becomes ambiguous. Database-level idempotency (nullable-unique keys) makes a duplicate successful comment impossible even under concurrency. The `PlaywrightFacebookCommentAdapter` refuses to run — with `ADAPTER_DISABLED` under safe defaults and `REAL_WRITE_FORBIDDEN` even when all five flags are set — so **no real Facebook write can occur**. Under the mandated safe defaults (engine off, writes off, kill switch on) `prepare-execution` returns `blocked` and creates no session. The Architecture Review remediations landed: doctor safety assertions, a production guard that rejects weak/default DB credentials, and strict `URL` parsing replacing the regex. The full quality suite passes (lint, typecheck, test — 376 passing, build, format:check, doctor) and `db:status` is green; runtime was verified with `FACEBOOK_COMMENT_ADAPTER=fake`. No commit was made this sprint. Detail: [sprints/SPRINT-012-facebook-comment-adapter.md](sprints/SPRINT-012-facebook-comment-adapter.md).

## Definition of Done

- [x] Migration `0010` (execution columns + 3 tables; nullable-unique keys); no credential/profile/cookie columns.
- [x] Narrow adapter + deterministic fake (13 scenarios) + disabled Playwright boundary; verification + recovery pure.
- [x] Verified-only success; exact typed-content equality; ambiguity never auto-retries; crash → ambiguous.
- [x] Database-level idempotency: one active job/session and one verified success per identity; concurrent duplicate rejected.
- [x] Five safety gates + kill-switch checks before execution and submit; Playwright refuses even fully flagged.
- [x] API + Execution UI + `action:execution:*` CLI; per-route rate limits; ownership enforced (404); no secrets in responses.
- [x] Remediation: doctor safety checks, production weak-credential guard, strict URL parsing, doc hygiene.
- [x] Tests (376 passing, 57 new) with fake/mocks; full quality suite + `db:status` green; runtime verified with the fake adapter.
- [x] Documentation + ADR-023/024/025/026. **No commit** made.

## Next

On sign-off, the project proceeds to **SPRINT 013 — Real Facebook Comment Execution**: implement the real Playwright adapter behind this boundary — publish approved comments to Facebook, verified and evidenced, at concurrency one, gated by the kill switch and database idempotency, with its own execution verification and operator sign-off. See [12-mvp-roadmap.md](12-mvp-roadmap.md).
