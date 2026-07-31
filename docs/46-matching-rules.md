# 46 — Matching Rules (evaluation)

**Document status:** SPRINT 008 — Business Candidate & Matching Engine
**Applies to:** KMKT Social AI
**Date:** 2026-07-31

This document describes how the Business Matcher **evaluates** a business's Business Matching Rules against a Signal. The rules themselves (fields, allowed types, CRUD, validation) are defined in [25-business-matching-rules.md](25-business-matching-rules.md); this is the deterministic evaluation contract.

Rule set version: **`rules-v1`** (recorded on every Business Match as `matcher_version`).

---

## Inputs

- **Signal**: the Opportunity's Signal — the matcher reads its `message`.
- **Rules**: the candidate business's **active** matching rules only (`status = 'active'`). Disabled rules are ignored. Rules are supplied priority-descending (per the store), though v1 evaluation is order-independent for the decision.

The allowed rule types are the fixed set from Sprint 003: `province`, `district`, `keyword`, `guest_count`, `budget`, `facility`, `custom`.

---

## Evaluation (deterministic containment)

For each active rule, the matcher computes:

```
matched = signal.message (lower-cased) CONTAINS ruleValue (trimmed, lower-cased)
```

- Case-insensitive substring containment. No stemming, tokenisation model, or fuzzy/semantic matching.
- This uniform rule applies to **every** rule type — the `ruleValue` is authored by the business owner (a keyword, a province name, a number-as-text such as a budget or guest count). A number rule matches when that number appears in the message text.
- An empty/whitespace `ruleValue` never matches. A `null` message matches nothing.

Each rule yields a **Reason**: `{ ruleType, ruleValue, matched }`. All evaluated rules are recorded (both matched and unmatched), giving a complete, human-readable explanation of the decision.

---

## Decision

```
decision = reasons.some(matched) ? MATCH : NO_MATCH
```

- **MATCH** — at least one active rule matched.
- **NO_MATCH** — no active rule matched, **or** the business has no active rules (reasons is an empty array).

---

## Determinism

Given the same Signal and the same rules, the matcher always returns the same Decision and Reasons. It performs no I/O, calls no model, and consults no clock or random source. This makes matching **testable** (pure unit tests), **auditable** (the Reasons fully explain the Decision), and **reproducible** for a given `matcher_version`.

---

## Configuration

Matching has **no** tunable environment configuration in v1 — behaviour is fully determined by the business's rules and the evaluation contract above. (This is intentional: the business owner controls matching through their rules, not through server settings.)

See [45-business-matching-engine.md](45-business-matching-engine.md), [47-business-match-lifecycle.md](47-business-match-lifecycle.md), [ADR-014](adr/ADR-014-business-matching-engine.md).
