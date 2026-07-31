# 47 — Business Match Lifecycle

**Document status:** SPRINT 008 — Business Candidate & Matching Engine
**Applies to:** KMKT Social AI
**Date:** 2026-07-31

A **Business Match** is the record of a deterministic matching decision between one **Opportunity** and one candidate **Business**. This document describes its shape, invariants, and how a matching run behaves.

---

## Storage

Table `business_matches`:

| Column | Notes |
| ------ | ----- |
| `id` | UUID primary key |
| `workspace_id` | FK → workspaces; every query is workspace-scoped |
| `business_id` | FK → businesses — the candidate business |
| `opportunity_id` | FK → opportunities — the Opportunity evaluated |
| `decision` | `MATCH` \| `NO_MATCH` (deterministic — no score, no confidence) |
| `reasons` | JSON array: `[{ ruleType, ruleValue, matched }]` |
| `matcher_version` | which rule set produced this decision (`rules-v1`) |
| `matched_at` | when the match was computed |

A Business Match is a **record of a computation**, not a mutable workflow object — it has no status field. Downstream workflow (drafts, approval) arrives in later sprints and will reference the match; it does not mutate it.

---

## Core invariant: one (Opportunity, Business) → at most one Business Match

`business_matches` carries a **UNIQUE (`opportunity_id`, `business_id`)** constraint. A given Opportunity is matched against a given Business at most once. This makes a matching run **idempotent**: pairs that already have a match are skipped, so re-running never creates duplicates.

---

## The matching run

`POST /business-matching/run` processes the workspace deterministically:

```
for each ACCEPTED Opportunity:
  signal ← the Opportunity's Signal
  candidates ← active businesses assigned to signal.group    (Candidate Generator)
  for each candidate business:
    if a match already exists (opportunity, business): skip
    rules ← business's ACTIVE matching rules
    (decision, reasons) ← matchBusiness(signal, rules)        (Business Matcher)
    store a Business Match
```

Only **accepted** Opportunities (Sprint 007 decision `ACCEPT`) are matched — rejected ones are archived and never reach the matcher (BR-18: posts matching no business produce no opportunity; here, non-accepted opportunities produce no matches).

### Run summary

The run returns counts: `processedOpportunities`, `candidates` (candidate businesses evaluated), `matches` (MATCH), `noMatches` (NO_MATCH), and `skipped` (pairs already matched).

---

## Ownership

Every Business Match belongs to a workspace. Cross-workspace access returns **404** (not 403) — the resource is invisible outside its workspace, consistent with [21-session-security.md](21-session-security.md).

---

## Multiple matches per Opportunity

An Opportunity may produce zero, one, or many Business Matches — one per candidate business (BR-17). When several businesses match, each is recorded and presented distinctly with its own reasons (BR-19); the system **never silently chooses** one on the customer's behalf (BR-20). Each will become its own opportunity/approval downstream (BR-21) in later sprints.

See [44-business-candidate-engine.md](44-business-candidate-engine.md), [45-business-matching-engine.md](45-business-matching-engine.md), [46-matching-rules.md](46-matching-rules.md), [ADR-014](adr/ADR-014-business-matching-engine.md).
