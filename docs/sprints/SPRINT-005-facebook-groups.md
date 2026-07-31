# SPRINT 005 — Facebook Groups Foundation

- **Stage:** SPRINT 005 — Facebook Groups Foundation
- **Type:** Feature implementation (Facebook Group management + Business assignment + access validation)
- **Date:** 2026-07-30
- **Owner:** Principal Software Architect / Senior Full Stack Engineer

---

## Goal

Allow an authenticated workspace owner to add Facebook Groups by URL, store safe group metadata, validate (connection-only) that the connected Facebook session can access a group, assign a group to one or more Businesses, unassign, disable/archive a group, and view access-validation status. No post scanning, ingestion, opportunities, AI, Telegram, or commenting.

---

## Deliverables

- **Database:** Drizzle migration `0003` — `facebook_groups` (unique `(workspace_id, canonical_url)` and `(workspace_id, facebook_group_id)`, access-state machine, no post data) and `business_facebook_groups` (unique `(business_id, facebook_group_id)`, workspace-scoped, ADR-008). No post/opportunity tables.
- **URL normaliser:** strict, offline Facebook Group URL normaliser (canonical form + identifier) rejecting non-Facebook/non-group/unsafe URLs.
- **Store:** create/list/get/update group, update access state, assign/unassign, list businesses↔groups, ownership-scoped.
- **Validation service:** connection-only Playwright group access validation — landing page only, no scroll, no post read, no clicks/writes, concurrency one, bounded timeout, one safe retry, login-disabled safety gate.
- **API:** 9 authenticated, ownership-scoped, CSRF-guarded endpoints; safe responses (no profile path/cookies/post data); duplicate detection.
- **Web UI:** `/settings/facebook/groups` (add/validate/enable/disable/archive/open/assign/unassign, reconnect warning) and a Business "Facebook Groups" tab; nav link.
- **Operator CLI:** `facebook:group:add|list|validate|assign|unassign`.
- **Audit:** 11 group event types with sanitised payloads (no cookies/paths/credentials/HTML/screenshots).
- **Tests:** 116 passing (URL normalisation, store/model, API, validation service, audit).
- **Documentation:** [30](../30-facebook-groups.md), [31](../31-group-url-normalisation.md), [32](../32-group-access-validation.md), [33](../33-business-group-assignment.md); [ADR-008](../adr/ADR-008-business-to-group-many-to-many.md); updates to current-sprint, product-memory, domain-model, system-overview, playwright-design, environment-configuration, development-workflow, roadmap.

---

## Non-Goals (not implemented)

Group post scanning, opportunity discovery, post ingestion, AI matching, AI comment drafts, Telegram approval, Facebook comment execution, auto-comment, multiple Facebook accounts per workspace, public browser viewer, n8n, billing, subscription, teams. No post tables, no opportunity tables.

---

## Acceptance Criteria

- [x] Add group by URL with canonicalisation; duplicates within a workspace rejected; non-Facebook/non-group/unsafe URLs rejected.
- [x] Store safe metadata; no post data.
- [x] Validate access using the connected profile — never reads posts, never scrolls, never writes; failures explicit and auditable.
- [x] Assign a group to multiple Businesses; unassign; unique assignment.
- [x] Disable/archive a group (no deletion of groups required; soft status).
- [x] Groups workspace-isolated; cross-workspace access → 404.
- [x] Disconnected/expired session prevents validation (`login_required`, no browser).
- [x] Kill switch on; Facebook writes disabled; scanner/comment workers disabled.
- [x] `pnpm lint | typecheck | test | build | format:check | run doctor | db:status` all pass.

---

## Runtime verification

MySQL started (loopback), migration `0003` applied (11 tables). Live flow (login disabled): add group (canonical `…/groups/987654321`), duplicate → 409, invalid URL → 400, list, assign to two businesses (duplicate → 409), business shows group, unassign, validate → `login_required` (no browser), ownership isolation (other workspace → 404 + empty list), audit events `facebook_group_created/assigned/unassigned/login_required` recorded with no secrets/paths. Services stopped. No real Facebook access.

---

## Risks & Mitigations

- **Unsafe/arbitrary URLs.** Mitigated by the strict offline normaliser (allowlist of hosts + exact `/groups/{token}` path; unsafe schemes rejected).
- **Reading posts during validation.** Mitigated by a connection-only validator that navigates to the landing page and reads only page-level metadata; enforced by the driver contract and tests.
- **Cross-workspace leakage.** Mitigated by workspace-scoped ownership on every endpoint and workspace-carrying join rows; 404 (not 403) responses.
- **Accidental Facebook contact.** Mitigated by the `FACEBOOK_LOGIN_ENABLED=false` gate (no browser by default) and the disconnected-session guard.

---

## Completion Checklist

- [x] Preflight (read-only); no firewall/SSH/user/network changes.
- [x] Migration `0003` + store methods.
- [x] URL normaliser + group validation service.
- [x] API + Web UI + operator CLI.
- [x] Audit events.
- [x] Tests (116 passing) with mocked browser; no real Facebook access.
- [x] Full quality suite + db:status green; live runtime verified.
- [x] Services stopped; secrets absent from Git; no commits.
- [x] Documentation + ADR-008 written; updates applied.

---

## Review Status

**Complete — ready for Product Owner review.**

Facebook Group management, many-to-many Business assignment, and connection-only access validation are implemented, ownership-isolated, and auditable — with writes disabled, the kill switch on, and no scanning, post access, AI, or Telegram. Ready for SPRINT 006.
