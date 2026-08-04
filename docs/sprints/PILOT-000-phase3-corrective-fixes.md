# PILOT 0 — Phase 3 Corrective Fixes

- **Type:** Bug-fix (two Pilot blockers). No new features.
- **Date:** 2026-08-04
- **Branch:** `feature/pilot0-classifier-dedup-fix`
- **Owner:** Principal Architect / SRE

---

## Context

Pilot 0 Phase 3 (real, read-only Collector validation over six pilot groups) passed as **PARTIAL_PASS**: read-only collection worked (6 groups, 9 signals, correct groups, clean Thai, no writes), but two blockers stopped the loop.

## Fix 1 — Opportunity Classifier accepted ads, rejected customers

`rules-v1` decided on structural completeness (text, min length, **author**, URL) with no notion of intent, so it accepted advertiser listings and rejected genuine "หาที่พัก…" seekers (which often lack an author and are short).

**`rules-v2`** now decides on **customer demand**, deterministically (no AI, no score): structural gate, then intent analysis (`opportunity/intent.ts`) distinguishing customer search verbs / availability questions from advertiser / owner / agent / property-code language. New reason codes (`CUSTOMER_SEARCH_INTENT`, `PROPERTY_CODE_ONLY`, `ADVERTISER_LANGUAGE`, `OWNER_OR_AGENT_LISTING`, `INTENT_AD_CONFLICT`, …). Detail: [85-pilot0-classifier-correction.md](../85-pilot0-classifier-correction.md).

A safe reclassification path (`pnpm opportunity:reclassify`) re-evaluates existing Opportunities in place — one per Signal — recording an `OpportunityReclassified` event that preserves the prior decision; earlier events are never rewritten; no destructive SQL.

## Fix 2 — Duplicate posts surfaced as REPOSITORY_ERROR

`persistSignal` did not guard the normalized-Signal insert or catch a duplicate-key race, so a duplicate (pinned post rendered twice; re-run) aborted the group. It is now idempotent — pre-checks URL / post-id / hash, catches the unique-constraint race, returns `{ inserted:false }`, counts `duplicatesSkipped` (migration `0011`), and continues. A genuine DB error still raises `REPOSITORY_ERROR` with a safe code only. Detail: [86-collector-duplicate-handling.md](../86-collector-duplicate-handling.md).

## Tests

- Classifier `rules-v2`: 28 cases (customer intent, advertiser, property-code, agent/on-behalf, conflict, structural, whitespace/emoji, idempotency).
- Collector dedup: 6 cases (same URL, same post-id, hash, race, continue-after-duplicate, never-rewrite).
- Existing opportunity behavioural fixtures updated from English placeholders to Thai accommodation intent (no safety tests regressed).

## Targeted runtime verification (no Facebook for classifier)

- Reclassified the 9 Pilot signals: **6→2 ACCEPT / 3→7 REJECT** (8 changed); the two accepted are the genuine seekers; `rules-v2`; 9 reclassification events recorded; 9 original events preserved.
- Deterministic matching: **1 MATCH** (Bangsaen intent → บางแสน Test), **0 wrong-area**, 1 NO_MATCH (Cha-am seeker omitted the area word — correct).
- **1 Mock AI Draft** generated (provider mock, policy PASS). No Review Task, no Action Job, no external AI.
- Cha-am Pilot 2 read-only retest: **completes with no `REPOSITORY_ERROR`**, lock released, no Facebook write.

## Acceptance

- [x] Customer-intent classifier corrected; advertiser posts rejected.
- [x] Duplicate posts handled gracefully (no `REPOSITORY_ERROR`); race-safe; `duplicatesSkipped` reported.
- [x] Cha-am retest completes cleanly; ≥1 correct MATCH; wrong-area = 0; ≥1 Mock draft.
- [x] No Facebook write, no external AI, safety flags unchanged.
- [x] `lint | typecheck | test | build | format:check | doctor | db:status` pass. **No commit/push** (operator-controlled).
