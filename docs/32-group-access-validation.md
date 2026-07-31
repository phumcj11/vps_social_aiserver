# 32 — Group Access Validation

**Document status:** SPRINT 005 — Facebook Groups Foundation
**Applies to:** KMKT Social AI
**Date:** 2026-07-30

Group access validation checks whether the workspace's **connected** Facebook session can reach a group's **landing page**. It is **connection-only**: it never reads posts, never scrolls, never clicks any control, and never writes. It reuses the Sprint 004 browser profile and safety gate.

---

## Access states

`facebook_groups.access_state`:

- `unknown` — added, not yet validated.
- `validating` — a validation run is in progress.
- `accessible` — the group landing page is reachable by the connected account.
- `inaccessible` — private / not accessible to this account.
- `login_required` — the session is not connected / expired.
- `checkpoint_required` — Facebook presented a checkpoint; human action required.
- `not_found` — the group could not be found.
- `validation_failed` — could not validate (error/timeout/login-disabled).

---

## `validateGroupAccess(workspaceId, groupId)`

1. Verify workspace ownership; load the group (404 if missing/not owned).
2. Verify a connected Facebook account exists and `connection_state = connected`. If not → set `login_required` (code `SESSION_NOT_CONNECTED`), audit, and return — **no browser** (rule: disconnected/expired sessions prevent validation).
3. Enforce concurrency one (per service) and acquire the cross-process profile lock.
4. Set `validating`; audit `facebook_group_validation_started`.
5. **Safety gate:** if `FACEBOOK_LOGIN_ENABLED=false` (default) → set `validation_failed` (code `LOGIN_DISABLED`), audit, return — **no browser**.
6. Launch a persistent Chromium context and navigate **only** to the canonical group URL, bounded by `FACEBOOK_VALIDATE_TIMEOUT_MS`, with **one** safe retry for a transient navigation failure (never for a browser-launch failure; no other retries).
7. Determine `accessible` / `inaccessible` / `login_required` / `checkpoint_required` / `not_found` / `validation_failed` from the response status and **safe page metadata only** (title / `og:title`) — never post text.
8. Extract only safe metadata when available: group name and numeric Facebook group id.
9. Persist the result and `last_validated_at`; close the browser; release the lock; record the matching audit event.

### Forbidden during validation

- No scrolling.
- No opening posts; no reading post text.
- No clicking Like, Join, Comment, Share, or any write control.
- No joining a group; no bypassing permissions; no stealth plugins; no CAPTCHA/checkpoint bypass.

---

## Error classification & audit

Each outcome maps to a `last_error_code` and an audit event:

| Outcome | access_state | audit event |
| ------- | ------------ | ----------- |
| accessible | accessible | `facebook_group_accessible` |
| inaccessible | inaccessible | `facebook_group_inaccessible` |
| login required | login_required | `facebook_group_login_required` |
| checkpoint | checkpoint_required | `facebook_group_checkpoint_required` |
| not found | not_found | `facebook_group_not_found` |
| failed / timeout / launch failure / login-disabled | validation_failed | `facebook_group_validation_failed` |

Audit payloads carry only the group id and a code/outcome — never cookies, profile paths, credentials, HTML, or screenshots.

---

## Safety gate (this sprint)

With `FACEBOOK_LOGIN_ENABLED=false` (default, unchanged) **no browser launches**; validation records `validation_failed` / `LOGIN_DISABLED`. This makes the whole state model exercisable without contacting Facebook and keeps the sprint free of any group/post access.
