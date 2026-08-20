# Current Sprint

## Current Sprint

**SPRINT 014 — Production Pilot Readiness & Controlled Rollout** (branch `feature/s014-production-pilot-readiness`).

> **Status:** Pilot 0 is **closed — PASS** (release `v0.9.3-pilot-write-verified`, main `b7d088f`): the full pipeline posted exactly one real comment in the operator-owned private test group and recovered to succeeded/verified with zero duplicates. Sprint 014 prepares a SMALL, human-supervised production pilot — **no production writes are enabled**. Delivered: Pilot 0 closure record ([91](91-pilot0-closure.md)); production safety primitives (`apps/api/src/production/` — Business readiness, group selection, bounded Write Window, one-shot submit authorization, hard limits, observability read model — pure + tested, 44 cases); Level-1 definition, rollout levels + exit criteria, 16 operator runbooks, and a read-only Operations UI section. No Facebook write, no flag enablement, no external AI, no Execute-Now surface. Detail: [SPRINT-014](sprints/SPRINT-014-production-pilot-readiness.md), [92](92-production-pilot-level1.md)–[99](99-production-rollout-levels.md), [ADR-033](adr/ADR-033-production-write-window.md)/[034](adr/ADR-034-one-shot-production-authorization.md)/[035](adr/ADR-035-production-pilot-limits.md).

### Previously

**SPRINT 013 — Operational Hardening and Controlled Write Test Preparation** (merged) → **PILOT 0 — Phase 3 corrective fixes** (branch `feature/pilot0-classifier-dedup-fix`, not committed)

> **Pilot 0 status:** Read-only Collector validation ran over six real pilot groups (PARTIAL_PASS). Two blockers found and fixed: (1) the Opportunity Classifier accepted advertiser posts and rejected genuine customer-intent posts — corrected to intent-driven **`rules-v2`** with a safe `opportunity:reclassify` path; (2) duplicate posts surfaced as `REPOSITORY_ERROR` — the Collector now skips duplicates idempotently and reports `duplicatesSkipped` (migration `0011`). Verified end-to-end on the Pilot data: 2 accept / 7 reject after reclassification, **1 correct MATCH** (0 wrong-area), **1 Mock draft**; Cha-am retest completes with no `REPOSITORY_ERROR`. No Facebook write, no external AI. Detail: [sprints/PILOT-000-phase3-corrective-fixes.md](sprints/PILOT-000-phase3-corrective-fixes.md), [85](85-pilot0-classifier-correction.md), [86](86-collector-duplicate-handling.md).

## Objectives

**Operational hardening (NO new product features; NO real execution).**

Make the system operable and safe for a first controlled Facebook comment test and a first pilot customer — backups, restore, health, monitoring, maintenance mode, incident lockdown, an operator surface, process-supervision templates, and the controlled-write-test and pilot-readiness runbooks — **without performing any real Facebook write**. All execution flags stay in their safe state. Concretely:

- Backups (`scripts/backup/`) and restore (`scripts/restore/`): compressed, checksummed, manifested, fail-closed, path-safe, credential-safe; retention 7/4/3.
- Browser-profile recovery by reconnect (never backup); safe `facebook:profile:status|verify` diagnostics.
- Structured, secret-free logging + rotation (`logs:*`); health endpoints (`/health/*`, `/ready`); lightweight monitoring (`monitor:*`, OK/WARNING/CRITICAL).
- Process-supervision templates (compose override + systemd, disabled by default); Collector/Executor never auto-restart or auto-resume.
- Maintenance mode + incident lockdown as **persistent runtime state** (survive restart, DB-independent, audited); effective-safety override forces writes off + kill switch on under lockdown.
- Operator-only Operations API + `/settings/operations` console; controlled-write-test, pilot-readiness, incident-response, and audit-investigation runbooks.
- Documentation ([72](72-operational-architecture.md)–[84](84-audit-investigation.md)) and [ADR-027](adr/ADR-027-single-vps-operational-model.md)–[ADR-030](adr/ADR-030-controlled-write-test-procedure.md).

## Scope

**In scope** — operability and safety: backup/restore, browser-profile policy, logging/rotation, health/monitoring, supervision, maintenance/lockdown, operations API/UI, runbooks, tests, docs, env.

**Out of scope** — real Facebook comment/message execution, auto-comment, generic platform framework, browser farm, horizontal scaling, Kubernetes/Kafka/Redis cluster, proxy rotation, stealth, CAPTCHA/checkpoint bypass, billing, subscriptions, teams, multi-server, external AI, real Telegram. No Execute-Now control. The full exclusion list is in [not-doing.md](not-doing.md).

## Status

**Complete (not committed).**

Backups produce compressed, checksummed, manifested archives outside the repo (mysqldump `--single-transaction`; the DB password never touches argv or logs); restore verifies checksum + manifest + schema version + path safety + credentials, requires maintenance + explicit confirmation in production, and never mutates on dry-run. Browser profiles never enter backups, logs, or git; recovery is operator reconnect (`reconnect_required`); safe diagnostics report status only. Structured JSON logging stays secret-free with `logs:verify`; rotation is planned locally. Layered health endpoints are public-safe and report execution as intentionally disabled; lightweight monitoring returns OK/WARNING/CRITICAL with meaningful exit codes. Maintenance mode and incident lockdown are persisted in a runtime state file that survives restart and works when the DB is down; every transition is audited; lockdown’s effective-safety override forces all write flags off and the kill switch on regardless of configuration. An operator-only Operations API (auth + operator allowlist + CSRF + rate limits, safe responses) and a `/settings/operations` console expose mode, safety flags, resources, queue health, backups, and the last incident. Process-supervision templates cover only mysql/api/web; the Collector and Executor never auto-restart or auto-resume. The controlled-write-test runbook keeps the first real write a manual, reversible, single-shot procedure with no Execute-Now surface. Safety defaults are unchanged (engine off, writes off, kill switch on, fake adapter). The full quality suite passes (lint, typecheck, test, build, format:check, doctor) and `db:status` is green; runtime was verified with all execution flags disabled and no real Facebook/browser/Telegram/AI access. No commit was made this sprint. Detail: [sprints/SPRINT-013-operational-hardening.md](sprints/SPRINT-013-operational-hardening.md).

## Definition of Done

- [x] Backup/restore scripts with all safety guarantees + tests.
- [x] Browser-profile reconnect policy + safe diagnostics.
- [x] Logging policy + rotation planning + `logs:verify`.
- [x] Health endpoints + monitoring with thresholds and exit codes + tests.
- [x] Process-supervision templates (disabled by default).
- [x] Maintenance + lockdown persistent state, audited, enforced + tests.
- [x] Operator-only Operations API + UI (safe, auditable) + tests.
- [x] Controlled-write-test + pilot-readiness + incident + audit runbooks; ADR-027…030.
- [x] Safe env vars; runtime state not `.env`-only. No secrets. **No commit.**

## Next

On sign-off, the operator may perform the **controlled disposable Facebook write test** ([81](81-controlled-facebook-write-test.md)) and, on passing, begin **first pilot** onboarding ([82](82-pilot-readiness.md)). See [12-mvp-roadmap.md](12-mvp-roadmap.md).
