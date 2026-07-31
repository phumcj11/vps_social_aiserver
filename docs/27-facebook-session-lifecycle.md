# 27 — Facebook Session Lifecycle

**Document status:** SPRINT 004 — Facebook Connection Foundation
**Applies to:** KMKT Social AI
**Date:** 2026-07-30

The connection service is a deterministic state machine over `facebook_accounts.connection_state`. It performs **connection and validation only** — never scanning, reading posts, or writing.

---

## States

`connection_state`:

- `not_connected` — no session yet.
- `connecting` — a connection task is running (concurrency one).
- `connected` — a valid session exists in the persistent profile.
- `reconnect_required` — the session expired or login is needed again.
- `checkpoint_required` — Facebook presented a CAPTCHA/checkpoint; human action required.
- `validation_failed` — the last connect/validate could not be verified (see `last_error_code`).
- `disconnected` — the operator disconnected; the profile has been removed.

`status`: `active` | `disconnected` | `blocked`.

---

## Transitions

```
not_connected ──startConnection──▶ connecting
connecting ──connected────────────▶ connected
connecting ──timeout/login────────▶ reconnect_required
connecting ──checkpoint───────────▶ checkpoint_required
connecting ──blocked──────────────▶ validation_failed (status=blocked)
connecting ──login disabled───────▶ validation_failed (LOGIN_DISABLED)
connected  ──validate:ok──────────▶ connected (last_validated_at updated)
connected  ──validate:expired─────▶ reconnect_required (SESSION_EXPIRED)
connected  ──validate:checkpoint──▶ checkpoint_required
any        ──disconnect(confirm)──▶ disconnected (profile removed)
reconnect_required/checkpoint_required/validation_failed ──startConnection──▶ connecting
```

---

## Operations

- **startConnection(workspaceId):** verifies workspace ownership; refuses if a run is already active (concurrency one → `CONNECTION_ALREADY_RUNNING`); creates the controlled profile directory; acquires an exclusive lock; launches Chromium with a persistent context (only when login is enabled); allows user-driven login **without ever typing or capturing the password**; detects success via the Facebook session cookie (`c_user`) read from the browser context; extracts minimal identity if available; persists state; closes the browser on completion or timeout; returns a safe status. Runs as a **background task** so the HTTP request returns immediately with `connecting`.
- **getConnectionStatus(workspaceId):** returns safe state + user-action hints. No profile path, no cookies.
- **validateSession(workspaceId):** launches the persistent profile, opens a safe Facebook page, and classifies the session as `connected`, `login_required`, `checkpoint_required`, `blocked`, or `validation_failed`. Never scans groups or reads posts; closes Chromium after.
- **disconnect(workspaceId, confirm):** requires explicit confirmation; aborts any active run; marks `disconnected`; removes the profile through the controlled service; reports cleanup failure explicitly.

---

## Error classification

No infinite retries. Terminal outcomes map to codes:

`CONNECTION_ALREADY_RUNNING` · `LOGIN_TIMEOUT` · `LOGIN_REQUIRED` · `SESSION_EXPIRED` · `CHECKPOINT_REQUIRED` · `ACCOUNT_BLOCKED` · `BROWSER_LAUNCH_FAILED` · `PROFILE_LOCKED` · `PROFILE_CLEANUP_FAILED` · `VALIDATION_FAILED` · `LOGIN_DISABLED` (safety gate).

Each is stored in `last_error_code` with a safe `last_error_message`, surfaced to the human (visible reconnect/checkpoint states) — never silently swallowed.

---

## Concurrency & timeouts

- **Concurrency one** globally: at most one browser task (connect or validate) runs at a time. A filesystem lock (`facebook.lock`) additionally prevents the API and CLI from using the same profile at once.
- **Timeouts:** `FACEBOOK_CONNECT_TIMEOUT_MS` (default 180000) and `FACEBOOK_VALIDATE_TIMEOUT_MS` (default 60000). On timeout the run ends and the state reflects it — no retry loop.

---

## Safety gate (this sprint)

With `FACEBOOK_LOGIN_ENABLED=false` (the default, unchanged this sprint) **no real browser launches**. Connect/validate record `validation_failed` / `LOGIN_DISABLED` and audit the attempt. This makes the state model fully exercisable without contacting Facebook, and keeps the sprint free of any Facebook read/write.
