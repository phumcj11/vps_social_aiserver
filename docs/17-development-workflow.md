# 17 — Development Workflow

**Document status:** SPRINT 001 — Technical Bootstrap
**Applies to:** KMKT Social AI

This document defines how work is carried out on KMKT Social AI: branching, commits, tasks, review, testing, and documentation. It is intentionally lightweight, matching a small team on a single VPS, while keeping the project's guarantees (safety, auditability, small MVP) intact.

---

## Branch Convention

- `main` is the primary, always-working branch. It must always pass all quality gates.
- Work happens on short-lived branches off `main`, named by type and topic:
  - `feat/<scope>-<short-description>` — a new capability (e.g. `feat/api-health`).
  - `fix/<scope>-<short-description>` — a bug fix.
  - `chore/<scope>-<short-description>` — tooling, config, or housekeeping.
  - `docs/<scope>-<short-description>` — documentation only.
  - `refactor/<scope>-<short-description>` — behaviour-preserving changes.
- One logical change per branch. Keep branches small and focused.
- Branches are merged back into `main` after review and are then deleted.

> No remote is configured in this sprint. When a remote is added, the same conventions apply; direct pushes to `main` are avoided in favour of reviewed merges.

---

## Commit Convention

Commits follow **Conventional Commits**:

```
<type>(<scope>): <short summary>

<optional body explaining what and why>
```

- **Types:** `feat`, `fix`, `chore`, `docs`, `refactor`, `test`, `build`, `ci`.
- **Scope:** the area touched (e.g. `api`, `web`, `config`, `docker`, `docs`).
- **Summary:** imperative mood, lower case, no trailing period, ≤ ~72 chars.
- Keep commits atomic and buildable. Do not mix unrelated changes.
- **Never commit secrets** or a real `.env`. Only `.env.example` is tracked.

Examples:
- `feat(api): add /ready readiness endpoint`
- `chore(tooling): pin pnpm via corepack`
- `docs(env): document MYSQL_* variables`

---

## Task Workflow

1. **Pick a task** from the current sprint (see [12-mvp-roadmap.md](12-mvp-roadmap.md) and the sprint record).
2. **Confirm scope.** Check the task against [02-product-scope.md](02-product-scope.md) and [not-doing.md](not-doing.md); do not expand the MVP.
3. **Branch** off `main` using the convention above.
4. **Implement** the smallest change that satisfies the task. Respect the twelve rules in [13-product-memory.md](13-product-memory.md).
5. **Verify locally** — run the full quality gate (below).
6. **Document** — update relevant docs in the same change (see documentation rule).
7. **Open for review**, address feedback, then merge and delete the branch.

Ideas that fall outside the current task go to the [backlog](backlog.md), not into the branch.

---

## Review Workflow

- Every change is reviewed before it reaches `main`.
- Reviewers check, at minimum:
  - **Scope:** stays within the MVP; nothing on the not-doing list slipped in.
  - **Safety:** human-approval, kill-switch, concurrency-one, and no-secret-in-Git guarantees are intact.
  - **Quality gates:** lint, typecheck, test, build, format:check, and `pnpm run doctor` all pass.
  - **Isolation:** business logic stays in the backend; the frontend never calls Playwright/AI/Facebook directly.
  - **Docs:** documentation updated to match the change.
- Reviews are constructive and specific. A change is merged only when green and approved.

---

## Test Requirements

- Unit tests use **Vitest** (`pnpm test`).
- New logic ships with tests. Safety-critical behaviour (approval required, kill switch, idempotency, concurrency) must be covered as it is built.
- The existing env-safety guardrail test must keep passing; do not weaken safety defaults.
- Integration tests live under `tests/integration` (reserved until there is something to integrate).
- The full local quality gate before any review:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm format:check
pnpm run doctor
```

All six must pass.

### Operational commands

Database and Facebook-connection commands are **operational**, not part of the quality gate:

```bash
pnpm db:generate | db:migrate | db:status | db:reset:development   # database (reset is dev-only, guarded)
pnpm facebook:connect | facebook:validate | facebook:disconnect | facebook:status --workspace <uuid>
# Facebook Groups (SPRINT 005)
pnpm facebook:group:add      --workspace <uuid> --url <url>
pnpm facebook:group:list     --workspace <uuid>
pnpm facebook:group:validate --workspace <uuid> --group <uuid>
pnpm facebook:group:assign   --workspace <uuid> --group <uuid> --business <uuid>
pnpm facebook:group:unassign --workspace <uuid> --group <uuid> --business <uuid>
# Collector (SPRINT 006, read-only)
pnpm collector:run --workspace <uuid>
# AI Drafts (SPRINT 009, DRAFT ONLY, Mock provider unless configured otherwise)
pnpm ai-draft:generate   --workspace <uuid> --business-match <uuid>
pnpm ai-draft:list       --workspace <uuid> --business-match <uuid>
pnpm ai-draft:show       --workspace <uuid> --draft <uuid>
pnpm ai-draft:regenerate --workspace <uuid> --draft <uuid>
# Action Queue (SPRINT 011, SAFE BOUNDARY — never executes Facebook)
pnpm action:create   --workspace <uuid> --review <uuid> --type facebook_comment
pnpm action:list     --workspace <uuid>
pnpm action:show     --workspace <uuid> --action <uuid>
pnpm action:cancel   --workspace <uuid> --action <uuid>
pnpm action:retry    --workspace <uuid> --action <uuid>
pnpm action:recheck  --workspace <uuid> --action <uuid>
```

The `facebook:*` and `facebook:group:*` commands are operator commands: they validate UUIDs, reject unsafe URLs, enforce workspace ownership, run at concurrency one, never print credentials/cookies/absolute profile paths/raw HTML, and never scan or comment. See [29-facebook-connection-runbook.md](29-facebook-connection-runbook.md) and [30-facebook-groups.md](30-facebook-groups.md).

The `ai-draft:*` commands (SPRINT 009) validate UUIDs, enforce workspace ownership, use the deterministic **Mock** provider unless AI is explicitly configured otherwise (a real provider refuses while `AI_ENABLED=false`), and produce **drafts only** — they never approve, never send Telegram, never call Facebook, and never print secrets or hidden prompt internals. They return useful exit codes. See [48-ai-draft-engine.md](48-ai-draft-engine.md).

The `action:*` commands (SPRINT 011) validate UUIDs, enforce workspace scope, and operate the Action Queue **safe boundary** — they **never execute Facebook**, never run a worker, never print secrets or profile paths, and return useful exit codes. Under current defaults every job is **blocked**. See [63-action-queue-runbook.md](63-action-queue-runbook.md).

### Operational commands (SPRINT 013)

Operational scripts are safe by construction — they never print secrets, never contact Facebook, and (except the guarded destructive restore) never mutate data:

```
pnpm backup:database | backup:config | backup:audit | backup:all | backup:verify | backup:list | backup:cleanup
pnpm restore:verify --backup <path>   |  restore:dry-run --backup <path>   |  restore:database --backup <path> --yes
pnpm monitor:status | monitor:check | monitor:report          # exit 0/1/2 = OK/WARNING/CRITICAL
pnpm logs:status | logs:rotate:dry-run | logs:verify
pnpm facebook:profile:status --workspace <uuid>   |  facebook:profile:verify --workspace <uuid>
pnpm maintenance:enable|disable --operator <email> --reason "<why>" --yes   |  maintenance:status
pnpm incident:lockdown|unlock  --operator <email> --reason "<why>" --yes    |  incident:status
```

See [73-backup-policy.md](73-backup-policy.md)–[84-audit-investigation.md](84-audit-investigation.md). Maintenance/lockdown state persists across restart; the controlled write test is a manual runbook ([81-controlled-facebook-write-test.md](81-controlled-facebook-write-test.md)), never an automated command.

---

## No Direct Production Changes

- There is one VPS and no separate staging server (a deliberate MVP choice).
- Never edit code, configuration, or data directly on a running production/service context. All changes flow through the branch → review → merge process.
- Never start Facebook writes, enable integrations, or flip safety flags ad hoc. Enabling any integration is a deliberate, reviewed, documented step in the sprint that owns it.
- Operational actions (e.g. the kill switch, session recovery) are performed through the product's intended controls and are auditable — not by hand-editing state.

---

## Documentation Update Rule

- **Documentation is part of the change, not an afterthought** (Documentation First principle).
- Any change that alters behaviour, structure, configuration, commands, or decisions updates the relevant document(s) in the **same** change:
  - New/changed env var → [16-environment-configuration.md](16-environment-configuration.md) and `.env.example`.
  - New command or tooling → [15-technical-bootstrap.md](15-technical-bootstrap.md).
  - A significant decision → a new ADR under `docs/adr/`.
  - Scope changes → [02-product-scope.md](02-product-scope.md), [backlog.md](backlog.md), [not-doing.md](not-doing.md).
  - Source-of-truth facts (stack, structure, sprint) → [13-product-memory.md](13-product-memory.md).
- At sprint boundaries, update [current-sprint.md](current-sprint.md) and add a sprint record under `docs/sprints/`.
- No placeholders, no TODO markers, and no fake completeness claims in documentation.
