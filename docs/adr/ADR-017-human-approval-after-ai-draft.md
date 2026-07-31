# ADR-017 — Human Approval After AI Draft

- **Status:** Accepted
- **Date:** 2026-07-31
- **Sprint:** SPRINT 009 — AI Draft Engine
- **Deciders:** Principal Software Architect / Senior Full Stack Engineer
- **Related principles:** AI Proposes / Human Disposes, No Silent Failure, Human Approval Mandatory
- **Relates to:** [ADR-006](ADR-006-telegram-human-approval.md), [ADR-015](ADR-015-ai-provider-abstraction.md), [ADR-016](ADR-016-immutable-ai-draft-versioning.md), [09-ai-design.md](../09-ai-design.md)

---

## Context

The AI Draft Engine produces comment drafts. The central safety question: what is a draft allowed to do? The product rule is absolute — **a human approves before any comment is posted** (BR-29). We must decide, at the engine's boundary, whether a draft can ever advance toward posting on its own.

Options:
- **A — Let a high-confidence / PASS draft auto-advance** toward posting.
- **B — A draft is inert**: it is only a proposal. It never approves, never sends, never posts; a human decision (in a later sprint) is required to advance it.

---

## Decision

**A draft is inert; human approval remains mandatory (Option B).**

- The engine produces a **DRAFT ONLY**. It **never** sends Telegram, **never** posts to Facebook, **never** triggers a write or Action Worker execution, and **never** auto-approves.
- There is **no approved / ready / sent / posted state** in this sprint. Draft states are `draft`, `needs_review`, `rejected`, `superseded` only.
- **BLOCK** (and provider failure) can never produce a ready state — such drafts are stored `needs_review` with a human required.
- A human may **reject** a draft; approval and delivery are deliberately deferred to later sprints (Telegram approval, then comment execution), which will build on this record without changing the "human disposes" rule.
- The global kill switch and write flags remain their safe defaults; nothing in this engine can flip them.

---

## Consequences

**Positive**
- **Safety by construction** — no code path exists from "AI produced text" to "Facebook comment". The absence of an approval/execution state is the guarantee.
- **Clear seam for later sprints** — Telegram approval and comment execution attach to the immutable draft ([ADR-016](ADR-016-immutable-ai-draft-versioning.md)) without weakening this rule.
- **Trustworthy** — the customer can inspect drafts knowing none can act.

**Negative / trade-offs**
- A human must act on every draft; there is no automation shortcut. This is intended and non-negotiable (BR-29).

**Explicitly out of scope:** approval execution, Telegram delivery/approval, Facebook comment/message, Action Worker execution, any Facebook write.
