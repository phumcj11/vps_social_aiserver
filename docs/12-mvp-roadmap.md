# 12 — MVP Roadmap

**Document status:** Foundation (SPRINT 000)
**Applies to:** KMKT Social AI MVP

This roadmap sequences the MVP into small, verifiable sprints. Each sprint has a single clear goal, concrete deliverables, explicit exclusions, exit criteria, and main risks. The order is deliberate: foundations and safety first, then read-only capability, then AI, then approval, and only then the first Facebook write. Nothing writes to Facebook until human approval and the kill switch are in place.

Scope is bounded by [02-product-scope.md](02-product-scope.md) and [not-doing.md](not-doing.md). Later sprints must not widen the MVP.

---

## Sprint 000 — Product Foundation

- **Goal:** Establish the complete product foundation as documentation so any engineer can build the MVP without this chat history.
- **Deliverables:** Vision, scope, personas, journey, business rules, domain model, system overview, UX spec, AI design, Playwright design, Telegram design, roadmap, product memory, glossary; ADR-004/005/006; sprint record; updated current-sprint, backlog, not-doing.
- **Exclusions:** No code, packages, services, databases, Docker, APIs, Playwright, or external connections.
- **Exit criteria:** All listed documents exist, are consistent, contain no placeholders or TODOs, and pass verification.
- **Main risks:** Ambiguity or contradiction between documents; scope creep into implementation. Mitigated by cross-referencing and a single source-of-truth document ([13-product-memory.md](13-product-memory.md)).

## Sprint 001 — Technical Bootstrap

- **Goal:** Choose and record the core technical stack and stand up a minimal, running skeleton within the VPS budget.
- **Deliverables:** ADRs for language/framework, database, and how components run on the single host; a bootable Backend and Web skeleton (no product features); local run and configuration approach; secrets-handling approach that keeps credentials out of Git.
- **Exclusions:** No Facebook, Telegram, AI, or Playwright behaviour; no business features.
- **Exit criteria:** The skeleton runs on the target host; configuration and secret handling are documented; stack decisions are recorded as ADRs.
- **Main risks:** Over-engineering the stack. Mitigated by Keep-MVP-Small and the resource budget.

## Sprint 002 — Authentication and Workspace

- **Goal:** Let a customer register, log in, and own an isolated workspace.
- **Deliverables:** Registration and login; secure credential storage; automatic single-workspace provisioning; workspace isolation enforced in the Backend; audit events for account and session actions.
- **Exclusions:** No businesses, Facebook, Telegram, AI, or Playwright.
- **Exit criteria:** A user can register, log in, and see an empty, isolated workspace; isolation is verified; auth actions are audited.
- **Main risks:** Weak isolation or credential handling. Mitigated by making isolation a Backend invariant and reviewing security early.

## Sprint 003 — Business Management

- **Goal:** Let a customer create and manage multiple businesses with complete profiles.
- **Deliverables:** Create/list/enable/disable businesses; full Business Profile editing (products/services, service area, selling points, contact, tone, keywords, response rules, prohibited claims); completeness indicators; audit events.
- **Exclusions:** No Facebook, groups, AI drafting, Telegram, or Playwright.
- **Exit criteria:** A customer can manage several businesses, each with a complete, isolated profile; profiles are the sole per-business context ready for later AI use.
- **Main risks:** Profile model too thin for good matching/drafting later. Mitigated by validating fields against [09-ai-design.md](09-ai-design.md).

## Sprint 004 — Facebook Connection Foundation

- **Status:** **Complete** (delivered as connection-only; Facebook Group setup/assignment deferred to Sprint 005 as its precondition).
- **Goal:** Establish a secure per-workspace Facebook session model — connect one account, validate, reconnect, disconnect, and show status.
- **Deliverables:** `facebook_accounts` (one per workspace; no password/cookie/token) + audit foundation; controlled per-workspace persistent browser profile (server-generated path, traversal-protected, gitignored); Playwright connection service (connect/validate/disconnect) at concurrency one with error classification; authenticated API; `/settings/facebook` UI; operator-assisted CLI ([ADR-007](adr/ADR-007-operator-assisted-facebook-login-mvp.md)); safety gate `FACEBOOK_LOGIN_ENABLED` (default off). See [26-facebook-connection.md](26-facebook-connection.md).
- **Exclusions:** No group listing/assignment, no scanning, no post reading, no commenting, no AI, no Telegram, no n8n. Session connection grants no permission to scan or comment.
- **Exit criteria:** A workspace can connect/validate/reconnect/disconnect one account and see session health; credentials/cookies/profile secured and never in Git; write flag false, kill switch on, workers disabled. **Met.**
- **Main risks:** Session fragility; credential leakage; headless-VPS remote login. Mitigated by explicit validation, the no-secrets-in-Git rule, and operator-assisted login (ADR-007).

> **Note:** Facebook Group setup/assignment (originally grouped with Sprint 004) became **Sprint 005 — Facebook Groups Foundation**, so the read-only scanner shifts to Sprint 006, and each subsequent sprint below shifts by one. The scanner's direct precondition (validated group management + assignment) is now in place.

## Sprint 005 — Facebook Groups Foundation

- **Status:** **Complete.**
- **Goal:** Facebook Group management, connection-only access validation, and many-to-many Business↔Group assignment — no scanning, post access, AI, or Telegram.
- **Deliverables:** `facebook_groups` + `business_facebook_groups` (ADR-008); strict offline URL normaliser; connection-only group access validation (landing page only; no scroll/post-read/write; concurrency one; bounded timeout; one safe retry; login-disabled gate); API; `/settings/facebook/groups` UI + Business Groups tab; operator CLI; audit events. See [30-facebook-groups.md](30-facebook-groups.md).
- **Exclusions:** No post scanning/ingestion, opportunities, AI, Telegram, commenting, n8n, multiple Facebook accounts, or public browser viewer.
- **Exit criteria:** Add/validate/assign/unassign/status groups, workspace-isolated and auditable; validation never reads posts, scrolls, or writes. **Met.**
- **Main risks:** Unsafe URLs, post-reading during validation, cross-workspace leakage. Mitigated by the strict normaliser, the connection-only validator, and workspace-scoped ownership.

## Sprint 006 — Read-Only Group Scanner (next)

- **Goal:** Discover new posts in assigned groups, strictly read-only, within the VPS budget.
- **Deliverables:** Playwright Scanner at concurrency one; gentle scan schedule; post extraction; unique post storage; orchestration via n8n calling the Backend; audit events; visible scanner status.
- **Exclusions:** No writing to Facebook of any kind; no AI matching/drafting; no approval.
- **Exit criteria:** New posts in assigned groups are reliably discovered and stored once, with no write actions ever performed, staying within resources.
- **Main risks:** Resource exhaustion or accidental writes. Mitigated by concurrency one, read-only role separation, and timeouts.

## Sprint 007 — Business Matching and AI Draft

- **Goal:** Match posts to businesses and generate business-specific drafts, with scores and explanations.
- **Deliverables:** Matching producing zero/one/many matches with confidence and plain-English reasons; multi-business matches surfaced distinctly; AI draft generation using only the selected business context; prohibited-claim screening; structured AI output validated by the Backend; safe fallback and missing-data behaviour; audit events.
- **Exclusions:** No Telegram delivery yet; no Facebook writing; no auto-selection among businesses.
- **Exit criteria:** For discovered posts, the system produces correct, explainable matches and compliant drafts; ambiguous matches are never silently resolved; AI never posts.
- **Main risks:** Cross-business context leakage or hallucination. Mitigated by prompt layering, output contracts, and prohibited-claim checks ([09-ai-design.md](09-ai-design.md)).

## Sprint 008 — Telegram Approval

- **Goal:** Deliver opportunities to Telegram and capture human decisions safely.
- **Deliverables:** Telegram onboarding/pairing; destination mapping; opportunity messages (business, group, summary, score/reasons, draft); approve/edit/reject/open-post; server-side callback validation; duplicate and expired-callback protection; audit events.
- **Exclusions:** No Facebook writing yet — approval is recorded but not executed.
- **Exit criteria:** A human can receive opportunities and approve, edit, or reject them from Telegram; decisions are validated and recorded; duplicates/expiry handled safely.
- **Main risks:** Spoofed or duplicated callbacks. Mitigated by Backend validation and idempotent decision handling ([11-telegram-design.md](11-telegram-design.md)).

## Sprint 009 — Playwright Comment Execution

- **Goal:** Publish approved comments to Facebook, verified and evidenced — the first Facebook writes.
- **Deliverables:** Comment Executor at concurrency one; direct post navigation; publish approved text; verification; screenshot capture; idempotency (one success per business-and-post); bounded retries after confirmed technical failure; error classification; kill-switch enforcement; success/failure notifications; audit events.
- **Exclusions:** No auto-commenting; no concurrency beyond one; no multi-account.
- **Exit criteria:** Approved comments are reliably published, verified, and screenshotted; the kill switch halts new writes; idempotency and retry rules hold; failures are surfaced.
- **Main risks:** Unintended or duplicate posts; checkpoints. Mitigated by verification, idempotency, kill switch, and never bypassing CAPTCHAs.

## Sprint 010 — History, Audit, Screenshot, and Stabilisation

- **Goal:** Make the whole loop trustworthy, complete, and stable.
- **Deliverables:** Approval History UI; complete, consistent audit trail; screenshot viewing; session-expiry recovery flow; System Status and kill-switch screen; resource and stability hardening within the VPS budget; consistency checks (e.g. no "success" without a screenshot).
- **Exclusions:** No new capabilities beyond completing and stabilising the loop.
- **Exit criteria:** History and audit are complete and accurate; recovery and kill-switch flows work; the system is stable within 2 cores/3.8 GiB under pilot load.
- **Main risks:** Hidden inconsistencies in history. Mitigated by explicit consistency checks and the no-silent-failure rule.

## Sprint 011 — Pilot Release

- **Goal:** Onboard the first real pilot customer end to end.
- **Deliverables:** Pilot onboarding materials; operator runbook (session recovery, checkpoints, kill switch); monitoring of health within budget; a defined feedback loop; go/no-go checklist against [02-product-scope.md](02-product-scope.md)'s pilot-readiness criteria.
- **Exclusions:** No scaling, no new platforms, no billing.
- **Exit criteria:** A real pilot customer completes the full loop (setup → opportunities → approval → verified, screenshotted comment → history) on the current VPS, safely.
- **Main risks:** Real-world Facebook variability and pilot expectations. Mitigated by the operator runbook, kill switch, and clear pilot scope.

---

## Roadmap Principles

- Safety mechanisms (approval, kill switch, audit) exist before the capabilities they guard.
- Read-only capability precedes any Facebook write.
- Each sprint is independently verifiable and does not widen the MVP.
- Everything runs within the current VPS budget; scaling is a deliberate future decision, not an MVP goal.
