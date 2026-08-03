# SPRINT 013 — Operational Hardening and Controlled Write Test Preparation

- **Stage:** SPRINT 013 — Operational Hardening and Controlled Write Test Preparation
- **Type:** Operational hardening (NO new product features; NO real execution)
- **Date:** 2026-08-03
- **Owner:** Principal Architect / DevOps / SRE / Security

---

## Goal

Make KMKT Social AI operable and safe for a first controlled Facebook comment test and a first pilot customer — backups, restore, health, monitoring, maintenance mode, incident lockdown, an operator surface, process-supervision templates, and the controlled-write-test and pilot-readiness runbooks — **without performing any real Facebook write** and without adding product features. All execution flags stay in their safe state.

---

## Deliverables

- **Operational architecture** ([72](../72-operational-architecture.md)): single-VPS model, six runtime modes, hard concurrency rules ([ADR-027](../adr/ADR-027-single-vps-operational-model.md)).
- **Backups** (`scripts/backup/`): `database|config|audit|all|verify|list|cleanup` — mysqldump `--single-transaction`, gzip, sha256, manifest, fail-closed, never-overwrite, `0600`; password never in argv/logs; retention 7/4/3 ([73](../73-backup-policy.md)).
- **Restore** (`scripts/restore/`): `verify|dry-run|database` — checksum + manifest + version + path-traversal + credential checks; production requires maintenance + `--yes`; dry-run never mutates ([74](../74-database-restore-runbook.md)).
- **Browser-profile policy** ([75](../75-browser-profile-recovery-policy.md), [ADR-028](../adr/ADR-028-browser-profile-reconnect-over-backup.md)): reconnect over backup; `facebook:profile:status|verify` (safe status only, no cookies/paths).
- **Logging & rotation** ([76](../76-log-rotation.md)): structured JSON, secret-free; `logs:status|rotate:dry-run|verify`.
- **Health** ([77](../77-health-and-monitoring.md)): `/health`, `/ready`, `/health/dependencies|safety|storage|queues` — public-safe, no browser/Facebook/AI/Telegram.
- **Monitoring** (`scripts/monitor/`): `status|check|report`, OK/WARNING/CRITICAL, exit 0/1/2; VPS thresholds. No Telegram alerts (future adapter documented).
- **Process supervision** ([78](../78-process-supervision.md)): compose override + systemd template (disabled by default); mysql/api/web bounded restart; Collector/Executor never auto-restart/resume.
- **Maintenance mode** ([79](../79-maintenance-mode.md)) & **Incident lockdown** ([80](../80-incident-lockdown.md)): persistent runtime state (survives restart, DB-independent), audited; `maintenance:*` / `incident:*` CLIs; effective-safety override ([ADR-029](../adr/ADR-029-maintenance-and-lockdown-state.md)).
- **Operations API + UI** ([N]): `/operations/status|backups|monitoring|incidents`, `/operations/maintenance|lockdown/enable|disable` (operator-only, CSRF, rate-limited, safe); `/settings/operations` console.
- **Controlled write-test runbook** ([81](../81-controlled-facebook-write-test.md), [ADR-030](../adr/ADR-030-controlled-write-test-procedure.md)) & **pilot readiness** ([82](../82-pilot-readiness.md)); incident response ([83](../83-incident-response.md)); audit investigation ([84](../84-audit-investigation.md)).
- **Env** (safe, no secrets): maintenance/lockdown/operations, backup, log, and monitor variables; runtime state file.
- **Tests**: backup/restore/monitoring/health/maintenance/lockdown/operations-API + pure helpers.

---

## Non-Goals (not implemented)

Real Facebook comment/message execution, auto-comment, generic platform framework, browser farm, horizontal scaling, Kubernetes, Kafka, Redis cluster, proxy rotation, stealth plugins, CAPTCHA/checkpoint bypass, paid billing, subscriptions, teams, multi-server deployment, external AI, real Telegram transport. No Execute-Now control. Real execution stays disabled.

---

## Acceptance Criteria

- [x] Backups: controlled path, manifest+checksum, no secrets, duplicate rejected, retention, staleness.
- [x] Restore: checksum/manifest/version/outside-path rejected; production requires confirmation; dry-run no DB change.
- [x] Maintenance blocks new work, keeps health/backup/operator up, persists across restart, audited.
- [x] Lockdown blocks Facebook ops, overrides write flags off + kill switch on, unlock requires confirm+reason, persists.
- [x] Health public-safe (no secret leakage); readiness false when DB down or in maintenance/lockdown.
- [x] Monitoring OK/WARNING/CRITICAL with exit codes and thresholds.
- [x] Operations API: unauthenticated 401, non-operator 403, CSRF, rate limit, safe responses, audited transitions.
- [x] Safety defaults unchanged; no real Facebook/Playwright/Telegram/AI; no destructive restore; no secrets added.
- [x] `pnpm lint | typecheck | test | build | format:check | run doctor | db:status` pass. **No commit.**
