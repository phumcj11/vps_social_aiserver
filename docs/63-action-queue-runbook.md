# 63 — Action Queue Runbook

**Document status:** SPRINT 011 — Action Queue Engine
**Applies to:** KMKT Social AI
**Date:** 2026-07-31

Operational guide for the Action Queue. This sprint the queue is a **safe boundary only** — it never executes a Facebook action and runs no worker.

> **Operations (SPRINT 013):** while **maintenance mode** is on, new Action Jobs and execution preparation are rejected; while **incident lockdown** is on, all Facebook-touching operations are blocked and write flags are forced off. See [79-maintenance-mode.md](79-maintenance-mode.md), [80-incident-lockdown.md](80-incident-lockdown.md), and the operator console at `/settings/operations`.

---

## Safety posture (must hold by default)

| Flag | Default | Effect |
| ---- | ------- | ------ |
| `ACTION_ENGINE_ENABLED` | `false` | No execution; jobs are created `blocked` |
| `FACEBOOK_WRITE_ACTION_ENABLED` | `false` | No Facebook writes; contributes to `blocked` |
| `GLOBAL_KILL_SWITCH` | `true` | Halts all new write actions; contributes to `blocked` |
| `TELEGRAM_ENABLED` | `false` | No Telegram send |

With these defaults, **every Action Job is `blocked`** and `recheck-policy` keeps it blocked. There is no way to execute a Facebook action this sprint — no Action Worker exists.

---

## Common operations

### API

- **Create** from an approved review: `POST /actions` `{ reviewTaskId, actionType: "facebook_comment" }` → a `blocked` job.
- **List / counts:** `GET /actions` (optional `?status=`), returns jobs + status statistics.
- **Detail:** `GET /actions/:id` (job + review/draft/match refs + policy reasons + events).
- **Cancel:** `POST /actions/:id/cancel` (queued/blocked/failed → `cancelled`).
- **Retry:** `POST /actions/:id/retry` (a `failed` job → `queued`, only under `max_attempts`).
- **Recheck policy:** `POST /actions/:id/recheck-policy` (a `blocked` job; stays blocked under defaults).

All routes are authenticated, workspace-scoped, and CSRF-guarded on state changes. Responses contain no secrets. There is **no execution endpoint**.

### CLI

```bash
pnpm action:create   --workspace <uuid> --review <uuid> --type facebook_comment
pnpm action:list     --workspace <uuid>
pnpm action:show     --workspace <uuid> --action <uuid>
pnpm action:cancel   --workspace <uuid> --action <uuid>
pnpm action:retry    --workspace <uuid> --action <uuid>
pnpm action:recheck  --workspace <uuid> --action <uuid>
```

The `action:*` commands validate UUIDs, enforce workspace scope, never execute Facebook, never print secrets or profile paths, and return useful exit codes.

---

## Troubleshooting

- **A job is `blocked` and won't clear.** Expected under current defaults. `recheck-policy` reports the reasons (`ENGINE_DISABLED`, `WRITE_DISABLED`, `KILL_SWITCH_ON`). Do **not** enable writes or the engine this sprint.
- **Create returns 409.** Either the review is not APPROVED, or an active job already exists for that (review, action type).
- **Retry returns 409.** Only a `failed` job under `max_attempts` can be retried; blocked/queued jobs cannot.
- **Cross-workspace access returns 404** — expected; jobs are workspace-isolated.

See [59-action-queue-engine.md](59-action-queue-engine.md), [61-action-policy-guard.md](61-action-policy-guard.md).
