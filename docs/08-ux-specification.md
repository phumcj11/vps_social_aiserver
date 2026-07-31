# 08 — UX Specification

**Document status:** Foundation (SPRINT 000)
**Applies to:** KMKT Social AI MVP

This document defines the MVP screens of the web application. It specifies, per screen, the user's goal, the primary information shown, the primary actions, the empty and error states, mobile considerations, and permissions. It describes intent and content, not visual design or markup. The Telegram approval surface is specified separately in [11-telegram-design.md](11-telegram-design.md).

**Global conventions (apply to every screen):**
- All screens are scoped to the signed-in user's single workspace; nothing from another workspace is ever shown (BR-3, BR-59).
- The web app is responsive and usable on a phone; the primary approval flow is expected to happen in Telegram.
- Every screen surfaces errors clearly and never hides a failure (BR-61).
- The kill-switch state is visible from a persistent indicator so the user always knows whether Facebook writing is halted.
- Permissions in the MVP: a workspace has one owner-user who can do everything; the internal operator/administrator has read access to system status and the kill switch for support.

---

## 1. Login

- **User goal:** Sign in securely to reach the workspace.
- **Primary information:** Email and password fields; product name; link to register.
- **Primary actions:** Log in; go to registration; recover access.
- **Empty state:** Blank form with clear labels.
- **Error state:** Invalid credentials shown plainly without revealing which field was wrong; lockout guidance after repeated failures.
- **Mobile considerations:** Single-column, large tap targets, no horizontal scroll.
- **Permissions:** Public (unauthenticated).

## 2. Dashboard

- **User goal:** See the current state at a glance and jump to what needs attention.
- **Primary information:** Count of new opportunities awaiting decision; Facebook connection and session health; kill-switch state; per-business quick stats (businesses, assigned groups); recent activity summary.
- **Primary actions:** Open opportunities; go to a business; open system status; connect Facebook or Telegram if not yet done.
- **Empty state:** For a new customer, a short guided checklist (create a business → complete profile → connect Facebook → assign groups → connect Telegram).
- **Error state:** Prominent banners for expired Facebook session, disconnected Telegram, or active kill switch, each with a direct link to resolve.
- **Mobile considerations:** Cards stack vertically; the most urgent item (pending approvals or a session problem) appears first.
- **Permissions:** Workspace owner.

## 3. Workspaces

- **User goal:** View and name the workspace.
- **Primary information:** Workspace name, owner, creation date; summary of contained businesses.
- **Primary actions:** Rename workspace.
- **Empty state:** Not applicable — the workspace always exists after registration.
- **Error state:** Save failure shown inline with retry.
- **Mobile considerations:** Simple single-column form.
- **Permissions:** Workspace owner. (Multi-workspace is out of MVP scope; this screen manages the single workspace.)

## 4. Businesses

- **User goal:** Manage the list of businesses in the workspace.
- **Primary information:** List of businesses with name, status, number of assigned groups, and profile-completeness indicator.
- **Primary actions:** Create a business; open a business; enable/disable a business.
- **Empty state:** "No businesses yet" with a clear "Create your first business" action and a one-line explanation that a business is the core unit.
- **Error state:** Create/update failures shown inline; disabling a business asks for confirmation.
- **Mobile considerations:** List rows are tappable cards; primary "Create" action is always reachable.
- **Permissions:** Workspace owner.

## 5. Business Profile

- **User goal:** Provide the complete context the AI will use for this business.
- **Primary information:** Products or services, service area, selling points, contact information, tone, keywords, response rules, and prohibited claims — grouped into clear sections; a completeness indicator.
- **Primary actions:** Edit and save each section; add/remove keywords, selling points, and prohibited claims.
- **Empty state:** A structured, guided form with helper text explaining why each field matters (especially prohibited claims and tone).
- **Error state:** Validation messages per field; unsaved-changes warning; save failures shown inline.
- **Mobile considerations:** Sections are collapsible; long lists (keywords, prohibited claims) are easy to add to on mobile.
- **Permissions:** Workspace owner.

## 6. Facebook Connection

- **User goal:** Connect and maintain the one Facebook account for the workspace.
- **Primary information:** Connection status; session validity; last verified time; guidance for login and one-time password; clear statement that credentials are stored securely and never shared.
- **Primary actions:** Start connection; complete login/OTP via the guided flow; re-authenticate when the session expires; disconnect.
- **Empty state:** "No Facebook account connected" with a "Connect Facebook" action and a short explanation that one account serves all businesses in the MVP.
- **Error state:** Session expired, CAPTCHA/checkpoint encountered, or login failed — each shown explicitly with the next step; never a silent failure.
- **Mobile considerations:** Step-by-step guided flow suited to a phone; clear waiting/among-steps states.
- **Permissions:** Workspace owner; operator may view status for support.

## 7. Facebook Groups

- **User goal:** Assign the right groups to each business.
- **Primary information:** Groups reachable by the connected account; which businesses each group is assigned to; per-business view of monitored groups.
- **Primary actions:** Assign a group to one or more businesses; remove an assignment.
- **Empty state:** If no Facebook account is connected, prompt to connect first; if connected but no groups assigned, prompt to assign groups per business.
- **Error state:** If groups cannot be listed (e.g. invalid session), an explicit message linking to Facebook Connection.
- **Mobile considerations:** Assignment uses simple toggles/checklists; the same group visibly assignable to multiple businesses.
- **Permissions:** Workspace owner.

## 8. Opportunities / Posts

- **User goal:** See discovered opportunities awaiting a decision.
- **Primary information:** List of opportunities, each showing matched business, group name, post summary, match score, and decision status (pending/approved/edited/rejected/failed).
- **Primary actions:** Open an opportunity; filter by business or status. (Approval also happens in Telegram; the list reflects those decisions.)
- **Empty state:** "No opportunities yet" with a note that the scanner surfaces posts as they appear, and a check that groups and Telegram are set up.
- **Error state:** If scanning is paused (session expired or kill switch active), an explicit banner explains why no new opportunities are arriving.
- **Mobile considerations:** Compact cards; matched business and score prominent; newest first.
- **Permissions:** Workspace owner.

## 9. Opportunity Detail

- **User goal:** Understand a single opportunity fully and, if reviewing on the web, decide.
- **Primary information:** Matched business; group name; full post content/summary; match score and plain-English reasons; the AI comment draft; if the post matched multiple businesses, each candidate business is shown distinctly with its own score and reasons (never a silent single choice).
- **Primary actions:** Approve; edit then approve; reject with optional reason; open the original post. Actions are disabled and explained when the kill switch is active or the session is invalid.
- **Empty state:** Not applicable — reached only for an existing opportunity.
- **Error state:** Publish failures shown with classification and any retry status; verification/screenshot status shown after posting.
- **Mobile considerations:** Draft text is easy to read and edit on a phone; approve/reject are large, clearly separated buttons to avoid mistakes.
- **Permissions:** Workspace owner decides; operator may view for support.

## 10. Approval History

- **User goal:** Review a trustworthy record of what happened.
- **Primary information:** Chronological list of opportunities and outcomes — matched business, decision, deciding user, original and edited comment text, result, and a link to screenshot evidence for successful comments.
- **Primary actions:** Open an entry; filter by business, status, or date; view screenshot.
- **Empty state:** "No history yet" explaining that decisions and results will appear here.
- **Error state:** If a screenshot is missing for a supposed success, that inconsistency is flagged rather than hidden (a success without evidence is not a confirmed success, BR-44).
- **Mobile considerations:** Entries are readable cards; screenshots open full-screen.
- **Permissions:** Workspace owner; operator may view for support. Read-only for everyone.

## 11. Settings

- **User goal:** Manage account, Telegram connection, and workspace preferences.
- **Primary information:** Account details; Telegram connection status and pairing; notification preferences; security basics (password change).
- **Primary actions:** Connect/re-pair Telegram; change password; update preferences.
- **Empty state:** If Telegram is not connected, a clear "Connect Telegram" step with pairing instructions.
- **Error state:** Pairing failures and save errors shown explicitly with retry.
- **Mobile considerations:** Simple grouped settings; Telegram pairing convenient from a phone.
- **Permissions:** Workspace owner.

## 12. System Status and Kill Switch

- **User goal:** Understand system health and be able to stop all Facebook write actions instantly.
- **Primary information:** Kill-switch state (active/inactive) with who last changed it and when; Facebook session health; scanner status; recent errors, session-expiry events, and checkpoints; concurrency status.
- **Primary actions:** Activate the kill switch (immediate); deactivate (deliberate, confirmed step); refresh status.
- **Empty state:** Not applicable — status always exists.
- **Error state:** Clearly distinguishes "paused by kill switch" from "paused by session problem" from "system error", each with guidance; every state change is recorded to history.
- **Mobile considerations:** The kill switch is a large, unmistakable control with confirmation to prevent accidental toggling; state is obvious at a glance.
- **Permissions:** Workspace owner and operator/administrator. The kill switch is available to both so an incident can always be stopped.

---

## Cross-Screen Rules

- No screen ever posts to Facebook directly; actions request the Backend, which enforces approval, idempotency, and the kill switch.
- Multi-business matches are always presented as distinct candidates; no screen silently resolves them (BR-20).
- Every failure state is visible and explained; nothing is silently swallowed (BR-61).
- The kill-switch indicator and Facebook-session health are visible across the app, not buried in one screen.
