# 26 — Facebook Connection

**Document status:** SPRINT 004 — Facebook Connection Foundation
**Applies to:** KMKT Social AI
**Date:** 2026-07-30

This sprint establishes a **secure per-workspace Facebook session model** for the MVP: connect one Facebook account, validate the session, reconnect, disconnect, and see status. It does **not** scan groups, read posts, comment, or use AI/Telegram/n8n — connection only. Facebook is an adapter (ADR-005: one account per workspace).

> **Session connection does not imply permission to scan or comment.** The reader/comment/write flags and the global kill switch remain disabled/on. A connected session is inert until later sprints add (human-approved) capabilities.

---

## What exists after this sprint

- A `facebook_accounts` record per workspace (at most one — DB-unique `workspace_id`) holding **only safe metadata** — no password, no cookies, no tokens ([20-database-foundation.md](20-database-foundation.md)).
- A controlled, per-workspace persistent browser profile directory ([28-browser-profile-security.md](28-browser-profile-security.md)).
- A Playwright-backed connection service performing **connection/validation only** ([27-facebook-session-lifecycle.md](27-facebook-session-lifecycle.md)).
- Authenticated API endpoints, a Facebook settings UI, an operator-assisted CLI, and audit events.

---

## Product rules honoured

1. One workspace → at most one Facebook account.
2. A session belongs to exactly one workspace; profiles/cookies are never shared between workspaces.
3. Facebook passwords are **never** stored; the user types credentials directly into the browser; the backend never receives or logs the password.
4. Browser profile files are never committed to Git.
5. Facebook write actions remain disabled; the global kill switch stays on; scanner and comment workers stay disabled.
6. Session expiry produces a visible **reconnect-required** state; CAPTCHA/checkpoint stops the flow and requires human action; disconnect invalidates the session reference and removes the profile. No silent failure.

---

## API

All endpoints require authentication; the workspace is derived from the session (no workspace/account id is accepted from the client, so cross-workspace access is impossible). Mutations require the CSRF/origin guard.

| Method & path | Purpose |
| ------------- | ------- |
| `GET /facebook/account` | Safe status metadata (never a profile path or cookies). |
| `POST /facebook/connect/start` | Begin a background connection task (returns `202`, state `connecting`). |
| `GET /facebook/connect/status` | Current safe state + user-action-required hints. |
| `POST /facebook/validate` | Validate the persisted session (no scan/write). |
| `POST /facebook/disconnect` | Requires `{"confirm": true}`; stops the browser, marks disconnected, cleans the profile. |

Credentials cannot be submitted through the API — no endpoint has a password/email field; any such body fields are ignored.

---

## Login method (MVP)

The VPS is headless, so a fully browser-based remote login cannot be exposed safely without an authenticated remote-browser viewer (out of scope, no public port). The MVP therefore uses an **operator-assisted login** for the first pilot ([ADR-007](adr/ADR-007-operator-assisted-facebook-login-mvp.md)), driven by a CLI:

```bash
pnpm facebook:connect    --workspace <uuid>
pnpm facebook:validate   --workspace <uuid>
pnpm facebook:disconnect --workspace <uuid> --confirm
pnpm facebook:status     --workspace <uuid>
```

By default `FACEBOOK_LOGIN_ENABLED=false`: **no browser launches** and a connection attempt is recorded as `validation_failed` / `LOGIN_DISABLED`. An operator sets the flag true in a local `.env` only when running the assisted login (see [29-facebook-connection-runbook.md](29-facebook-connection-runbook.md)).

---

## What is explicitly NOT implemented

Facebook Group management/scanning, post ingestion, opportunity discovery, AI matching, AI comment drafts, Telegram approval, comment execution, auto-comment, multiple Facebook accounts per workspace, shared accounts between workspaces, billing, subscriptions, teams, n8n workflows.
