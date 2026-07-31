# SPRINT 008 — Business Candidate & Matching Engine

- **Stage:** SPRINT 008 — Business Candidate & Matching Engine
- **Type:** Feature implementation (deterministic matching — no AI)
- **Date:** 2026-07-31
- **Owner:** Principal Software Architect / Senior Full Stack Engineer

---

## Goal

Introduce **deterministic business matching**: for each accepted Opportunity, generate candidate businesses and decide, per candidate, whether it **MATCH**es or **NO_MATCH**es — using ONLY the business's human-authored Business Matching Rules. NO AI, NO Telegram, NO Comment, NO Facebook Write, NO score, NO confidence.

```
Opportunity → Candidate Generator → Business Matcher → Business Match
```

---

## Deliverables

- **Database:** Drizzle migration `0006` — `business_matches` (id, workspace_id, business_id, opportunity_id, decision, reasons, matcher_version, matched_at) with **UNIQUE (opportunity_id, business_id)** and indexes on workspace/opportunity/business. No AI/telegram/comment/draft/approval/score/confidence tables.
- **Matching Engine** (`apps/api/src/matching/*`): **CandidateGenerator** (pure `selectCandidates`), **BusinessMatcher** (pure `matchBusiness`, no DB/AI), **MatchRepository** (only DB boundary, via the Store), **Coordinator** (run + idempotency + ownership). Plus `types.ts` and `errors.ts`. Store methods added to `InMemoryStore` and `DrizzleStore`.
- **Candidate rule:** active businesses assigned to the Opportunity's Signal's group (BR-15). **Matching (`rules-v1`):** case-insensitive substring containment of each active rule's value in the Signal message; MATCH iff ≥1 rule matches.
- **Decision & reasons:** `MATCH`/`NO_MATCH` with a reasons array `[{ ruleType, ruleValue, matched }]`. One (Opportunity, Business) → at most one match; run is idempotent (existing pairs skipped).
- **API:** `POST /business-matching/run`, `GET /business-matches` (opportunityId/businessId/decision filters), `GET /business-matches/:id` — authenticated, workspace-scoped, CSRF-guarded, safe responses.
- **Web:** Opportunity Detail extended with Candidate Businesses → Matched Businesses → Reasons and a "Run business matching" button; Business Match detail page (`/settings/business-matches/[id]`). No Business writes to Facebook, no AI, no Telegram.
- **Tests:** 196 passing (23 new: candidate, matcher, repository, coordinator, API, ownership, duplicate).
- **Documentation:** [44](../44-business-candidate-engine.md), [45](../45-business-matching-engine.md), [46](../46-matching-rules.md), [47](../47-business-match-lifecycle.md); [ADR-013](../adr/ADR-013-business-candidate-generator.md), [ADR-014](../adr/ADR-014-business-matching-engine.md); updates to system-overview, roadmap, product-memory, domain-model, current-sprint.

---

## Non-Goals (not implemented)

AI / ML / embeddings / vector or semantic search; score / confidence; Comment Drafts; Telegram; Facebook write/message; notification; approval; recommendation; auto-selection among businesses. The Business Match has **no downstream consumer** — the pipeline ends at Business Match.

---

## Acceptance Criteria

- [x] CandidateGenerator and BusinessMatcher are pure functions (no DB, no AI, no I/O).
- [x] Matcher never executes SQL — only the Repository does; Coordinator orchestrates.
- [x] Decision `MATCH`/`NO_MATCH`; reasons array stored; `matcher_version` recorded.
- [x] Candidates = active businesses assigned to the Signal's group; only accepted Opportunities are matched.
- [x] One (Opportunity, Business) → max one match (UNIQUE); run idempotent.
- [x] API + Opportunity Detail (candidates/matched/reasons) + match detail; ownership enforced (404 cross-workspace).
- [x] `pnpm lint | typecheck | test | build | format:check | run doctor | db:status` all pass.
- [x] No AI; no Telegram; no Comment; no Facebook write. Collector and Signals unchanged.

---

## Runtime verification

MySQL started (loopback), migration `0006` applied (18 tables incl. `business_matches`). Seeded (via API) a business with a `keyword=plumber` rule, a group, and an assignment; inserted a Signal in that group; classified it to an accepted Opportunity. Live flow: `POST /business-matching/run` → `{ processedOpportunities: 1, candidates: 1, matches: 1, noMatches: 0, skipped: 0 }`; list returned the MATCH with its keyword reason; `decision=NO_MATCH` filter empty; detail returned match + business + opportunity; re-run idempotent → `{ matches: 0, skipped: 1 }`; other workspace isolated (`404`, empty list, zero run). No AI/telegram/comment/score tables; `business_matches` has no score/confidence columns; Signals unchanged. Services stopped. No Facebook contact.

---

## Risks & Mitigations

- **Scope creep into AI / scoring.** Mitigated by the pure-Matcher boundary (no DB, no model) and a binary rules-only decision; documented in [ADR-014](../adr/ADR-014-business-matching-engine.md).
- **Duplicate matches for one (Opportunity, Business).** Mitigated by the UNIQUE constraint and the idempotent skip-existing run.
- **Silently choosing one business among many.** Prevented — every candidate is recorded distinctly with its own reasons (BR-19, BR-20).
- **Leaking one workspace's matches to another.** Mitigated by per-endpoint workspace ownership (404 on cross-workspace).

---

## Outcome

Deterministic candidate generation and business matching implemented end-to-end (engine, API, UI, tests, docs). No commit made this sprint (per instruction). **Ready for Sprint 009.**
