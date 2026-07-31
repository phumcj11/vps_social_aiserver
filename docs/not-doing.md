# Not Doing — Explicit MVP Exclusions

This document lists what KMKT Social AI is **deliberately not building** in the MVP, and what is **explicitly out of scope for the current foundation sprint**. It exists to defend scope and make every exclusion a visible, intentional decision rather than an accident.

Being on this list does not mean an idea is bad. It means it is not part of the minimal core we are proving first. Some items may be adopted in later sprints; when they are, they move from here (or from the [backlog](backlog.md)) into a sprint plan.

This document upholds the **Keep MVP Small** and **No Feature Creep** principles. See [project-principles.md](project-principles.md).

---

## Out of scope for SPRINT -1 (Server Foundation)

The current sprint prepares the workspace only. The following are explicitly **not** done in this sprint:

- Any application source code — frontend, backend, or otherwise.
- Any user interface or frontend framework.
- Any API or backend service implementation.
- Any background worker implementation.
- Any database, schema, or data-layer work.
- Any container work — Docker, Docker Compose, images, or orchestration.
- Installing any runtime or platform software (Node.js, package managers, MySQL, web servers, etc.).
- Any automated or end-to-end testing tooling.
- Any deployment, CI/CD pipeline, or hosting configuration.

Only documentation and repository preparation are performed in this sprint.

---

## Not in the MVP

The following are excluded from the first product release. They are recorded here so the MVP stays deliberately small. The MVP is defined in [02-product-scope.md](02-product-scope.md); the loop it delivers is: discover Facebook Group posts → match to business → AI draft → Telegram approval → Playwright publish → screenshot and audit.

**What the MVP _does_ include (to avoid confusion below):** multiple **businesses** per customer within one workspace ([ADR-004](adr/ADR-004-multiple-businesses-per-customer.md)), and one shared Facebook account serving those businesses ([ADR-005](adr/ADR-005-single-facebook-account-mvp.md)). The exclusions below concern multiple Facebook _accounts_, multiple _users_, and multiple _platforms_ — not multiple businesses.

### Publishing and automation
- **Auto-commenting without human approval** (fully autonomous publishing) — permanently excluded for the MVP; it violates the **Human Approval** principle. Every Facebook comment requires explicit human approval ([ADR-006](adr/ADR-006-telegram-human-approval.md)).
- Scheduled or time-delayed publishing of approved comments.
- Publishing concurrency beyond one; bulk or parallel publishing.

### Platform breadth
- **Any platform other than Facebook.** TikTok, Instagram, LINE, and all other platforms are out of the MVP; each would be a future adapter behind the common contract.
- Platform-specific advanced features (ads, commerce, live formats, and similar).

### Facebook accounts and scaling
- **Multiple Facebook accounts per workspace** — deferred; the MVP uses one shared account ([ADR-005](adr/ADR-005-single-facebook-account-mvp.md)).
- **Browser farms and multi-account scaling** — excluded; the MVP runs one browser at a time (concurrency one) on a single VPS.

### Users and collaboration
- **Multiple users, team collaboration, and shared review workflows** within a workspace. The MVP has one owner-user per workspace (plus internal operator support).
- Fine-grained roles and permissions beyond what the core approval flow requires.

### Insight and optimisation
- Analytics, dashboards, and performance reporting on published comments.
- AI optimisation driven by engagement data.
- A/B testing of comment variants.

### Platform and operations
- Mobile applications (the web app is responsive; Telegram is the mobile approval surface).
- Public or third-party API for external integrators.
- Billing, subscriptions, and monetisation features.
- Internationalisation and localisation beyond the primary working language.

---

## How this list is used

- Any request for something on this list is not refused outright — it is directed to the [backlog](backlog.md) for future consideration.
- Moving an item off this list requires a deliberate decision in a sprint plan, and where architecturally significant, an Architecture Decision Record.
- This document is reviewed at the start of each sprint to confirm the boundaries still hold.
