# 11 — Telegram Design

**Document status:** Foundation (SPRINT 000)
**Applies to:** KMKT Social AI MVP

This document describes how Telegram is used as the human approval interface for the MVP: onboarding, how opportunities are presented, how decisions are captured safely, and how results are communicated. It is a design specification only. **No Telegram bot is created, connected, or run in this sprint.**

The defining rule: **Telegram is an approval interface, not the source of truth.** Every decision received through Telegram is validated and recorded by the Backend, which enforces all rules.

---

## Telegram Onboarding

- The customer connects Telegram from the web app's Settings by starting the bot and completing a short **pairing** step (e.g. a one-time pairing code) that links their Telegram chat to their workspace.
- Until Telegram is paired, opportunities queue and no approval can be given; the app clearly prompts the customer to connect.
- Pairing status is visible in the web app and is recorded as an audit event.

## Mapping Customer to Telegram Destination

- Pairing creates a **Telegram Destination** that maps the customer's Telegram chat to their workspace (see [06-domain-model.md](06-domain-model.md)).
- All opportunities and notifications for that workspace are delivered to this destination and to no other.
- The Backend always resolves the destination from its own records — never from data supplied in an incoming Telegram message — preserving isolation (BR-59).

## Opportunity Notification Format

Each opportunity is delivered as a clear, self-contained message containing:

- **Business name** — which business this opportunity is for (unambiguous, especially for multi-business owners).
- **Group name** — the Facebook Group the post came from.
- **Original post summary** — a concise, neutral summary of what the poster wants.
- **AI match score and reasons** — the confidence score and the plain-English explanation of why the post is relevant.
- **Draft comment** — the proposed comment text (or a clear note that no compliant draft could be produced and the human should write one — see [09-ai-design.md](09-ai-design.md)).

When a post matches **multiple businesses**, each business is sent as its **own opportunity message** with its own score, reasons, and draft. The bot never merges them or asks the human to pick a business inside one message; each is decided independently (BR-19–BR-21).

## Buttons

Each opportunity message offers clear actions:

- **Approve** — accept the draft as-is; the Backend creates a Comment Job.
- **Edit** — provide revised comment text; the edited text becomes what will be posted and still requires the approval action (BR-28).
- **Reject** — decline the opportunity, optionally with a reason; no comment is posted.
- **Open Post** — open the original Facebook post to review it in context (read-only; opening does not decide anything).

## Callback Validation

- Every button tap (callback) is **validated by the Backend** before any effect: it confirms the callback belongs to a known opportunity, that the sender maps to the owning workspace's destination, and that the opportunity is still open.
- The Backend, not Telegram, decides whether the action is allowed and records the resulting Approval Decision.
- Unauthorised or mismatched callbacks are rejected and audited.

## Duplicate Callback Protection

- If the same decision is tapped more than once (double-tap, retries, network echoes), only the **first valid** decision takes effect; subsequent identical callbacks are ignored (BR-31).
- The user receives a clear acknowledgement so they are not left uncertain, without a second action being triggered.
- This prevents a second comment or conflicting decisions on one opportunity.

## Expired Approval Handling

- Opportunities have a validity window. If a decision arrives after the opportunity has expired or was already resolved, the callback is **not acted upon**; the user is told it has expired or is already handled.
- Expiry never results in an automatic post or an ambiguous state; the opportunity remains visible in history with its outcome.
- If circumstances change (e.g. session was invalid), the human is guided to the current state rather than acting on stale information.

## Success and Failure Notifications

- On a **verified successful** comment, the customer receives a success notification, including confirmation and reference to the captured screenshot evidence.
- On **failure**, the customer receives a clear failure notification stating the classification (e.g. session expired, checkpoint encountered, publish failed) and what happens next (waiting, retry within limits, or needs attention) — never a silent non-result (BR-61).
- Notifications are also reflected in the web app's history.

## Session Reconnection Notification

- If the Facebook session expires or a checkpoint/CAPTCHA appears, the customer is notified via Telegram that action is paused and re-authentication or resolution is needed (BR-50).
- The notification links the customer to the guided recovery flow in the web app.
- Pending opportunities are preserved and resume after successful reconnection; the human is told when normal operation resumes.

## Telegram Is an Approval Interface, Not the Source of Truth

- Telegram **presents** opportunities and **collects** decisions; it **stores and decides nothing** authoritative.
- The Backend validates every callback, enforces approval, idempotency, isolation, and the kill switch, and writes the definitive record.
- If Telegram messages were lost, delayed, or duplicated, the Backend's records remain the single source of truth, and no rule is weakened.
- No comment is ever posted by Telegram itself; Telegram only conveys the human's approval to the Backend, which then authorises the Playwright adapter.

---

## Telegram Guarantees (summary)

1. Each opportunity clearly states the business, group, post summary, score/reasons, and draft.
2. Multi-business matches are sent as separate, independently-decided opportunities.
3. Approve, edit, reject, and open-post are the only actions; approval is always explicit.
4. Every callback is validated server-side; duplicates and expired callbacks are safely ignored.
5. Success and failure are always communicated; nothing is silent.
6. Session problems are surfaced with a path to recovery; pending work is preserved.
7. Telegram is an interface only — the Backend is the source of truth and the sole authoriser of posts.
