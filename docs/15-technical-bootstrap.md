# 15 — Technical Bootstrap

**Document status:** SPRINT 001 — Technical Bootstrap
**Applies to:** KMKT Social AI development foundation
**Date:** 2026-07-30

This document records the technical foundation established in SPRINT 001. It is documentation of a working, verified scaffold: a monorepo with minimal, non-feature app/worker/package scaffolds, quality tooling, a Docker Compose foundation, and safety defaults. **No product features were implemented** (see the final section).

---

## Installed Tools and Versions

Installed on the host (Ubuntu 24.04.4 LTS, 2 CPU cores, 3.8 GiB RAM) using official methods:

| Tool                  | Version        | Install method                                  |
| --------------------- | -------------- | ----------------------------------------------- |
| Ubuntu                | 24.04.4 LTS    | (host)                                          |
| Git                   | 2.43.0         | pre-installed                                   |
| curl                  | 8.5.0          | pre-installed                                   |
| ca-certificates       | 20260601       | pre-installed                                   |
| Node.js               | 22.23.2 (LTS)  | NodeSource `setup_22.x` apt repository          |
| npm                   | 10.9.8         | bundled with Node.js                            |
| pnpm                  | 11.18.0        | Corepack (`corepack enable`)                    |
| Docker Engine         | 29.6.2         | official Docker apt repository                  |
| Docker Compose plugin | v5.3.1         | official Docker apt repository (`docker compose`) |

Project toolchain (installed via pnpm into the workspace):

| Package            | Version  | Role                          |
| ------------------ | -------- | ----------------------------- |
| TypeScript         | 5.9.3    | types & compilation           |
| Next.js            | 15.5.22  | web framework (App Router)     |
| React / React DOM  | 19.2.8   | web UI runtime                |
| Fastify            | 5.10.0   | API framework                 |
| Vitest             | 3.2.7    | unit testing                  |
| ESLint             | 9.39.5   | linting (flat config)         |
| typescript-eslint  | 8.65.0   | TypeScript lint rules         |
| Prettier           | 3.9.6    | formatting                    |
| Zod                | 3.25.76  | env validation (@kmkt/config) |

**Deliberately NOT installed on the host:** MySQL and nginx (MySQL runs only as a Docker service; nginx is out of scope this sprint).

**Reserved, not installed:** Drizzle ORM (chosen ORM for the schema sprint) and Playwright (chosen browser automation for the worker sprint). These are named in the roadmap but not added as dependencies yet, so nothing browser- or database-related can execute.

---

## Repository Layout

```
kmkt-social-ai/
├── apps/
│   ├── web/                 Next.js App Router scaffold (home + /health page)
│   └── api/                 Fastify scaffold (GET /health, GET /ready)
├── workers/
│   ├── facebook-scanner/    Disabled placeholder (read-only, no Playwright)
│   └── facebook-comment/    Disabled placeholder (write, no Playwright)
├── packages/
│   ├── config/              Typed env validation foundation (Zod, safe defaults)
│   ├── domain/              Empty domain package (no entities yet)
│   ├── shared/              Small shared TS helpers
│   └── logger/              Minimal structured logger (dependency-free)
├── docker/
│   ├── compose/             docker-compose.yml (foundation, not started)
│   ├── api.Dockerfile       API image (foundation)
│   ├── web.Dockerfile       Web image (foundation)
│   ├── worker.Dockerfile    Shared worker image (foundation)
│   ├── mysql/               MySQL runtime assets placeholder
│   └── n8n/                 n8n runtime assets placeholder
├── scripts/
│   ├── doctor/index.mjs     Environment & safety-defaults checker
│   ├── backup/              (reserved)
│   └── development/         (reserved)
├── storage/                 Runtime artefacts (gitignored, .gitkeep only)
│   ├── screenshots/  browser-profiles/  logs/  backups/
├── tests/
│   ├── unit/                Root unit tests (env-safety guardrails)
│   ├── integration/         (reserved)
│   └── fixtures/            (reserved)
├── docs/                    Product & technical documentation
├── .env.example             Safe example environment (tracked; no secrets)
├── package.json             Root workspace + quality scripts
├── pnpm-workspace.yaml      Workspace definition + build-script allowlist
├── tsconfig.base.json       Shared TypeScript config
├── eslint.config.js         Flat ESLint config
├── prettier.config.js       Prettier config
├── .gitignore  .editorconfig  .prettierignore  vitest.config.ts
```

The top-level directories match the structure established in SPRINT -1 and the product's separation of concerns: `apps` (user-facing), `workers` (background), `packages` (shared libraries). Business logic will live in the API/domain, never in the frontend, n8n, or workers (see [07-system-overview.md](07-system-overview.md)).

---

## Local Development Workflow

Prerequisites: Node.js 22, pnpm 11, Docker (for later sprints). Then:

```bash
# 1. Install dependencies (workspace-wide)
pnpm install

# 2. Create a local environment file from the safe example
cp .env.example .env      # .env is gitignored; never commit it

# 3. Verify the environment and safety defaults
pnpm run doctor

# 4. Run quality gates
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm format:check
```

The app/worker scaffolds are runnable but implement no product features:

- `pnpm --filter @kmkt/api build && node apps/api/dist/index.js` → API serving `/health` and `/ready`.
- `pnpm --filter @kmkt/web dev` → web app with a home page and `/health` page.
- The workers print a "disabled" message and exit 0; they do not touch Facebook or Playwright.

> **Note on `pnpm doctor`:** `doctor` is a reserved pnpm built-in subcommand, so the project's checker is invoked as **`pnpm run doctor`**. Both the built-in and our script are useful; our script is the one that checks the project's safety defaults.

---

## Docker Strategy

A single Docker Compose stack ([docker/compose/docker-compose.yml](../docker/compose/docker-compose.yml)) defines every service for a single-host deployment. **It is a foundation only and is not started in this sprint.**

- **Services:** `mysql`, `api`, `web` (default), plus `n8n`, `facebook-scanner`, `facebook-comment` (profile-gated).
- **Profiles gate risky/optional services:** `n8n` → `n8n` profile; `facebook-scanner` → `workers` profile; `facebook-comment` → `comment-worker` profile. None of these start with a plain `docker compose up`.
- **Images:** `api`, `web`, and the two workers build from `docker/*.Dockerfile` (multi-stage, Node 22 + pnpm, non-root runtime). MySQL and n8n use official images.
- **Named volumes:** `kmkt_mysql_data`, `kmkt_n8n_data` for persistence.
- **Health checks:** MySQL (`mysqladmin ping`) and API (`/health`).
- **Validation:** `docker compose config` parses cleanly; `env_file` is marked `required: false` so validation needs no committed secret file. Developers supply a local `.env`.

### Networking & exposure (security)

- **MySQL** has no `ports:` mapping — reachable only on the internal Compose network, never from the host or public internet.
- **n8n** has no `ports:` mapping and is profile-gated — never publicly exposed.
- **API** has no host port publish — internal only (`expose`).
- **Web** is the only host-published port, bound to **`127.0.0.1:3000`** (loopback), never `0.0.0.0`.

---

## Resource Limits

Conservative limits sized for 2 cores / 3.8 GiB RAM (services are not intended to run at full size simultaneously; browser concurrency remains one in later sprints):

| Service            | CPU limit | Memory limit | Notes                          |
| ------------------ | --------- | ------------ | ------------------------------ |
| mysql              | 1.0       | 768M         | default (core)                 |
| api                | 0.75      | 384M         | default (core)                 |
| web                | 0.75      | 512M         | default (core)                 |
| n8n                | 0.5       | 512M         | `n8n` profile only             |
| facebook-scanner   | 1.0       | 700M         | `workers` profile only         |
| facebook-comment   | 1.0       | 700M         | `comment-worker` profile only  |

---

## Safety Defaults

Encoded in [.env.example](../.env.example) and enforced by `pnpm run doctor` and the env-safety unit test:

- All Facebook actions **disabled**: `FACEBOOK_READER_ENABLED`, `FACEBOOK_COMMENT_ENABLED`, `FACEBOOK_WRITE_ACTION_ENABLED`, `FACEBOOK_LOGIN_ENABLED` = `false`.
- **Human approval required**: `COMMENT_APPROVAL_REQUIRED=true`.
- **Global kill switch ON**: `GLOBAL_KILL_SWITCH=true`.
- **Concurrency pinned to 1**: `PLAYWRIGHT_CONCURRENCY`, `SCANNER_CONCURRENCY`, `COMMENT_CONCURRENCY` = `1`.
- **External integrations disabled**: `AI_ENABLED`, `TELEGRAM_ENABLED`, `N8N_ENABLED` = `false`.
- The comment (write) worker is doubly protected: profile-gated in Compose **and** blocked at runtime by the kill switch / write flags.

Full detail per variable is in [16-environment-configuration.md](16-environment-configuration.md).

---

## Commands

| Command             | Effect                                                             |
| ------------------- | ----------------------------------------------------------------- |
| `pnpm lint`         | ESLint across the monorepo.                                        |
| `pnpm typecheck`    | `tsc --noEmit` in every package.                                   |
| `pnpm test`         | Vitest unit tests.                                                 |
| `pnpm build`        | Build all packages/apps (tsc + `next build`).                     |
| `pnpm format:check` | Prettier check (code/config; docs excluded).                      |
| `pnpm run doctor`   | Verify toolchain, resources, required files, and safety defaults. |

All six pass on the current host (verified in SPRINT 001).

---

## Known Constraints

- **2 CPU cores / 3.8 GiB RAM.** Keeps concurrency at one and forbids heavy infrastructure. `next build` is the heaviest step and completes comfortably.
- **Swap is ~2.0 GiB.** Meets the 2 GiB target; must not be resized without approval.
- **`pnpm doctor` name collision.** Use `pnpm run doctor` (pnpm reserves the bare `doctor` subcommand).
- **No committed `.env`.** Secrets are developer-supplied locally; only `.env.example` is tracked.
- **MySQL/n8n only via Docker.** Not installed on the host.

---

## What Was Explicitly NOT Implemented

Per the sprint brief, none of the following exist yet (only structure, disabled placeholders, or reserved decisions):

- Facebook login, scanning, or commenting; Playwright execution (workers are disabled placeholders that do not import Playwright).
- AI matching or comment generation; no AI provider connection.
- Telegram bot integration.
- Authentication flows; workspace or business screens.
- Database schema, migrations, or any database access (Drizzle reserved, not used).
- n8n workflows.
- Billing, subscriptions, or auto-commenting.
- Any external service connection; no Docker services were started; no new ports were opened.
