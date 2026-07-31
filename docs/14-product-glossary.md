# 14 — Product Glossary

**Document status:** Foundation (SPRINT 000)
**Applies to:** KMKT Social AI MVP

Plain-English definitions of the product and technical terms used across the documentation. Terms are consistent with [06-domain-model.md](06-domain-model.md) and [05-business-rules.md](05-business-rules.md). Where a term is a domain entity, its detailed definition lives in the domain model; here it is summarised for quick reference.

---

### Adapter
The layer that translates between the product's internal language and a specific external platform. Facebook is the first adapter. See **Platform Adapter**.

### Approval Decision
The human's recorded choice on a draft: approve, edit-then-approve, or reject. Exactly one per opportunity.

### Audit Event
An append-only record of something meaningful that happened (discovery, match, draft, decision, attempt, result, session change, kill-switch change). Enables full reconstruction of events.

### Backend (Backend API)
The single source of truth. It owns the domain model, enforces all business rules, stores data, calls the AI provider, and authorises every Facebook write. Business logic lives here and nowhere else.

### Business
A single venture a customer wants to capture leads for — the core domain concept. A workspace may contain many.

### Business Group Assignment
The link stating that a specific business monitors a specific Facebook Group. The same group may be assigned to several businesses.

### Business Match
The judgement that a post is relevant to a particular business, carrying a confidence score and a plain-English explanation. A post may have zero, one, or many.

### Business Profile
The complete context defining a business: products/services, service area, selling points, contact information, tone, keywords, response rules, and prohibited claims. The only context the AI may use for that business.

### CAPTCHA / Checkpoint
A Facebook verification challenge. The system never attempts to solve or bypass it; it stops, records the interruption, and asks a human to resolve it.

### Comment Attempt
A single try at publishing a comment via Playwright. Every attempt is recorded; a verified success has screenshot evidence.

### Comment Draft
The proposed comment text for a specific business-and-post match, generated using only that business's context. Always a proposal for human review.

### Comment Executor
The Playwright component that publishes approved comments (the write role of the Facebook adapter). Runs at concurrency one and is gated by the kill switch.

### Comment Job
The unit of work to publish an approved comment. Created only from a recorded approval; enforces idempotency; runs one or more attempts.

### Concurrency One
The hard limit that at most one Playwright browser action (scan or comment) runs at any time, driven by the VPS budget and safety.

### Confidence Score
A consistent-scale measure of how well a post fits a business, shown to the human as a decision aid — never an authorisation to post.

### Customer
The business owner who uses the product; represented as a **User** that owns one workspace.

### Data Isolation
The guarantee that a workspace's data is never visible to another, and that a business's context never leaks into another business's draft.

### Draft
Short for **Comment Draft**.

### Facebook Group
A Facebook Group whose posts may contain leads; assignable to businesses.

### Idempotency
The rule that a given business-and-post combination results in at most one successful comment. Prevents duplicate posting.

### Kill Switch
The global control that immediately stops all new Facebook write actions system-wide. Cannot be bypassed; every change is audited.

### Lead
A person expressing, in a post, a need the business can serve. The product surfaces leads as opportunities.

### Match Explanation
The plain-English reasons a post was judged relevant to a business (e.g. service-area and keyword overlap, expressed intent).

### MVP
Minimum Viable Product — the deliberately small first version that proves the core loop for a pilot customer.

### n8n
The workflow orchestrator that sequences background steps by calling the Backend. It coordinates timing but is not the source of truth and makes no business decisions.

### Opportunity
The human-facing bundle of a Business Match with its post summary, score, reasons, and draft — what the customer reviews in Telegram or the web app. A presentation concept built from domain entities.

### OTP (One-Time Password)
A one-time code sometimes required during Facebook login. Handled in a guided, human-assisted flow; never stored as a reusable secret.

### Persistent Browser Profile
The stored browser session (cookies/state) that keeps the Facebook account logged in between actions. Stored securely server-side; never committed to Git or exposed to the frontend.

### Platform
The abstract representation of an external social platform as an adapter target. Facebook is the only value in the MVP.

### Platform Account
A connected external account through which the system reads posts and publishes comments. One Facebook account per workspace in the MVP.

### Platform Adapter
The design principle that each external platform is integrated behind a common internal contract, keeping platform specifics at the edge and the core stable.

### Playwright
The browser-automation mechanism used by the Facebook adapter to scan posts (read) and publish approved comments (write). A tool of the adapter, not a decision-maker.

### Post
A single discovered Facebook Group post that may be a lead. Stored once per group.

### Prohibited Claims
Statements a business must never make (e.g. unverifiable guarantees, regulated medical/legal/financial assertions). A hard constraint on every draft.

### Response Rules
A business's dos and don'ts for how it engages, applied when drafting comments.

### Scanner
The Playwright component that discovers new posts in assigned groups (the read-only role of the Facebook adapter). It never writes.

### Screenshot Evidence
The image captured on a verified successful comment, proving it was published. Required for every success; stored securely and workspace-scoped.

### Selling Points
What makes a business a good choice; used to shape relevant, specific drafts.

### Service Area
The geographic area a business serves; used in matching and drafting.

### Session Expiry
When the Facebook session becomes invalid. Writing is paused, the human is notified, and re-authentication is requested; pending work is preserved.

### Telegram Bot
The Telegram interface that delivers opportunities and collects approve/edit/reject decisions, forwarding them to the Backend for validation.

### Telegram Destination
The mapping of a customer's Telegram chat to their workspace, resolved from the Backend's own records.

### Tone
How a business wants to sound (e.g. friendly, professional). Steers draft voice, but never overrides prohibited claims or response rules.

### User
The customer account; owns exactly one workspace in the MVP.

### Verification
Confirming, after posting, that a comment actually appears. An unverifiable comment is not counted as a success.

### VPS Budget
The resource envelope of the target host: 2 CPU cores and 3.8 GiB RAM. It constrains the architecture (concurrency one, single host, no heavy infrastructure).

### Workspace
The isolation boundary and container for all of a customer's data: businesses, the Facebook connection, groups, opportunities, and history. One per user in the MVP.
