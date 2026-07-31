# 43 — Classification Rules

**Document status:** SPRINT 007 — Opportunity Classification Engine
**Applies to:** KMKT Social AI
**Date:** 2026-07-31

The Classifier applies a fixed, ordered set of **deterministic** rules to a Signal. Each rule yields a Reason `{ code, passed }`. The Decision is **ACCEPT only if every rule passes**; otherwise **REJECT**. There is no scoring, weighting, threshold, or probability — a rule either passes or it does not.

Rule set version: **`rules-v1`** (recorded on every Opportunity as `classifier_version`).

---

## Rules (in evaluation order)

| # | Reason code | Passes when | Notes |
| - | ----------- | ----------- | ----- |
| 1 | `HAS_TEXT` | The Signal message is present and non-empty (after trim) | An empty/whitespace-only post has nothing to act on. |
| 2 | `TEXT_MIN_LENGTH` | Trimmed message length ≥ `OPPORTUNITY_MIN_TEXT_LENGTH` | Configurable minimum (default **15**). Filters trivial posts like "help". |
| 3 | `HAS_AUTHOR` | `authorName` is present and non-empty | An actionable Opportunity needs a knowable author. |
| 4 | `HAS_URL` | `postUrl` is present and non-empty | The Signal must be locatable back on the platform. |
| 5 | `NOT_DELETED` | The message is not a deletion tombstone | Rejects known deleted/removed markers (e.g. "[deleted]", "content not available"). |
| 6 | `SUPPORTED_LANGUAGE` | The message contains supported script (Latin or Thai) | Detected by character-range regex `/[A-Za-z฀-๿]/u`. No language model. |
| 7 | `NOT_DUPLICATE` | No existing Opportunity shares this Signal's normalized content hash | Computed by the Coordinator via the Repository and passed into the pure Classifier as context. |

All seven Reasons are always evaluated and stored (both passing and failing), so the event trail shows the complete picture, not just the first failure.

---

## Configuration

| Env var | Default | Effect |
| ------- | ------- | ------ |
| `OPPORTUNITY_MIN_TEXT_LENGTH` | `15` | Minimum trimmed message length for `TEXT_MIN_LENGTH`. |

---

## Determinism

Given the same Signal and the same context, the Classifier always returns the same Decision and Reasons. It performs no I/O, calls no model, and consults no clock or random source. This makes classification:

- **testable** — pure unit tests, no database or network;
- **auditable** — the Reasons fully explain the Decision;
- **reproducible** — re-running yields identical results for a given `classifier_version`.

The one fact the Classifier cannot compute by itself — whether the Signal duplicates an already-classified one — is supplied as `isDuplicate` in the `ClassifierContext`, keeping the Classifier pure while `NOT_DUPLICATE` still works. See [40-opportunity-classifier.md](40-opportunity-classifier.md) for the module boundary.

Related: [41-opportunity-lifecycle.md](41-opportunity-lifecycle.md), [42-opportunity-events.md](42-opportunity-events.md), [ADR-011](adr/ADR-011-opportunity-classification.md).
