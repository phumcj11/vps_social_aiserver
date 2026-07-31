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

> **Implementation status.** The Backend is built with Fastify (SPRINT 001). It implements authentication and workspaces (SPRINT 002), the **Business domain** (SPRINT 003), the **Facebook Connection Foundation** (SPRINT 004), and the **Facebook Groups Foundation** (SPRINT 005) — group management, a strict offline URL normaliser, connection-only group access validation (landing page only; no scroll/post-read/write), and many-to-many Business↔Group assignment ([ADR-008](adr/ADR-008-business-to-group-many-to-many.md)) — all per-endpoint ownership-scoped. Still no scanning, post ingestion, opportunities, commenting, AI, Telegram, or n8n. Facebook writes remain disabled and the kill switch stays on; the scan/comment workers are disabled.

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

1. **Scan.** n8n triggers the Scanner → Scanner discovers posts → posts sent to Backend → Backend stores unique posts (BR-13).
2. **Match & draft.** Backend evaluates each post against assigned businesses → creates Business Matches with scores and reasons → calls the AI Provider with a single business's context → stores a Comment Draft (BR-22).
3. **Notify.** Backend builds the opportunity → Telegram Bot delivers it to the customer's destination.
4. **Decide.** Customer taps approve / edit / reject → callback goes to Backend → Backend validates and records the Approval Decision (BR-29).
5. **Publish.** On approval, Backend creates a Comment Job (checking idempotency and the kill switch) → n8n dispatches it → Comment Executor publishes, verifies, screenshots → Backend records the Comment Attempt, result, and evidence.
6. **Inform & audit.** Backend sends a success/failure notification via Telegram and appends audit events throughout (BR-46).

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
