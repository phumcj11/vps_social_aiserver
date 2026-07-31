# 07 — System Overview

**Document status:** Foundation (SPRINT 000)
**Applies to:** KMKT Social AI MVP

This document describes the logical architecture of the MVP — the components, how data flows between them, where the trust boundaries lie, and the rules that keep the design safe and small. It deliberately avoids specific frameworks and product-specific configuration; concrete technology choices are made in later sprints and recorded as ADRs.

The guiding constraint is the target host: **2 CPU cores and 3.8 GiB RAM** (see [server-audit.md](server-audit.md)). The architecture must run comfortably within this. That constraint, plus the **Keep MVP Small** principle, rules out microservices, message brokers, clustered caches, container orchestration, and browser farms.

---

## Logical Architecture

The system is a small set of cooperating components on a single VPS:

```
                 ┌──────────────────────────────────────────────┐
                 │                 Single VPS                     │
                 │        (2 CPU cores, 3.8 GiB RAM)              │
                 │                                                │
  Customer  ───► │  Web Frontend ──► Backend API ──► Database     │
  (browser)      │                      │  ▲                      │
                 │                      │  │                       │
  Customer  ◄──► │                 Telegram Bot                    │
  (Telegram)     │                      │  ▲                       │
                 │                      ▼  │                       │
                 │                   n8n (orchestration)           │
                 │                      │  ▲                       │
                 │              ┌───────┘  └────────┐              │
                 │              ▼                   ▼              │
                 │      Playwright Scanner   Playwright Comment    │
                 │        (read-only)          Executor (write)    │
                 │              │                   │              │
                 │              └──────► Facebook ◄─┘              │
                 │                                                │
                 │   AI Provider (external, called by Backend)    │
                 │   Storage (screenshots, browser profile)       │
                 └──────────────────────────────────────────────┘
```

All business decisions flow through the Backend API. Facebook is reached only through the two Playwright components, which act as the Facebook platform adapter.

---

## Components

### Web Frontend
The customer's setup and review surface: registration, workspaces, businesses, profiles, Facebook connection, group assignment, opportunities, approval history, settings, and system status including the kill switch. It talks only to the Backend API. It holds no business logic and never talks to Playwright, n8n, the AI provider, or Facebook directly.

### Backend API
The **source of truth and the only place business rules live**. It owns the domain model, enforces every rule in [05-business-rules.md](05-business-rules.md), stores data, decides matches and idempotency, calls the AI provider for drafts, records audit events, and controls the kill switch. Nothing writes to Facebook without the Backend having authorised it based on a recorded human approval.

> **Implementation status.** The Backend is built with Fastify (SPRINT 001). It implements authentication and workspaces (SPRINT 002), the **Business domain** (SPRINT 003), the **Facebook Connection Foundation** (SPRINT 004), the **Facebook Groups Foundation** (SPRINT 005), the **Collector Engine** (SPRINT 006) — a modular, **read-only** pipeline (Navigation → Extraction → Normalization → Persistence) that opens groups, reads posts, and stores platform-neutral **Signals** ([ADR-009](adr/ADR-009-collector-engine.md), [ADR-010](adr/ADR-010-signal-model.md)) — the **Opportunity Classification Engine** (SPRINT 007) — a **deterministic, rules-only** stage that reads Signals and decides `ACCEPT`/`REJECT` with explicit Reasons, storing **Opportunities** ([ADR-011](adr/ADR-011-opportunity-classification.md), [ADR-012](adr/ADR-012-opportunity-domain.md)) — and the **Business Candidate & Matching Engine** (SPRINT 008) — a **deterministic, rules-only** stage that generates candidate businesses (those assigned to the Signal's group) and decides `MATCH`/`NO_MATCH` per candidate using only that business's Business Matching Rules, storing **Business Matches** ([ADR-013](adr/ADR-013-business-candidate-generator.md), [ADR-014](adr/ADR-014-business-matching-engine.md)). The Classifier, CandidateGenerator, and Matcher are pure functions (no DB, no AI); Repositories are the single DB boundary; Coordinators run the pipelines. Reading is gated by `FACEBOOK_READER_ENABLED` (default off → no browser). Still **no AI, no score/confidence, no Comment Drafts, no commenting, no Telegram, no n8n**. Facebook writes remain disabled and the kill switch stays on; the Collector Worker is read-only and the Action Worker (write) is disabled.

> **Terminology (SPRINT 006):** the read-only worker is the **Collector** (formerly "Scanner"), a collected post is a **Signal** (formerly "Post"), the write worker is the **Action Worker** (formerly "Comment Worker"), and a qualified prospect is an **Opportunity** (formerly "Lead").
>
> **Terminology (SPRINT 007):** the deciding module is the **Classifier** (formerly "Detector"). An **Opportunity** is now a stored root — the deterministic classification record for one Signal — not merely a presentation bundle.
>
> **Terminology (SPRINT 008):** a **Business Match** is now a stored root — the deterministic match record for one (Opportunity, Business) pair — decided by the **Business Matcher** from **candidate** businesses (the **Candidate Generator** selects businesses assigned to the Signal's group). Matching is rules-only; there is no score/confidence and no AI.

### Database
Durable storage for the domain model: users, workspaces, businesses, profiles, knowledge, matching rules, and later groups, assignments, posts, matches, drafts, decisions, jobs, attempts, audit events, and kill-switch state. It is the persistent backbone the Backend API reads and writes.

> **Implementation status.** MySQL 8 (Docker only, loopback-published) with Drizzle ORM. Migration `0000` created users/sessions/workspaces (SPRINT 002); migration `0001` created businesses/business_profiles/business_knowledge/business_matching_rules (SPRINT 003). See [20-database-foundation.md](20-database-foundation.md) and [22-business-foundation.md](22-business-foundation.md).

### AI Provider
An external service the **Backend** calls to extract intent from posts, assist matching, and generate drafts. It is invoked only by the Backend, with only the selected business's context, and only as a stateless helper — it is never a source of truth and never called by the frontend, n8n, or Playwright directly. No provider is wired up in this sprint.

### n8n
A workflow orchestrator that sequences background steps — trigger a scan, move discovered posts to the Backend, drive the notify/approve/publish sequence — by **calling the Backend API**. It coordinates timing and glue; it does **not** hold business state, make business decisions, or store the truth. If n8n were lost, the Backend would still hold every fact and rule.

### Telegram Bot
The human approval interface. It delivers opportunities and receives approve/edit/reject callbacks, which it forwards to the Backend for validation and recording. It is a channel, not an authority; every decision is validated and stored by the Backend.

### Playwright Scanner (read-only)
The **read** half of the Facebook adapter. It logs in with the connected account's persistent profile and visits assigned groups to discover new posts, sending them to the Backend. It never writes to Facebook — no comments, likes, or reactions.

### Playwright Comment Executor (write)
The **write** half of the Facebook adapter. On an approved Comment Job dispatched by the Backend (via n8n), it navigates directly to the post, publishes the approved comment, verifies it, and captures a screenshot. It runs at **concurrency one** and is gated by the kill switch.

### Storage
Secure storage for artefacts that do not belong in the database: screenshot evidence and the Facebook browser profile (cookies/session). Screenshots are workspace-scoped. The browser profile and any credentials are server-side only, never exposed to the frontend, and **never committed to Git**.

---

## Data Flow

1. **Collect.** The Collector (backend/CLI) opens groups read-only → reads posts → normalizes → stores unique **Signals** (BR-13). *(SPRINT 006.)*
2. **Classify.** Backend applies the deterministic Classifier to each new Signal → stores an **Opportunity** with Decision (`ACCEPT`/`REJECT`) and Reasons; ACCEPT ⇒ READY, REJECT ⇒ ARCHIVED. No AI, no matching. *(SPRINT 007.)*
3. **Match.** Backend generates candidate businesses for each accepted Opportunity (those assigned to the Signal's group) and deterministically decides `MATCH`/`NO_MATCH` per candidate using that business's rules → stores Business Matches with reasons (no score, no AI). *(SPRINT 008.)*
4. **Draft.** Backend calls the AI Provider with a single matched business's context → stores a Comment Draft (BR-22). *(Later sprint.)*
5. **Notify.** Backend builds the opportunity bundle → Telegram Bot delivers it to the customer's destination.
6. **Decide.** Customer taps approve / edit / reject → callback goes to Backend → Backend validates and records the Approval Decision (BR-29).
7. **Publish.** On approval, Backend creates a Comment Job (checking idempotency and the kill switch) → n8n dispatches it → Comment Executor publishes, verifies, screenshots → Backend records the Comment Attempt, result, and evidence.
8. **Inform & audit.** Backend sends a success/failure notification via Telegram and appends audit events throughout (BR-46).

Every arrow that changes state passes through the Backend, which is where rules are enforced and history is written.

---

## Trust Boundaries

- **Frontend ↔ Backend.** The frontend is untrusted input. The Backend authenticates requests, enforces workspace isolation, and validates everything.
- **Telegram ↔ Backend.** Telegram callbacks are validated server-side; the Backend confirms the destination mapping, guards against duplicate/expired callbacks, and records the decision. Telegram is not trusted to be the truth.
- **n8n ↔ Backend.** n8n may request actions but cannot decide them; the Backend re-checks every rule (approval exists, idempotency, kill switch) before acting.
- **Playwright ↔ Facebook.** The Playwright components are the only parts that touch Facebook. They act only on Backend-authorised instructions. Credentials and cookies stay inside this boundary.
- **AI Provider.** Treated as an external, untrusted helper. Its output is a proposal reviewed by a human; it never triggers an action by itself.

---

## Why Business Logic Must Remain in the Backend

- **Single source of truth.** Rules (approval, idempotency, isolation, kill switch, audit) must be enforced in exactly one place. Scattering them across n8n, the frontend, or Playwright would make them impossible to guarantee.
- **Safety.** The mandatory-approval and kill-switch guarantees are only credible if a single trusted component checks them before every write.
- **Auditability.** A single authority can produce a complete, consistent audit trail; multiple authorities cannot.
- **Adapter independence.** Keeping logic in the Backend lets Facebook remain a replaceable adapter rather than the core.

## Why n8n Must Not Be the Source of Truth

- n8n coordinates *when* things happen, not *whether* they are allowed. It calls the Backend, which decides.
- Workflow tools are optimised for orchestration, not for durable, consistent, auditable state. Storing truth there would fragment the model and weaken guarantees.
- The system must remain correct even if n8n is restarted, reconfigured, or replaced. All facts and rules live in the Backend and Database, so losing n8n loses no truth.

## Why Playwright Must Not Be Called Directly by the Frontend

- Playwright performs privileged Facebook actions using stored credentials. Exposing it to the frontend would expose those credentials and bypass every rule.
- Only the Backend knows whether an approval exists, whether idempotency allows the action, and whether the kill switch permits it. The frontend has no basis to make that call.
- Direct frontend access would break the trust boundary and make auditing and the kill switch unenforceable.

---

## MVP Deployment Constraints (2 CPU cores, 3.8 GiB RAM)

The single-VPS budget shapes the architecture directly:

- **Everything on one host.** Frontend, Backend, Database, n8n, Telegram bot, and Playwright run on the same VPS. No clustering.
- **Browser concurrency of one.** At most one Playwright browser action runs at a time. A headless Chromium instance is the heaviest consumer of RAM here, so scanning and commenting are serialised and never run two browsers at once.
- **Read and write separated but serialised.** The Scanner and Comment Executor are distinct roles but share the single-concurrency budget; they do not run simultaneously.
- **Modest scan cadence.** Scanning runs on a gentle schedule rather than continuously, to protect CPU and memory and to stay within reasonable Facebook usage.
- **No heavy infrastructure.** No microservices, Kubernetes, Kafka, RabbitMQ, Redis clusters, or browser farms. Background sequencing uses n8n calling the Backend; queued work is tracked in the Database.
- **Fail safe under pressure.** If resources are constrained, the system delays or pauses work (and records it) rather than spawning parallel browsers or dropping audit records.
- **Headroom for the operator.** The design leaves memory for the OS and operator tools, since the host has little to spare.

This keeps the MVP well within the current VPS while preserving every safety and auditability guarantee. If pilot demand later exceeds one host, scaling is a deliberate future decision recorded as an ADR — not an MVP concern.
