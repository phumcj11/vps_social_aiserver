# SPRINT 002 — Authentication and Workspace

- **Stage:** SPRINT 002 — Authentication and Workspace
- **Type:** Feature implementation (auth + workspace foundation)
- **Date:** 2026-07-30
- **Owner:** Principal Software Architect / Senior Full Stack Engineer

---

## Goal

Implement the minimum usable Authentication and Workspace foundation so one real user can create an account, sign in and out, create and view one workspace, edit its name, and access only their own workspace — with secure, self-hosted, cookie-based sessions. No Business management or any Facebook/AI/Telegram/Playwright/n8n functionality.

---

## Deliverables

- **Database:** MySQL 8 (Docker only), Drizzle ORM + mysql2, schema for `users`, `sessions`, `workspaces`, first migration, connection module, DB health check, and the `db:*` commands.
- **Authentication API:** `POST /auth/register`, `POST /auth/login`, `POST /auth/logout`, `GET /auth/me`; scrypt password hashing; server-managed sessions in HttpOnly cookies; session validation/expiry/revocation; authentication middleware; rate-limit foundation; audit-safe logging.
- **Workspace API:** `POST /workspaces`, `GET /workspaces/current`, `PATCH /workspaces/current`; one workspace per user; ownership enforced; safe slug generation with collision handling.
- **Web UI:** `/register`, `/login`, `/dashboard`, `/settings/workspace`, plus navigation with logout; loading/error/empty/success states; protected routes.
- **Security:** scrypt hashing, min password policy, HttpOnly + SameSite=Lax (+ Secure in prod) cookies, token rotation on login, tokens hashed at rest, CSRF-aware origin guard, strict CORS allowlist, input validation, ORM-based SQL-injection protection, generic auth errors, ownership checks.
- **Tests:** 28 passing (auth, workspace, security, health) using an in-memory store — no external services.
- **Documentation:** [18-authentication-design.md](../18-authentication-design.md), [19-workspace-design.md](../19-workspace-design.md), [20-database-foundation.md](../20-database-foundation.md), [21-session-security.md](../21-session-security.md); updates to [current-sprint.md](../current-sprint.md), [13-product-memory.md](../13-product-memory.md), [16-environment-configuration.md](../16-environment-configuration.md).

---

## Non-Goals (not implemented)

Facebook connection/login/groups; Playwright; AI matching/generation; Telegram; n8n workflows; comment approval/execution; billing; subscription; team members; multiple users per workspace; multiple Facebook accounts; auto-comment; social login; password reset; email verification; Business management.

---

## Acceptance Criteria

- [x] A user can register, sign in, sign out.
- [x] A user can create, view, and rename one workspace.
- [x] A user can access only their own workspace (ownership enforced).
- [x] Passwords hashed (scrypt); plaintext never stored; hashes never returned.
- [x] Sessions server-managed; tokens stored hashed; HttpOnly cookie; SameSite=Lax; Secure in prod; expiry; logout revocation.
- [x] Email unique; workspace slug unique; one workspace per user (DB + backend).
- [x] Schema via Drizzle migrations; no Business tables.
- [x] Rate-limit foundation on login/register; CSRF-aware; strict CORS.
- [x] `pnpm lint | typecheck | test | build | format:check | run doctor` all pass.
- [x] `db:generate | db:migrate | db:status | db:reset:development` work; reset is guarded.
- [x] MySQL private (loopback only); API not publicly bound; web loopback only.

---

## Risks & Mitigations

- **CSRF in cookie-auth.** Mitigated by SameSite=Lax + strict CORS + Origin check; token-based CSRF deferred and documented ([21-session-security.md](../21-session-security.md)).
- **User enumeration / timing.** Mitigated by generic errors and equalised login timing (dummy verify).
- **Resource pressure (2 cores / 3.8 GiB).** scrypt params tuned modestly; small DB pool; only MySQL/API/web run; workers/n8n never started.
- **Secret leakage.** Strict `.gitignore`, only `.env.example` tracked, logger denylist, no hashes returned.

---

## Completion Checklist

- [x] Preflight (read-only) performed; no firewall/SSH/user/network changes.
- [x] DB deps installed; schema + migration + connection + health + commands.
- [x] Auth backend implemented and tested.
- [x] Workspace backend implemented and tested (ownership enforced).
- [x] Web UI implemented.
- [x] Security controls implemented and verified.
- [x] MySQL started (Docker), migrations run, live end-to-end flow verified.
- [x] Full quality suite green; `db:status` green.
- [x] Services stopped after verification (MySQL retained for final `db:status`).
- [x] Documentation written/updated; no placeholders or TODO markers.
- [x] No Facebook/Telegram/AI/n8n/Playwright action; workers disabled; kill switch on; no secrets committed.

---

## Review Status

**Complete — ready for Product Owner review.**

A real user can register, sign in/out, and manage their single workspace with ownership enforced, over secure cookie-based sessions. All quality gates and the live runtime flow pass. No product features beyond authentication and workspace exist. The project is ready to proceed to **SPRINT 003 — Business Management** upon sign-off.
