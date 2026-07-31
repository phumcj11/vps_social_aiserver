# 13 — Product Memory

**Document status:** Foundation (SPRINT 000)
**Purpose:** A concise, authoritative source-of-truth summary of KMKT Social AI. When any other document conflicts on a fact of scope or rule, this summary and the documents it cites are the reference. Read this first to understand the product without the full document set or any chat history.

---

## Product Name
KMKT Social AI.

## Current Stage
SPRINT 005 — Facebook Groups Foundation (complete). Facebook Group management, connection-only access validation, and many-to-many Business↔Group assignment — no scanning, no post access, no AI. See [current-sprint.md](current-sprint.md).

## Product Purpose
Help business owners discover relevant customer-intent posts in Facebook Groups, generate a business-specific AI-assisted comment draft, send the opportunity to Telegram for human review, and publish the approved comment through Playwright — with full auditability and a global kill switch.

## Core Domain Model
User → owns one Workspace → contains many Businesses (each with a Business Profile) and one Platform Account (one Facebook account in the MVP). Businesses are assigned Facebook Groups (Business Group Assignment). Groups contain Posts. A Post yields zero/one/many Business Matches (score + explanation). A Match yields a Comment Draft → an Approval Decision → (if approved) a Comment Job → one or more Comment Attempts → Screenshot Evidence on success. Telegram Destination delivers opportunities; Audit Events record everything; the Kill Switch gates all writes. Full detail: [06-domain-model.md](06-domain-model.md).

## MVP Flow
Customer Account → Workspace → One or More Businesses → One Facebook Account → Groups Assigned to Businesses → Scan New Posts (read-only) → Match Post to Relevant Business(es) → Generate Business-Specific AI Draft → Send Telegram Notification → Human Approves / Edits / Rejects → Playwright Publishes Approved Comment → Store Result, Screenshot, and Audit History.

## Scope (in MVP)
- Multiple businesses per customer.
- One Facebook account per workspace, shared by all businesses.
- Multiple groups per business; a group may serve several businesses.
- Read-only scanning; matching with score and explanation; business-specific drafting.
- Telegram approval (approve/edit/reject).
- Playwright publishing at concurrency one; verification; screenshot evidence.
- Idempotency, bounded retries, full audit history, global kill switch.
Detail: [02-product-scope.md](02-product-scope.md).

## Non-Scope (not in MVP)
Auto-commenting without approval (rejected); multiple Facebook accounts (deferred); TikTok, Instagram, LINE, and other platforms; billing/subscriptions; team management/roles; browser farms and multi-account scaling; concurrency beyond one; analytics/reporting; mobile apps; public API. Detail: [not-doing.md](not-doing.md).

## Key Decisions
- **ADR-004:** One customer account may manage multiple businesses.
- **ADR-005:** One Facebook account per workspace in the MVP, usable by multiple businesses; multiple accounts deferred.
- **ADR-006:** Telegram is the MVP approval interface and every comment requires human approval.
- Business is the core; Facebook is the first platform adapter, not the core.
- Business logic lives in the Backend; n8n orchestrates but is not the source of truth; Playwright is never called directly by the frontend.

## Technical Stack (chosen and installed in SPRINT 001)
Monorepo (pnpm workspaces) · Node.js 22 LTS · pnpm · TypeScript · Next.js (App Router) for web · Fastify for API · MySQL 8 (Docker only) · Drizzle ORM (reserved for the schema sprint) · Docker Compose · n8n (reserved, profile-gated) · Playwright (reserved for the worker sprint) · Vitest · ESLint · Prettier.

**Installed versions (host):** Node.js 22.23.2, npm 10.9.8, pnpm 11.18.0, Docker Engine 29.6.2, Docker Compose v5.3.1, Git 2.43.0. **Workspace:** TypeScript 5.9.3, Next.js 15.5.22, React 19.2.8, Fastify 5.10.0, Vitest 3.2.7, ESLint 9.39.5, typescript-eslint 8.65.0, Prettier 3.9.6, Zod 3.25.76. MySQL and nginx are NOT installed on the host. See [15-technical-bootstrap.md](15-technical-bootstrap.md).

## Actual Project Structure (SPRINT 001)
`apps/{web,api}` · `workers/{facebook-scanner,facebook-comment}` (disabled placeholders, no Playwright) · `packages/{config,domain,shared,logger}` · `docker/{compose,mysql,n8n}` + Dockerfiles · `scripts/{doctor,backup,development}` · `storage/{screenshots,browser-profiles,logs,backups}` (gitignored runtime) · `tests/{unit,integration,fixtures}`. Root: `.env.example` (safe defaults, tracked), `package.json`, `pnpm-workspace.yaml`, `tsconfig.base.json`, `eslint.config.js`, `prettier.config.js`, `vitest.config.ts`. Quality commands: `pnpm lint | typecheck | test | build | format:check` and `pnpm run doctor` (all passing).

## Implemented Authentication & Session Model (SPRINT 002)
Self-hosted email + password (no third-party provider, no social login). Passwords hashed with **scrypt** (Node core, per-password salt); plaintext never stored, hashes never returned. **Server-managed sessions**: opaque random token in an **HttpOnly, SameSite=Lax** cookie (Secure in production); only the token's SHA-256 hash is stored. Session validation checks expiry and revocation; login rotates the token; logout revokes it. Endpoints: `POST /auth/register|login|logout`, `GET /auth/me`. Controls: rate-limit foundation on login/register, CSRF-aware Origin guard, strict CORS allowlist (`WEB_ORIGIN`), generic invalid-credentials, audit-safe logging (no secrets). Detail: [18-authentication-design.md](18-authentication-design.md), [21-session-security.md](21-session-security.md).

## Workspace Constraints (SPRINT 002)
One workspace per user (enforced by backend logic AND a DB unique constraint on `owner_user_id`). Ownership enforced: endpoints only ever load the authenticated user's own workspace; no endpoint takes a workspace id, so cross-user access is impossible. Endpoints: `POST /workspaces`, `GET /workspaces/current`, `PATCH /workspaces/current`. Slug generated and unique; no deletion; soft `status` only. Detail: [19-workspace-design.md](19-workspace-design.md).

## Actual Schema (SPRINT 002–005)
Eleven tables via Drizzle migrations (MySQL 8, Docker only). Migration `0003` (Facebook Groups) adds **facebook_groups** (id, workspace_id FK, facebook_group_id, name, canonical_url, original_url, status [active/disabled/archived], access_state, last_validated_at, last_error_code, last_error_message, timestamps; UNIQUE `(workspace_id, canonical_url)` and `(workspace_id, facebook_group_id)`; NO post data) and **business_facebook_groups** (id, workspace_id FK, business_id FK, facebook_group_id FK→facebook_groups.id, status, timestamps; UNIQUE `(business_id, facebook_group_id)`). No post/opportunity tables yet. Migration `0002` (Facebook Connection) adds **facebook_accounts** (id, workspace_id FK **UNIQUE**, platform, display_name, facebook_user_id, status, connection_state, profile_path [relative, server-generated], connected_at, last_validated_at, session_expires_at, disconnected_at, last_error_code, last_error_message, timestamps — NO password/cookie/token columns) and **audit_events** (id, workspace_id, user_id, event_type, payload [safe JSON], created_at). Migration `0000`: **users** (id, email UNIQUE, password_hash, status, timestamps) · **sessions** (id, user_id FK, session_token_hash UNIQUE, expires_at, last_seen_at, revoked_at, created_at) · **workspaces** (id, owner_user_id FK UNIQUE, name, slug UNIQUE, status, timestamps). Migration `0001` (Business Foundation): **businesses** (id, workspace_id FK, name, slug UNIQUE, status, timestamps; UNIQUE `(workspace_id, name)`) · **business_profiles** (id, business_id FK UNIQUE, category, description, selling_points, service_area, contact_information, response_tone, prohibited_claims, timestamps) · **business_knowledge** (id, business_id FK, title, content, status, timestamps) · **business_matching_rules** (id, business_id FK, rule_type, rule_value, priority INT, status, timestamps). UUID PKs; safe timestamps; businesses never deleted (soft status); knowledge & rules deletable. Detail: [20-database-foundation.md](20-database-foundation.md), [22-business-foundation.md](22-business-foundation.md).

## Facebook Groups (SPRINT 005)
Facebook Group management + Business assignment + connection-only access validation. **No scanning, no post ingestion, no opportunities, no AI, no Telegram, no commenting.** A group belongs to one workspace (many per workspace); assigned to many Businesses (many-to-many, [ADR-008](adr/ADR-008-business-to-group-many-to-many.md)); a Business monitors many groups. URLs are canonicalised by a strict OFFLINE normaliser (allowlisted Facebook hosts + exact `/groups/{token}` path; rejects non-Facebook/profile/page/post/unsafe-scheme URLs). Duplicate groups within a workspace rejected (unique `(workspace_id, canonical_url)`). Access validation (`POST /facebook/groups/:id/validate`) uses the workspace's connected profile, navigates ONLY to the landing page — **never reads posts, never scrolls, never clicks Like/Join/Comment/Share, never writes** — concurrency one, bounded timeout, one safe retry; access_state ∈ unknown/validating/accessible/inaccessible/login_required/checkpoint_required/not_found/validation_failed. Disconnected/expired session → `login_required` (no browser). Endpoints: `GET/POST /facebook/groups`, `GET/PATCH /facebook/groups/:id`, `POST /facebook/groups/:id/validate`, `GET/POST /facebook/groups/:id/businesses`, `DELETE /facebook/groups/:id/businesses/:businessId`, `GET /businesses/:id/facebook-groups`. Operator CLI: `facebook:group:add|list|validate|assign|unassign`. Safety gate `FACEBOOK_LOGIN_ENABLED=false` → no browser. Detail: [30](30-facebook-groups.md), [31](31-group-url-normalisation.md), [32](32-group-access-validation.md), [33](33-business-group-assignment.md).

## Facebook Connection (SPRINT 004)
Secure per-workspace session model — **connection only** (no scan/read/comment/AI). One Facebook account per workspace (DB-unique `workspace_id`, ADR-005). The DB stores ONLY safe metadata — **no password, no cookies, no tokens**; the session lives in an on-disk per-workspace persistent browser profile at `storage/browser-profiles/{workspace-id}/facebook/` (server-generated path, UUID traversal-protection, 0700, gitignored, never returned). Playwright drives a manual login where the **user types credentials directly in the browser; the backend never receives or logs the password**. State machine: not_connected → connecting → connected | reconnect_required | checkpoint_required | validation_failed | disconnected. Concurrency one; timeouts; error classification; no infinite retries; no silent failure. Endpoints: `GET /facebook/account`, `POST /facebook/connect/start`, `GET /facebook/connect/status`, `POST /facebook/validate`, `POST /facebook/disconnect` (confirm required). Operator-assisted login via `pnpm facebook:connect|validate|disconnect|status` ([ADR-007](adr/ADR-007-operator-assisted-facebook-login-mvp.md)). **Safety gate:** `FACEBOOK_LOGIN_ENABLED=false` by default → no browser launches. Connecting a session grants NO permission to scan or comment; write flag false, kill switch on, scanner/comment workers disabled. Minimal `audit_events` table added (facebook_* + login/logout/workspace-updated; payloads sanitised). Detail: [26](26-facebook-connection.md), [27](27-facebook-session-lifecycle.md), [28](28-browser-profile-security.md), [29](29-facebook-connection-runbook.md).

## Business Domain (SPRINT 003)
Business is the product core. Workspace owns many businesses; a business owns one profile and many knowledge items and matching rules. Ownership verified on every endpoint (user → workspace → business → sub-resource; cross-user → 404). Unique slug (global) and unique name within a workspace. Endpoints: `POST/GET /businesses`, `GET/PATCH /businesses/:id`, `GET/PATCH /businesses/:id/profile`, `GET/POST/PATCH/DELETE /businesses/:id/knowledge[/:kid]`, `GET/POST/PATCH/DELETE /businesses/:id/matching-rules[/:rid]`. **Business Knowledge is structured data, NOT AI memory. Matching Rules are deterministic, NOT AI** (allowed types: province, district, keyword, guest_count, budget, facility, custom). AI consumes these in a later sprint. Detail: [22](22-business-foundation.md), [23](23-business-profile.md), [24](24-business-knowledge.md), [25](25-business-matching-rules.md).

## Current Server Constraints
Single VPS: Ubuntu 24.04.4 LTS, 2 CPU cores, 3.8 GiB RAM, ~47 GiB free disk, ~2.0 GiB swap. Forces browser concurrency of one, a single-host deployment, and no heavy infrastructure. MySQL runs in Docker, published on host loopback only (127.0.0.1:3306), never public. See [server-audit.md](server-audit.md).

## Current Sprint
SPRINT 005 — Facebook Groups Foundation (complete). Group management, connection-only access validation, and many-to-many Business↔Group assignment. No scanning, post ingestion, opportunities, AI, Telegram, or n8n.

## Next Sprint
SPRINT 006 — Read-Only Group Scanner: discover new posts in assigned groups, strictly read-only, within the VPS budget. See [12-mvp-roadmap.md](12-mvp-roadmap.md).

## Rules Claude Must Always Follow
1. **Human approval is mandatory** before every Facebook comment. There is no auto-commenting in the MVP.
2. **Never silently choose a business** when a post matches multiple; surface each distinctly.
3. **AI uses only the selected business's context**; never leak across businesses; never invent facts; never make prohibited claims.
4. **Business is the core; Facebook is an adapter.** Keep business logic in the Backend.
5. **One successful comment per business-and-post combination**; retry only after a confirmed technical failure, within limits.
6. **Every successful comment must have screenshot evidence**; an unverifiable comment is not a success.
7. **Everything is auditable**; no silent failure — surface and record every error and interruption.
8. **Never bypass CAPTCHAs/checkpoints**; pause and ask a human.
9. **The kill switch stops all new Facebook writes** and cannot be bypassed.
10. **Credentials, cookies, and browser profiles never go into Git** or the frontend.
11. **Keep the MVP small**; do not add platforms, scaling, billing, teams, or auto-commenting.
12. **Stay within the VPS budget** (2 cores, 3.8 GiB): concurrency one, single host, no heavy infrastructure.
