# 04 — Customer Journey

**Document status:** Foundation (SPRINT 000)
**Applies to:** KMKT Social AI MVP

This document walks through the end-to-end journey of a customer using the MVP, from first registration to reviewing history and handling incidents. Each stage states what the customer does, what the system does, and the key rules that apply. Terminology follows [06-domain-model.md](06-domain-model.md) and [05-business-rules.md](05-business-rules.md).

---

## 1. Registration

**Customer:** Signs up with an email and password.
**System:** Creates a **User** account and, on first login, provisions a single **Workspace** owned by that user.
**Rules:** One customer account owns one workspace in the MVP. Credentials are stored securely; no third-party sign-in is required.

---

## 2. Workspace Creation

**Customer:** Lands in their workspace (created automatically at registration) and names it if desired.
**System:** Establishes the workspace as the container for all businesses, the Facebook connection, groups, opportunities, and history.
**Rules:** All data the customer creates lives inside their workspace and is isolated from every other workspace.

---

## 3. Business Creation

**Customer:** Creates one or more **businesses** (e.g. "Nok Home Cleaning").
**System:** Creates each business under the workspace, ready for its profile.
**Rules:** A workspace may hold multiple businesses ([ADR-004](adr/ADR-004-multiple-businesses-per-customer.md)). Each is independent.

---

## 4. Business Profile Setup

**Customer:** Fills in the business profile: products or services, service area, selling points, contact information, tone, keywords, response rules, and prohibited claims.
**System:** Stores the profile as the sole context the AI may use when drafting for that business.
**Rules:** The AI must use only the selected business's profile. Prohibited claims recorded here must never appear in drafts. A business with an incomplete profile can still be created, but the system flags that its drafts and matches will be weaker until completed.

---

## 5. Facebook Connection

**Customer:** Connects **one Facebook account** for the workspace, completing login (including any one-time password) through a guided, operator-supported flow.
**System:** Establishes a persistent, private browser profile for that account. It confirms the session is valid.
**Rules:** One Facebook account per workspace in the MVP ([ADR-005](adr/ADR-005-single-facebook-account-mvp.md)), usable by multiple businesses. Credentials, cookies, and the browser profile are stored securely server-side, never exposed to the frontend, and never committed to Git.

---

## 6. Group Assignment

**Customer:** Assigns one or more **Facebook Groups** to each business.
**System:** Records which groups each business monitors. The same group may be assigned to more than one business.
**Rules:** Only groups reachable by the connected Facebook account can be assigned. A group assigned to several businesses means posts there may match any of them.

---

## 7. Telegram Connection

**Customer:** Links their **Telegram** account to the workspace by starting the bot and completing a short pairing step.
**System:** Maps the customer to a **Telegram destination** for approvals and notifications.
**Rules:** Telegram is the approval interface, not the source of truth. If Telegram is not connected, opportunities queue and no comment can be approved until it is linked.

---

## 8. Post Discovery

**Customer:** Nothing required — this runs automatically.
**System:** The read-only **scanner** (Playwright) periodically visits assigned groups and discovers new posts, recording each unique post once.
**Rules:** Scanning never posts, likes, or writes anything. Each post is stored once per group to avoid duplicates. Discovery respects concurrency of one and the VPS budget.

---

## 9. Business Matching

**Customer:** Nothing required.
**System:** For each new post, evaluates it against each business's profile and keywords, producing zero, one, or multiple **business matches**, each with a **confidence score** and a plain-English **explanation**.
**Rules:** A post may match zero, one, or several businesses. The system never silently chooses one business when several match — ambiguity is surfaced. Posts that match no business generate no opportunity.

---

## 10. AI Draft Review (draft generation)

**Customer:** Nothing required to generate; review happens in the next step.
**System:** For a matched business, generates a **comment draft** using only that business's profile and tone, avoiding its prohibited claims. It assembles an **opportunity**: post summary, matched business, score, reasons, and draft.
**Rules:** One draft is prepared per business-and-post match. If required business data is missing, the system produces a safe, conservative draft or flags that human input is needed — it never invents facts.

---

## 11. Approve, Edit, or Reject

**Customer:** Receives the opportunity in Telegram — showing business name, group name, post summary, match score and reasons, and the draft — and chooses **Approve**, **Edit**, **Reject**, or **Open Post**.
**System:** Records the **approval decision**. On approve, it queues a **comment job**. On edit, it accepts the revised text and then treats it as approved. On reject, it closes the opportunity with a reason.
**Rules:** Human approval is mandatory before any comment. No comment is posted automatically. Each opportunity resolves to exactly one decision. Duplicate taps on the same decision are ignored.

---

## 12. Comment Result

**Customer:** Nothing required; awaits confirmation.
**System:** The **comment executor** (Playwright) navigates directly to the post, publishes the approved comment (concurrency one), **verifies** it appears, and captures a **screenshot**. It then sends a success or failure notification to Telegram and records the outcome.
**Rules:** One approved comment action per business-and-post combination. Successful comments must have screenshot evidence. Failures are classified and surfaced, never hidden.

---

## 13. Session-Expiry Recovery

**Customer:** May be asked, via Telegram and the web app, to help re-authenticate the Facebook account.
**System:** Detects an expired or invalid Facebook session, pauses new write actions for that workspace, notifies the customer and operator, and guides re-login (including one-time password) through the supported flow. Queued approvals wait rather than fail silently.
**Rules:** No comment is attempted on an invalid session. Recovery is explicit and recorded. Pending opportunities are preserved.

---

## 14. History Review

**Customer:** Opens the **Approval History** in the web app.
**System:** Shows every opportunity and its outcome — matched business, decision, who decided, comment text, result, and screenshot — as an auditable record.
**Rules:** Every comment attempt is auditable. History is read-only and scoped to the customer's workspace. Screenshots are available for successful comments.

---

## 15. Kill-Switch Incident Flow

**Customer or Operator:** Activates the global **kill switch** from System Status when something looks wrong.
**System:** Immediately stops initiating new Facebook **write** actions (comments). In-flight verification of an already-posted comment may complete and be recorded, but no new comment is started. The state is clearly shown, and the event is audited.
**Rules:** The kill switch stops new Facebook write actions system-wide. Read-only scanning may be paused as a policy choice, but writing is always halted. Reactivation is a deliberate, recorded action. Nothing bypasses the kill switch.

---

## Journey at a Glance

Registration → Workspace → Business → Business Profile → Facebook Connection → Group Assignment → Telegram Connection → Post Discovery → Business Matching → AI Draft → Telegram Review (Approve / Edit / Reject) → Publish & Verify → Screenshot & Result → History. Session-expiry recovery and the kill switch operate across the whole journey as safety mechanisms.
