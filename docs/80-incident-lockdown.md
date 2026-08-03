# 80 — Incident Lockdown

Incident lockdown is the emergency brake: engage it the moment anything looks wrong with Facebook access, execution, or an account. It is stricter than maintenance.

## State

Persisted in the same runtime **state file** as maintenance ([79](79-maintenance-mode.md)); survives restart; `.env` `INCIDENT_LOCKDOWN` is only the initial fallback. Every change records operator, reason, and timestamp and is audited.

## Behavior when enabled

- **All Facebook access blocked** — Collector, connection validation, group validation, and Action execution (prepare/dry-run) are rejected (HTTP 423 `incident_lockdown`).
- **AI Draft generation** is blocked too (optional per spec; we block it).
- The **Telegram adapter** stays inert (already disabled).
- **All write flags are treated as false and the kill switch is treated as on** — the effective-safety override forces `actionEngine/write/comment = false`, `killSwitch = true` regardless of configuration, so even a mis-set flag cannot post.
- **Operator health and audit access remain available.**

## Commands & API

```
pnpm incident:lockdown --operator <email> --reason "<why>" --yes
pnpm incident:unlock   --operator <email> --reason "<why>" --yes
pnpm incident:status
```

`POST /operations/lockdown/enable|disable` (operator-only, CSRF, rate-limited).

## Unlock discipline

Unlock **must** require: explicit confirmation (`confirm: true` / `--yes`), a **reason**, the **operator identity**, and it writes an **audit event**. There is **no automatic unlock** — a human decides the incident is resolved. See [ADR-029](adr/ADR-029-maintenance-and-lockdown-state.md) and [83](83-incident-response.md).
