# KMKT Social AI — Documentation

This directory is the single source of truth for how KMKT Social AI is designed, decided, and delivered. Documentation is written before implementation, and every significant decision is recorded here.

---

## Project Overview

KMKT Social AI is a business-oriented platform for producing and managing social media content with the assistance of AI, while keeping a human firmly in control of what is published.

The product exists to help a business plan, draft, review, and approve social media content across platforms — turning AI from an unsupervised publisher into a supervised assistant. Every AI-generated output is treated as a proposal that a human reviews and approves before it reaches an audience.

The project is currently in its foundation stage. No application code exists yet. The present focus is establishing a clean, professional, well-documented engineering workspace on which future sprints will build.

---

## Architecture Philosophy

The architecture is guided by a small number of durable ideas rather than by any specific framework or tool. Concrete technology choices are deferred until the sprint that needs them, and each is recorded as an Architecture Decision Record.

- **Separation of concerns.** The repository is organised so that user-facing applications (`apps`), background processing (`workers`), and shared libraries (`packages`) each have a clear home. Responsibilities do not bleed across these boundaries.
- **Platform adapters.** Each external social platform is integrated behind a dedicated adapter with a common internal contract. The core of the system never speaks a platform's dialect directly; it speaks one internal language, and adapters translate.
- **Human approval in the loop.** AI proposes; a human disposes. Approval is a first-class step in every content flow, not an afterthought bolted on later.
- **Auditable by construction.** Actions that create, change, or publish content are designed to leave a durable trail, so that any outcome can be explained after the fact.
- **Small, deliberate core.** The MVP is intentionally minimal. Capabilities are added only when a real need justifies them, and rejected ideas are recorded so they are not silently revived.

These principles are described in full in [project-principles.md](project-principles.md).

---

## Current Sprint

**SPRINT 000 — Product Foundation** — *Complete (pending Product Owner review).*

This sprint produced the complete product foundation for the MVP as documentation: vision, scope, personas, journey, business rules, domain model, system overview, UX specification, AI design, Playwright (Facebook adapter) design, Telegram design, roadmap, product memory, glossary, and the first product ADRs. It remains documentation-only — no application, service, database, container, or external connection work.

The preceding **SPRINT -1 — Server Foundation** (host audit, repository structure, foundational documentation) is complete.

Full detail is tracked in [current-sprint.md](current-sprint.md) and [sprints/SPRINT-000-product-foundation.md](sprints/SPRINT-000-product-foundation.md).

---

## Project Principles

The project is governed by seven principles that take precedence over convenience or speed:

1. **Business First** — every capability must serve a clear business purpose.
2. **Human Approval** — AI output is a proposal; a human approves before anything is published.
3. **Platform Adapter** — every external platform is integrated behind a common adapter contract.
4. **Documentation First** — decisions and designs are written down before they are built.
5. **Keep MVP Small** — the first product is deliberately minimal.
6. **No Feature Creep** — scope is defended; new ideas are parked, not smuggled in.
7. **Everything Auditable** — meaningful actions leave a durable, explainable trail.

Each principle is explained in [project-principles.md](project-principles.md).

---

## Documentation Map

**Foundation and governance**

| Document                                       | Purpose                                                        |
| ---------------------------------------------- | ------------------------------------------------------------- |
| [server-audit.md](server-audit.md)            | Factual baseline of the host as of SPRINT -1.                  |
| [project-principles.md](project-principles.md) | The seven governing principles of the project.                |
| [current-sprint.md](current-sprint.md)        | The active sprint, its objectives, and status.                |
| [backlog.md](backlog.md)                      | Ideas, future features, rejected ideas, and technical debt.   |
| [not-doing.md](not-doing.md)                  | Everything explicitly excluded from the MVP.                  |

**Product foundation (SPRINT 000)**

| Document                                              | Purpose                                                   |
| ----------------------------------------------------- | --------------------------------------------------------- |
| [01-product-vision.md](01-product-vision.md)          | Vision, problem, solution, value, and success definition. |
| [02-product-scope.md](02-product-scope.md)            | In-scope, non-goals, and pilot-readiness boundary.        |
| [03-user-personas.md](03-user-personas.md)            | Who the MVP is for and who operates it.                   |
| [04-customer-journey.md](04-customer-journey.md)      | End-to-end journey from registration to history.          |
| [05-business-rules.md](05-business-rules.md)          | Precise, binding rules (BR-1…BR-62).                      |
| [06-domain-model.md](06-domain-model.md)              | Core concepts and relationships (no SQL).                 |
| [07-system-overview.md](07-system-overview.md)        | Logical architecture and trust boundaries.                |
| [08-ux-specification.md](08-ux-specification.md)      | MVP screens and states.                                   |
| [09-ai-design.md](09-ai-design.md)                    | Matching, drafting, and AI guardrails.                    |
| [10-playwright-design.md](10-playwright-design.md)    | Facebook adapter: read/write, safety, kill switch.        |
| [11-telegram-design.md](11-telegram-design.md)        | Human approval interface.                                 |
| [12-mvp-roadmap.md](12-mvp-roadmap.md)                | Sprint-by-sprint plan to pilot.                           |
| [13-product-memory.md](13-product-memory.md)          | Concise source-of-truth summary.                          |
| [14-product-glossary.md](14-product-glossary.md)      | Plain-English definitions of key terms.                   |

**Records**

| Document                                       | Purpose                                                        |
| ---------------------------------------------- | ------------------------------------------------------------- |
| [adr/](adr/)                                   | Architecture Decision Records (ADR-004, ADR-005, ADR-006).    |
| [rfcs/](rfcs/)                                 | Requests for Comments — proposals under discussion.           |
| [sprints/](sprints/)                           | Per-sprint planning and retrospective records.                |
| [tasks/](tasks/)                               | Individual task specifications.                                |

> **SPRINT 014 — Production Pilot Readiness (2026-08-20):** SMALL human-supervised production pilot prepared behind Write Window + one-shot authorization + Level-1 limits; no production writes enabled. See [92](92-production-pilot-level1.md), [99](99-production-rollout-levels.md), [sprints/SPRINT-014](sprints/SPRINT-014-production-pilot-readiness.md).
