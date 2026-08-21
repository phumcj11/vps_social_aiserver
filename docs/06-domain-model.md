# 06 — Domain Model

**Document status:** Foundation (SPRINT 000)
**Applies to:** KMKT Social AI MVP

This document describes the product's core concepts and their relationships in plain language — no SQL, no schema, no storage detail. It is the shared vocabulary for every other document. Terms defined here are used consistently throughout. Rules referenced as BR-n are defined in [05-business-rules.md](05-business-rules.md).

The core of the model is the **Business**. **Facebook** appears only through the **Platform** and **Platform Account** concepts, keeping it an adapter rather than the centre of the model.

---

## Relationship Overview

- A **User** owns one **Workspace**.
- A **Workspace** contains many **Businesses** and one **Platform Account** (Facebook, in the MVP).
- A **Business** has one **Business Profile** and is assigned many **Facebook Groups** via **Business Group Assignments**.
- A **Facebook Group** contains many **Posts**.
- A **Post** produces zero or more **Business Matches**.
- A **Business Match** leads to one **Comment Draft**, which receives one **Approval Decision**.
- An approved decision creates one **Comment Job**, which runs one or more **Comment Attempts**.
- A successful attempt has **Screenshot Evidence**.
- A **Telegram Destination** carries opportunities and notifications to the human.
- **Audit Events** record everything; the **Kill Switch** governs whether new write actions may start.

---

## User

- **Purpose:** The customer account — the person who owns and controls everything in a workspace.
- **Owner:** Itself (the account holder).
- **Important attributes:** Identity (email), authentication credentials, display name.
- **Relationships:** Owns exactly one Workspace (BR-1).
- **Lifecycle:** Registered → active → (optionally) disabled.
- **Invariants:** A user always maps to exactly one workspace in the MVP; credentials are stored securely.

## Workspace

- **Purpose:** The isolation boundary and container for all of a customer's data.
- **Owner:** One User.
- **Important attributes:** Name, owner reference, creation time.
- **Relationships:** Contains many Businesses; has at most one Platform Account; contains all Posts, Opportunities, and history.
- **Lifecycle:** Created at registration → active.
- **Invariants:** All contained data is isolated to this workspace (BR-3, BR-59); no cross-workspace access.

## Business

- **Purpose:** A single venture the customer wants to capture leads for. The core domain concept.
- **Owner:** One Workspace.
- **Important attributes:** Name, status (active/disabled), reference to its Business Profile.
- **Relationships:** Has one Business Profile, many Business Knowledge items, and many Business Matching Rules; will later have Business Group Assignments and produce Business Matches; is the sole context for its Comment Drafts.
- **Lifecycle:** Created → profile completed → active → (optionally) disabled. Never deleted (soft status only).
- **Invariants:** A business belongs to exactly one workspace; unique slug (global) and unique name within its workspace; its drafting uses only its own profile (BR-22, BR-60).
- **Implementation status:** Implemented in SPRINT 003 (multiple businesses per workspace, full CRUD, ownership enforced). See [22-business-foundation.md](22-business-foundation.md).

## Business Profile

- **Purpose:** The complete context that defines how a business presents itself and what the AI may say for it.
- **Owner:** One Business.
- **Important attributes:** Products or services, service area, selling points, contact information, tone, keywords, response rules, prohibited claims.
- **Relationships:** Belongs to one Business; consumed by matching and drafting.
- **Lifecycle:** Created (possibly partial) → refined → maintained.
- **Invariants:** Prohibited claims here must never appear in any draft (BR-24); it is the only permitted context for that business's drafts.
- **Implementation status:** Implemented in SPRINT 003 (one profile per business; created with the business). See [23-business-profile.md](23-business-profile.md).

## Business Knowledge

- **Purpose:** Structured business information — titled notes (opening hours, policies, packages, FAQs) that describe the business. **Not AI memory**; a later sprint's AI will consume it as context.
- **Owner:** One Business (many per business).
- **Important attributes:** Title, content, status (`active`/`archived`).
- **Relationships:** Belongs to one Business.
- **Lifecycle:** Created → updated → archived or deleted.
- **Invariants:** Human-authored, deterministic structured data; no model involvement. Belongs to exactly one owned business.
- **Implementation status:** Implemented in SPRINT 003. See [24-business-knowledge.md](24-business-knowledge.md).

## Business Matching Rules

- **Purpose:** Deterministic rules a business owner defines to describe what it can serve (location, keywords, guest count, budget, facilities). **Not AI**; AI-assisted matching arrives later and may read these as signals.
- **Owner:** One Business (many per business).
- **Important attributes:** Rule type (province, district, keyword, guest_count, budget, facility, custom), rule value, priority (integer), status (`active`/`disabled`).
- **Relationships:** Belongs to one Business.
- **Lifecycle:** Created → updated → deleted.
- **Invariants:** Deterministic and human-authored; rule type is restricted to the allowed set; priority is an integer. Belongs to exactly one owned business.
- **Implementation status:** Implemented in SPRINT 003. See [25-business-matching-rules.md](25-business-matching-rules.md).

## Platform

- **Purpose:** Represents an external social platform as an abstract adapter target. In the MVP the only value is Facebook.
- **Owner:** The system (a fixed concept, not customer data).
- **Important attributes:** Platform name, adapter capabilities (read posts, publish comment).
- **Relationships:** A Platform Account belongs to a Platform; Facebook Groups belong to the Facebook platform.
- **Lifecycle:** Static in the MVP (Facebook only).
- **Invariants:** Core logic depends on the Platform abstraction, not on Facebook specifics — Facebook is an adapter, not the core.

## Platform Account

- **Purpose:** A connected external account through which the system reads posts and publishes comments. In the MVP, one Facebook account.
- **Owner:** One Workspace.
- **Important attributes:** Platform reference, connection status, session validity, reference to a securely stored browser profile.
- **Relationships:** Belongs to one Workspace; used by many Businesses (BR-8); reachable Facebook Groups derive from it.
- **Lifecycle:** Connected → valid → (expired → re-authenticated) → disconnected.
- **Invariants:** At most one per workspace in the MVP (BR-7); credentials/cookies/profile never exposed to frontend or Git (BR-9).
- **Implementation status:** Implemented in SPRINT 004 as the Facebook Connection Foundation — a `facebook_accounts` record (one per workspace, no password/cookie/token) plus a controlled per-workspace persistent browser profile. States: not_connected, connecting, connected, reconnect_required, checkpoint_required, validation_failed, disconnected. Connection only — no scanning/reading/writing; writes disabled and kill switch on. See [26-facebook-connection.md](26-facebook-connection.md), [27-facebook-session-lifecycle.md](27-facebook-session-lifecycle.md), [28-browser-profile-security.md](28-browser-profile-security.md).

## Facebook Group

- **Purpose:** A Facebook Group whose posts may contain leads.
- **Owner:** One Workspace (via its Platform Account); assignable to Businesses.
- **Important attributes:** Group identity, name, reachability by the connected account.
- **Relationships:** Assigned to Businesses via Business Group Assignments; contains Posts.
- **Lifecycle:** Discovered/added → assigned → monitored → (optionally) unassigned.
- **Invariants:** Only groups reachable by the connected account can be assigned (BR-10).
- **Implementation status:** Implemented in SPRINT 005 as `facebook_groups` (one per workspace, unique canonical URL) with an access-validation state machine (unknown/validating/accessible/inaccessible/login_required/checkpoint_required/not_found/validation_failed). Added by URL (strict offline normalisation), validated connection-only (landing page; no scroll/post-read/write). No post data stored. See [30-facebook-groups.md](30-facebook-groups.md), [31-group-url-normalisation.md](31-group-url-normalisation.md), [32-group-access-validation.md](32-group-access-validation.md).

## Business Group Assignment

- **Purpose:** The link declaring that a specific business monitors a specific group.
- **Owner:** One Workspace.
- **Important attributes:** Business reference, group reference, active flag.
- **Relationships:** Connects one Business and one Facebook Group; the same group may link to several businesses (BR-11), and a business may link to several groups.
- **Lifecycle:** Created → active → removed.
- **Invariants:** A post is only considered for a business if such an assignment exists (BR-12).
- **Implementation status:** Implemented in SPRINT 005 as `business_facebook_groups` — a many-to-many link within a workspace, unique `(business_id, facebook_group_id)` ([ADR-008](adr/ADR-008-business-to-group-many-to-many.md)). Assignment carries no scanning/commenting capability yet. See [33-business-group-assignment.md](33-business-group-assignment.md).

## Post → Signal

> **Renamed (SPRINT 006):** "Post" is now **Signal** — a platform-neutral unit of collected content (today a Facebook post; tomorrow a TikTok video, Instagram reel, or LINE message). See [ADR-010](adr/ADR-010-signal-model.md).

- **Purpose:** A single collected Facebook Group post, stored as a platform-neutral Signal that may later become an Opportunity.
- **Owner:** One Workspace (via the group).
- **Important attributes:** Group reference, platform post identity, post URL, author (as visible), message, media, created time.
- **Relationships:** Belongs to one Facebook Group; will produce zero or more Business Matches (later sprint).
- **Lifecycle:** Collected (raw) → normalized (Signal) → retained; matched (or not) in a later sprint.
- **Invariants:** Collection is READ-ONLY and never writes to Facebook. Stored as an immutable raw signal plus a normalized Signal; deduplicated by URL → facebook_post_id → normalized hash.
- **Implementation status:** Implemented in SPRINT 006 by the Collector Engine — tables `facebook_raw_signals` (immutable) and `facebook_signals` (normalized), with `collector_checkpoints` and `collector_runs`. Collection knows nothing about Business/AI/opportunity. See [34-collector-engine.md](34-collector-engine.md), [37-raw-signal.md](37-raw-signal.md), [38-normalized-signal.md](38-normalized-signal.md).

## Opportunity

> **Promoted to a stored root (SPRINT 007):** as of the Opportunity Classification Engine, an **Opportunity** is a first-class stored entity — the record of a deterministic decision about one Signal. See [ADR-012](adr/ADR-012-opportunity-domain.md), [41-opportunity-lifecycle.md](41-opportunity-lifecycle.md).

- **Purpose:** The record of the Classifier's decision that a Signal is (or is not) worth further processing. Answers only "should this Signal become an Opportunity?" — **no AI, no score, no Business matching**.
- **Owner:** One Workspace.
- **Important attributes:** Signal reference (UNIQUE), Decision (`ACCEPT`/`REJECT`, immutable), Status (`NEW`/`READY`/`ARCHIVED`), classifier version; plus an append-only event log carrying the Reasons.
- **Relationships:** Links to exactly one Signal (one Signal → at most one Opportunity). Has many Opportunity Events.
- **Lifecycle:** Classified once → ACCEPT ⇒ READY / REJECT ⇒ ARCHIVED → (manual) ARCHIVED. Idempotent; no downstream consumer yet.
- **Invariants:** UNIQUE `signal_id`; Decision is immutable; classification is deterministic (rules-only, versioned `rules-v1`); workspace-scoped (cross-workspace access is invisible → 404).
- **Implementation status:** Implemented in SPRINT 007 — tables `opportunities` and `opportunity_events` (migration `0005`); modules Classifier (pure), Repository (only DB boundary), Coordinator. See [40-opportunity-classifier.md](40-opportunity-classifier.md), [43-classification-rules.md](43-classification-rules.md), [ADR-011](adr/ADR-011-opportunity-classification.md).

## Business Match

> **Deterministic stored root (SPRINT 008):** as of the Business Candidate & Matching Engine, a **Business Match** is a first-class stored entity — the record of a deterministic decision between one Opportunity and one candidate Business, using only that business's Business Matching Rules. **NO AI, NO score, NO confidence.** See [ADR-014](adr/ADR-014-business-matching-engine.md), [47-business-match-lifecycle.md](47-business-match-lifecycle.md).

- **Purpose:** The judgement that an Opportunity is (or is not) relevant to a particular business, with a plain, rule-by-rule explanation. Deterministic — no score, no confidence, no AI.
- **Owner:** One Workspace.
- **Important attributes:** Opportunity reference, business reference, Decision (`MATCH`/`NO_MATCH`), reasons array (`{ ruleType, ruleValue, matched }`), matcher version, matched-at.
- **Relationships:** Links one Opportunity and one candidate Business (UNIQUE pair). Will lead to one Comment Draft in a later sprint.
- **Lifecycle:** Computed once per (Opportunity, Business) pair by a matching run (idempotent). No mutable status; downstream workflow references it without mutating it.
- **Invariants:** UNIQUE (`opportunity_id`, `business_id`); Decision is deterministic (rules-only, versioned `rules-v1`); workspace-scoped (cross-workspace access → 404). Zero, one, or many per Opportunity (BR-17); when many, each is presented distinctly and none is silently chosen (BR-19, BR-20).
- **Candidates:** the businesses evaluated for an Opportunity are those **active** businesses assigned to the Signal's group (BR-15) — the **Candidate Generator** ([44-business-candidate-engine.md](44-business-candidate-engine.md)).
- **Implementation status:** Implemented in SPRINT 008 — table `business_matches` (migration `0006`); modules CandidateGenerator (pure), BusinessMatcher (pure), MatchRepository (only DB boundary), Coordinator. See [45-business-matching-engine.md](45-business-matching-engine.md), [46-matching-rules.md](46-matching-rules.md), [ADR-013](adr/ADR-013-business-candidate-generator.md).

> **Opportunity (two senses).** The **stored Opportunity** above (SPRINT 007) is the deterministic classification record for one Signal. Separately, later sprints will present a human-facing *opportunity bundle* — a stored Opportunity enriched with a Business Match, post summary, score, reasons, and Comment Draft — for Telegram approval. The bundle is a presentation concept built on top of the stored root; it does not replace it.

## Comment Draft (AI Draft)

> **Implemented as a stored root (SPRINT 009):** the **AI Draft Engine** produces a **DRAFT ONLY** for one MATCH Business Match. It is never sent to Telegram, never posted to Facebook, never a write action; human approval remains mandatory ([ADR-017](adr/ADR-017-human-approval-after-ai-draft.md)). AI is disabled by default; a deterministic Mock provider is used for tests/local use ([ADR-015](adr/ADR-015-ai-provider-abstraction.md)). Drafts are immutable and versioned ([ADR-016](adr/ADR-016-immutable-ai-draft-versioning.md)).

- **Purpose:** The proposed comment text for a specific MATCH Business Match, generated from only that business's context. A proposal for human review — never an action.
- **Owner:** One Workspace.
- **Important attributes:** Business Match reference (+ denormalised opportunity/business), version, status (`draft`/`needs_review`/`rejected`/`superseded`), content, provider/model/prompt_version, safe input snapshot, policy result (PASS/NEEDS_REVIEW/BLOCK + reasons). Has many append-only draft events.
- **Relationships:** Belongs to exactly one Business Match; a Business Match may have many Draft versions. A later sprint attaches an Approval Decision.
- **Lifecycle:** Generated (only for MATCH) → policy PASS ⇒ `draft` / NEEDS_REVIEW or BLOCK ⇒ `needs_review`; regenerate ⇒ new version, older ⇒ `superseded`; human ⇒ `rejected`. No approved/sent/posted state this sprint.
- **Invariants:** Uses only its business's profile and same-workspace context (BR-22); contains no prohibited claims (BR-24); **every version is retained and immutable** (`UNIQUE (business_match_id, version)`, BR-27); nothing is overwritten; workspace-scoped (cross-workspace access → 404).
- **Implementation status:** Implemented in SPRINT 009 — tables `ai_drafts` and `ai_draft_events` (migration `0007`); modules BusinessContextBuilder, AiDraftPromptBuilder, AiDraftProvider (Mock), DraftPolicyChecker, AiDraftRepository, AiDraftCoordinator. See [48-ai-draft-engine.md](48-ai-draft-engine.md), [52-ai-draft-lifecycle.md](52-ai-draft-lifecycle.md).

## Review Task (Human Decision)

> **Implemented as a stored root (SPRINT 010):** the human decision on a draft is a **Review Task** produced by the **Human Review Engine** — the channel-agnostic core. **Telegram is only the first Review Adapter**, never the source of truth ([ADR-018](adr/ADR-018-review-engine.md), [ADR-019](adr/ADR-019-telegram-adapter.md), [54-review-engine.md](54-review-engine.md)). A decision records the human's choice **only** — this sprint has NO Facebook write, NO comment, and NO Action Engine.

- **Purpose:** The human's decision on an AI Draft: approve, reject, or edit. The engine's core unit.
- **Owner:** One Workspace (decisions recorded against a User).
- **Important attributes:** Draft reference (UNIQUE — one Draft → one Review Task), Business Match reference, status (`PENDING`/`APPROVED`/`REJECTED`/`EXPIRED`), assignee, edited content + editor + edited-at, decided-by + decided-at + reason. Has many append-only review events.
- **Relationships:** Belongs to exactly one AI Draft. A later sprint may execute an approved decision (out of scope here).
- **Lifecycle:** PENDING → APPROVED / REJECTED (terminal) or EXPIRED; EDIT stores revised text and keeps the task PENDING (approval still required, BR-28).
- **Invariants:** One Review Task per Draft (`UNIQUE draft_id`); exactly one terminal decision — the first valid decision wins (BR-31); approval is explicit and mandatory before any future comment (BR-29); only authorised users of the owning workspace decide (BR-32); cross-workspace access → 404. A decision **posts nothing** — no Facebook write, no Action Engine.
- **Implementation status:** Implemented in SPRINT 010 — tables `review_tasks` and `review_events` (migration `0008`); modules ReviewQueue, ReviewRepository, ReviewCoordinator, and the ReviewAdapter interface with a disabled-by-default TelegramReviewAdapter. See [55-review-queue.md](55-review-queue.md), [57-human-decision.md](57-human-decision.md).

## Action Job (Comment Job)

> **Implemented as a stored root (SPRINT 011):** the unit of work is an **Action Job** created by the **Action Queue Engine** — a SAFE BOUNDARY between an approved review and future execution. **This sprint does NOT execute** — there is no Action Worker and no Facebook write; every job is created **BLOCKED**. See [ADR-020](adr/ADR-020-action-queue-boundary.md)–[ADR-022](adr/ADR-022-action-execution-disabled-by-default.md), [60-action-job-lifecycle.md](60-action-job-lifecycle.md).

- **Purpose:** The unit of work to publish an approved comment — captured now, executed in a later sprint.
- **Owner:** One Workspace.
- **Important attributes:** Review Task reference, AI Draft & Business Match references, action type (`facebook_comment`), status (`queued`/`blocked`/`processing`/`succeeded`/`failed`/`cancelled`), target platform (`facebook`), target URL, **immutable** approved content, attempt/max-attempt counts, lifecycle timestamps, safe error classification. Has many append-only action events.
- **Relationships:** Created from exactly one **APPROVED** Review Task; a future executor will run it.
- **Lifecycle:** Created (blocked under current defaults) → cancelled / (future) processing → succeeded / failed → queued (retry, bounded). Terminal: succeeded, cancelled.
- **Invariants:** Only an APPROVED review creates a job; at most one **active** job per (review, action type); **intent is immutable** — approved content and target are never silently altered; execution disabled by default (engine off + writes off + kill switch on ⇒ blocked); bounded retries (BR-39, BR-41); subject to the Kill Switch (BR-56); workspace-scoped (cross-workspace → 404). A job **posts nothing** this sprint.
- **Implementation status:** Implemented in SPRINT 011 — tables `action_jobs` and `action_events` (migration `0009`); modules ActionIntentBuilder, ActionPolicyGuard, ActionQueue, ActionRepository, ActionCoordinator. No Action Worker; no Facebook/Playwright/Telegram call. See [59-action-queue-engine.md](59-action-queue-engine.md), [61-action-policy-guard.md](61-action-policy-guard.md).

## Comment Attempt (Execution Session)

- **Purpose:** A single try at publishing the comment. Implemented as an **Execution Session** (SPRINT 012).
- **Owner:** One Action Job.
- **Important attributes:** Attempt number, adapter (`fake`/`playwright`), status, per-state timestamps, error/recovery classification, active-key (nullable-unique → one active session per job).
- **Relationships:** Belongs to one Action Job; has append-only Execution Evidence.
- **Lifecycle:** `created → preflight → ready_to_submit → submitting → submitted → verifying → verified`, with `failed`/`cancelled`/`ambiguous`/interrupt off-ramps. `verified` is the ONLY success.
- **Invariants:** Every attempt is recorded (BR-42); a success must be verified and evidenced (BR-44); ambiguity never auto-retries. This sprint runs only the **fake** adapter — no real write.
- **Implementation status (SPRINT 012):** tables `action_execution_sessions` and `action_execution_evidence` (migration `0010`); see [66-execution-session-lifecycle.md](66-execution-session-lifecycle.md), [ADR-025](adr/ADR-025-execution-session-and-verification.md).

## Action Idempotency Record

- **Purpose:** Database-level guard that at most one successful comment exists per (business, target post, action type).
- **Owner:** One Workspace; references a Business, target post identity, and Action Job.
- **Important attributes:** `target_post_key` (deterministic hash of the canonical post), status (`reserved`/`submitted`/`verified`/`ambiguous`/`released`), nullable-unique `idem_key`.
- **Lifecycle:** `reserved → submitted → verified` (key kept live), or `released` (key → NULL) after a provably pre-submit failure; `ambiguous` keeps the key live pending human recovery.
- **Invariants:** Concurrent duplicate reservations are impossible (unique index); a verified record permanently blocks new attempts. See [70-database-idempotency.md](70-database-idempotency.md), [ADR-024](adr/ADR-024-database-level-idempotency.md).

## Execution Evidence (Screenshot Evidence)

- **Purpose:** An append-only trail of what an attempt observed — corroborating, never the decision itself (a screenshot alone is never proof of success).
- **Owner:** One Execution Session (within a Workspace).
- **Important attributes:** Evidence type, **opaque relative storage key** (never an absolute path), content hash, observed comment id/content/author, capture time.
- **Relationships:** Belongs to one Execution Session.
- **Lifecycle:** Recorded at each step (pre-submit, typed-content, submit, comment-identity, verification/failure snapshots) → retained.
- **Invariants:** Required corroboration for a verified comment (BR-43); stored securely, workspace-scoped, traversal-protected (BR-45); holds no secrets. This sprint captures only **synthetic** evidence. See [67-execution-evidence.md](67-execution-evidence.md).

## Telegram Destination

- **Purpose:** Where opportunities and notifications are delivered for human review.
- **Owner:** One Workspace (mapped to the customer).
- **Important attributes:** Telegram chat identity, pairing status.
- **Relationships:** Belongs to one Workspace; carries opportunities and result notifications.
- **Lifecycle:** Unpaired → paired → active → (optionally) unlinked.
- **Invariants:** It is an approval/notification interface, not the source of truth; approvals are validated server-side.

## Audit Event

- **Purpose:** An append-only record of something meaningful that happened.
- **Owner:** One Workspace (system-wide events also recorded).
- **Important attributes:** Event type, subject reference, actor (human or system), timestamp, details, result.
- **Relationships:** References any other entity it describes.
- **Lifecycle:** Appended → retained (never edited or deleted in the MVP).
- **Invariants:** Every meaningful action produces one (BR-46); append-only (BR-47); enables full reconstruction (BR-48).

## Kill Switch

- **Purpose:** The global control that halts new Facebook write actions.
- **Owner:** The system (operable by operator and, per policy, customer).
- **Important attributes:** State (active/inactive), who changed it, when, reason.
- **Relationships:** Gates every Comment Job; changes recorded as Audit Events.
- **Lifecycle:** Inactive ↔ active, by deliberate human action.
- **Invariants:** While active, no new comment is initiated anywhere (BR-56); nothing bypasses it (BR-58); every change is audited.

---

## Key Invariants Summary

1. Business is the core; Facebook is reached only through Platform / Platform Account.
2. Everything is workspace-isolated; drafts are business-isolated.
3. A post may match zero, one, or many businesses; multi-matches are never silently resolved.
4. Human approval precedes every comment; no auto-commenting.
5. One successful comment per business-and-post combination; bounded retries only after confirmed technical failure.
6. Every successful comment has screenshot evidence.
7. Every meaningful action is an append-only audit event.
8. The kill switch can stop all new write actions and cannot be bypassed.

> **SPRINT 015 — Production Business & Property (2026-08-20):** Business and Property are distinct persisted entities; structured contacts/policies with inheritance; persisted Business+Property readiness; deterministic Property matcher (backend + tests; UI + full matching pipeline → Sprint 016). See [100](100-production-business-model.md), [101](101-property-accommodation-model.md), [sprints/SPRINT-015](sprints/SPRINT-015-production-business-property-management.md).

> **SPRINT 016B — Property Match Pipeline (2026-08-20):** persisted Property data is wired into the real pipeline — after a Business MATCH, a deterministic Property stage (`property-rules-v1`) selects one Property (or NO_PROPERTY_MATCH) into `property_matches`, feeds the Property-aware Draft context, and surfaces an immutable Property snapshot + warnings in Human Review. Additive migration `0013`; no Facebook write/AI/Telegram. See [118](118-property-match-persistence.md)–[124](124-property-match-observability.md), [sprints/SPRINT-016B](sprints/SPRINT-016B-property-match-pipeline.md).
