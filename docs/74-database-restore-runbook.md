# 74 — Database Restore Runbook

Restore is **never automatic**. Scripts live in `scripts/restore/`.

## Commands

```
pnpm restore:verify   --backup <path>   # checks only, exit 0/1
pnpm restore:dry-run  --backup <path>   # full verification, NO database change
pnpm restore:database --backup <path> --yes   # destructive; guarded
```

## Verification (all must pass)

1. **Path safety** — the backup must resolve **inside** `BACKUP_ROOT`; traversal (`..`), null bytes, and absolute paths outside the root are refused.
2. **Archive present** and its **manifest present**.
3. **Checksum** — the archive’s sha256 must equal the manifest’s.
4. **Version compatibility** — the manifest’s `schemaMigration` must be known to the current code; a newer/unknown version is refused.
5. **Credentials** — `DATABASE_URL` must be present and **not** weak/default.

`verify` and `dry-run` print a step-by-step report; **dry-run never touches the database**.

## Destructive restore (`restore:database`)

Additionally requires:

- verification passed,
- in production (`APP_ENV=production`): **maintenance mode must be engaged** ([79](79-maintenance-mode.md)),
- explicit **`--yes`** confirmation.

The dump is streamed (gunzip → `mysql`) into the container; the password is forwarded via `-e MYSQL_PWD` only. Browser profiles are **never** restored ([75](75-browser-profile-recovery-policy.md)).

## Development-only restore test

```
# 1. Take a fresh dev backup
pnpm backup:database
# 2. Confirm verification + dry-run pass (no DB change)
pnpm restore:verify  --backup /opt/kmkt/backups/social-ai/db-<ts>.sql.gz
pnpm restore:dry-run --backup /opt/kmkt/backups/social-ai/db-<ts>.sql.gz
# 3. (dev only) actually restore into the dev DB
pnpm restore:database --backup /opt/kmkt/backups/social-ai/db-<ts>.sql.gz --yes
# 4. pnpm db:status  &&  pnpm run doctor
```

Never run a destructive production restore outside a planned maintenance window with a verified, fresh backup in hand. See [ADR-029](adr/ADR-029-maintenance-and-lockdown-state.md).
