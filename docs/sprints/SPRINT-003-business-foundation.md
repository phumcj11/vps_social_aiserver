# SPRINT 003 — Business Foundation

- **Stage:** SPRINT 003 — Business Foundation
- **Type:** Feature implementation (Business domain)
- **Date:** 2026-07-30
- **Owner:** Principal Product Architect / Senior Full Stack Engineer

---

## Goal

Implement the complete Business Foundation — the core of the product. After this sprint: **one user → one workspace → multiple businesses**, each with a profile, structured knowledge, and deterministic matching rules, all under strict workspace ownership. No Facebook, AI, Playwright, Telegram, or n8n.

---

## Deliverables

- **Database:** Drizzle migration `0001` adding `businesses`, `business_profiles`, `business_knowledge`, `business_matching_rules` (UUID PKs, FKs, unique slug, unique `(workspace_id, name)`, unique `business_id` on profile, safe timestamps, soft status).
- **Store:** business-domain methods added to the `Store` interface, the in-memory store (tests), and the Drizzle store (runtime; profile created transactionally with the business; JSON arrays for selling points / prohibited claims).
- **API:** all 13 endpoints — businesses CRUD (no delete), profile read/update, knowledge CRUD, matching-rules CRUD — with ownership verified on every endpoint (user → workspace → business → sub-resource; 404 for not-owned).
- **Validation:** name & category required on create; knowledge title min 2; matching-rule priority must be an integer; rule type restricted to the allowed set.
- **Web UI:** Businesses List; Business Detail with Profile / Knowledge / Matching Rules tabs; nav + dashboard links.
- **Tests:** 12 business tests (CRUD, profile, knowledge, rules, ownership/isolation, validation, security) — 40 total passing.
- **Documentation:** [22](../22-business-foundation.md), [23](../23-business-profile.md), [24](../24-business-knowledge.md), [25](../25-business-matching-rules.md); updates to [current-sprint.md](../current-sprint.md), [13-product-memory.md](../13-product-memory.md), [07-system-overview.md](../07-system-overview.md), [06-domain-model.md](../06-domain-model.md).

---

## Non-Goals (not implemented)

Facebook / Facebook login / Facebook groups; Playwright; AI (matching or comment drafting); Telegram; n8n; opportunity discovery; matching engine; comment draft/approval/execution; billing; subscription; teams; multiple workspace users; multiple Facebook accounts; auto-comment.

**Explicit clarifications:** Business Knowledge is structured data, **not** AI memory. Matching Rules are deterministic, **not** AI.

---

## Acceptance Criteria

- [x] Multiple businesses per workspace work.
- [x] Workspace isolation and per-endpoint ownership enforced (cross-user → 404).
- [x] Business/Profile/Knowledge/Matching-Rule CRUD work (businesses: no delete, soft status).
- [x] Unique slug; unique business name within workspace.
- [x] Validation (name/category required; knowledge title min 2; integer priority; allowed rule types).
- [x] `pnpm lint | typecheck | test | build | format:check | run doctor` all pass.
- [x] Live end-to-end verification against MySQL (migration `0001` applied).
- [x] No Facebook/AI/Playwright/Telegram/n8n/comment/opportunity; no external connections; workers disabled; kill switch on.

---

## Risks & Mitigations

- **Cross-user data exposure.** Mitigated by the ownership chain enforced on every endpoint and 404-not-403 responses; covered by isolation tests.
- **Partial writes (business without profile).** Mitigated by creating business + profile in a single DB transaction.
- **Scope creep toward AI/Facebook.** Mitigated by explicit non-goals and by keeping knowledge/rules deterministic and clearly documented as non-AI.
- **Resource use (2 cores / 3.8 GiB).** Only MySQL/API/web run; small DB pool; no heavy infrastructure.

---

## Completion Checklist

- [x] Preflight (read-only); no firewall/SSH/user/network changes.
- [x] Schema + migration `0001` generated.
- [x] Store interface + in-memory + Drizzle implementations.
- [x] API routes + validation + ownership.
- [x] Web UI (list + detail tabs).
- [x] Tests (40 passing).
- [x] Full quality suite green; live DB verification green.
- [x] Services stopped after verification.
- [x] Documentation written/updated; no placeholders or TODO markers.
- [x] No commits made.

---

## Review Status

**Complete — ready for Sprint 004.**

The Business domain is implemented and verified: multiple businesses per workspace, full CRUD for businesses/profile/knowledge/rules, strict ownership and isolation, deterministic (non-AI) knowledge and rules. All quality gates and a live end-to-end run pass. No platform integration exists.
