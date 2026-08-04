# 86 — Collector Duplicate-Signal Handling

## The Pilot finding

Pilot 0 Phase 3 surfaced a `REPOSITORY_ERROR` on one group (Cha-am Pilot 2). A duplicate post (Facebook renders a pinned post twice; re-runs re-see the same feed) reached the persistence layer and the **normalized Signal insert** hit the database unique constraint (`facebook_signals` is `UNIQUE(workspace_id, post_url)`), which was re-thrown as `REPOSITORY_ERROR` and aborted the rest of that group.

Root cause: `persistSignal` guarded the **raw** insert with an existence check but the **normalized** insert had **no guard** and no duplicate-key catch. The coordinator's pre-check (`isDuplicate`) covers the common case, but a within-batch pinned duplicate or a race could still slip through to the insert.

## The fix

`CollectorRepository.persistSignal` is now **idempotent** and returns `{ inserted: boolean }`:

1. **Pre-check every identity** before inserting the normalized Signal — canonical post URL, then Facebook post id, then normalized hash. If any exists → `{ inserted: false }` (skip). An existing Signal is **never rewritten**.
2. **Catch the unique-constraint race**: if an insert still throws a duplicate-key error (`ER_DUP_ENTRY` / errno 1062, or a store's "duplicate"/"unique" error), convert it to `{ inserted: false }` — an idempotent skip, **not** a `REPOSITORY_ERROR`.
3. A genuine, non-duplicate DB error still raises `REPOSITORY_ERROR`, now annotated with the **safe** DB error code only (e.g. `(ER_DATA_TOO_LONG)`) — never the offending value or post content.

The coordinator counts skips in a new **`duplicatesSkipped`** run field (migration `0011` adds `collector_runs.duplicates_skipped`), reported by the CLI (`dupsSkipped=`) and the run summary. A duplicate is a normal outcome — it increments `duplicatesSkipped`, records nothing about the post's content, does **not** mark the group failed, and processing continues to the next post. The checkpoint remains valid.

## Behavior summary

| Situation | Before | After |
| --- | --- | --- |
| Duplicate post URL (pinned/re-run) | REPOSITORY_ERROR, group aborts | skipped, `duplicatesSkipped++`, continue |
| Same Facebook post id, different tracking params | possible error | skipped |
| Unique-constraint race (pre-check passed, insert lost) | REPOSITORY_ERROR | skipped |
| Genuine data error (e.g. over-long value) | REPOSITORY_ERROR (opaque) | REPOSITORY_ERROR + safe code |

## Retest result

The previously-failing Cha-am Pilot 2 group now **completes with no `REPOSITORY_ERROR`** across repeated read-only runs; the profile lock is released each time; no Facebook write occurs. Unit tests (`collector/dedup.test.ts`) cover same-URL, same-post-id, hash, race, continue-after-duplicate, and never-rewrite-existing. See [PILOT-000-phase3-corrective-fixes](sprints/PILOT-000-phase3-corrective-fixes.md).
