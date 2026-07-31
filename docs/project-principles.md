# Project Principles — KMKT Social AI

These principles govern how KMKT Social AI is designed and built. They are deliberately few, and they take precedence over convenience, speed, or novelty. When a decision is unclear, it is resolved by returning to these principles. Every Architecture Decision Record and every sprint plan is expected to be consistent with them.

---

## 1. Business First

Every capability must earn its place by serving a clear business purpose. Features exist to help the business plan, produce, review, and publish social media content more effectively — not to showcase technology for its own sake.

Before any capability is designed, the question asked is: *what business outcome does this enable, and for whom?* If that question cannot be answered plainly, the capability is not built. Technical elegance is valued, but it is never a justification on its own.

---

## 2. Human Approval

AI proposes; a human disposes. Every piece of AI-generated content is treated as a proposal, not a decision. A human reviews and explicitly approves content before it is published to any audience.

Approval is a first-class step in every content workflow, designed in from the start rather than added later. The system is built to make review easy and approval deliberate. There is no path in which AI output reaches an audience without a human having consented to it.

---

## 3. Platform Adapter

Every external social platform is integrated behind a dedicated adapter that conforms to a single, common internal contract. The core of the system never speaks a platform's specific dialect; it speaks one internal language, and each adapter translates between that language and its platform.

This keeps platform-specific detail — authentication, formatting rules, rate limits, quirks — isolated at the edge. Adding, changing, or removing a platform affects its adapter and nothing else. The core remains stable regardless of how many platforms are supported.

---

## 4. Documentation First

Decisions and designs are written down before they are built. Documentation is not a record produced after the fact; it is the medium in which thinking happens.

Significant decisions are captured as Architecture Decision Records. Proposals under discussion live as RFCs. Sprints and tasks are specified before work begins. This principle is why the project's foundation sprint produces documentation and structure before a single line of application code exists.

---

## 5. Keep MVP Small

The first version of the product is deliberately minimal. The goal of the MVP is to prove the core value — assisted content creation with human approval — with the smallest surface area that can do so honestly.

A small MVP is faster to build, easier to reason about, and cheaper to change when reality teaches us something. Everything that is not essential to that core is deferred, and the deferrals are recorded in [not-doing.md](not-doing.md) so they are visible and intentional.

---

## 6. No Feature Creep

Scope is actively defended. New ideas are welcome, but they are parked in the [backlog](backlog.md), not smuggled into the current sprint. A good idea at the wrong time is still the wrong thing to build.

When a proposed addition does not serve the current objective, it is written down and set aside — not silently absorbed. Ideas that are considered and declined are recorded as rejected, with the reasoning, so they are not quietly revived later without cause.

---

## 7. Everything Auditable

Meaningful actions — creating, changing, approving, or publishing content — are designed to leave a durable, explainable trail. It should always be possible to answer *what happened, when, and on whose authority.*

Auditability is an architectural property built in from the foundation, not a logging feature added at the end. It underpins trust in an AI-assisted system: because every outcome can be traced and explained, the business can rely on the platform with confidence.

---

## How these principles are applied

- Every Architecture Decision Record states which principles it upholds or trades off.
- Every sprint objective is checked against **Business First** and **Keep MVP Small**.
- Every new idea is filtered through **No Feature Creep** before it enters a sprint.
- Every content-handling design is checked against **Human Approval** and **Everything Auditable**.
- Every external integration is checked against **Platform Adapter**.
