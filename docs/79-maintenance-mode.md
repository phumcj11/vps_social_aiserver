# 79 — Maintenance Mode

Maintenance mode takes the system out of normal-user service for a planned window (migration, restore, upgrade) while keeping operators able to work.

## State

Persisted in a runtime **state file** (`OPERATIONS_STATE_FILE`, default `storage/runtime/ops-state.json`) — **not** only `.env`, so it **survives a process restart**. The `.env` `MAINTENANCE_MODE` is only the initial fallback. Every change records operator, reason, and timestamp, is audited, and appears in the state history (no silent disablement).

## Behavior when enabled

Rejected (via a single request hook, HTTP 503 `maintenance_mode`):

- new **Collector** runs,
- new **AI Draft** generation,
- new **Review Tasks**,
- new **Action Jobs**,
- **execution preparation** (and dry-run).

Still available:

- **login** (so an operator can act),
- **health** endpoints,
- **backup and restore** commands,
- the **operations** surface itself (to disable maintenance).

Any existing active browser work should be cancelled safely by the operator before/at the window (there is no auto-resume). Maintenance makes **no direct Facebook contact**.

## Commands & API

```
pnpm maintenance:enable  --operator <email> --reason "<why>" --yes
pnpm maintenance:disable --operator <email> --reason "<why>" --yes
pnpm maintenance:status
```

`POST /operations/maintenance/enable|disable` (operator-only, CSRF, rate-limited) require `{ reason, confirm: true }`. Enabling/disabling is explicit and auditable.

See [ADR-029](adr/ADR-029-maintenance-and-lockdown-state.md) and [80](80-incident-lockdown.md).
