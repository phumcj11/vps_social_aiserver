# 76 — Logging and Log Rotation

## Logging policy

All application logs are **structured JSON** (`lib/logger.ts`) written to stdout and, where files are used, under `storage/logs/` (gitignored). Logs must **never** contain: passwords, cookies, session tokens, profile paths, AI API keys, Telegram tokens, raw credentials, hidden prompts, or private DOM dumps. The `AuditService` additionally redacts a forbidden-key set before persisting audit events.

Covered streams: **API**, **Web**, **Collector**, **Action execution**, **Audit export**, and **backup** logs.

## Rotation

Project-local rotation is preferred over touching global host config. Defaults (env-tunable):

- rotate **daily**, keep **7** daily files (`LOG_RETENTION_DAYS`),
- **compress** rotated logs,
- **max size per file** `LOG_MAX_SIZE_MB` (50 MB),
- safe permissions, **no indefinite growth**.

## Commands

```
pnpm logs:status          # inventory of storage/logs (sizes, gz)
pnpm logs:rotate:dry-run  # what WOULD be compressed/deleted — no changes
pnpm logs:verify          # scan for secret-shaped lines; reports COUNT only, never the line
```

`logs:verify` fails (exit 1) if any line matches a secret pattern (API keys, tokens, private keys, credential-looking assignments, profile paths) — the offending content is **never printed**, only counted.

## Host rotation (optional, documented)

If system-level rotation is desired, install a project-local `logrotate` fragment (a template ships in the repo docs); do **not** modify global host rotation unless necessary. See [77](77-health-and-monitoring.md) for log-storage growth monitoring.
