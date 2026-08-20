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

## Sprint 009 — AI Draft Generation (AI Draft Engine)

- **Status:** **Complete.** (Delivered as a **DRAFT ONLY** engine with **AI disabled by default** and a deterministic **Mock provider**; a real provider is a disabled boundary, not connected. Human approval remains mandatory.)
- **Goal:** For matched businesses, generate business-specific comment drafts using only that business's context — the first AI stage, but inert (never posts, sends, or approves).
- **Deliverables:** `ai_drafts` (UNIQUE `(business_match_id, version)`, immutable versioning) + `ai_draft_events` (migration `0007`); modules BusinessContextBuilder, AiDraftPromptBuilder (layered `rules-v1`, no chain-of-thought), AiDraftProvider (Mock + disabled external), DraftPolicyChecker (PASS/NEEDS_REVIEW/BLOCK), AiDraftRepository, AiDraftCoordinator; prohibited-claim screening; safe missing-data behaviour; API, UI, CLI; 8 audit events. See [48-ai-draft-engine.md](48-ai-draft-engine.md), [ADR-015](adr/ADR-015-ai-provider-abstraction.md), [ADR-016](adr/ADR-016-immutable-ai-draft-versioning.md), [ADR-017](adr/ADR-017-human-approval-after-ai-draft.md).
- **Exclusions:** No Telegram delivery; no Facebook writing; no approval execution; no auto-selection among businesses; no embeddings/semantic search/vector DB/AI training; no real provider connected; no multiple active providers.
- **Exit criteria:** For MATCH decisions, the system produces compliant drafts using only that business's context; NO_MATCH never generates; drafts are immutable/versioned and never overwritten; AI never posts, sends, or approves. **Met.**
- **Main risks:** Cross-business leakage, hallucination, or accidental real AI/write. Mitigated by the safe single-workspace context builder, prompt layering (safety above voice), the pure policy checker, AI-disabled-by-default with a refusing external boundary, and the absence of any approval/posting code path ([09-ai-design.md](09-ai-design.md), [ADR-017](adr/ADR-017-human-approval-after-ai-draft.md)).

> **Note:** the deterministic **Business Candidate & Matching Engine** took Sprint 008, and **AI Draft Generation** became its own Sprint 009, so every subsequent sprint below shifts by one.

## Sprint 010 — Human Review Engine (Telegram Approval)

- **Status:** **Complete.** (Delivered as a **channel-agnostic Human Review Engine** — the core — with **Telegram as only the first Review Adapter**, disabled by default. The engine works without Telegram; a decision records the human's choice and posts nothing.)
- **Goal:** Turn an AI Draft into a Review Task a human approves/rejects/edits, safely and auditably, through the web UI and (optionally) a Review Adapter.
- **Deliverables:** `review_tasks` (UNIQUE `draft_id`) + `review_events` (migration `0008`); ReviewQueue (create/assign/expire), ReviewRepository (only DB boundary), ReviewCoordinator (AI Draft → Review Task; approve/reject/edit; ownership); ReviewAdapter interface + TelegramReviewAdapter (renders business/opportunity/draft + approve/reject/edit/open-post/open-business, disabled transport, never touches the DB); server-side validation, duplicate-decision protection, expiry; API; Review Queue + Detail + Decision History web pages; audit events. See [54-review-engine.md](54-review-engine.md), [ADR-018](adr/ADR-018-review-engine.md), [ADR-019](adr/ADR-019-telegram-adapter.md).
- **Exclusions:** No Facebook writing/comment/message; no Action Engine; no auto-approval; no live Telegram bot/pairing/webhook — a decision is recorded but not executed.
- **Exit criteria:** A human can approve, edit, or reject a Review Task; decisions are validated, recorded, and audited; one Draft → one Review Task; duplicates/expiry handled safely; the engine works without Telegram; nothing is posted. **Met.**
- **Main risks:** Telegram becoming the source of truth, spoofed/duplicated decisions, or a decision posting. Mitigated by the channel-agnostic core (Telegram → Review API → Coordinator → Repository; adapter never writes the DB), Backend validation, first-valid-decision-wins, and the absence of any posting/Action path ([ADR-018](adr/ADR-018-review-engine.md)).

## Sprint 011 — Action Queue Engine (safe boundary before execution)

- **Status:** **Complete.** (Delivered as a **safe boundary**: an APPROVED review creates an immutable **Action Job**. Execution is disabled by default and NO Action Worker runs — every job is created **BLOCKED**. Playwright comment execution moves to Sprint 012.)
- **Goal:** Capture an approved decision as a durable, auditable Action Job — the safe boundary between approval and future Facebook writes — without executing anything.
- **Deliverables:** `action_jobs` + `action_events` (migration `0009`); modules ActionIntentBuilder (pure), ActionPolicyGuard (pure; ALLOW/BLOCK/REJECT), ActionQueue (state machine), ActionRepository (only DB boundary), ActionCoordinator; only-APPROVED gating; one active job per (review, action type); immutable intent; bounded retries; kill-switch/write-flag/engine-flag enforcement (all default to blocked); API, UI, CLI; 9 audit events. See [59-action-queue-engine.md](59-action-queue-engine.md), [ADR-020](adr/ADR-020-action-queue-boundary.md)–[ADR-022](adr/ADR-022-action-execution-disabled-by-default.md).
- **Exclusions:** No Facebook comment/message execution, Playwright write, Facebook write, Action Worker/Adapter, Telegram sending, auto-approval, unbounded retries, billing, subscription, teams.
- **Exit criteria:** Only APPROVED reviews create jobs; intent is immutable; execution disabled by default (jobs blocked); state machine enforced; retries bounded; nothing is posted; fully auditable and workspace-isolated. **Met.**
- **Main risks:** Accidental post, acting on unapproved content, duplicates, infinite retries. Mitigated by the absence of any executor, only-APPROVED gating with immutable content, one-active-job dedup, bounded retries, and multi-gate blocking ([ADR-022](adr/ADR-022-action-execution-disabled-by-default.md)).

> **Note:** the deterministic **Action Queue** boundary took Sprint 011, so **Playwright Comment Execution** becomes Sprint 012, and every subsequent sprint below shifts by one.

## Sprint 012 — Playwright Comment Execution

- **Goal:** Publish approved (queued) Action Jobs to Facebook, verified and evidenced — the first Facebook writes, behind the Sprint 011 boundary.
- **Deliverables:** Comment Executor at concurrency one; direct post navigation; publish approved text; verification; screenshot capture; idempotency (one success per business-and-post); bounded retries after confirmed technical failure; error classification; kill-switch enforcement; success/failure notifications; audit events.
- **Exclusions:** No auto-commenting; no concurrency beyond one; no multi-account.
- **Exit criteria:** Approved comments are reliably published, verified, and screenshotted; the kill switch halts new writes; idempotency and retry rules hold; failures are surfaced.
- **Main risks:** Unintended or duplicate posts; checkpoints. Mitigated by verification, idempotency, kill switch, and never bypassing CAPTCHAs.

## Sprint 013 — Operational Hardening and Controlled Write Test Preparation

- **Status:** **Complete (not committed).** Ahead of enabling any real write, Sprint 013 hardened operations: backups & restore, health & monitoring, maintenance mode, incident lockdown, an operator console, process-supervision templates, and the controlled-write-test + pilot-readiness runbooks — **no real Facebook write, no new product features**. The history/audit/screenshot/stabilisation work below folds into the pilot-readiness track ([82-pilot-readiness.md](82-pilot-readiness.md)); the first real write is the manual, reversible procedure in [81-controlled-facebook-write-test.md](81-controlled-facebook-write-test.md). Detail: [sprints/SPRINT-013-operational-hardening.md](sprints/SPRINT-013-operational-hardening.md).

### (Original plan) History, Audit, Screenshot, and Stabilisation

- **Goal:** Make the whole loop trustworthy, complete, and stable.
- **Deliverables:** Approval History UI; complete, consistent audit trail; screenshot viewing; session-expiry recovery flow; System Status and kill-switch screen; resource and stability hardening within the VPS budget; consistency checks (e.g. no "success" without a screenshot).
- **Exclusions:** No new capabilities beyond completing and stabilising the loop.
- **Exit criteria:** History and audit are complete and accurate; recovery and kill-switch flows work; the system is stable within 2 cores/3.8 GiB under pilot load.
- **Main risks:** Hidden inconsistencies in history. Mitigated by explicit consistency checks and the no-silent-failure rule.

## Sprint 014 — Pilot Release

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

> **SPRINT 014 — Production Pilot Readiness (2026-08-20):** SMALL human-supervised production pilot prepared behind Write Window + one-shot authorization + Level-1 limits; no production writes enabled. See [92](92-production-pilot-level1.md), [99](99-production-rollout-levels.md), [sprints/SPRINT-014](sprints/SPRINT-014-production-pilot-readiness.md).
