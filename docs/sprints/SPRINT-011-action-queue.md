# SPRINT 011 — Action Queue Engine

- **Stage:** SPRINT 011 — Action Queue Engine
- **Type:** Feature implementation (safe boundary; NO execution)
- **Date:** 2026-07-31
- **Owner:** Principal Software Architect / Senior Full Stack Engineer

---

## Goal

Implement the Action Queue Engine — a **SAFE BOUNDARY** between an approved Human Review decision and future platform execution. An **APPROVED Review Task** creates an **Action Job** that captures the approved content and target immutably. **This sprint does NOT execute Facebook actions** and runs **NO Action Worker**; every job is created **BLOCKED** under current safety defaults.

```
AI Draft → Human Review → Approved Review → Action Queue → Action Job → END
```

---

## Deliverables

- **Database:** Drizzle migration `0009` — `action_jobs` (id, workspace_id, review_task_id, ai_draft_id, business_match_id, action_type, status, target_platform, target_url, approved_content, attempt_count, max_attempts, scheduled/started/completed/cancelled/blocked_at, last_error_code/message, timestamps; default status `blocked`) and `action_events` (append-only, safe payloads). No credentials/profile/cookie columns; no screenshot or comment-result table.
- **Engine** (`apps/api/src/action/*`): **ActionIntentBuilder** (pure), **ActionPolicyGuard** (pure; ALLOW/BLOCK/REJECT), **ActionQueue** (state machine), **ActionRepository** (only DB boundary), **ActionCoordinator**. Plus `types.ts`/`errors.ts`. Store methods added to `InMemoryStore` and `DrizzleStore`.
- **Rules:** only APPROVED reviews create jobs; at most one active job per (review, action type); intent immutable; execution disabled by default; edited content preferred over draft; safe Facebook target URL only.
- **State machine:** queued→processing/cancelled/blocked, blocked→queued(recheck)/cancelled, processing→succeeded/failed, failed→queued(under max)/cancelled. Invalid transitions rejected. `processing` never entered at runtime (no worker).
- **Events (9):** created/queued/blocked/cancelled/processing/succeeded/failed/retry_scheduled/policy_rejected — safe payloads only.
- **API:** `POST /actions`, `GET /actions`, `GET /actions/:id`, `POST /actions/:id/cancel|retry|recheck-policy` — authenticated, workspace-scoped, CSRF-guarded, safe responses; no execution endpoint.
- **Web:** Action Queue (`/settings/actions`, counts + list) + Action Detail (`/settings/actions/[id]`, approved content, target, source refs, policy result, status history, Cancel / Retry(failed) / Recheck(blocked)); Review Detail extended with "Create Action Job" (APPROVED only) + existing job + "This action has not been executed on Facebook." No Execute/Send/Auto/Write-enable controls.
- **CLI:** `pnpm action:create|list|show|cancel|retry|recheck` (UUID validation, workspace scope, never execute/print secrets, exit codes).
- **Tests:** 319 passing (41 new: intent builder, policy guard, queue/state machine, coordinator, ownership, API). Mocks only; no real Facebook action.
- **Documentation:** [59](../59-action-queue-engine.md)–[63](../63-action-queue-runbook.md); [ADR-020](../adr/ADR-020-action-queue-boundary.md), [ADR-021](../adr/ADR-021-approved-review-to-action-job.md), [ADR-022](../adr/ADR-022-action-execution-disabled-by-default.md); updates to system-overview, roadmap, domain-model, product-memory, environment-configuration, development-workflow, current-sprint.

---

## Non-Goals (not implemented)

Facebook comment/message execution, Playwright write, Facebook write, an Action Adapter/Worker, Telegram sending, auto-approval, auto-comment, unbounded retries, billing, subscription, teams. The Action Job has **no executor** — the pipeline ends at the job.

---

## Acceptance Criteria

- [x] Only APPROVED reviews create Action Jobs; PENDING/REJECTED/EXPIRED rejected.
- [x] At most one active job per (review, action type); duplicate rejected.
- [x] Intent immutable; approved content = edited (else draft); safe Facebook target URL.
- [x] Execution disabled by default → jobs created BLOCKED (engine off + writes off + kill switch on); recheck stays blocked.
- [x] State machine enforces allowed transitions; invalid rejected; no infinite retries; no `processing` at runtime.
- [x] Events auditable with safe payloads; API + UI + CLI; ownership enforced (404); no secrets in responses.
- [x] No Action Worker; no Facebook/Playwright/Telegram/AI call anywhere.
- [x] `pnpm lint | typecheck | test | build | format:check | run doctor | db:status` all pass.

---

## Runtime verification

MySQL + API started with defaults (migration `0009`, 24 tables incl. `action_jobs`, `action_events`). Full pipeline: seeded business/rule/group/assignment + Thai Signal → classify (ACCEPT) → match (MATCH) → AI draft (mock) → review enqueue → **approve**. Live flow: `POST /actions` → **blocked** job, policy **BLOCK** (`ENGINE_DISABLED`, `WRITE_DISABLED`, `KILL_SWITCH_ON`), approved content copied, target = the Facebook post URL; duplicate create → `409`; `recheck-policy` → stays **blocked** + `action_job_policy_rejected` event; retry on a blocked job → `409`; PENDING review create → `409`; REJECTED review create → `409`; `cancel` → **cancelled**; statistics `{ blocked: 1 }`; cross-workspace GET/cancel → `404`, empty list; **no** `action_job_processing` event. No Facebook/Playwright/Telegram/AI network attempt in the API log; no comment-job/action-worker/screenshot/comment-result tables; `action_jobs` has no credential/profile/cookie columns. Services stopped.

---

## Risks & Mitigations

- **Accidental Facebook post.** Impossible — there is no executor and no Facebook/Playwright call; the Policy Guard blocks every job under defaults ([ADR-022](../adr/ADR-022-action-execution-disabled-by-default.md)).
- **Acting on unapproved content.** Prevented — only APPROVED reviews create jobs; approved content is captured immutably ([ADR-021](../adr/ADR-021-approved-review-to-action-job.md)).
- **Duplicate/competing actions.** Mitigated by the one-active-job-per-(review, type) rule.
- **Infinite retries.** Mitigated by `max_attempts` and the retry guard.
- **Cross-workspace access.** Mitigated by per-endpoint ownership (404).

---

## Outcome

Action Queue Engine implemented end-to-end (engine, state machine, policy guard, API, UI, CLI, tests, docs) as a safe boundary with execution disabled by default. No commit made this sprint (per instruction). **Ready for Sprint 012.**
