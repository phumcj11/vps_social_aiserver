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

- **Purpose:** The judgement that a post is relevant to a particular business, with a score and explanation.
- **Owner:** One Workspace.
- **Important attributes:** Post reference, business reference, confidence score, plain-English explanation.
- **Relationships:** Links one Post and one Business; leads to one Comment Draft.
- **Lifecycle:** Created by matching → drives an opportunity → resolved by a decision.
- **Invariants:** Zero, one, or many per post (BR-17); when many, each is presented distinctly and none is silently chosen (BR-19, BR-20).

> **Opportunity (two senses).** The **stored Opportunity** above (SPRINT 007) is the deterministic classification record for one Signal. Separately, later sprints will present a human-facing *opportunity bundle* — a stored Opportunity enriched with a Business Match, post summary, score, reasons, and Comment Draft — for Telegram approval. The bundle is a presentation concept built on top of the stored root; it does not replace it.

## Comment Draft

- **Purpose:** The proposed comment text for a specific business-and-post match.
- **Owner:** One Workspace.
- **Important attributes:** Business Match reference, generated text, generation context summary, edited text (if any).
- **Relationships:** Belongs to one Business Match; receives one Approval Decision.
- **Lifecycle:** Generated → (optionally edited) → approved or rejected.
- **Invariants:** Uses only its business's profile (BR-22); contains no prohibited claims (BR-24); both original and edited versions are retained (BR-27).

## Approval Decision

- **Purpose:** The human's decision on a draft.
- **Owner:** One Workspace (recorded against a User).
- **Important attributes:** Draft reference, decision (approve / edit-then-approve / reject), deciding user, reason (optional), timestamp.
- **Relationships:** Resolves one Comment Draft; an approval creates one Comment Job.
- **Lifecycle:** Pending → decided (final).
- **Invariants:** Exactly one decision per opportunity (BR-31); approval is mandatory before any comment (BR-29); only authorised users decide (BR-32).

## Comment Job

- **Purpose:** The unit of work to publish an approved comment.
- **Owner:** One Workspace.
- **Important attributes:** Approved draft reference, business-and-post combination key, status, retry count.
- **Relationships:** Created from one approved Approval Decision; runs one or more Comment Attempts.
- **Lifecycle:** Queued → running → succeeded / failed.
- **Invariants:** At most one successful comment per business-and-post combination (BR-36); retries only after confirmed technical failure and within the limit (BR-39, BR-41); subject to the Kill Switch (BR-56).

## Comment Attempt

- **Purpose:** A single try at publishing the comment via Playwright.
- **Owner:** One Comment Job.
- **Important attributes:** Attempt number, start/end time, outcome, error classification (if failed), verification result.
- **Relationships:** Belongs to one Comment Job; a successful attempt has Screenshot Evidence.
- **Lifecycle:** Started → published → verified → succeeded, or → failed/interrupted.
- **Invariants:** Every attempt is recorded (BR-42); a success must be verified and evidenced (BR-44).

## Screenshot Evidence

- **Purpose:** Visual proof that a comment was published.
- **Owner:** One Comment Attempt (within a Workspace).
- **Important attributes:** Image reference, capture time, attempt reference.
- **Relationships:** Belongs to one successful Comment Attempt.
- **Lifecycle:** Captured on verified success → retained.
- **Invariants:** Required for every successful comment (BR-43); stored securely and workspace-scoped (BR-45).

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
