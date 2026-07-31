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

## Sprint 006 — Collector Engine (read-only)

- **Status:** **Complete.** (Delivered as the "Collector Engine"; the read-only worker is renamed **Scanner → Collector**, and a collected post is a platform-neutral **Signal** — see [ADR-010](adr/ADR-010-signal-model.md).)
- **Goal:** Discover posts in active groups, strictly read-only, and store them as Signals within the VPS budget.
- **Deliverables:** Modular Collector Engine (Navigation, Extractor, Normalizer, Repository, Coordinator) at concurrency one; raw + normalized Signal storage; duplicate detection (URL → facebook_post_id → hash); per-group checkpoints; run history; API + dashboard + worker + CLI; audit events. Orchestration is via the backend/CLI (not n8n). See [34-collector-engine.md](34-collector-engine.md), [ADR-009](adr/ADR-009-collector-engine.md).
- **Exclusions:** No Facebook writes of any kind; no matching, AI, Telegram, comment, opportunity, notification, or approval. Reader gated off by default.
- **Exit criteria:** Posts in active groups are collected read-only and stored once (deduplicated), with checkpoints for resume and no write actions ever performed, within resources. **Met.**
- **Main risks:** Resource exhaustion or accidental writes/contact. Mitigated by concurrency one, a read-only `PageController` (no write methods), the reader gate (no browser by default), bounded scrolls/posts/timeout, and no infinite retries.

## Sprint 007 — Opportunity Classification Engine

- **Status:** **Complete.** (A deterministic, rules-only stage inserted between the Collector and Business Matching. The concept **Detector → Classifier** is renamed. NO AI, NO ML, NO score/confidence, NO Business matching.)
- **Goal:** Decide, per Signal, **"should this become an Opportunity?"** using pure deterministic rules; store the Decision, its Reasons, and an event history.
- **Deliverables:** `opportunities` (UNIQUE `signal_id`) + `opportunity_events` (migration `0005`); three modules — Classifier (pure), Repository (only DB boundary), Coordinator (state machine + ownership); rules `rules-v1` (HAS_TEXT, TEXT_MIN_LENGTH, HAS_AUTHOR, HAS_URL, NOT_DELETED, SUPPORTED_LANGUAGE, NOT_DUPLICATE); API (`/opportunities/classify|:id|:id/status|statistics`); Opportunity Dashboard + Detail; audit events. See [40-opportunity-classifier.md](40-opportunity-classifier.md), [ADR-011](adr/ADR-011-opportunity-classification.md), [ADR-012](adr/ADR-012-opportunity-domain.md).
- **Exclusions:** No AI/ML/embeddings/vector search; no score/confidence; no Business matching; no Telegram, comment, notification, approval, recommendation, or Facebook write. The Opportunity has no downstream consumer yet.
- **Exit criteria:** Signals are classified once (idempotent; one Signal → max one Opportunity), Decisions and Reasons are stored and auditable, ACCEPT → READY / REJECT → ARCHIVED, ownership enforced. **Met.**
- **Main risks:** Scope creep into AI/matching, or duplicate Opportunities. Mitigated by the pure-Classifier boundary (no DB, no model) and the UNIQUE `signal_id` idempotent pass.

> **Note:** the "Opportunity Classification Engine" was inserted here as a deterministic precondition for later intelligence, so **Business Matching and AI Draft** and every subsequent sprint below shift by one.

## Sprint 008 — Business Candidate & Matching Engine

- **Status:** **Complete.** (Delivered as a **deterministic, rules-only** matching stage. The **AI Draft** half of the originally-planned "Business Matching and AI Draft" is split out to Sprint 009 — matching precedes drafting, and matching is deterministic. NO AI, NO score/confidence this sprint.)
- **Goal:** For each accepted Opportunity, generate candidate businesses and decide `MATCH`/`NO_MATCH` per candidate using only the business's Business Matching Rules.
- **Deliverables:** `business_matches` (UNIQUE `(opportunity_id, business_id)`, migration `0006`); three modules — CandidateGenerator (pure), BusinessMatcher (pure), MatchRepository (only DB boundary), Coordinator; candidate rule (active businesses assigned to the Signal's group, BR-15); deterministic `rules-v1` matching; zero/one/many matches surfaced distinctly (BR-17/19/20), never silently chosen; API (`/business-matching/run`, `/business-matches`, `/business-matches/:id`); Opportunity Detail (candidates/matched/reasons) + match detail. See [45-business-matching-engine.md](45-business-matching-engine.md), [ADR-013](adr/ADR-013-business-candidate-generator.md), [ADR-014](adr/ADR-014-business-matching-engine.md).
- **Exclusions:** No AI/ML/embeddings/semantic search; no score/confidence; no Comment Drafts; no Telegram; no Facebook writing; no auto-selection among businesses.
- **Exit criteria:** For accepted Opportunities, the system produces correct, explainable, deterministic matches; ambiguous (multi-business) matches are never silently resolved; one match per (opportunity, business); run idempotent. **Met.**
- **Main risks:** Scope creep into AI/scoring, or duplicate matches. Mitigated by the pure-Matcher boundary (no DB, no model) and the UNIQUE constraint with an idempotent run.

## Sprint 009 — AI Draft Generation

- **Goal:** For matched businesses, generate business-specific comment drafts with plain-English rationale — the first AI in the pipeline.
- **Deliverables:** AI draft generation using only the matched business's context; prohibited-claim screening; structured AI output validated by the Backend; safe fallback and missing-data behaviour; audit events.
- **Exclusions:** No Telegram delivery yet; no Facebook writing; no auto-selection among businesses.
- **Exit criteria:** For matched businesses, the system produces compliant drafts using only that business's context; AI never posts.
- **Main risks:** Cross-business context leakage or hallucination. Mitigated by prompt layering, output contracts, and prohibited-claim checks ([09-ai-design.md](09-ai-design.md)).

> **Note:** the deterministic **Business Candidate & Matching Engine** took Sprint 008, and **AI Draft Generation** became its own Sprint 009, so every subsequent sprint below shifts by one.

## Sprint 010 — Telegram Approval

- **Goal:** Deliver opportunities to Telegram and capture human decisions safely.
- **Deliverables:** Telegram onboarding/pairing; destination mapping; opportunity messages (business, group, summary, score/reasons, draft); approve/edit/reject/open-post; server-side callback validation; duplicate and expired-callback protection; audit events.
- **Exclusions:** No Facebook writing yet — approval is recorded but not executed.
- **Exit criteria:** A human can receive opportunities and approve, edit, or reject them from Telegram; decisions are validated and recorded; duplicates/expiry handled safely.
- **Main risks:** Spoofed or duplicated callbacks. Mitigated by Backend validation and idempotent decision handling ([11-telegram-design.md](11-telegram-design.md)).

## Sprint 011 — Playwright Comment Execution

- **Goal:** Publish approved comments to Facebook, verified and evidenced — the first Facebook writes.
- **Deliverables:** Comment Executor at concurrency one; direct post navigation; publish approved text; verification; screenshot capture; idempotency (one success per business-and-post); bounded retries after confirmed technical failure; error classification; kill-switch enforcement; success/failure notifications; audit events.
- **Exclusions:** No auto-commenting; no concurrency beyond one; no multi-account.
- **Exit criteria:** Approved comments are reliably published, verified, and screenshotted; the kill switch halts new writes; idempotency and retry rules hold; failures are surfaced.
- **Main risks:** Unintended or duplicate posts; checkpoints. Mitigated by verification, idempotency, kill switch, and never bypassing CAPTCHAs.

## Sprint 012 — History, Audit, Screenshot, and Stabilisation

- **Goal:** Make the whole loop trustworthy, complete, and stable.
- **Deliverables:** Approval History UI; complete, consistent audit trail; screenshot viewing; session-expiry recovery flow; System Status and kill-switch screen; resource and stability hardening within the VPS budget; consistency checks (e.g. no "success" without a screenshot).
- **Exclusions:** No new capabilities beyond completing and stabilising the loop.
- **Exit criteria:** History and audit are complete and accurate; recovery and kill-switch flows work; the system is stable within 2 cores/3.8 GiB under pilot load.
- **Main risks:** Hidden inconsistencies in history. Mitigated by explicit consistency checks and the no-silent-failure rule.

## Sprint 013 — Pilot Release

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
