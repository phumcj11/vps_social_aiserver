# 19 — Workspace Design

**Document status:** SPRINT 002 — Authentication & Workspace
**Applies to:** KMKT Social AI
**Date:** 2026-07-30

This document describes the workspace foundation implemented in SPRINT 002. A workspace is the isolation boundary and container for a customer's data (see [06-domain-model.md](06-domain-model.md)). In this sprint it holds only a name, slug, and status — Business management and everything downstream come later.

---

## Constraints (this sprint)

- **One workspace per user.** Enforced two ways: backend logic checks for an existing workspace before creating, and the database has a **unique** constraint on `owner_user_id`.
- **Ownership enforced in the backend.** Every workspace operation is scoped to the authenticated user; the API only ever loads *that user's* workspace. There is no endpoint that accepts a workspace id, so a user can never read or modify another user's workspace.
- **No deletion.** Workspaces are never deleted; only a soft `status` field exists (default `active`).
- **No team members, no invitations, no multiple workspaces per user.**

---

## Endpoints

All require authentication. Mutating endpoints also pass the CSRF/origin guard (see [21-session-security.md](21-session-security.md)). Responses are JSON with `Cache-Control: no-store`.

### POST /workspaces
1. Require authentication.
2. Validate `{ name }` (required, 1–120 chars).
3. If the user already has a workspace → `409 workspace_exists` (a clear already-exists conflict).
4. Generate a unique slug from the name (see below).
5. Create the workspace (`status` defaults to `active`).
6. Return `201 { workspace }`.

### GET /workspaces/current
1. Require authentication.
2. Load the authenticated user's workspace.
3. Return `200 { workspace }`, or `404 workspace_not_found` when none exists (the web app renders this as an empty state).

### PATCH /workspaces/current
1. Require authentication.
2. Validate `{ name }`.
3. Load the authenticated user's workspace (never another user's); `404 workspace_not_found` if none.
4. Update the name and return `200 { workspace }`.

---

## Slug generation & collisions

- The name is slugified: Unicode-normalised, diacritics stripped, lowercased, non-alphanumeric runs collapsed to hyphens, trimmed, length-bounded. Empty results fall back to `workspace`.
- Uniqueness: the base slug is tried first; on collision, short random suffixes are appended until an unused slug is found. The database also enforces a **unique** constraint on `slug`.
- The slug is shown read-only in the UI and is generated on creation; renaming the workspace does not change the slug in this sprint.

---

## Idempotency / already-exists behaviour

Creation is not silently idempotent: a second `POST /workspaces` for a user who already has one returns a clear `409 workspace_exists` rather than creating a duplicate or silently returning the existing one. The web app avoids this by routing existing-workspace users to the edit flow.

---

## Web UI

- **Dashboard** (`/dashboard`): protected; shows the signed-in user's email, and the workspace name/status/slug, or an empty state with a "Create workspace" button.
- **Workspace Settings** (`/settings/workspace`): protected; creates the workspace if missing, edits the name if present, shows the slug read-only, and gives success/error feedback.

Both pages verify the session via `GET /auth/me` on load and redirect to `/login` if unauthenticated.

---

## Out of scope (this sprint)

Businesses and business profiles, Facebook accounts/groups, any lead/AI/Telegram/Playwright functionality, multiple workspaces, and any workspace sharing or roles.
