# 71 — Safe Execution Runbook

How to exercise the Safe Execution Foundation **without any real Facebook write**. Under the mandated safe defaults every prepare/dry-run is **blocked**; the full pipeline is proven by tests and by the fake adapter.

> **The first REAL write** is a separate, manual, operator-supervised procedure — see [81-controlled-facebook-write-test.md](81-controlled-facebook-write-test.md) and [ADR-030](adr/ADR-030-controlled-write-test-procedure.md). Incident lockdown ([80-incident-lockdown.md](80-incident-lockdown.md)) can force all execution off instantly.

## Safety posture

Real execution requires ALL of these, and this sprint keeps them in their safe state:

| Flag | Safe default |
| --- | --- |
| `ACTION_ENGINE_ENABLED` | `false` |
| `FACEBOOK_WRITE_ACTION_ENABLED` | `false` |
| `FACEBOOK_COMMENT_ENABLED` | `false` |
| `GLOBAL_KILL_SWITCH` | `true` |
| `FACEBOOK_COMMENT_ADAPTER` | `fake` |

The **real** Playwright comment path now exists behind these gates ([87](87-real-facebook-comment-adapter.md), [ADR-031](adr/ADR-031-real-facebook-comment-adapter.md)) — it replaced the former unconditional `REAL_WRITE_FORBIDDEN`. It still refuses to type or submit unless **every** gate passes together **and** the executor grants an explicit one-shot authorization in `submit_once` mode, with the kill switch re-checked immediately before submit. Under the safe defaults above, submit is always refused and nothing is typed.

**Read-only readiness probe (no write):** `pnpm --filter @kmkt/api action:execution:prepare-live --workspace <ws> --action <job>` runs `prepare_only` — it opens the exact target, validates session/identity/comments/duplicate/composer, then closes. It types/submits nothing and needs no write flag. Run it (operator-supervised, as the non-root browser user) to validate live selectors before any `submit_once`. The one real write remains the separate procedure in [81-controlled-facebook-write-test.md](81-controlled-facebook-write-test.md); there is **no** Execute-Now command/API/UI.

## API

- `POST /actions/:id/prepare-execution` — run one attempt. Under safe defaults returns `{ status: "blocked" }` with reasons and **no session**. There is **no "Execute Now"** endpoint.
- `POST /actions/:id/dry-run` — fake-only diagnostic (accepts a `scenario`); does not consume the job.
- `GET /actions/:id/execution-sessions` — sessions for a job.
- `GET /action-executions/:sessionId` — session detail + evidence.
- `GET /action-executions/:sessionId/evidence` — the evidence trail.
- `POST /action-executions/:sessionId/cancel` — cancel a live session.
- `POST /action-executions/:sessionId/recover` — classify for [recovery](69-execution-recovery.md).

Prepare and recover are rate-limited; all routes are authenticated, workspace-scoped, and CSRF-guarded, and never return secrets or profile paths.

## CLI

```
pnpm action:execution:prepare  --workspace <uuid> --action <uuid>
pnpm action:execution:show     --workspace <uuid> --session <uuid>
pnpm action:execution:evidence --workspace <uuid> --session <uuid>
pnpm action:execution:cancel   --workspace <uuid> --session <uuid>
pnpm action:execution:dry-run  --workspace <uuid> --action <uuid> [--scenario <name>]
```

`dry-run` is fake-only. None of these can post a real comment.

## Web

The Action Detail page adds an **Execution** section (Prepare Execution — blocked under defaults — and the session list); `/settings/action-executions/:id` shows a session's status, evidence, Cancel (live) and Classify Recovery (terminal). There are no Execute / Enable-Write / Kill-Switch controls.

## Verifying the fake pipeline

Tests run the executor with the fake adapter under an execution-enabled **test** env (kill switch off) to prove every path — verified success, each pre-submit abort, and every ambiguous/interrupt outcome — with zero risk of a real write. See `apps/api/src/execution/*.test.ts`.
