# 75 — Browser-Profile Recovery Policy

A Facebook browser profile contains **live session material** (cookies, localStorage). It is the single most sensitive artifact in the system and is treated accordingly (ADR-028).

## Policy

- Browser profiles **must not enter normal backups** — they are excluded from `backup:*` entirely.
- Browser profiles **must never be uploaded to GitHub** (`storage/browser-profiles/` is gitignored except a `.gitkeep`).
- Browser-profile contents **must never be copied to logs or evidence**. Evidence stores opaque storage keys only.
- **Automatic cross-server restore is forbidden.** A profile is bound to the machine that created it.
- **Account reconnect is the default recovery method.** If a profile is lost, corrupt, or expired, the operator reconnects the account (operator-assisted login) — we do not restore session material.
- **Optional encrypted offline backup is future scope only** and requires explicit, audited operator authorization; it is not implemented this sprint.
- **Profile corruption → `reconnect_required`.** The connection state moves to `reconnect_required` and the operator must reconnect.
- **Profile deletion is controlled and auditable** — only via the explicit disconnect flow, which removes the whole workspace profile directory and audits the action.

## Safe diagnostics

```
pnpm facebook:profile:status --workspace <uuid>
pnpm facebook:profile:verify --workspace <uuid>
```

These report **only** safe status: whether a profile exists, whether it is locked and for how long, and the DB connection state. They **never** print cookies, localStorage, profile paths, or credentials. `verify` flags a **stale lock** (older than the execution timeout → a crashed execution to investigate) and a `reconnect_required` state.

See [ADR-028](adr/ADR-028-browser-profile-reconnect-over-backup.md) and [83](83-incident-response.md).
