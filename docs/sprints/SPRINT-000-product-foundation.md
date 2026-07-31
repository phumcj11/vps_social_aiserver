# SPRINT 000 — Product Foundation

- **Stage:** SPRINT 000 — Product Foundation
- **Type:** Documentation-only
- **Date:** 2026-07-30
- **Owner:** Product Architect / Principal Software Architect

---

## Sprint Goal

Produce the complete **Product Foundation** for the KMKT Social AI MVP as documentation, so that any engineer can build the MVP from these documents alone — without this chat history. Define the product's vision, scope, users, journey, rules, domain model, architecture, UX, AI design, Facebook/Playwright design, Telegram design, roadmap, source-of-truth memory, and glossary, and record the key product decisions as ADRs.

This sprint writes documentation only. It does not build, install, or connect anything.

---

## Deliverables

**New product documents (docs/):**
- [01-product-vision.md](../01-product-vision.md)
- [02-product-scope.md](../02-product-scope.md)
- [03-user-personas.md](../03-user-personas.md)
- [04-customer-journey.md](../04-customer-journey.md)
- [05-business-rules.md](../05-business-rules.md)
- [06-domain-model.md](../06-domain-model.md)
- [07-system-overview.md](../07-system-overview.md)
- [08-ux-specification.md](../08-ux-specification.md)
- [09-ai-design.md](../09-ai-design.md)
- [10-playwright-design.md](../10-playwright-design.md)
- [11-telegram-design.md](../11-telegram-design.md)
- [12-mvp-roadmap.md](../12-mvp-roadmap.md)
- [13-product-memory.md](../13-product-memory.md)
- [14-product-glossary.md](../14-product-glossary.md)

**Architecture Decision Records (docs/adr/):**
- [ADR-004 — Multiple Businesses per Customer](../adr/ADR-004-multiple-businesses-per-customer.md)
- [ADR-005 — Single Facebook Account per Workspace (MVP)](../adr/ADR-005-single-facebook-account-mvp.md)
- [ADR-006 — Telegram Human Approval](../adr/ADR-006-telegram-human-approval.md)

**Sprint record (docs/sprints/):**
- This document.

**Updated existing documents:**
- [current-sprint.md](../current-sprint.md) — set to SPRINT 000 — Product Foundation.
- [backlog.md](../backlog.md) — reflect multi-business as MVP scope, multiple Facebook accounts and TikTok as future scope, auto-comment rejected for MVP.
- [not-doing.md](../not-doing.md) — align exclusions with the agreed MVP.

---

## Non-Goals

- No application code (frontend, backend, workers, or otherwise).
- No Docker, containers, or orchestration.
- No database or SQL.
- No API implementation.
- No Playwright implementation or browser automation.
- No Facebook connection.
- No Telegram connection.
- No calls to external AI services.
- No installing software, opening ports, or changing firewall/SSH configuration.
- No expansion of the MVP beyond the agreed scope.

---

## Acceptance Criteria

- All listed documents exist and are written in clear, practical English.
- Terminology is consistent across every document and matches [06-domain-model.md](../06-domain-model.md) and [14-product-glossary.md](../14-product-glossary.md).
- Business is treated as the core; Facebook is treated as an adapter throughout.
- The mandatory human-approval rule and the no-auto-commenting rule are stated consistently.
- Multi-business matching is never silently resolved in any document.
- Credentials/cookies/profiles are stated as never committed to Git.
- The architecture stays within the 2-core / 3.8 GiB VPS budget (concurrency one, single host, no heavy infrastructure).
- No placeholders, TODO/TBD markers, lorem ipsum, or fake completeness claims.
- No contradictions between documents; existing foundation documents remain consistent.
- No code, packages, services, ports, or external connections were created.

---

## Risks

- **Inconsistency across many documents.** Mitigated by a single source-of-truth summary ([13-product-memory.md](../13-product-memory.md)), a shared glossary, and cross-references.
- **Scope creep into implementation.** Mitigated by the documentation-only constraint and explicit non-goals.
- **MVP expansion pressure.** Mitigated by [02-product-scope.md](../02-product-scope.md), [not-doing.md](../not-doing.md), and the ADRs that deliberately defer features.
- **Under-specified profile model weakening later AI quality.** Mitigated by aligning the Business Profile fields across the domain model, UX, and AI design.

---

## Completion Checklist

- [x] 01–14 product documents created.
- [x] ADR-004, ADR-005, ADR-006 created.
- [x] Sprint record created (this document).
- [x] current-sprint.md updated to SPRINT 000.
- [x] backlog.md updated for scope changes.
- [x] not-doing.md aligned with the agreed MVP.
- [x] Verified: no TODO/TBD/lorem ipsum/placeholders.
- [x] Verified: no application code created.
- [x] Verified: no packages installed, no services started, no ports opened.
- [x] Verified: no Facebook/Telegram/database/Docker/AI connection attempted.
- [x] Terminology and scope consistent across all documents.

---

## Review Status

**Complete — ready for Product Owner review.**

All Sprint 000 deliverables are produced, internally consistent, and free of placeholders. No implementation, installation, or external connection occurred. The project is ready to proceed to **SPRINT 001 — Technical Bootstrap** upon Product Owner sign-off.
