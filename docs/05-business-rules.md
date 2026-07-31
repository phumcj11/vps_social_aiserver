# 05 — Business Rules

**Document status:** Foundation (SPRINT 000)
**Applies to:** KMKT Social AI MVP

This document states the precise rules that govern the product's behaviour. These rules are binding on all designs and later implementation. Where a rule and a convenience conflict, the rule wins. Rules are numbered for reference (BR-n).

---

## Workspace Ownership

- **BR-1.** Each customer account (**User**) owns exactly one **Workspace** in the MVP.
- **BR-2.** All businesses, the Facebook connection, groups, opportunities, decisions, and history belong to a single workspace.
- **BR-3.** A workspace's data is fully isolated from every other workspace. No query, screen, or notification may cross workspace boundaries.

## Multiple Businesses

- **BR-4.** A workspace may contain one or more **businesses**.
- **BR-5.** Each business has its own **business profile**: products or services, service area, selling points, contact information, tone, keywords, response rules, and prohibited claims.
- **BR-6.** Businesses are independent. Deleting or disabling one does not affect another.

## Facebook Account Ownership

- **BR-7.** A workspace has at most **one connected Facebook account** in the MVP.
- **BR-8.** That single Facebook account may be used by multiple businesses in the workspace.
- **BR-9.** The Facebook account's credentials, cookies, and browser profile are stored securely server-side, never exposed to the frontend, and never committed to Git.

## Group Assignment

- **BR-10.** A business may be assigned one or more **Facebook Groups** reachable by the connected account.
- **BR-11.** The same group may be assigned to multiple businesses.
- **BR-12.** A post is only considered for a business if the post's group is assigned to that business.

## Post Uniqueness

- **BR-13.** Each **post** discovered in a group is stored once; re-discovering the same post does not create a duplicate.
- **BR-14.** A post is identified by its group and its platform post identity, so the same content in two different groups is treated as two posts.

## Business Matching

- **BR-15.** For each post, the system evaluates every business whose assigned groups include that post's group.
- **BR-16.** A match produces a **confidence score** and a plain-English **explanation** of why the post is relevant.
- **BR-17.** A post may produce zero, one, or multiple **business matches**.
- **BR-18.** Posts matching no business produce no opportunity.

## Multi-Business Matches

- **BR-19.** When a post matches multiple businesses, the system must present each candidate business distinctly, with its own score and reasons.
- **BR-20.** The system must **never silently choose** one business on the customer's behalf when several match.
- **BR-21.** Each candidate business is handled as its own opportunity and its own approval decision. Approving for one business does not approve for another.

## Draft Generation

- **BR-22.** A **comment draft** is generated per business-and-post match, using **only** that business's profile and tone.
- **BR-23.** A draft must never include another business's details, offers, or claims.
- **BR-24.** A draft must never contain any of the business's recorded **prohibited claims**.
- **BR-25.** When required business data is missing, the system produces a safe, conservative draft or flags that human input is needed; it does not invent facts.

## Editing

- **BR-26.** A human may edit a draft before approval.
- **BR-27.** An edited draft is what will be posted; the original draft and the edited version are both retained in history.
- **BR-28.** Editing does not bypass approval — the edited text must still be explicitly approved.

## Approval

- **BR-29.** Human approval is mandatory before any Facebook comment.
- **BR-30.** There is no automatic commenting in the MVP under any condition.
- **BR-31.** Each opportunity resolves to exactly one approval decision: approve, edit-then-approve, or reject.
- **BR-32.** Only an authorised user of the workspace may approve.

## Rejection

- **BR-33.** A human may reject an opportunity, optionally with a reason.
- **BR-34.** A rejected opportunity produces no comment and is closed; it remains in history.
- **BR-35.** Rejection is final for that opportunity; a new opportunity would be required to reconsider.

## Comment Idempotency

- **BR-36.** There is at most **one successful comment action per business-and-post combination**.
- **BR-37.** Once a comment for a business-and-post combination has succeeded, no further comment is posted for that combination.
- **BR-38.** Because a post may match multiple businesses, distinct businesses may each comment on the same post — but each combination still comments at most once.

## Retry

- **BR-39.** A retry is permitted **only** after a confirmed technical failure (e.g. a publish error, timeout, or crash before success).
- **BR-40.** A retry is not permitted after a confirmed success, nor after a rejection.
- **BR-41.** Retries are bounded by a fixed limit; beyond it, the opportunity is marked failed and surfaced for human attention.
- **BR-42.** Every retry is recorded as a distinct **comment attempt** in the audit history.

## Screenshot Evidence

- **BR-43.** Every **successful** comment must have a **screenshot** captured as evidence.
- **BR-44.** If a comment cannot be verified and evidenced, it is not treated as a confirmed success.
- **BR-45.** Screenshots are stored securely, scoped to the workspace, and linked to their comment attempt.

## Audit Logging

- **BR-46.** Every meaningful action — post discovery, match, draft, decision, comment attempt, result, session change, and kill-switch event — produces an **audit event**.
- **BR-47.** Audit events are append-only and never edited or deleted in the MVP.
- **BR-48.** It must always be possible to reconstruct what happened, when, on whose authority, and with what result.

## Session Expiry

- **BR-49.** When the Facebook session is expired or invalid, no comment is attempted.
- **BR-50.** New write actions for the affected workspace are paused, and the customer and operator are notified.
- **BR-51.** Pending opportunities are preserved and resume after successful re-authentication.

## CAPTCHA or Verification Interruption

- **BR-52.** If Facebook presents a CAPTCHA, checkpoint, or other verification during any action, the action stops and is not forced.
- **BR-53.** The interruption is classified, recorded, and surfaced to the human; the system never attempts to defeat or bypass such verification.
- **BR-54.** Affected write actions wait for human resolution rather than failing silently.

## Kill Switch

- **BR-55.** A global **kill switch** stops all new Facebook **write** actions (comments) system-wide.
- **BR-56.** While active, no new comment is initiated for any workspace.
- **BR-57.** Activation and deactivation are deliberate, recorded actions; deactivation requires an explicit human step.
- **BR-58.** No feature, retry, or automation may bypass the kill switch.

## Data Isolation

- **BR-59.** All data is scoped to a workspace; cross-workspace access is prohibited.
- **BR-60.** AI drafting is scoped to a single business's context; cross-business context leakage is prohibited.

## No Silent Failure

- **BR-61.** No failure is swallowed. Every error, interruption, or unexpected state is recorded and surfaced to the appropriate human (customer, operator, or both).
- **BR-62.** The system prefers to stop and ask rather than guess when a rule cannot be satisfied.

---

## Rule Precedence

When rules appear to conflict, resolve them in this order:

1. **Human Approval** and **No Silent Failure** (safety) — highest.
2. **Data Isolation** and **Correct Business Attribution**.
3. **Idempotency and Auditability**.
4. **Everything else**.

Safety and correctness always take precedence over convenience or throughput.
