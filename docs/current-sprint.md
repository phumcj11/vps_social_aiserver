# Current Sprint

## Current Sprint

**SPRINT 005 — Facebook Groups Foundation**

## Objectives

**Facebook Groups Foundation.**

Allow an authenticated workspace owner to add Facebook Groups by URL, store safe group metadata, validate (connection-only) that the connected Facebook session can access a group, assign a group to one or more Businesses, unassign, disable/archive a group, and view access-validation status — with **no post scanning, no post ingestion, no opportunities, no AI, no Telegram, and no commenting**. Concretely, this sprint delivers:

- Database: `facebook_groups` and `business_facebook_groups` (many-to-many, ADR-008) via migration `0003`.
- A strict, offline Facebook Group URL normaliser.
- A connection-only Playwright group access-validation service (landing page only; no scroll, no post read, no writes).
- Authenticated API, `/settings/facebook/groups` UI + a Business "Facebook Groups" tab, an operator CLI, and audit events.
- Documentation ([30](30-facebook-groups.md), [31](31-group-url-normalisation.md), [32](32-group-access-validation.md), [33](33-business-group-assignment.md)) and [ADR-008](adr/ADR-008-business-to-group-many-to-many.md).

## Scope

**In scope**

- Facebook Group management (add by URL, canonicalise, dedup, status), safe metadata storage.
- Connection-only access validation using the workspace's connected profile.
- Business↔Group many-to-many assignment within a workspace.

**Out of scope**

- Group post scanning, opportunity discovery, post ingestion.
- AI matching, AI comment drafts, Telegram approval, comment execution, auto-comment.
- Multiple Facebook accounts per workspace, public browser viewer, n8n, billing, subscription, teams.

The full exclusion list is in [not-doing.md](not-doing.md).

## Status

**Complete.**

Group management, many-to-many Business assignment, and connection-only access validation are implemented, workspace-isolated, and auditable. URLs are canonicalised and deduplicated; non-Facebook/non-group/unsafe URLs are rejected; validation never reads posts, never scrolls, and never writes, and a disconnected session prevents validation (recorded as `login_required`, no browser). Facebook writes remain disabled, the global kill switch stays on, and the scanner/comment workers stay disabled. With `FACEBOOK_LOGIN_ENABLED=false` (default) no browser launches. The full quality suite passes (lint, typecheck, test — 116 passing, build, format:check, doctor) and `db:status` is green; the flow was verified live against MySQL without any real Facebook access. Detail and review status: [sprints/SPRINT-005-facebook-groups.md](sprints/SPRINT-005-facebook-groups.md).

## Definition of Done

- [x] Migration `0003` (`facebook_groups`, `business_facebook_groups`); no post/opportunity tables.
- [x] Strict offline URL normaliser.
- [x] Connection-only group access validation service (no scroll/post-read/write; concurrency one; bounded timeout; one safe retry).
- [x] API + `/settings/facebook/groups` UI + Business Groups tab + operator CLI; ownership enforced; no secret/path leakage.
- [x] Audit events (11 group events) with sanitised payloads.
- [x] Tests (116 passing) with mocked browser; no real Facebook access.
- [x] Full quality suite + `db:status` green; live runtime verification green.
- [x] Documentation + ADR-008; write flag false; kill switch on; workers disabled; secrets absent from Git.

## Next

On sign-off, the project proceeds to **SPRINT 006 — Read-Only Group Scanner**: discover new posts in assigned groups, strictly read-only, within the VPS budget. See [12-mvp-roadmap.md](12-mvp-roadmap.md).
