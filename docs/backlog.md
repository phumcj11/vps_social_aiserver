# Backlog — KMKT Social AI

This backlog captures ideas that are not part of the current sprint. It exists so that good thinking is not lost and scope is not quietly expanded. Nothing here is a commitment. Items move out of the backlog only when a sprint deliberately adopts them.

The backlog directly supports two principles: **No Feature Creep** (ideas are parked here rather than smuggled into active work) and **Documentation First** (thinking is written down before it is built). See [project-principles.md](project-principles.md).

As of SPRINT 000, the MVP scope is defined by [02-product-scope.md](02-product-scope.md) and the Architecture Decision Records. In particular: **multiple businesses per customer is confirmed MVP scope** ([ADR-004](adr/ADR-004-multiple-businesses-per-customer.md)); **multiple Facebook accounts per workspace is future scope** ([ADR-005](adr/ADR-005-single-facebook-account-mvp.md)); **TikTok and other non-Facebook platforms remain future scope**; and **auto-commenting without human approval remains rejected for the MVP**.

---

## Ideas

Early, unrefined thoughts. These have not been evaluated for fit, effort, or priority. They are recorded so they can be considered deliberately later.

- A content calendar view for planning posts across platforms over time.
- Reusable content templates for common recurring post types.
- A brand-voice profile that guides AI drafting toward a consistent tone.
- Lightweight performance signals (engagement) surfaced back to the content planning view.
- A review queue that groups pending approvals for efficient human sign-off.
- Role separation between those who draft and those who approve.

---

## Future Features

Ideas that are plausibly valuable and likely to be built in some form, but are explicitly deferred beyond the MVP. They are kept here so the MVP stays small while the direction remains visible.

- **Multiple Facebook accounts per workspace** — future scope. The MVP supports one Facebook account per workspace, shared by all businesses ([ADR-005](adr/ADR-005-single-facebook-account-mvp.md)); a migration path is recorded there.
- **TikTok support** — future scope. A future platform adapter alongside Facebook, once the core loop is proven.
- **Instagram and LINE support** — future scope. Additional platform adapters beyond Facebook.
- Scheduled publishing of approved content at a chosen future time.
- Analytics and reporting on published comment performance.
- Collaboration and team-review features (multiple users per workspace, roles).
- Multi-account scaling and higher publishing concurrency (beyond the MVP's concurrency of one).

---

## Rejected Ideas

Ideas that were considered and deliberately declined, with the reason. They are recorded so they are not silently revived without new justification.

- **Auto-commenting without human approval (fully autonomous publishing).** Rejected for the MVP — it violates the **Human Approval** principle, which is core to the product's value and trustworthiness. Every Facebook comment requires explicit human approval ([ADR-006](adr/ADR-006-telegram-human-approval.md), [05-business-rules.md](05-business-rules.md) BR-29/BR-30).
- **Building a bespoke general-purpose social platform.** Rejected — outside the business purpose; the product assists with content for existing platforms, it does not replace them.
- **Adopting a heavy microservices architecture up front.** Rejected for the MVP — it conflicts with **Keep MVP Small** and adds operational cost the foundation host cannot justify at this stage.

---

## Technical Debt

Known compromises, deferred cleanups, and constraints to revisit. During the foundation sprint this section records constraints observed rather than debt incurred in code.

- **Host CPU constraint.** The foundation host provides 2 logical cores (see [server-audit.md](server-audit.md)). Future build and container workloads must be planned against this limit or the host upgraded.
- **Host memory constraint.** Approximately 3.2 GiB of RAM is available. Service footprints must be tracked against this as the system grows.
- **No dependency tooling yet.** No package manager beyond the system defaults is installed. When runtimes are introduced in a later sprint, dependency and lockfile strategy must be decided deliberately via an ADR.
