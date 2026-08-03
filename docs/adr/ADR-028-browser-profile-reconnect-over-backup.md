# ADR-028 — Browser-Profile Recovery by Reconnect, Not Backup

- **Status:** Accepted
- **Date:** 2026-08-03
- **Sprint:** SPRINT 013 — Operational Hardening and Controlled Write Test Preparation
- **Deciders:** Principal Architect / DevOps / SRE / Security
- **Related principles:** Safe by Default, Everything Auditable
- **Relates to:** [75-browser-profile-recovery-policy.md](../75-browser-profile-recovery-policy.md), [ADR-007](ADR-007-operator-assisted-facebook-login-mvp.md)

---

## Context

A Facebook browser profile holds live session material (cookies, localStorage). Backups exist for disaster recovery — but a profile in a backup, on GitHub, in a log, or copied across servers is a standing credential-theft and session-hijack risk. We must decide how profiles are protected and recovered.

## Decision

**Recover Facebook access by operator reconnect, never by restoring session material.** Browser profiles are excluded from all normal backups, are gitignored, and are never written to logs or evidence. Automatic cross-server restore is forbidden. On loss, corruption, or expiry the connection state becomes `reconnect_required` and the operator performs an operator-assisted login. An optional **encrypted offline** profile backup is future scope only and requires explicit, audited operator authorization. Deletion is controlled and auditable (the explicit disconnect flow). Diagnostics (`facebook:profile:status|verify`) report only safe status — never cookies, localStorage, paths, or credentials.

## Consequences

**Positive** — the most sensitive artifact never travels; a stolen backup contains no session material; recovery is simple and auditable.

**Negative / trade-offs** — recovery requires a human reconnect rather than an automatic restore. This is intended: a brief manual step is far cheaper than a leaked session.

**Out of scope:** automatic profile restore, cross-server profile migration, and (this sprint) encrypted offline profile backup.
