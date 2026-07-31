# 54 — Review Engine

**Document status:** SPRINT 010 — Human Review Engine
**Applies to:** KMKT Social AI
**Date:** 2026-07-31

The **Review Engine** is the CORE human-in-the-loop step of the pipeline. It turns an **AI Draft** into a **Review Task** that a human **approves**, **rejects**, or **edits**.

> **Telegram is NOT the core. The Review Engine is the core.** Telegram is only the first **Review Adapter** ([56](56-review-adapter.md), [58](58-telegram-review-adapter.md)). The engine works completely **without** Telegram — via the Review API and the web UI.

This sprint records human **decisions only**. There is **NO Facebook comment/message/write, NO Action Engine, and NO auto-approval**. Approving a Review Task records the human's choice; it does not post anything.

---

## Pipeline position

```
Collector → Signals → Opportunity → Business Matching → AI Draft
  → [ Review Queue → Human Decision ] → END
```

The engine consumes an **AI Draft** (Sprint 009) and produces a **Review Task** with a decision history. The pipeline ends here this sprint — a later sprint may execute an approved comment, but that is explicitly out of scope.

---

## Modules (single responsibility each)

| Module | Responsibility |
| ------ | -------------- |
| **ReviewQueue** | Create a Review Task for a Draft, assign it, expire it ([55](55-review-queue.md)). |
| **ReviewRepository** | Store tasks, keep history (events), read records to present. The ONLY DB boundary. |
| **ReviewCoordinator** | Orchestrates: AI Draft → Review Task; approve / reject / edit; ownership; adapter delivery (best-effort). |
| **ReviewAdapter** | A presentation channel (Telegram is the first). Holds NO business logic, writes NO database ([56](56-review-adapter.md)). |

> **Boundary rule:** an adapter never touches the database. All decisions flow **Telegram → Review API → Coordinator → Repository**. Only the Repository talks to the Store.

---

## Core rule: one Draft → one Review Task

`review_tasks.draft_id` is **UNIQUE**. Enqueuing a Draft twice returns the existing Review Task (idempotent) — never a duplicate.

---

## Decisions

- **APPROVE** — the human accepts the draft (or its edited version). Records the decision only; **posts nothing**.
- **REJECT** — the human declines, optionally with a reason.
- **EDIT** — the human provides revised text; it is stored and the task **stays PENDING** (approval is still required, BR-28).

See [57-human-decision.md](57-human-decision.md) for the decision lifecycle, and [55-review-queue.md](55-review-queue.md) for statuses (PENDING / APPROVED / REJECTED / EXPIRED).

---

## Why an engine, not a Telegram integration

Building the Review Engine as a channel-agnostic core (rather than "a Telegram bot") means:

- **The engine works without any adapter** — the web Review Queue is a complete review surface on its own.
- **Adapters are pluggable** — Telegram is first; email, LINE, or others could follow with no change to the core.
- **Safety is centralised** — validation, ownership, idempotency, and duplicate-decision protection live in the Backend, exactly where Telegram design always said the source of truth belongs ([11-telegram-design.md](11-telegram-design.md)).

See [ADR-018](adr/ADR-018-review-engine.md), [ADR-019](adr/ADR-019-telegram-adapter.md).
