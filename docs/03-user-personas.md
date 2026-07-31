# 03 — User Personas

**Document status:** Foundation (SPRINT 000)
**Applies to:** KMKT Social AI MVP

These personas describe who the MVP is for and who operates it. They exist to keep design decisions grounded in real needs. Where a design choice affects one of these people, this document is the reference for their goals, constraints, and concerns.

---

## Persona 1 — Solo Business Owner (one business)

**Example:** Nok runs a single home-cleaning service in one city. She is the owner, the operator, and the marketer.

### Goals
- Win new customers from people already asking for her service in local Facebook Groups.
- Spend as little time as possible watching feeds.
- Respond quickly and in a friendly, trustworthy tone that reflects her business.

### Pain points
- She belongs to several local groups and cannot keep up with them.
- By the time she sees a relevant post, other providers have already replied.
- Writing a good, specific comment each time is tiring.
- She worries about looking spammy or breaking group rules.

### Technical comfort
- Comfortable with Facebook and Telegram on her phone.
- Not a technical user; expects clear screens and simple choices.
- Will abandon anything that feels complicated or risky.

### Daily workflow
- Runs jobs during the day; checks her phone between tasks.
- Prefers to handle admin in short bursts, on mobile.
- Wants to glance at an opportunity, decide, and move on.

### Trust concerns
- Fears an AI posting something wrong or embarrassing in her name.
- Wants to read exactly what will be posted before it goes out.
- Needs proof that a comment was actually posted.

### Definition of value
- Real leads she would otherwise have missed, delivered to Telegram.
- Drafts good enough to approve with little or no editing.
- Absolute confidence that nothing is posted without her tap.

---

## Persona 2 — Owner with Multiple Businesses

**Example:** Somchai owns three small ventures: a coffee shop, a small catering service, and a bicycle repair shop. Each has a different offer, area, and tone.

### Goals
- Capture leads for all three businesses from one place.
- Keep each business's voice and details cleanly separated.
- Avoid the effort of running three separate monitoring routines.

### Pain points
- The same group can contain leads for different businesses; it is easy to confuse them.
- A comment written for the coffee shop must never carry the repair shop's phone number or claims.
- Managing three sets of keywords, service areas, and rules is mentally heavy.

### Technical comfort
- More experienced than the solo owner, but still non-technical.
- Values organisation and clear labelling of which business an opportunity belongs to.

### Daily workflow
- Switches context frequently between his ventures.
- Reviews opportunities in batches, often in the evening.
- Needs each Telegram opportunity to clearly state which business it is for.

### Trust concerns
- Above all, fears cross-contamination — the system attributing a post to, or replying on behalf of, the wrong business.
- Wants explicit handling when a post could fit more than one of his businesses.
- Needs an audit trail per business.

### Definition of value
- One inbox of opportunities, each unambiguously tied to the right business.
- A hard guarantee that business contexts never mix.
- When a post matches several of his businesses, a clear choice rather than a silent guess.

---

## Persona 3 — Internal Operator / Product Administrator

**Example:** Priya is part of the KMKT team. She onboards pilot customers, watches system health, and steps in when something breaks.

### Goals
- Get pilot customers set up smoothly.
- Keep the system healthy within the small VPS budget.
- Intervene safely when Facebook sessions expire, checkpoints appear, or something looks wrong.

### Pain points
- A single VPS with 2 cores and 3.8 GiB RAM leaves little headroom; runaway processes are a real risk.
- Facebook may present CAPTCHAs, checkpoints, or expire sessions at inconvenient times.
- She must be able to stop all Facebook write activity instantly if something goes wrong.

### Technical comfort
- Technically capable; comfortable with dashboards, logs, and system status.
- Understands the architecture and the safety rules.

### Daily workflow
- Monitors system status and the health of the Facebook session and scanner.
- Responds to alerts about session expiry or checkpoints.
- Reviews audit history when a customer reports a problem.
- Uses the kill switch during incidents.

### Trust concerns
- Needs certainty that the kill switch truly halts new Facebook write actions.
- Needs every action to be auditable so incidents can be reconstructed.
- Must never see one customer's data leak into another's view.

### Definition of value
- Clear system status and health signals.
- A reliable, obvious kill switch.
- Complete, accurate audit history for support and incident response.
- A system that stays within its resource budget without manual babysitting.

---

## Cross-Persona Priorities

| Concern                        | Solo Owner | Multi-Business Owner | Operator |
| ------------------------------ | ---------- | -------------------- | -------- |
| No posting without approval    | Critical   | Critical             | Critical |
| Correct business attribution   | Important  | Critical             | Critical |
| Fast mobile approval           | Critical   | Important            | —        |
| Screenshot / proof of posting  | Important  | Important            | Important |
| Audit history                  | Nice       | Important            | Critical |
| Kill switch                    | Reassuring | Reassuring           | Critical |
| Runs within VPS budget         | —          | —                    | Critical |

These priorities inform every UX and architecture decision in the documents that follow.
