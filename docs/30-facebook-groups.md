# 30 — Facebook Groups

**Document status:** SPRINT 005 — Facebook Groups Foundation
**Applies to:** KMKT Social AI
**Date:** 2026-07-30

This sprint adds **Facebook Group management and Business↔Group assignment**, plus **connection-only access validation**. It does **not** scan posts, ingest posts, create opportunities, generate AI output, send Telegram, or comment. Facebook writes remain disabled and the kill switch stays on.

---

## What exists after this sprint

- A `facebook_groups` record per workspace holding **safe metadata only** (name, canonical/original URL, status, access state, validation timestamps/errors — no post data).
- A `business_facebook_groups` many-to-many assignment ([ADR-008](adr/ADR-008-business-to-group-many-to-many.md)).
- A strict Group URL normaliser ([31-group-url-normalisation.md](31-group-url-normalisation.md)).
- A connection-only Playwright access-validation service ([32-group-access-validation.md](32-group-access-validation.md)).
- Authenticated API, a `/settings/facebook/groups` UI + a Business "Facebook Groups" tab, an operator CLI, and audit events.

---

## Product rules honoured

1. A group belongs to exactly one workspace; a workspace may manage many groups.
2. A group may be assigned to many Businesses in the same workspace; a Business may monitor many groups ([ADR-008](adr/ADR-008-business-to-group-many-to-many.md), [33-business-group-assignment.md](33-business-group-assignment.md)).
3. Group URLs are canonicalised before storage; duplicates within a workspace are rejected; non-Facebook/non-group URLs are rejected.
4. Validation uses the workspace's connected Facebook profile, **never reads posts, never scrolls, never writes**; failures are explicit and auditable.
5. Groups are workspace-isolated — never visible or assignable across workspaces.
6. A disconnected/expired session prevents validation (recorded as `login_required`, no browser).
7. Global kill switch on; Facebook writes disabled; scanner/comment workers disabled.

---

## API

All endpoints require authentication; the workspace is derived from the session (no workspace/account id is accepted from the client). Mutations pass the CSRF/origin guard. Cross-workspace access returns **404** (existence never leaked).

| Method & path | Purpose |
| ------------- | ------- |
| `GET /facebook/groups` | List the workspace's groups. |
| `POST /facebook/groups` | Add a group by `{ url }` (normalised + dedup). |
| `GET /facebook/groups/:id` | Get one owned group. |
| `PATCH /facebook/groups/:id` | Set status (`active`/`disabled`/`archived`). |
| `POST /facebook/groups/:id/validate` | Validate access (connection-only). |
| `GET /facebook/groups/:id/businesses` | List assigned businesses. |
| `POST /facebook/groups/:id/businesses` | Assign `{ businessId }`. |
| `DELETE /facebook/groups/:id/businesses/:businessId` | Unassign. |
| `GET /businesses/:id/facebook-groups` | Groups assigned to a business. |

No endpoint accepts an arbitrary URL for navigation, a filesystem path, cookies, or credentials. Responses never include a profile path or cookies.

---

## Web UI

- **`/settings/facebook/groups`** — list groups (name, canonical URL, status, access state, last validated), add by URL, Validate, Enable/Disable/Archive, open in a new tab, assign/unassign businesses, and a reconnect warning when the Facebook session is invalid.
- **Business detail → Facebook Groups tab** — shows assigned groups and lets the owner assign/unassign.

No post feed, scanner interval, keyword, AI, comment, or Telegram controls are present.

---

## Operator CLI

```bash
pnpm facebook:group:add      --workspace <uuid> --url <url>
pnpm facebook:group:list     --workspace <uuid>
pnpm facebook:group:validate --workspace <uuid> --group <uuid>
pnpm facebook:group:assign   --workspace <uuid> --group <uuid> --business <uuid>
pnpm facebook:group:unassign --workspace <uuid> --group <uuid> --business <uuid>
```

The commands validate UUIDs, reject unsafe URLs, enforce workspace ownership, never print credentials/cookies/profile paths/raw HTML, never scan or comment, and return useful exit codes.

---

## Explicitly NOT implemented

Group post scanning, opportunity discovery, post ingestion, AI matching, AI comment drafts, Telegram approval, Facebook comment execution, auto-comment, multiple Facebook accounts per workspace, public browser viewer, n8n, billing, subscriptions, teams. No post tables and no opportunity tables exist yet.
