# 16 — Environment Configuration

**Document status:** SPRINT 001 — Technical Bootstrap
**Applies to:** KMKT Social AI

This document is the authoritative reference for every environment variable used by the project. The tracked [.env.example](../.env.example) is the safe template; developers copy it to a local, gitignored `.env`. **No real secrets appear in `.env.example` or in the repository.**

For each variable: its **purpose**, **safe default**, whether it is a **secret**, the **sprint/phase** it becomes relevant, and **security notes**.

---

## How environment is loaded

- `.env.example` (tracked) documents and defaults every variable in its **safe** state.
- A local `.env` (gitignored) holds developer/runtime values. Never commit it.
- `@kmkt/config` ([packages/config](../packages/config/src/index.ts)) provides a typed, validated foundation with the same safe defaults, coercing booleans/integers. It does not read secrets or connect to anything in this sprint.
- `pnpm run doctor` and a unit test assert the safety-critical defaults have not been weakened.

---

## Variables

### Application

| Variable | Purpose | Safe default | Secret? | Relevant from | Security notes |
| -------- | ------- | ------------ | ------- | ------------- | -------------- |
| `APP_ENV` | Selects the runtime profile (`development` \| `test` \| `production`). | `development` | No | SPRINT 001 | Never run production against development secrets. |

### Ports

| Variable | Purpose | Safe default | Secret? | Relevant from | Security notes |
| -------- | ------- | ------------ | ------- | ------------- | -------------- |
| `WEB_PORT` | Port the web app listens on. | `3000` | No | SPRINT 001 | In Compose, published to `127.0.0.1` only, never `0.0.0.0`. |
| `API_PORT` | Port the API listens on. | `3001` | No | SPRINT 001 | Internal only; not published to the host in Compose. |
| `API_HOST` | Bind address for the API process. | `127.0.0.1` | No | SPRINT 002 | Loopback in dev; `0.0.0.0` only inside the private Compose network. Never bind the API publicly on the host. |

### Database

| Variable | Purpose | Safe default | Secret? | Relevant from | Security notes |
| -------- | ------- | ------------ | ------- | ------------- | -------------- |
| `DATABASE_URL` | Connection string for MySQL. | `mysql://kmkt_social_ai:change_me@127.0.0.1:3306/kmkt_social_ai` | **Yes (in real use)** | SPRINT 002 | Placeholder, not a real credential. Use host `mysql` inside Compose; use `127.0.0.1` for host-run API/migrations (MySQL is published on loopback only, never public). Replace `change_me` locally; never commit the real value. **In production (`APP_ENV=production`) startup REJECTS a weak/default credential** (e.g. `change_me`, `password`, `root`) — SPRINT 012 guard. |
| `MYSQL_DATABASE` | Database name for the MySQL container. | `kmkt_social_ai` | No | SPRINT 002+ | — |
| `MYSQL_USER` | Application DB user created by the container. | `kmkt_social_ai` | No | SPRINT 002+ | — |
| `MYSQL_PASSWORD` | Password for `MYSQL_USER`. | `change_me` | **Yes (in real use)** | SPRINT 002+ | Placeholder only. Set a strong value in local `.env`; never commit. |
| `MYSQL_ROOT_PASSWORD` | MySQL root password for the container. | `change_me_root` | **Yes (in real use)** | SPRINT 002+ | Placeholder only. Set a strong value in local `.env`; never commit. |

### Facebook adapter — all disabled

| Variable | Purpose | Safe default | Secret? | Relevant from | Security notes |
| -------- | ------- | ------------ | ------- | ------------- | -------------- |
| `FACEBOOK_READER_ENABLED` | Enables the read-only scanner. | `false` | No | SPRINT 005 | Must remain `false` until the scanner exists. |
| `FACEBOOK_COMMENT_ENABLED` | Enables the comment executor. | `false` | No | SPRINT 008 | Must remain `false` until commenting is implemented and approved. |
| `FACEBOOK_WRITE_ACTION_ENABLED` | Master switch for any Facebook write. | `false` | No | SPRINT 008 | Hard safety flag. `doctor` fails if this is not `false` in `.env.example`. |
| `FACEBOOK_LOGIN_ENABLED` | Gates the real browser login. | `false` | No | SPRINT 004 | When `false` (default) **no browser launches**; a connection attempt is recorded as `LOGIN_DISABLED`. An operator sets it `true` in a local `.env` only to run the operator-assisted login. Enabling it does NOT permit scanning or commenting. |

### Facebook connection — browser profile & timeouts (SPRINT 004)

| Variable | Purpose | Safe default | Secret? | Relevant from | Security notes |
| -------- | ------- | ------------ | ------- | ------------- | -------------- |
| `BROWSER_PROFILE_ROOT` | Root directory for per-workspace persistent browser profiles. | `storage/browser-profiles` | No | SPRINT 004 | Paths are server-generated per workspace and never returned to clients. Profile contents are gitignored and never committed. |
| `FACEBOOK_CONNECT_TIMEOUT_MS` | Max duration of an interactive connection run. | `180000` (3 min) | No | SPRINT 004 | No infinite retries; the run ends and the state reflects a timeout. |
| `FACEBOOK_VALIDATE_TIMEOUT_MS` | Max duration of a session or **group access** validation run. | `60000` (1 min) | No | SPRINT 004 | Also bounds group access validation (SPRINT 005), which additionally allows one safe retry for a transient navigation failure. |

> **SPRINT 005 (Facebook Groups)** added no new environment variables — group management and access validation reuse `BROWSER_PROFILE_ROOT`, `FACEBOOK_LOGIN_ENABLED` (safety gate), and `FACEBOOK_VALIDATE_TIMEOUT_MS`.

> Facebook **credentials, cookies, OTP secrets, and browser profiles are never environment variables committed to Git.** They live only in secure server-side storage (see [10-playwright-design.md](10-playwright-design.md)). Storage paths under `storage/browser-profiles/` are gitignored.

### Safety guarantees

| Variable | Purpose | Safe default | Secret? | Relevant from | Security notes |
| -------- | ------- | ------------ | ------- | ------------- | -------------- |
| `COMMENT_APPROVAL_REQUIRED` | Requires explicit human approval before any comment. | `true` | No | Always | Must never be `false` in the MVP. Enforced by `doctor`. |
| `GLOBAL_KILL_SWITCH` | Halts all new Facebook write actions. | `true` | No | Always | Defaults ON. Nothing may bypass it. Read by the Action Policy Guard — while on, every Action Job is blocked. |
| `FACEBOOK_WRITE_ACTION_ENABLED` | Enables Facebook write actions. | `false` | No | SPRINT 011 | Read by the Action Policy Guard — while false, every Action Job is blocked. No executor exists this sprint. |
| `FACEBOOK_COMMENT_ENABLED` | Enables the comment executor. | `false` | No | SPRINT 011 | Must remain `false` until commenting is implemented and approved (a later sprint). |

### Action Queue Engine (SPRINT 011)

The Action Queue is a **safe boundary** — it does NOT execute Facebook actions and runs no worker. With these defaults every Action Job is created **blocked** and never executes.

| Variable | Purpose | Safe default | Secret? | Security notes |
| -------- | ------- | ------------ | ------- | -------------- |
| `ACTION_ENGINE_ENABLED` | Enables action execution. | `false` | No | Read by the Action Policy Guard — while false, jobs are blocked. No executor exists this sprint. |
| `ACTION_DEFAULT_MAX_ATTEMPTS` | Retry cap per job (no infinite retries). | `3` | No | Enforced by the queue's retry guard. |
| `ACTION_ALLOWED_TYPES` | Comma-separated allowed action types. | `facebook_comment` | No | Only `facebook_comment` in the MVP; others are rejected. |
| `ACTION_EXECUTION_CONCURRENCY` | Execution concurrency (one attempt at a time). | `1` | No | Must stay `1`; verified by doctor. |

### Safe Execution Foundation (SPRINT 012)

The execution foundation is exercised only through the deterministic **fake** adapter — no real Facebook write ships this sprint. Under these defaults every `prepare-execution` is **blocked** and no session is created.

| Variable | Purpose | Safe default | Secret? | Security notes |
| -------- | ------- | ------------ | ------- | -------------- |
| `FACEBOOK_COMMENT_ADAPTER` | Selects the comment adapter. | `fake` | No | `fake` is the safe default. `playwright` selects the **real gated adapter** ([87](87-real-facebook-comment-adapter.md)); it still refuses to type/submit unless every enablement flag is set **and** the executor grants an explicit one-shot `submit_once` authorization. Doctor asserts `fake` as the safe posture. |
| `PILOT_DRAFT_MODE` | Production draft provider mode (SPRINT 014). | `mock` | No | `mock`/`manual` require a mandatory human rewrite; `external_ai` is refused (not configured). Enables no write. [92](92-production-pilot-level1.md) |
| `PILOT_MAX_GROUPS` / `PILOT_MAX_COMMENTS_PER_DAY` / `PILOT_MAX_COMMENTS_PER_GROUP_PER_DAY` / `PILOT_MAX_COMMENTS_PER_BUSINESS_PER_DAY` / `PILOT_MAX_AMBIGUOUS_PER_DAY` | Level-1 pilot hard limits. | `3` / `3` / `1` / `1` / `1` | No | Enforced by the pilot limit evaluator; advisory, never trigger an action. [96](96-production-pilot-limits.md) |
| `PILOT_WRITE_WINDOW_MAX_SECONDS` / `PILOT_AUTHORIZATION_TTL_SECONDS` | Max bounded write-window length / one-shot authorization TTL. | `300` / `300` | No | Window auto-closes at expiry (never auto-retries); authorization is single-use. [94](94-production-write-window.md), [95](95-production-submit-authorization.md) |
| `FACEBOOK_WRITE_ACTION_ENABLED` | Enables Facebook write actions. | `false` | No | One of the five execution gates; safe default off. |
| `FACEBOOK_COMMENT_ENABLED` | Enables the comment action specifically. | `false` | No | One of the five execution gates; safe default off. |
| `FACEBOOK_COMMENT_EXECUTION_TIMEOUT_MS` | Max time for one execution attempt. | `90000` | No | — |
| `FACEBOOK_COMMENT_VERIFY_TIMEOUT_MS` | Max time for post-submit verification. | `30000` | No | — |
| `FACEBOOK_COMMENT_MAX_ATTEMPTS` | Attempts per job (no blind retries). | `1` | No | Ambiguity never auto-retries. |
| `ACTION_EVIDENCE_RETENTION_DAYS` | Evidence retention window. | `30` | No | Evidence stores opaque storage keys, never secrets. |
| `ACTION_AMBIGUOUS_AUTO_RETRY` | Auto-retry ambiguous outcomes. | `false` | No | Must stay `false`; doctor asserts it. Ambiguity requires human recovery. |
| `PLAYWRIGHT_CONCURRENCY` | Chromium instances at once. | `1` | No | Collector and Comment Executor never share a profile concurrently. |
| `ACTION_CREATE_RATE_LIMIT_MAX` / `_WINDOW_SECONDS` | Rate limit on action creation. | `30` / `60` | No | Per client, per window. |
| `EXECUTION_PREPARE_RATE_LIMIT_MAX` / `_WINDOW_SECONDS` | Rate limit on prepare-execution. | `10` / `60` | No | — |
| `EXECUTION_RECOVER_RATE_LIMIT_MAX` / `_WINDOW_SECONDS` | Rate limit on recover. | `10` / `60` | No | — |

### Operational Hardening (SPRINT 013)

Maintenance and lockdown are toggled at RUNTIME via a persistent state file (`storage/runtime/ops-state.json`) and **survive restart**; the `.env` values below are only the initial fallback, never the source of truth once state exists. No secrets are added here.

| Variable | Purpose | Safe default | Secret? | Security notes |
| -------- | ------- | ------------ | ------- | -------------- |
| `MAINTENANCE_MODE` | Initial maintenance fallback. | `false` | No | Runtime state file is authoritative. |
| `INCIDENT_LOCKDOWN` | Initial lockdown fallback. | `false` | No | Lockdown forces write flags off + kill switch on (effective-safety override). |
| `OPERATIONS_ENABLED` | Enables the operator surface. | `true` | No | When false, `/operations/*` returns 404. |
| `OPERATIONS_OPERATOR_EMAILS` | Comma-separated operator allowlist. | *(empty)* | No | Empty = nobody is an operator; operations locked. Not a secret. |
| `OPERATIONS_RATE_LIMIT_MAX` / `_WINDOW_MS` | Operations endpoint rate limit. | `10` / `60000` | No | — |
| `BACKUP_ROOT` | Backup directory (OUTSIDE the repo). | `/opt/kmkt/backups/social-ai` | No | Never contains secrets; `0700`. |
| `BACKUP_RETENTION_DAILY/WEEKLY/MONTHLY` | Retention tiers. | `7` / `4` / `3` | No | — |
| `BACKUP_STALE_HOURS` | Backup staleness warning. | `26` | No | Surfaced by monitor + `/health/storage`. |
| `LOG_RETENTION_DAYS` / `LOG_MAX_SIZE_MB` | Log rotation. | `7` / `50` | No | — |
| `MONITOR_DISK_WARNING/CRITICAL_PERCENT` | Disk thresholds. | `80` / `90` | No | — |
| `MONITOR_RAM_WARNING/CRITICAL_MB` | Free-RAM thresholds. | `700` / `350` | No | Lower is worse. |
| `MONITOR_SWAP_WARNING/CRITICAL_PERCENT` | Swap thresholds. | `25` / `60` | No | — |
| `MONITOR_LOAD_WARNING/CRITICAL` | Load-average thresholds. | `1.5` / `2.5` | No | — |
| `OPERATIONS_STATE_FILE` | Persistent maintenance/lockdown state. | `storage/runtime/ops-state.json` | No | Gitignored; `0600`; no secrets. |

### Concurrency (conservative for the VPS)

| Variable | Purpose | Safe default | Secret? | Relevant from | Security notes |
| -------- | ------- | ------------ | ------- | ------------- | -------------- |
| `PLAYWRIGHT_CONCURRENCY` | Max simultaneous browser actions. | `1` | No | SPRINT 005 | Must stay `1` in the MVP (2-core host). Enforced by `doctor`. |
| `SCANNER_CONCURRENCY` | Max simultaneous scans. | `1` | No | SPRINT 005 | Must stay `1`. |
| `COMMENT_CONCURRENCY` | Max simultaneous comment jobs. | `1` | No | SPRINT 008 | Must stay `1`. |

### External integrations — disabled

| Variable | Purpose | Safe default | Secret? | Relevant from | Security notes |
| -------- | ------- | ------------ | ------- | ------------- | -------------- |
| `AI_ENABLED` | Enables a **real** external AI provider. When `false` (default) a real provider REFUSES to run; the deterministic Mock is used. | `false` | No | SPRINT 009 | Provider keys are secrets, never committed. A draft is never posted or sent regardless. |
| `TELEGRAM_ENABLED` | Enables the Telegram **Review Adapter** transport. When `false` (default) the adapter transport refuses to send and delivery is skipped best-effort; the Review Engine works regardless. | `false` | No | SPRINT 010 | No bot connected this sprint. Bot token (future) is a secret, never committed. A review decision never posts to Facebook regardless. |
| `N8N_ENABLED` | Enables n8n orchestration. | `false` | No | SPRINT 005+ | n8n is internal only; never publicly exposed. |

### AI Draft Engine (SPRINT 009)

The engine produces **DRAFT ONLY** comment suggestions; a draft is never sent to Telegram, never posted to Facebook, and never triggers a write action. AI is disabled by default and the deterministic Mock provider is used for tests and local use.

| Variable | Purpose | Safe default | Secret? | Security notes |
| -------- | ------- | ------------ | ------- | -------------- |
| `AI_PROVIDER` | Which provider to use (`mock` or a real provider name). | `mock` | No | Non-`mock` resolves to a boundary that refuses while `AI_ENABLED=false`. |
| `AI_MODEL` | Model identifier (mock value when AI is disabled). | `mock-draft-v1` | No | — |
| `AI_PROMPT_VERSION` | Prompt rule-set version recorded on each draft. | `rules-v1` | No | — |
| `AI_DRAFT_MAX_LENGTH` | Maximum draft length (characters). | `500` | No | Enforced by the policy checker (over-length → BLOCK). |
| `AI_CONTEXT_MAX_KNOWLEDGE_ITEMS` | Max knowledge entries in the context. | `20` | No | Bounds context size. |
| `AI_CONTEXT_MAX_CHARACTERS` | Max total context characters. | `12000` | No | Bounds context size. |

**Future real-provider secrets (documented, never populated in `.env.example`):** `ANTHROPIC_API_KEY` (real provider key), `AI_PROVIDER_BASE_URL` (optional endpoint override). Supply these only via the gitignored `.env`, and only after `AI_ENABLED` is intentionally set. No real API key is ever committed.

### Authentication, sessions & cookies (SPRINT 002)

| Variable | Purpose | Safe default | Secret? | Relevant from | Security notes |
| -------- | ------- | ------------ | ------- | ------------- | -------------- |
| `SESSION_COOKIE_NAME` | Name of the session cookie. | `kmkt_session` | No | SPRINT 002 | — |
| `SESSION_TTL_HOURS` | Session lifetime in hours. | `168` (7 days) | No | SPRINT 002 | Also sets the cookie Max-Age. |
| `SESSION_COOKIE_SECURE` | Whether the cookie carries the `Secure` attribute. | `false` (dev) | No | SPRINT 002 | Automatically forced **on** when `APP_ENV=production`. |
| `PASSWORD_MIN_LENGTH` | Minimum password length on registration. | `10` | No | SPRINT 002 | Enforced server-side. |

### CORS & rate limiting (SPRINT 002)

| Variable | Purpose | Safe default | Secret? | Relevant from | Security notes |
| -------- | ------- | ------------ | ------- | ------------- | -------------- |
| `WEB_ORIGIN` | The single web origin allowed to call the API with credentials. | `http://localhost:3000` | No | SPRINT 002 | Never a wildcard — especially in production. Also used by the CSRF Origin guard. |
| `AUTH_RATE_LIMIT_MAX` | Max register/login requests per window. | `10` | No | SPRINT 002 | Applied only to `/auth/register` and `/auth/login`. |
| `AUTH_RATE_LIMIT_WINDOW_SECONDS` | Rate-limit window in seconds. | `900` (15 min) | No | SPRINT 002 | — |

### Web app (public, build-time) (SPRINT 002)

| Variable | Purpose | Safe default | Secret? | Relevant from | Security notes |
| -------- | ------- | ------------ | ------- | ------------- | -------------- |
| `NEXT_PUBLIC_API_BASE_URL` | Base URL the browser uses to reach the API. | `http://localhost:3001` | No | SPRINT 002 | `NEXT_PUBLIC_*` is inlined into the client bundle at build — never put secrets in it. |

### Retention & logging

| Variable | Purpose | Safe default | Secret? | Relevant from | Security notes |
| -------- | ------- | ------------ | ------- | ------------- | -------------- |
| `SCREENSHOT_RETENTION_DAYS` | Days to keep screenshot evidence. | `30` | No | SPRINT 009 | Screenshots stored under gitignored `storage/screenshots/`. |
| `LOG_LEVEL` | Minimum log level (`debug` \| `info` \| `warn` \| `error`). | `info` | No | SPRINT 001 | Avoid logging secrets or PII at any level. |

---

## Future secret variables (not present yet)

These will be added in the sprint indicated and will always be secrets — never committed, supplied only via local `.env` or a secret manager:

- `TELEGRAM_BOT_TOKEN` (SPRINT 007)
- AI provider API key(s) (SPRINT 006)
- Any Facebook session material — handled as secure server-side storage, **not** as committed env values (SPRINT 004+).

---

## Security rules for environment configuration

1. `.env` is always gitignored; only `.env.example` (safe, no secrets) is tracked.
2. Placeholders (`change_me`, `change_me_root`) must be replaced locally and never committed as real values.
3. Safety flags (`GLOBAL_KILL_SWITCH`, `COMMENT_APPROVAL_REQUIRED`, all `FACEBOOK_*`, `ACTION_ENGINE_ENABLED=false`, `FACEBOOK_COMMENT_ADAPTER=fake`, `ACTION_AMBIGUOUS_AUTO_RETRY=false`, concurrency = 1) are verified by `pnpm run doctor`; weakening them fails the check.
4. Secrets never appear in logs, screenshots, the frontend, n8n workflows, or Docker images.
5. Facebook credentials/cookies/profiles are never environment variables in Git — they are secure server-side storage only.
6. In production, startup **rejects** a weak/default `DATABASE_URL` credential (SPRINT 012); doctor warns when `.env` still carries a placeholder.
