# SPRINT 001 — Technical Bootstrap

- **Stage:** SPRINT 001 — Technical Bootstrap
- **Type:** Technical foundation (scaffolds + tooling; no product features)
- **Date:** 2026-07-30
- **Owner:** Principal Software Architect / DevOps Engineer / Senior Full Stack Engineer

---

## Goal

Prepare a minimal, production-conscious technical foundation for future development on the VPS: install the development toolchain, initialise the Git repository, create the monorepo structure, add minimal non-feature scaffolds, encode safety defaults, and provide a Docker Compose foundation and quality tooling — all within the 2-core / 3.8 GiB budget, and **without implementing any product feature**.

---

## Deliverables

**Toolchain installed (official methods):** Node.js 22.23.2, pnpm 11.18.0 (Corepack), Docker Engine 29.6.2, Docker Compose v5.3.1. (Git, curl, ca-certificates already present.)

**Repository foundation:** Git initialised on `main` with repo-local defaults; `.gitignore`, `.editorconfig`, `.env.example`, `package.json`, `pnpm-workspace.yaml`, `tsconfig.base.json`, `eslint.config.js`, `prettier.config.js`, `.prettierignore`, `vitest.config.ts`.

**Monorepo structure:** `apps/{web,api}`, `workers/{facebook-scanner,facebook-comment}`, `packages/{config,domain,shared,logger}`, `docker/{compose,mysql,n8n}` + Dockerfiles, `scripts/{doctor,backup,development}`, `storage/{screenshots,browser-profiles,logs,backups}`, `tests/{unit,integration,fixtures}`.

**Scaffolds (no features):**
- `apps/web` — Next.js App Router, home + `/health` page; no auth, no product UI, no external calls.
- `apps/api` — Fastify, `GET /health` and `GET /ready`; no DB, no auth, no product endpoints.
- `workers/facebook-scanner`, `workers/facebook-comment` — disabled placeholders that exit safely and do **not** import or execute Playwright.
- `packages/config` — typed env validation (Zod) with safe defaults, no secrets.
- `packages/logger` — minimal dependency-free structured logger.
- `packages/shared` — small TS helpers.
- `packages/domain` — empty structure, no entities.

**Environment safety defaults:** [.env.example](../.env.example) with all Facebook actions disabled, approval required, kill switch on, concurrency = 1, AI/Telegram/n8n disabled.

**Docker Compose foundation:** [docker/compose/docker-compose.yml](../docker/compose/docker-compose.yml) — MySQL/n8n/API not publicly exposed, web bound to loopback, workers profile-gated, named volumes, health checks, conservative limits. Validated with `docker compose config`; **not started**.

**Quality commands:** `pnpm lint`, `typecheck`, `test`, `build`, `format:check`, and `pnpm run doctor` — all passing.

**Documentation:** [15-technical-bootstrap.md](../15-technical-bootstrap.md), [16-environment-configuration.md](../16-environment-configuration.md), [17-development-workflow.md](../17-development-workflow.md), this record; updates to [current-sprint.md](../current-sprint.md) and [13-product-memory.md](../13-product-memory.md).

---

## Exclusions (not implemented)

Facebook login/scanning/commenting; Playwright execution; AI matching/generation; Telegram integration; authentication flows; workspace/business screens; database schema/migrations; n8n workflows; billing; subscriptions; auto-commenting; any external service connection. No Docker services started; no database created; no ports opened; no firewall/SSH/user/network changes.

---

## Acceptance Criteria

- [x] Toolchain installed via official methods; exact versions reported.
- [x] Git repository initialised; no remote, no push, no committed secrets.
- [x] Monorepo structure created per specification.
- [x] Minimal scaffolds created; workers disabled and Playwright-free.
- [x] `.env.example` encodes all safety defaults; write actions disabled; kill switch on.
- [x] Docker Compose foundation created, validated, and **not started**; no public MySQL/n8n/API ports; web loopback only.
- [x] `pnpm lint | typecheck | test | build | format:check` all pass.
- [x] `pnpm run doctor` verifies toolchain, resources, required files, and safety defaults.
- [x] Documentation created/updated; no placeholders or TODO markers.
- [x] No external connection (Facebook/Telegram/AI/DB) attempted.

---

## Risks

- **Resource pressure on 2 cores / 3.8 GiB.** Mitigated by concurrency = 1, profile-gated services, conservative limits, and no heavy infrastructure. `next build` (heaviest step) completes comfortably.
- **`pnpm doctor` name collision** with pnpm's built-in. Mitigated by invoking `pnpm run doctor` and documenting it.
- **Accidental enabling of Facebook/write actions.** Mitigated by disabled-by-default flags, kill switch on, profile-gating of the comment worker, and a `doctor` check that fails if defaults are weakened.
- **Secret leakage.** Mitigated by a strict `.gitignore` (secrets, cookies, profiles, volumes), only `.env.example` tracked, and no real credentials anywhere.
- **Drift between docs and code.** Mitigated by the documentation-update rule ([17-development-workflow.md](../17-development-workflow.md)).

---

## Completion Checklist

- [x] Preflight audit (read-only) performed; no firewall/SSH/user/network changes.
- [x] Node/pnpm/Docker installed and versioned.
- [x] Git initialised with local defaults only.
- [x] Root config files created.
- [x] Monorepo directories created.
- [x] Web/API/worker/package scaffolds created.
- [x] Safety defaults encoded and tested.
- [x] Docker Compose foundation created and validated (not started).
- [x] Doctor command implemented and passing.
- [x] Documentation written and cross-referenced.
- [x] Full quality suite green (6/6).
- [x] Verified: no services started, no ports opened, no external connections, no secrets committed.

---

## Review Status

**Complete — ready for Product Owner review.**

The technical foundation is in place and verified on the target host. No product features were implemented; all safety defaults are intact and enforced. The project is ready to proceed to **SPRINT 002 — Authentication and Workspace** upon sign-off.
