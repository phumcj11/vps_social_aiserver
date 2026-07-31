# 20 — Database Foundation

**Document status:** SPRINT 002 — Authentication & Workspace
**Applies to:** KMKT Social AI
**Date:** 2026-07-30

This document describes the database foundation: MySQL 8 (Docker only), Drizzle ORM, the schema, migrations, and the database commands. Only the three tables needed for authentication and workspaces exist — **no Business tables yet**.

---

## Technology

- **MySQL 8** — runs only as a Docker Compose service. Not installed on the host.
- **Drizzle ORM** (`drizzle-orm`) with the **mysql2** driver — parameterised queries provide SQL-injection protection.
- **Drizzle Kit** — generates and applies SQL migrations.
- **tsx** — runs the TypeScript migration/status/reset scripts.

MySQL is **never publicly exposed**. In development it is published on the host **loopback only** (`127.0.0.1:3306`) so host-run migrations/tools can connect; it never binds a public interface. Inside Compose, services reach it at host `mysql` on the private network.

---

## Schema

Three tables (`apps/api/src/db/schema.ts`). Primary keys are application-generated UUIDs (`varchar(36)`). Rows are never deleted; soft `status` fields only. Every table carries safe timestamps.

### users
| Column | Type | Notes |
| ------ | ---- | ----- |
| `id` | varchar(36) PK | UUID |
| `email` | varchar(255) | **unique**, normalised (lowercase) |
| `password_hash` | varchar(255) | scrypt hash; never returned |
| `status` | varchar(20) | default `active` |
| `created_at` | timestamp | defaults to now |
| `updated_at` | timestamp | now, on update |

### sessions
| Column | Type | Notes |
| ------ | ---- | ----- |
| `id` | varchar(36) PK | UUID |
| `user_id` | varchar(36) | FK → `users.id`, indexed |
| `session_token_hash` | varchar(64) | **unique**; SHA-256 of the opaque token (raw token never stored) |
| `expires_at` | datetime | session expiry |
| `created_at` | timestamp | defaults to now |
| `last_seen_at` | datetime | updated on each authenticated request |
| `revoked_at` | datetime | set on logout; null while active |

### workspaces
| Column | Type | Notes |
| ------ | ---- | ----- |
| `id` | varchar(36) PK | UUID |
| `owner_user_id` | varchar(36) | FK → `users.id`, **unique** → one workspace per user |
| `name` | varchar(120) | required |
| `slug` | varchar(140) | **unique** |
| `status` | varchar(20) | default `active` |
| `created_at` | timestamp | defaults to now |
| `updated_at` | timestamp | now, on update |

Uniqueness enforced at the DB level: `users.email`, `sessions.session_token_hash`, `workspaces.owner_user_id`, `workspaces.slug`.

---

## Migrations

- Schema is the source of truth; migrations are generated from it with Drizzle Kit and committed under `apps/api/drizzle/`.
- The first migration (`0000_*.sql`) creates the three tables, their indexes, unique constraints, and foreign keys.
- Migrations are applied with `pnpm db:migrate` (which uses the Drizzle mysql2 migrator). Applied migrations are tracked in the `__drizzle_migrations` table.

---

## Connection module

`apps/api/src/db/client.ts` creates a small mysql2 connection **pool** (conservative size for the 2-core / 3.8 GiB host) and a Drizzle client. It also provides `checkDbHealth(db)`, used by the API's `GET /health/db` endpoint (a trivial `SELECT 1`).

---

## Commands

| Command | Effect |
| ------- | ------ |
| `pnpm db:generate` | Generate a new SQL migration from the schema (no DB needed). |
| `pnpm db:migrate` | Apply pending migrations to MySQL. |
| `pnpm db:status` | Report connectivity, applied migrations, and known tables; exits non-zero if unreachable. |
| `pnpm db:reset:development` | **Development-only** reset (drop + re-migrate). Refuses to run if `APP_ENV=production`, and requires explicit confirmation (`CONFIRM_DB_RESET=YES` or `--yes`). Never runs in production. |

CLI scripts load a local `.env` (dependency-free loader) without overriding existing environment values.

---

## Runtime verification (this sprint)

MySQL was started via Compose, migrations applied, and `db:status` reported: **reachable, 1 migration applied, tables `sessions, users, workspaces`**. The full register → login → workspace create/edit → logout flow was verified against the live database.

---

## Out of scope (this sprint)

Business, Business Profile, Platform Account, Facebook Group, Post, Match, Comment, and all other domain tables ([06-domain-model.md](06-domain-model.md)) — added in later sprints.
