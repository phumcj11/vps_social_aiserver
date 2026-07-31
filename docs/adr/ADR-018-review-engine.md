# ADR-018 — Review Engine (channel-agnostic core)

- **Status:** Accepted
- **Date:** 2026-07-31
- **Sprint:** SPRINT 010 — Human Review Engine
- **Deciders:** Principal Product Architect / Senior Full Stack Engineer
- **Related principles:** AI Proposes / Human Disposes, Backend is the Source of Truth, Keep MVP Small, Single Responsibility
- **Relates to:** [ADR-017](ADR-017-human-approval-after-ai-draft.md), [ADR-019](ADR-019-telegram-adapter.md), [11-telegram-design.md](../11-telegram-design.md), [54-review-engine.md](../54-review-engine.md)

---

## Context

Sprint 009 produces AI Drafts; a human must decide on each. The obvious framing — "build a Telegram approval bot" — puts the decision logic inside a channel. But the Telegram design has always insisted that **Telegram is an interface, not the source of truth**, and the product may later present reviews through other channels (web, email, LINE). If the decision logic lives in Telegram, every rule (validation, ownership, idempotency, duplicate protection) is coupled to one vendor and cannot be reused.

Options:
- **A — Build a Telegram approval bot** that owns the decision flow.
- **B — Build a channel-agnostic Review Engine** (the core) with Telegram as one pluggable **Review Adapter**.

---

## Decision

**Build a channel-agnostic Review Engine (Option B). Telegram is only the first adapter.**

- The engine has three modules: **ReviewQueue** (create/assign/expire), **ReviewRepository** (the only DB boundary), **ReviewCoordinator** (AI Draft → Review Task; approve/reject/edit; ownership).
- A **Review Task** is stored per Draft (`review_tasks.draft_id` UNIQUE — one Draft → one Review Task) with an append-only `review_events` history.
- Decisions are **APPROVE / REJECT / EDIT**. EDIT stores revised text and keeps the task PENDING (approval still required, BR-28). The first valid decision wins (duplicate protection, BR-31).
- **The engine works with no adapter at all** — the web Review Queue is a complete review surface.
- A **ReviewAdapter** is an optional presentation channel called **best-effort**; an adapter never writes to the database and never blocks a review.
- This sprint records decisions **only**: NO Facebook comment/message/write, NO Action Engine, NO auto-approval.

---

## Consequences

**Positive**
- **Reusable safety** — validation, ownership, idempotency, and duplicate-decision protection live once, in the Backend, for every channel.
- **Pluggable channels** — Telegram is first; others add by implementing one interface, with no change to the core, API, or storage.
- **Works without Telegram** — the web UI is a full review surface; Telegram is additive.
- **Faithful to the design** — matches the long-standing rule that the Backend is the source of truth ([11-telegram-design.md](../11-telegram-design.md)).

**Negative / trade-offs**
- Slightly more structure than a single-channel bot. Justified: it prevents vendor lock-in and centralises safety.

**Explicitly out of scope:** Facebook comment/message/write, Action Engine, auto-approval/auto-comment, billing, subscription, teams.
