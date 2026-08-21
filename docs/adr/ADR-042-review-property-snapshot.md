# ADR-042 — Review Property Snapshot (Immutability)

**Status:** Accepted (Sprint 016B).

## Context

A Draft is built from a specific Property + policies + contacts at a point in
time. Owners keep editing Properties. A review decision must reflect what the
reviewer actually saw — a later Property edit must not silently change an
already-created Review/Draft.

## Decision

At Review creation, snapshot `business_id`, `property_id`, `property_match_id`,
and a `context_hash` (sha256 of the draft `inputSnapshot`) onto `review_tasks`
(additive nullable columns). The review detail prefers the snapshotted
`property_id`; it also loads the live Property for display, clearly distinct from
the frozen snapshot. Human actions remain APPROVE / EDIT / REJECT with no
auto-approval.

## Consequences

- Auditability: the review preserves the exact context hash even after Property
  edits (proven by `review/property-snapshot.test.ts`).
- Action Jobs can reference `property_match_id` / `property_id` for traceability;
  Facebook execution semantics are unchanged and no write ships this sprint.
