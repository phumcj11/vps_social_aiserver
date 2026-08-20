# KMKT Social AI

**KMKT Social AI** is a business-oriented platform for producing and managing social media content with the assistance of AI, while keeping a human firmly in control of what is published.

AI drafts; a human approves. Every AI-generated output is treated as a proposal that a person reviews and explicitly approves before it reaches an audience. The product's goal is to make content creation faster and more consistent without ever surrendering editorial control.

---

## Status

**Stage:** SPRINT 013 — Operational Hardening and Controlled Write Test Preparation — *Complete (not committed).*

The product: KMKT Social AI helps business owners discover customer-intent posts in Facebook Groups, generate business-specific AI comment drafts, review them via Telegram, and publish approved comments through Playwright — with full auditability and a global kill switch. The pipeline is built through SPRINT 012: authentication & workspaces, the Business domain, Facebook connection & groups, the read-only Collector, the deterministic Opportunity Classifier and Business Matcher, the AI Draft Engine (AI disabled by default), the Human Review Engine, the Action Queue Engine, the **Safe Execution Foundation** (executor, narrow Facebook Comment Adapter with a deterministic fake default and a disabled Playwright boundary, Execution Sessions, evidence, verification, recovery, database-level idempotency), and now **Operational Hardening** — backups & restore, health & monitoring, maintenance mode, incident lockdown, an operator console, process-supervision templates, and the controlled-write-test and pilot-readiness runbooks. **No real Facebook write executes** — real execution stays disabled, the kill switch stays on, and every `prepare-execution` is blocked under safe defaults. See [docs/current-sprint.md](docs/current-sprint.md) and [docs/13-product-memory.md](docs/13-product-memory.md).

---

## Guiding Principles

1. **Business First** — every capability serves a clear business purpose.
2. **Human Approval** — AI output is a proposal; a human approves before publishing.
3. **Platform Adapter** — every external platform sits behind a common adapter contract.
4. **Documentation First** — decisions and designs are written down before they are built.
5. **Keep MVP Small** — the first product is deliberately minimal.
6. **No Feature Creep** — scope is defended; new ideas are parked, not smuggled in.
7. **Everything Auditable** — meaningful actions leave a durable, explainable trail.

Each principle is explained in [docs/project-principles.md](docs/project-principles.md).

---

## Repository Structure

| Path         | Purpose                                                                 |
| ------------ | ----------------------------------------------------------------------- |
| `apps/`      | User-facing applications.                                               |
| `workers/`   | Background and asynchronous processing.                                 |
| `packages/`  | Shared libraries and internal packages.                                 |
| `config/`    | Configuration for the workspace and its environments.                  |
| `scripts/`   | Operational and developer scripts.                                     |
| `storage/`   | Local storage and data working area.                                   |
| `tests/`     | Test suites and test support.                                          |
| `tools/`     | Developer tooling and utilities.                                       |
| `docs/`      | Project documentation — the single source of truth.                    |
| `docs/adr/`  | Architecture Decision Records.                                          |
| `docs/rfcs/` | Requests for Comments — proposals under discussion.                    |
| `docs/sprints/` | Per-sprint planning and retrospective records.                      |
| `docs/tasks/`   | Individual task specifications.                                     |
| `.github/`   | Repository and workflow metadata.                                      |

The `apps`, `workers`, `packages`, and other top-level directories are established now as the intended homes for future work. They are deliberately empty during the foundation sprint — no implementation exists yet.

---

## Documentation

Documentation is the single source of truth for this project and lives under [docs/](docs/README.md).

| Document                                             | Purpose                                          |
| --------------------------------------------------- | ------------------------------------------------ |
| [docs/README.md](docs/README.md)                    | Documentation home and project overview.         |
| [docs/server-audit.md](docs/server-audit.md)        | Factual baseline of the host.                    |
| [docs/project-principles.md](docs/project-principles.md) | The seven governing principles.             |
| [docs/current-sprint.md](docs/current-sprint.md)    | The active sprint and its status.                |
| [docs/backlog.md](docs/backlog.md)                  | Ideas, future features, rejected ideas, debt.    |
| [docs/not-doing.md](docs/not-doing.md)              | Everything explicitly outside the MVP.           |

---

## Scope Note

This repository currently contains **documentation and structure only**. No application, service, database, or container code is present, and none is intended during SPRINT -1. What the MVP will and will not include is defined in [docs/not-doing.md](docs/not-doing.md).

> **SPRINT 014 — Production Pilot Readiness (2026-08-20):** a SMALL, human-supervised production pilot is prepared behind full gates (bounded Write Window, one-shot submit authorization, Level-1 hard limits) — **no production writes enabled**. See [docs/92 Production Pilot Level 1](docs/92-production-pilot-level1.md), [docs/99 rollout levels](docs/99-production-rollout-levels.md), [docs/sprints/SPRINT-014](docs/sprints/SPRINT-014-production-pilot-readiness.md).

> **SPRINT 015 — Production Business & Property (2026-08-20):** Business and Property are now distinct, self-service entities with structured contacts/policies, persisted readiness, audit, and a deterministic Property matcher (backend + persistence + tests; frontend + full matching pipeline → Sprint 016). See [docs/100 business model](docs/100-production-business-model.md), [docs/101 property model](docs/101-property-accommodation-model.md), [docs/sprints/SPRINT-015](docs/sprints/SPRINT-015-production-business-property-management.md).
