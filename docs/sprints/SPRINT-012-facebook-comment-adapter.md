# SPRINT 012 — Facebook Comment Adapter and Safe Execution Foundation

- **Stage:** SPRINT 012 — Facebook Comment Adapter and Safe Execution Foundation
- **Type:** Feature implementation (safe foundation; NO real execution)
- **Date:** 2026-08-02
- **Owner:** Principal Software Architect / Senior Full Stack Engineer

---

## Goal

Build the **foundation** for executing a single Facebook comment safely — a narrow adapter, a deterministic fake, an executor, execution sessions, evidence, verification, recovery, and database-level idempotency — **without performing any real Facebook write**. Real execution stays disabled after this sprint. This also lands the mandatory Architecture Review remediations.

```
Queued Action Job → ExecutionCoordinator → Session → Executor → (Fake) Adapter → Verify → Evidence
                                   (blocked under safe defaults; no real write)
```

---

## Deliverables

- **Database:** Drizzle migration `0010` — `action_jobs` gains `target_post_key`, `active_dedup_key` (unique), `success_idempotency_key` (unique), `execution_state`, `ambiguous_at`, `verification_required`, `last_execution_session_id`; new tables `action_execution_sessions` (active-key unique), `action_execution_evidence`, `action_idempotency_records` (idem-key unique). Nullable-unique keys emulate partial-unique indexes ([ADR-024](../adr/ADR-024-database-level-idempotency.md)).
- **Execution module** (`apps/api/src/execution/*`): narrow `FacebookCommentAdapter`; `FakeFacebookCommentAdapter` (13 deterministic scenarios); disabled `PlaywrightFacebookCommentAdapter` boundary; session/evidence/idempotency repositories; `ExecutionVerificationService` (pure); `ExecutionRecoveryPolicy` (pure); `ActionExecutor`; `ExecutionCoordinator`; session state machine; controlled evidence storage keys; routes; CLI.
- **Canonical URL** (`apps/api/src/action/canonical-url.ts`): strict `URL` parsing (https-only, host allowlist, supported post forms) replacing regex, deriving the deterministic `targetPostKey`. Wired into the intent builder and policy guard.
- **Safety:** five-gate check + kill-switch checks before execution and before submit; verified-only success; exact typed-content equality; ambiguity never auto-retries; Playwright boundary refuses even when fully flagged ([ADR-026](../adr/ADR-026-playwright-adapter-disabled-boundary.md)).
- **API:** `POST /actions/:id/prepare-execution`, `POST /actions/:id/dry-run` (fake-only), `GET /actions/:id/execution-sessions`, `GET /action-executions/:sessionId`, `GET /action-executions/:sessionId/evidence`, `POST /action-executions/:sessionId/cancel|recover`. Per-route rate limits (action create, prepare, recover). **No "Execute Now."**
- **Web:** Action Detail gains an Execution section (Prepare Execution — blocked under defaults — + session list); `/settings/action-executions/[id]` shows status, evidence, Cancel, Classify Recovery. No Execute / Enable-Write / Kill-Switch controls.
- **CLI:** `pnpm action:execution:prepare|show|evidence|cancel|dry-run`.
- **Remediation:** doctor now asserts `ACTION_ENGINE_ENABLED=false`, `FACEBOOK_COMMENT_ADAPTER=fake`, `ACTION_AMBIGUOUS_AUTO_RETRY=false`, `ACTION_EXECUTION_CONCURRENCY=1`, and warns on weak DB credentials; production startup **rejects** weak/default DB credentials; docs refreshed; strict URL parsing.
- **Tests:** 376 passing (57 new: canonical URL, idempotency, verification, recovery, executor scenarios, playwright refusal, execution API). Fake adapter / mocked only — no real Facebook.
- **Documentation:** [64](../64-facebook-comment-adapter.md)–[71](../71-safe-execution-runbook.md); [ADR-023](../adr/ADR-023-facebook-comment-adapter-boundary.md)–[ADR-026](../adr/ADR-026-playwright-adapter-disabled-boundary.md); updates to system-overview, domain-model, product-memory, environment-configuration, READMEs, current-sprint.

---

## Non-Goals (not implemented)

Real Facebook comment/write execution, Playwright submit, a generic Platform Adapter Framework, Facebook Message, TikTok/Instagram/LINE, auto-comment, concurrent browser executions, CAPTCHA/checkpoint bypass, proxy rotation, stealth plugins, browser farm, n8n execution, real Telegram/AI, billing, subscription, teams. Real execution remains **disabled** after this sprint.

---

## Acceptance Criteria

- [x] Only APPROVED-review-derived, queued `facebook_comment` jobs are executable; under safe defaults `prepare-execution` returns `blocked` and creates no session.
- [x] Verified-only success: observed comment id + exact content match; a screenshot alone is never sufficient.
- [x] Exact typed-content equality and target-identity match are enforced before submit; mismatch aborts with no write.
- [x] Ambiguous outcomes and platform interrupts never auto-retry and require human recovery; a crash mid-submit becomes ambiguous.
- [x] Database-level idempotency: at most one active job/session and one verified success per identity; concurrent duplicate reservation rejected.
- [x] The Playwright adapter refuses even when all five flags are set (`REAL_WRITE_FORBIDDEN`); the fake adapter is the only functional path.
- [x] Doctor safety checks + production weak-credential guard + strict URL parsing landed.
- [x] `pnpm lint | typecheck | test (376) | build | format:check | run doctor | db:status` all pass.
- [x] No commit made this sprint; no real Facebook/Playwright/Telegram/AI call anywhere.
