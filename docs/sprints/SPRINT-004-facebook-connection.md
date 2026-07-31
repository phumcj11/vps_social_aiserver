# SPRINT 004 — Facebook Connection Foundation

- **Stage:** SPRINT 004 — Facebook Connection Foundation
- **Type:** Feature implementation (secure Facebook session model — connection only)
- **Date:** 2026-07-30
- **Owner:** Principal Software Architect / Senior Full Stack Engineer

---

## Goal

Establish a secure, per-workspace Facebook session model for the MVP: connect one Facebook account, validate, reconnect, disconnect, and see status — with no scanning, no post reading, no commenting, and no AI/Telegram/n8n. Facebook remains an adapter; the session is inert (writes disabled, kill switch on).

---

## Deliverables

- **Database:** Drizzle migration `0002` adding `facebook_accounts` (unique `workspace_id`; NO password/cookie/token columns) and a minimal `audit_events` table. Store methods for get/create/update-state/update-identity/mark-reconnect/mark-checkpoint/disconnect, plus audit create/list.
- **Profile storage:** controlled `ProfileService` — server-generated per-workspace paths under `storage/browser-profiles/{workspace-id}/facebook/`, UUID-based path-traversal protection, `0700` permissions, exclusive lock, controlled deletion with explicit cleanup-failure reporting.
- **Playwright:** installed `playwright` + Chromium; a `BrowserDriver` abstraction (real Playwright driver + fake for tests); `FacebookConnectionService` implementing `startConnection`, `getConnectionStatus`, `validateSession`, `disconnect`, concurrency one, timeouts, and full error classification.
- **Safety gate:** `FACEBOOK_LOGIN_ENABLED=false` by default → no browser launches; attempts recorded as `LOGIN_DISABLED`.
- **API:** `GET /facebook/account`, `POST /facebook/connect/start`, `GET /facebook/connect/status`, `POST /facebook/validate`, `POST /facebook/disconnect` — authenticated, ownership-scoped, CSRF-guarded, no profile path/cookies returned, no credentials accepted.
- **Web UI:** `/settings/facebook` — status, display name, last validated, connection state, safe errors, Connect/Validate/Reconnect/Disconnect (with confirmation), credential notice, progress/timeout/checkpoint/blocked/cleanup-failed states; nav link added.
- **Operator CLI:** `pnpm facebook:connect|validate|disconnect|status` — validates workspace id, concurrency one, safe output (no secrets/paths), useful exit codes.
- **Audit:** events for connection started/succeeded/failed, session validated, reconnect required, checkpoint required, disconnected, profile cleanup failed — plus login/logout/workspace-updated. Payloads sanitised (no secrets/paths).
- **Tests:** 74 passing (profile service, connection state machine, API auth/ownership/validation, account model, audit, empty-body POST).
- **Documentation:** [26](../26-facebook-connection.md), [27](../27-facebook-session-lifecycle.md), [28](../28-browser-profile-security.md), [29](../29-facebook-connection-runbook.md); [ADR-007](../adr/ADR-007-operator-assisted-facebook-login-mvp.md); updates to current-sprint, product-memory, system-overview, domain-model, playwright-design, environment-configuration, development-workflow, and the roadmap.

---

## Non-Goals (not implemented)

Facebook Group management/scanning, post ingestion, opportunity discovery, AI matching, AI comment drafts, Telegram approval, comment execution, auto-comment, multiple Facebook accounts per workspace, shared accounts between workspaces, billing, subscription, teams, multiple workspace users, n8n workflows. No customer-facing remote-browser viewer.

---

## Acceptance Criteria

- [x] One Facebook account per workspace (DB unique + service checks).
- [x] No password/cookie/token columns; no credentials in API payloads; backend never receives the password.
- [x] Server-generated profile paths; path traversal rejected; one workspace cannot access another's profile.
- [x] Connection state model with all seven states and full error classification; no infinite retries.
- [x] Session validation with connected/login_required/checkpoint/blocked/validation_failed; no scan/write.
- [x] Disconnect stops the browser, marks disconnected, cleans the profile, reports cleanup failure explicitly.
- [x] Ownership enforced on every endpoint; profile path never returned; duplicate connection start rejected; disconnect confirmation required.
- [x] Audit events recorded with no secrets.
- [x] Write flag false; kill switch on; scanner/comment workers disabled; no public browser viewer.
- [x] `pnpm lint | typecheck | test | build | format:check | run doctor | db:status` all pass.

---

## Runtime verification

MySQL started (loopback), migration `0002` applied (9 tables). Live flow (login disabled) verified: account status `not_connected`; connect → `202`/`connecting` → `validation_failed`/`LOGIN_DISABLED` (no browser); server-generated profile directory created and then removed on disconnect; validate handled; disconnect requires confirmation; ownership isolation confirmed; audit events `facebook_connection_started/failed/session_validated/disconnected` recorded with no secrets/paths. Services stopped afterward. No real Facebook login attempted.

---

## Risks & Mitigations

- **Accidental Facebook access.** Mitigated by the `FACEBOOK_LOGIN_ENABLED=false` gate (no browser launches by default) and by the driver touching only the login/home page when enabled.
- **Secret leakage.** No password/cookie/token stored; audit sanitiser; profile paths never returned; strict `.gitignore` (verified).
- **Concurrency / stuck locks.** Concurrency one, filesystem lock with stale-lock reclaim, bounded timeouts, no infinite retries.
- **Headless remote login.** Deferred via operator-assisted flow ([ADR-007](../adr/ADR-007-operator-assisted-facebook-login-mvp.md)); documented limitation.

---

## Completion Checklist

- [x] Preflight (read-only); no firewall/SSH/user/network changes.
- [x] Migration `0002` + store methods.
- [x] Profile service + Playwright driver + connection service.
- [x] API + Web UI + CLI.
- [x] Audit foundation.
- [x] Tests (74 passing) with mocked browser; no real Facebook login.
- [x] Full quality suite + db:status green; live runtime verified.
- [x] Services stopped; secrets absent from Git; no commits.
- [x] Documentation + ADR-007 written; updates applied.

---

## Review Status

**Complete — ready for Product Owner review.**

A secure, auditable Facebook connection foundation exists: one account per workspace, controlled per-workspace browser profiles, a full connection/validation/disconnect state model, safe API/UI/CLI, and audit events — with writes disabled, the kill switch on, and no scanning, posting, or AI. Login is operator-assisted for the first pilot (ADR-007); a customer-facing remote-browser login remains an open decision.
