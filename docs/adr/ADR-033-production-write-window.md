# ADR-033 — Bounded Production Write Window

**Status:** Accepted (SPRINT 014). **Date:** 2026-08-20.

## Context

Level-1 production writes must be small, supervised, and bounded in time. Leaving execution "enabled" for any length of time widens the blast radius.

## Decision

Gate every production `submit_once` behind an explicit, bounded **Write Window** (`CLOSED` default / `OPEN` / `LOCKDOWN`). Opening requires a full operator checklist (identity, reason, exact job + `target_post_key`, expiry, fresh verified backup, health OK, prepare_only PASS, no duplicate, no ambiguous, kill-switch acknowledgement) and clamps to a Level-1 maximum of 5 minutes. A window auto-closes at expiry.

## Consequences

- Production writes are only possible inside a short, explicitly-opened interval that the operator also explicitly closes.
- **Auto-expiry never retries or submits anything** — it only disables further execution.
- Opening a window is independent of the global kill switch and never turns it off; the kill switch remains a separate hard control.
- LOCKDOWN (checkpoint/CAPTCHA/restriction) is sticky and cleared only by manual recovery.
- The window is one of two independent gates; a valid one-shot authorization ([ADR-034](ADR-034-one-shot-production-authorization.md)) is also required.
