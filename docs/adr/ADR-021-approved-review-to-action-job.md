# ADR-021 — Approved Review → Action Job

- **Status:** Accepted
- **Date:** 2026-07-31
- **Sprint:** SPRINT 011 — Action Queue Engine
- **Deciders:** Principal Software Architect / Senior Full Stack Engineer
- **Related principles:** Human Approval Mandatory, No Silent Failure, Everything Auditable
- **Relates to:** [ADR-018](ADR-018-review-engine.md), [ADR-020](ADR-020-action-queue-boundary.md), [60-action-job-lifecycle.md](../60-action-job-lifecycle.md)

---

## Context

We must decide precisely what may create an Action Job, what content it carries, and how duplicates are handled. Getting this wrong risks acting on content a human did not approve, or creating multiple competing actions for one decision.

Options:
- **A — Any review (or a draft) can create an action**, with content re-derived at execution time.
- **B — Only an APPROVED review creates an action**, capturing the exact approved content immutably, with strict de-duplication.

---

## Decision

**Only an APPROVED review creates an Action Job, capturing the approved content immutably (Option B).**

- **Gating:** only a Review Task in status **APPROVED** may create an Action Job. `PENDING`, `REJECTED`, and `EXPIRED` reviews never do (rules 1–2). The **ActionIntentBuilder** enforces this.
- **Content:** the job's `approved_content` is the review's **edited content when present, otherwise the draft content** — captured at creation and **never re-derived or silently altered** (rules 4–5, BR-28).
- **Target:** the target URL is the Signal's Facebook post URL, validated as a supported Facebook URL; unsafe URLs are rejected.
- **De-duplication:** at most **one ACTIVE job** (`queued | blocked | processing`) per (review task, action type) — enforced by the repository. A duplicate create is rejected (`409`). After a terminal state (`succeeded`/`cancelled`) a new job may be created.
- **Isolation:** every record must belong to the same workspace; cross-workspace creation is rejected.

---

## Consequences

**Positive**
- **What the human approved is exactly what is captured** — no drift between approval and action.
- **No competing actions** — one active job per decision and type.
- **Auditable** — the job records its review, draft, and match provenance.

**Negative / trade-offs**
- Editing after an action is created requires cancelling and re-creating. Acceptable — intent immutability is the safety property; the human can cancel the blocked job and produce a new one.

**Explicitly out of scope:** re-deriving content at execution time, actions from non-approved reviews, multiple active jobs per (review, type), and any execution.
