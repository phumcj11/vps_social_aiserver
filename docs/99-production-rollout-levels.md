# 99 — Production Rollout Levels

**Status:** SPRINT 014 — definition. No level above 0 is activated by this document.

## LEVEL 0 — Private Test
**PASS** (Pilot 0, [91](91-pilot0-closure.md)). One real comment in an operator-owned private test group; recovered to succeeded/verified; zero duplicates.

## LEVEL 1 — Supervised Production
- ≤ 3 groups (one per area: บางแสน / พัทยา / ชะอำ).
- ≤ 3 real comments/day (1/group, 1/business).
- Every draft human-reviewed; every submit explicitly authorized; `prepare_only` before each submit.
- Operator online during any write; no auto-retry; ambiguous → stop for the day; checkpoint/CAPTCHA/restriction → LOCKDOWN.
- Details: [92](92-production-pilot-level1.md).

### Level 1 exit criteria (before Level 2)
- ≥ 7 operating days.
- ≥ 20 genuine Opportunities reviewed.
- ≥ 10 correct Business MATCHes.
- **Zero** wrong-area production comments, **zero** duplicate comments, **zero** unauthorized comments, **zero** unresolved ambiguous executions.
- No account restriction; no checkpoint requiring an unsafe workaround.
- Classifier precision reviewed; operator confirms the Review workflow is practical.
- Backup/restore verified.
- Every comment traceable to Review + Authorization + Action Job.

## LEVEL 2 — Expanded Supervised
Only after Level 1 exit criteria. Possibly 6–10 groups, higher read frequency; **still** Human Review and **still** explicit write authorization.

## LEVEL 3 — Assisted Operations
Future only. **Automatic public-group commenting is NOT implemented in this sprint** and is out of scope until much later, with separate design and approval.

> **SPRINT 016B note:** the Property Match stage sits **upstream** of execution —
> it enriches the AI draft + Human Review with the selected Property (or
> NO_PROPERTY_MATCH). It changes NO write/rollout semantics: Action Jobs still
> derive only from an APPROVED Review, no production Facebook write is enabled,
> and Action Jobs may additionally reference `property_match_id` / `property_id`
> for traceability only. See [sprints/SPRINT-016B](sprints/SPRINT-016B-property-match-pipeline.md).

> **SPRINT 017 note:** owner-facing UX polish only (onboarding checklist, labels,
> readiness click-to-fix, match-summary page, review contact display, improved
> deterministic Mock draft). It changes NO write/rollout semantics: no production
> Facebook write, no new migration, Action Jobs still derive only from an APPROVED
> Review. See [sprints/SPRINT-017](sprints/SPRINT-017-owner-ux-polish.md).
