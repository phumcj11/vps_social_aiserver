# 28 — Browser Profile Security

**Document status:** SPRINT 004 — Facebook Connection Foundation
**Applies to:** KMKT Social AI
**Date:** 2026-07-30

The Facebook session lives entirely in an on-disk **persistent browser profile** — never in the database. This document defines how that profile is stored and protected.

---

## Location

```
storage/browser-profiles/{workspace-id}/facebook/
```

- One profile directory **per workspace**; never shared between workspaces.
- The path is **server-generated** from the workspace id only.
- `BROWSER_PROFILE_ROOT` (default `storage/browser-profiles`) sets the root.

---

## Controls

- **Server-generated paths only.** The frontend never supplies a path; the API stores only a **relative** `profile_path` and never returns it.
- **Path-traversal protection.** The workspace id must be a valid UUID, which structurally cannot contain `/` or `..`. A second check asserts the resolved absolute path stays under the profile root. Invalid ids are rejected (`INVALID_WORKSPACE`).
- **Restrictive permissions.** Directories are created with `0700` (owner only).
- **No absolute-path exposure.** Absolute paths never appear in API responses, logs, or audit payloads.
- **No profile contents in logs or Git.** Profile contents are never copied into logs, never archived automatically, and are gitignored (`storage/browser-profiles/*`, plus `*.cookies`, `*.session`, `sessions/`, `cookies/`). Verified: a path like `storage/browser-profiles/<uuid>/facebook/cookies` is ignored by Git.
- **One profile, one process.** An exclusive lock (`facebook.lock`, created with `wx`) prevents two browser processes (API and CLI) from using the same profile concurrently; stale locks are reclaimed. Contended access returns `PROFILE_LOCKED`.
- **Deletion is controlled and explicit.** The profile directory is removed **only** through the service's `deleteProfile`, and **only** during an explicit disconnect. If deletion fails, the account is marked with `PROFILE_CLEANUP_FAILED`, a `facebook_profile_cleanup_failed` audit event is recorded, and the UI/CLI report that manual cleanup is required — no silent failure.

---

## What is NOT stored

- **No Facebook password** — anywhere. The user types it directly into the browser; the backend never receives it.
- **No cookies or session tokens in the database.** Session material lives only inside the on-disk profile.
- The database (`facebook_accounts`) holds only safe metadata: display name, Facebook user id (if safely obtainable), state, timestamps, error code/message, and the relative profile path.

---

## Disconnect guarantee

Disconnect invalidates the stored session reference (`disconnected`, `session_expires_at` cleared) and removes the profile directory, so no stored session remains and future browser use requires a fresh reconnect. A different workspace's profile is never affected.

---

## Playwright browser binaries

The Chromium binary installed by Playwright lives outside the repository (`~/.cache/ms-playwright`) and is never committed. On a fresh host, system libraries may be required to launch it; see the runbook ([29-facebook-connection-runbook.md](29-facebook-connection-runbook.md)).
