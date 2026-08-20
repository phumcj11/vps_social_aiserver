# 92 — Production Pilot Level 1 (Supervised)

**Status:** SPRINT 014 — definition only. **No production writes are enabled by this document.**

Level 1 is a SMALL, human-supervised production pilot against real accommodation-seeking groups. Every draft is human-reviewed; every submit is explicitly authorized and preceded by a live `prepare_only`; the operator is online during any write.

## Scope

- **Areas (exactly 3):** บางแสน, พัทยา, ชะอำ.
- **Groups:** **one validated group per area, max 3 total** — NOT all six existing groups. Selection is a recommendation only (see [group selection](#group-selection)); it enables nothing.
- **Businesses:** real, production-ready Businesses only ([93](93-production-business-readiness.md)). Test Businesses (`บางแสน Test` / `พัทยา Pool Villa Test` / `ชะอำ Pool Villa Test`) are **never** used for production comments.
- **Draft mode:** `mock` or `manual`, always with a mandatory human rewrite; `external_ai` is **not** configured this sprint ([env `PILOT_DRAFT_MODE`](16-environment-configuration.md)).

## Pipeline (unchanged, all gates retained)

Facebook read → Signal → Opportunity (rules-v2) → Candidate Generation → Business Matching → Draft → **Human Review (mandatory)** → Action Queue (BLOCKED by default) → **prepare_only** → **explicit one-shot authorization** → **submit_once inside an OPEN write window** → post-submit verification → idempotency → recovery.

## Group selection

`recommendPilotGroups` (apps/api/src/production/group-selection.ts) recommends at most one group per area that meets **every** criterion: connected account has access; genuine accommodation-seeking posts; stable Collector parsing; group rules do not prohibit business responses; manageable post volume; no checkpoint/CAPTCHA history; stable access. It only recommends — it activates no writes.

## Hard invariants

- No automatic execution; no scheduled execution; no batch; no auto-retry; no ambiguous retry.
- Max one queued production Action Job at a time; concurrency = 1; Playwright concurrency = 1.
- Duplicate-comment precheck + `prepare_only` immediately before every production submit.
- Fresh verified backup before the write window; operator explicitly opens and closes the window.
- Daily limits enforced ([96](96-production-pilot-limits.md)); an ambiguous execution stops writes for the day; checkpoint/CAPTCHA/restriction → LOCKDOWN.
- **No Execute-Now API/UI.**

Exit criteria to Level 2 are in [99](99-production-rollout-levels.md#level-1-exit-criteria).
