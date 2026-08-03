# 81 — Controlled Facebook Write Test

The precise, operator-supervised procedure for the **first and only** real Facebook comment write. Nothing here runs automatically. This test is performed once, by a human, on a **disposable** account and post, and every flag is restored immediately afterward (ADR-030).

> This sprint does **not** perform this test. This is the runbook the operator follows later, deliberately.

## Preconditions (ALL required)

- A **disposable** test Facebook account and a **disposable** test Group or post (never a real customer account).
- **Operator supervision** throughout.
- Exactly one of each: Workspace, Business, Opportunity, **MATCH**, Draft, **APPROVED** Review, Action Job, browser profile, Action Execution Session.
- **Zero** other active Collector or Executor processes; **no n8n**; **one Chromium maximum**.
- A **fresh database backup** (`pnpm backup:database` → `pnpm backup:verify`).
- Health **green** (`/health/*`), monitoring **green** (`pnpm monitor:check`), disk & RAM safe.
- **No ambiguous prior execution** for the same Business and post (idempotency clear).

## Enable (temporary, explicit, recorded)

Record first: current flag values, operator identity, reason, start time. Then set **only for the test**:

```
ACTION_ENGINE_ENABLED=true
FACEBOOK_WRITE_ACTION_ENABLED=true
FACEBOOK_COMMENT_ENABLED=true
FACEBOOK_COMMENT_ADAPTER=playwright
GLOBAL_KILL_SWITCH=false
```

Before triggering: verify idempotency reservation is clear, the Facebook session is connected, the target post matches, the approved content is exact, the profile lock is acquired, no Collector is running, no n8n is running, and only one Chromium will launch.

## Run

Trigger **one** `prepare-execution` for the single Action Job. Watch the Execution Session move through preflight → submit → verify. Success is **verified-only**: an observed comment id and exact content match ([68](68-execution-verification.md)).

## Restore immediately (always)

```
ACTION_ENGINE_ENABLED=false
FACEBOOK_WRITE_ACTION_ENABLED=false
FACEBOOK_COMMENT_ENABLED=false
FACEBOOK_COMMENT_ADAPTER=fake
GLOBAL_KILL_SWITCH=true
```

## Post-test verification

- comment **found**; content **exact**; comment **ID captured** when available;
- **screenshot** + **verification** evidence stored;
- Action Job **succeeded only after verification**;
- **no duplicate** comment; **no second** Action Job;
- browser **closed**; profile lock **released**;
- **no service** remains running; safety flags **restored**; `pnpm run doctor` **green**.

## Abort conditions (stop immediately, restore flags)

CAPTCHA, checkpoint, login required, account restriction, wrong target, ambiguous DOM, content mismatch, a pre-existing matching comment, browser crash, low memory, disk warning, stale backup, a kill-switch event, or an unexpected second browser.

**No CAPTCHA or checkpoint is ever bypassed** — an interrupt pauses for a human ([69](69-execution-recovery.md)). See [ADR-030](adr/ADR-030-controlled-write-test-procedure.md).
