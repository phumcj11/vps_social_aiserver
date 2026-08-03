# Current Sprint

## Current Sprint

**SPRINT 013 — Operational Hardening and Controlled Write Test Preparation**

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
