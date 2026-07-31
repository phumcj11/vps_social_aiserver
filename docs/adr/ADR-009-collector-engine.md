# ADR-009 — Collector Engine

- **Status:** Accepted
- **Date:** 2026-07-31
- **Sprint:** SPRINT 006 — Collector Engine (read-only)
- **Deciders:** Principal Software Architect / Senior Full Stack Engineer
- **Related principles:** Platform Adapter, Everything Auditable, Keep MVP Small, No silent failure
- **Relates to:** [ADR-005](ADR-005-single-facebook-account-mvp.md), [ADR-007](ADR-007-operator-assisted-facebook-login-mvp.md), [ADR-008](ADR-008-business-to-group-many-to-many.md), [ADR-010](ADR-010-signal-model.md), [34-collector-engine.md](../34-collector-engine.md), [35-collector-pipeline.md](../35-collector-pipeline.md)

---

## Context

The MVP needs its first production data pipeline: read posts from a workspace's Facebook Groups and store them for later matching/drafting. This must be **read-only**, must not entangle collection with business/AI/opportunity concerns, and must run safely on a small VPS without contacting Facebook until explicitly enabled.

We must decide how to structure this collector.

Options:
- **A — A single monolithic scanner** that navigates, parses, dedups, and writes, coupled to business/opportunity concepts.
- **B — A modular Collector Engine** (Navigation, Extractor, Normalizer, Repository, Coordinator) with a strict persistence boundary and no knowledge of Business/AI/Opportunity.

---

## Decision

**Adopt a modular Collector Engine (Option B).**

- Five modules, each with one responsibility: **Navigation** (open/scroll/read, read-only), **Extractor** (page HTML → raw captures, pure), **Normalizer** (raw → normalized Signal, pure), **Repository** (the only module that touches the database), **Coordinator** (pipeline + state machine + run history).
- **Boundary rule:** the Collector never executes SQL directly; it talks only to the Repository, and the Repository talks to the database.
- The browser boundary is a `CollectorBrowser` interface (real Playwright at runtime, fake in tests); Navigation uses a read-only `PageController` (open/scroll/read only).
- The Collector knows **only** platform entities (groups, posts→Signals). It knows nothing about Business, AI, Telegram, comments, approval, matching, or opportunities.
- **Read-only and gated:** reading is gated by `FACEBOOK_READER_ENABLED` (default off → no browser); a connected session is required; concurrency one; Facebook writes stay disabled and the kill switch stays on.

---

## Consequences

**Positive**
- Clean separation makes each stage independently testable (pure Extractor/Normalizer, Repository over the Store, Coordinator over a fake browser) — the pipeline is fully tested without a real browser or Facebook.
- The persistence boundary keeps SQL in one place and prevents the pipeline from coupling to the database or to business logic.
- The read-only design + reader gate + connected-session guard make it safe to ship and verify without contacting Facebook.
- Platform-neutral Signals (ADR-010) let future platforms reuse the same downstream pipeline.

**Negative / costs**
- More modules and interfaces than a monolith; a small amount of extra wiring.
- The extractor is best-effort HTML parsing; live-DOM hardening against real Facebook is future work when the reader is enabled with a real session.

**Neutral**
- The Coordinator runs inside the backend and is also exposed via an operator CLI (`collector:run`) and a thin worker.

---

## Alternatives considered

- **Monolithic scanner (Option A).** Rejected: it would couple collection to business/opportunity concepts, scatter SQL, and be hard to test without a live browser. It also violates the Platform Adapter principle by baking Facebook specifics into the core.

---

## Guarantees affirmed

- Collector talks only to the Repository; the Repository talks to the database.
- Read-only: no click/like/share/comment/message/join/write; browser gated by the reader flag; session required.
- No silent failure: every stage error is classified and audited.
