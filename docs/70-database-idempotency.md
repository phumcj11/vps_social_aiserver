# 70 — Database-Level Idempotency

To make "at most one successful comment per (business, post)" impossible to violate — even under concurrent attempts or a crash — the guarantee is enforced by the **database**, not application logic (Architecture Review CRITICAL C1).

## The nullable-unique-key pattern

MySQL 8 has no partial unique index. We emulate one: a key column holds a composite value while a row is *live*, and `NULL` when the row is *terminal/released*. MySQL treats `NULL`s as distinct, so a `UNIQUE` index enforces "at most one live row" while allowing any number of released rows.

This sprint applies the pattern in four places:

| Table | Live key | Guarantee |
| --- | --- | --- |
| `action_jobs.active_dedup_key` | `reviewTaskId:actionType` | one active job per (review, action type) |
| `action_jobs.success_idempotency_key` | identity of a verified success | one verified success per identity |
| `action_execution_sessions.active_key` | `actionJobId` while live | one active session per job |
| `action_idempotency_records.idem_key` | `workspace:business:targetPostKey:actionType` | one live reservation per post identity |

When a job/session/reservation reaches a terminal or released state, its live key is set to `NULL`, freeing the slot for a deliberate future attempt.

## Target post key

The identity is a **deterministic hash of the canonical post**, not the raw URL. `canonical-url.ts` strictly parses the Facebook post URL (`new URL`, https-only, host allowlist, supported post forms) and derives `targetPostKey` from the post's identity (e.g. `group:<gid>:post:<pid>`). Query strings, fragments, and host variants (`www`/`m`/`web`/`mbasic`) collapse to the same key; unrelated posts never collide.

## Reservation lifecycle

`reserved` → `submitted` → `verified` (key kept live — permanently blocks duplicates), or → `released` (key → `NULL`) after a provably pre-submit failure, or → `ambiguous` (key kept live) pending human recovery. Two concurrent attempts for the same identity cannot both reserve — the second hits the unique index and is rejected with `IDEMPOTENCY_CONFLICT`.
