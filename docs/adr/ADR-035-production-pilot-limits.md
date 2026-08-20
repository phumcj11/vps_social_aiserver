# ADR-035 — Production Pilot Hard Limits

**Status:** Accepted (SPRINT 014). **Date:** 2026-08-20.

## Context

A supervised pilot must fail safe under volume, ambiguity, and platform interrupts. Limits must be small, deterministic, and enforced at decision time — never a source of automatic action.

## Decision

Adopt deterministic Level-1 hard limits (env-configurable): ≤ 3 groups, ≤ 3 comments/day, ≤ 1/group/day, ≤ 1/business/day, ≤ 1 ambiguous/day; concurrency 1 everywhere. The limit evaluator only decides whether one more production comment is within limits. An ambiguous execution stops writes for the day; a checkpoint/CAPTCHA/account-restriction forces LOCKDOWN and manual recovery.

## Consequences

- Worst-case daily exposure is tiny and human-paced.
- A single ambiguous outcome halts the day (no double-post risk, human review required).
- Platform interrupts halt all Facebook operations until manual recovery.
- Limits are advisory defaults applied at authorization time; they never trigger or retry an action, and they compose with the Write Window and one-shot authorization gates.
