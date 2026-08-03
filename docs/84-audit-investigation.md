# 84 — Audit Investigation

Every meaningful action leaves a durable, explainable trail. This document is the guide to reconstructing "what happened" without ever touching a secret.

## Where the trail lives

- **Audit events** (`audit_events`) — auth, Facebook connection, group, and operational events (maintenance/lockdown enable/disable with operator + reason). Payloads are redacted of forbidden keys.
- **Action events** (`action_events`) — the Action Job lifecycle.
- **Execution sessions** (`action_execution_sessions`) — per-attempt state timeline with timestamps, error/recovery classification.
- **Execution evidence** (`action_execution_evidence`) — append-only observations: pre-submit, typed-content, submit, comment-identity, verification/failure. Storage **keys** only, never bytes or paths.
- **Idempotency records** (`action_idempotency_records`) — reservation status per (business, post, type).
- **Domain events** — review, AI draft, matching, opportunity, collector runs.
- **Operational state history** — the runtime state file’s `history[]` (maintenance/lockdown transitions).

## Investigating a comment execution

1. Find the **Action Job** → its **Execution Session(s)** (attempt number, status, timestamps).
2. Read the session **evidence** in order: was the target verified? did typed content match exactly? was the comment observed with an id and exact content?
3. Check the **idempotency record**: `verified` (permanent block), `ambiguous` (needs human), or `released`.
4. Confirm the terminal state: `verified` is the only success; `ambiguous`/interrupts require recovery.

## Exporting for review

`pnpm backup:audit` exports the audit-relevant tables (data only, no secrets, no raw browser data) as a checksummed, manifested archive ([73](73-backup-policy.md)). Share the **manifest** and export, never the `.env` or profiles.

## What you will never find in the trail

Passwords, cookies, session tokens, profile paths, AI keys, Telegram tokens, raw DOM, or screenshots-as-data — these are redacted or excluded by construction. If any appear, treat it as a security incident ([83](83-incident-response.md)) and run `pnpm logs:verify`.
