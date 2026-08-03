# ADR-029 — Maintenance & Lockdown as Persistent Runtime State

- **Status:** Accepted
- **Date:** 2026-08-03
- **Sprint:** SPRINT 013 — Operational Hardening and Controlled Write Test Preparation
- **Deciders:** Principal Architect / DevOps / SRE / Security
- **Related principles:** No Silent Failure, Safe by Default, Everything Auditable
- **Relates to:** [79-maintenance-mode.md](../79-maintenance-mode.md), [80-incident-lockdown.md](../80-incident-lockdown.md)

---

## Context

Maintenance mode and incident lockdown must be reliable: they cannot vanish on a process restart, cannot depend on the database being up (lockdown may be engaged *because* the DB is misbehaving), and must be auditable. Options: process memory (lost on restart), `.env` (requires a redeploy/restart to change, easy to forget, not audited), or a database row (unavailable when the DB is down).

## Decision

Persist both modes in a small **runtime JSON state file** (`OPERATIONS_STATE_FILE`), written atomically (temp + rename, `0600`), read tolerantly (corrupt/missing → safe default of "no mode engaged"). The `.env` `MAINTENANCE_MODE` / `INCIDENT_LOCKDOWN` are only the initial fallback. Every transition records operator, reason, and timestamp in an in-file history and emits an audit event. Enforcement is a single request hook; lockdown additionally applies an **effective-safety override** that forces write flags off and the kill switch on regardless of configuration. Unlock is never automatic and always requires confirmation + reason + operator identity.

## Consequences

**Positive** — survives restart; works when the DB is down; auditable; one enforcement point; a mis-set write flag cannot defeat lockdown.

**Negative / trade-offs** — a file is machine-local (correct for a single VPS, ADR-027); the file is gitignored and never committed. A future multi-server model would need a shared store — explicitly out of scope.

**Out of scope:** distributed/shared mode state, automatic unlock.
