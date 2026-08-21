# 118 — Property Match Persistence

**Status:** SPRINT 016B — SHIPPED. Additive migration `0013` adds the
`property_matches` table (and four nullable snapshot columns to `review_tasks`);
no destructive SQL, Pilot data preserved.

## Table `property_matches`

One deterministic result per **Business Match**: either the selected Property
(`decision = MATCH`, `property_id` set) or a single NO_PROPERTY_MATCH row
(`decision = NO_MATCH`, `property_id = NULL`). Never a fabricated Property.

| column | type | notes |
|---|---|---|
| `id` | varchar(36) PK | app UUID |
| `workspace_id` | varchar(36) FK→workspaces | workspace-safe |
| `opportunity_id` | varchar(36) FK→opportunities | funnel join key |
| `business_match_id` | varchar(36) FK→business_matches | the parent stage |
| `business_id` | varchar(36) FK→businesses | |
| `property_id` | varchar(36) FK→properties, **nullable** | NULL ⇒ NO_PROPERTY_MATCH |
| `decision` | varchar(10) | `MATCH` \| `NO_MATCH` |
| `reasons` | text (JSON) | `{ reasons[], rejected[], requirement{} }` — labels/flags only, no secrets |
| `matcher_version` | varchar(40) | e.g. `property-rules-v1` (independent of the Business `matcher_version`) |
| `candidates_evaluated` | int | active Properties evaluated for this Business Match |
| `evaluated_at`, `created_at` | timestamp | |

## Idempotency

A **unique index on `business_match_id`** guarantees at most one Property result
per Business Match. The coordinator also checks `getPropertyMatchByBusinessMatch`
before evaluating, and the Business-match stage's own dedup means a re-run skips
the whole match. Deterministic: identical inputs → identical row.

## Indexes

`workspace_id`, `opportunity_id`, `business_id`, `property_id`, and
`(workspace_id, decision)` — supporting the list endpoints and the operations
funnel aggregate. See [ADR-040](adr/ADR-040-property-match-persistence.md).
