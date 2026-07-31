# Current Sprint

## Current Sprint

**SPRINT 008 — Business Candidate & Matching Engine**

## Objectives

**Business Candidate & Matching (deterministic, no AI).**

For each accepted **Opportunity**, generate candidate businesses and decide, per candidate, whether it **MATCH**es or **NO_MATCH**es — using ONLY the business's human-authored Business Matching Rules. **No score, no confidence, no AI.** Concretely:

- Database: `business_matches` (UNIQUE `(opportunity_id, business_id)`; migration `0006`).
- Three modules: CandidateGenerator (pure `selectCandidates`), BusinessMatcher (pure `matchBusiness`), MatchRepository (only DB boundary, via the Store), Coordinator (run + idempotency + ownership).
- Candidate rule: active businesses assigned to the Opportunity's Signal's group (BR-15). Matching `rules-v1`: case-insensitive substring containment of each active rule value in the Signal message; MATCH iff ≥1 rule matches.
- API, Opportunity Detail (Candidate Businesses → Matched Businesses → Reasons) + Business Match detail page.
- Documentation ([44](44-business-candidate-engine.md)–[47](47-business-match-lifecycle.md)) and [ADR-013](adr/ADR-013-business-candidate-generator.md)/[ADR-014](adr/ADR-014-business-matching-engine.md).

## Scope

**In scope**

- Deterministic pipeline: Opportunity → Candidate Generator → Business Matcher → Business Match.
- Business Match persistence with UNIQUE `(opportunity_id, business_id)` (one match per pair); idempotent run.
- Decision (MATCH/NO_MATCH) + reasons array; zero/one/many matches per Opportunity, each distinct, never silently chosen.

**Out of scope**

- AI / ML / embeddings / vector or semantic search; score / confidence.
- Comment Drafts, Telegram, comment, Facebook write/message, notification, approval, recommendation, auto-selection.
- The Business Match has no downstream consumer — the pipeline ends at Business Match.

The full exclusion list is in [not-doing.md](not-doing.md).

## Status

**Complete (not committed).**

The engine reads accepted Opportunities, generates candidate businesses (those assigned to the Signal's group), runs the pure matcher against each candidate's active rules, and stores a Business Match — as three single-responsibility modules where the CandidateGenerator and Matcher are pure (no DB, no AI), the MatchRepository is the only DB boundary, and the Coordinator runs the pipeline and enforces ownership. Matches are `MATCH`/`NO_MATCH` with a rule-by-rule reasons array; there is no score and no confidence. The UNIQUE `(opportunity_id, business_id)` guarantees one match per pair and makes the run idempotent. Only accepted Opportunities are matched; when several businesses match, each is recorded distinctly and none is silently chosen. No AI, no Comment Draft, no Telegram, no Facebook write. The full quality suite passes (lint, typecheck, test — 196 passing, build, format:check, doctor) and `db:status` is green; the flow was verified live against MySQL (run → list/filter → detail → idempotent re-run → cross-workspace 404). No commit was made this sprint. Detail: [sprints/SPRINT-008-business-matching.md](sprints/SPRINT-008-business-matching.md).

## Definition of Done

- [x] Migration `0006` (`business_matches` UNIQUE `(opportunity_id, business_id)`); no AI/telegram/comment/draft/approval/score tables.
- [x] Four modules (CandidateGenerator pure, BusinessMatcher pure, MatchRepository sole DB boundary, Coordinator orchestration).
- [x] Deterministic candidate rule + matching `rules-v1`; Decision + reasons stored; `matcher_version` recorded.
- [x] One (Opportunity, Business) → max one match; idempotent run; only accepted Opportunities matched.
- [x] API + Opportunity Detail (candidates/matched/reasons) + match detail; ownership enforced (404 cross-workspace).
- [x] Tests (196 passing, 23 new: candidate, matcher, repository, coordinator, API, ownership, duplicate).
- [x] Full quality suite + `db:status` green; live runtime verified; Collector/Signals unchanged.
- [x] Documentation + ADR-013/014; no AI/Telegram/Comment/Facebook write. **No commit** made.

## Next

On sign-off, the project proceeds to **SPRINT 009 — AI Draft Generation**: for matched businesses, generate business-specific comment drafts using only that business's context, with prohibited-claim screening and validated structured output (the first AI; AI never posts). See [12-mvp-roadmap.md](12-mvp-roadmap.md).
