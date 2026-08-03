# 66 — Execution Session Lifecycle

An **Execution Session** (`action_execution_sessions`) records one attempt to execute an Action Job. At most **one active session per job** is enforced at the database level (a nullable `active_key` unique index — see [70](70-database-idempotency.md)).

## States

Happy path (strictly ordered):

```
created → preflight → ready_to_submit → submitting → submitted → verifying → verified
```

Off-ramps at each step:

- **failed** — a deterministic failure.
- **cancelled** — operator action on a live session.
- **ambiguous** — the outcome could not be determined (unknown after submit, or a crash mid-flight). Routes to [recovery](69-execution-recovery.md); **never auto-retries**.
- **checkpoint_required / session_expired / account_restricted** — platform interrupts that pause for a human.

`verified` is the **only** success. The terminal states are `verified`, `ambiguous`, `failed`, `cancelled`, and the three interrupt states. Reaching any terminal state releases the session's `active_key` so a future, deliberate attempt is possible without ever having two live sessions at once.

The transition table is enforced in `session-state.ts`; illegal transitions throw. Each state stamps its own timestamp column (`started_at`, `preflight_verified_at`, `submitted_at`, `verified_at`, `ambiguous_at`, …) so the full timeline is auditable.

## Adapter and profile

A session records which `adapter` ran it (`fake` / `playwright`) and, for a real (refusing) adapter, the single per-workspace `browser_profile_key`. Playwright concurrency is **1**; the Collector and the Comment Executor never share a browser profile concurrently.
