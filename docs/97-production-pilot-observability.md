# 97 — Production Pilot Observability

**Status:** SPRINT 014. Read model: `apps/api/src/production/observability.ts` (`buildPilotDashboard`). Surfaced in the Operations UI ([settings/operations](../apps/web/app/settings/operations/page.tsx)).

A single safe, aggregated snapshot for the operator — built from counts the repositories already expose. **No heavy monitoring stack**; it reuses the existing operational architecture. It contains **no** cookies, credentials, profile paths, or session data.

## Today

groups scanned · Collector runs · posts inspected · Signals created · duplicates skipped · Opportunities ACCEPT/REJECT · Business MATCH/NO_MATCH · Drafts · Reviews pending/approved/rejected · Action Jobs blocked/queued/succeeded/failed/ambiguous · comments verified · duplicate-prevention events.

## Runtime safety state

profile-lock state · current Write Window (and expiry) · kill-switch state · Facebook session status · last verified backup · last successful comment verification · comments used today / remaining · ambiguous count · `writesStoppedForDay`.

## Derivation

`buildPilotDashboard` computes `commentsUsedToday`, `commentsRemainingToday`, `ambiguousToday`, and `writesStoppedForDay` (true when the daily comment limit is hit, an ambiguous execution occurred, or the window is in LOCKDOWN). The raw counts come from the Collector / Opportunity / Matching / Review / Action / Execution repositories via a read-only aggregation; wiring the live query is a follow-up integration (the pure read model and its shape are defined and tested here).
