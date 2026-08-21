# SPRINT 016B — Property Match Pipeline, Draft Context & Human Review Integration

**Base:** main `2aa89230` / tag `v1.2.0-business-property-self-service`.
**Branch:** `feature/s016b-property-match-pipeline`.

## Mission

Wire persisted Property data into the real pipeline:
`Opportunity → Business Candidate → Business Match → Property Candidates →
Property Match → Draft Context → Draft → Human Review`. **No production Facebook
write; no external AI; no Telegram; no Collector/Executor.**

## Delivered

- **Persistence** — additive migration `0013`: `property_matches` table +
  four nullable snapshot columns on `review_tasks`. Applied; Pilot data preserved
  (14 migrations, job `2a85a0dd…` still `succeeded`). Docs [118], ADR-040.
- **Candidate generator** — active, same-Business, same-Workspace only. Doc [119].
- **Deterministic matcher + ranking** — `property-selection.ts`
  (`property-rules-v1`): requirement parser, per-candidate evaluation, strict
  ranking with stable tie-break, NO_PROPERTY_MATCH. Docs [120], ADR-041.
- **Coordinator wiring** — a Property stage runs after each Business MATCH,
  persisting one deterministic result; idempotent; funnel counters in the run
  summary.
- **Draft context** — selected Property + effective policies + approved contacts
  wired into `BusinessContextBuilder`; prompt `rules-v2-property`; policy checker
  enforces `mustNotClaim` (availability/price/promotion/capacity), approved-only
  contacts, and NO_PROPERTY_MATCH → NEEDS_REVIEW. Docs [121]/[123].
- **Human Review** — read model shows Property match, selected Property, and
  Thai-first warnings; immutable snapshot (business/property/property-match ids +
  context hash) frozen at creation. Docs [122], ADR-042.
- **API** — `GET /property-matches`, `GET /property-matches/:id`,
  `GET /property-matching/funnel`; review detail extended. All auth +
  workspace-scoped + cross-workspace 404.
- **Frontend** — review page renders the Thai property-match card + warnings.
- **Operations** — funnel aggregate (MATCH/NO_MATCH, candidates, distinct
  properties, gap, top NO_MATCH reasons). Doc [124].

## Tests

+34 tests (597 total, all green): `property-selection`, `property-pipeline`,
`property-e2e` (synthetic Opportunity→…→Review), `ai/property-draft-context`,
`review/property-snapshot`, plus updated fixtures.

## Verification

`lint`/`typecheck`/`test`/`build`/`format:check`/`doctor`/`db:status` all pass.
Runtime pipeline verified with synthetic data (the canonical Bangsaen scenario:
Villa A capacity-fail, Villa B MATCH, Villa C area-fail → selected Villa B). No
Facebook contact, no execution, no external AI.

## Safety

`GLOBAL_KILL_SWITCH=true`, `AI_ENABLED=false`, `AI_PROVIDER=mock`,
`TELEGRAM_ENABLED=false`, `N8N_ENABLED=false`, comment adapter `fake`. Pilot
execution state untouched. Migration additive only.
