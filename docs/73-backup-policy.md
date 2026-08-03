# 73 — Backup Policy

Backups are compressed, checksummed, manifested, and stored **outside the repo** under `BACKUP_ROOT` (default `/opt/kmkt/backups/social-ai`) with restrictive permissions. Scripts live in `scripts/backup/`.

## Commands

```
pnpm backup:database   # schema + data, single-transaction, gzipped
pnpm backup:config     # safe operational config only (allowlist)
pnpm backup:audit      # audit-relevant tables only
pnpm backup:all        # database + config + audit
pnpm backup:verify     # re-hash every archive vs its manifest
pnpm backup:list       # inventory + [STALE] flags
pnpm backup:cleanup    # retention (dry-run; --apply to delete)
```

## Guarantees

- **mysqldump** with `--single-transaction` (consistent snapshot) → **gzip**.
- **Timestamped** names (`db-YYYYMMDD-HHMMSS.sql.gz`), a `.sha256` checksum, and a `.manifest.json` (kind, createdAt, bytes, sha256, appVersion, gitCommit, gitTag, schemaMigration).
- **No password in argv or logs** — the DB password is forwarded to the container via `-e MYSQL_PWD` (value from the child environment only), read from `DATABASE_URL`.
- **Fail closed**; **never overwrite** an existing backup; files are `0600`, the root `0700`.

## What is NEVER backed up

`.env` plaintext, GitHub credentials, AI keys, Telegram tokens, Facebook passwords, raw cookies, **browser-profile contents** ([75](75-browser-profile-recovery-policy.md)), and SSH keys. Config backup uses a strict allowlist (`.env.example`, migrations, compose, docs, version metadata). Audit backup exports only `action_events`, `action_execution_sessions`, `action_execution_evidence` (storage keys only, no secrets), `review_events`, `ai_draft_events`, `business_matches`, `opportunity_events`, `collector_runs`.

## Retention

Newest **7 daily**, **4 weekly**, **3 monthly** distinct buckets are kept (`classifyRetention`); everything else is eligible for cleanup. `cleanup` is dry-run by default. A backup older than `BACKUP_STALE_HOURS` (26h) is flagged **stale** by `list`, monitoring, and `/health/storage`.

## Scheduling

Not auto-scheduled this sprint. A safe local cron/systemd timer may be added later and must ship **disabled by default**. See [ADR-024]… n/a — restore is in [74](74-database-restore-runbook.md).
