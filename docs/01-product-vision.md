# 01 — Product Vision

**Document status:** Foundation (SPRINT 000)
**Applies to:** KMKT Social AI MVP

---

## Product Vision

KMKT Social AI helps small business owners turn everyday conversations in Facebook Groups into real customer opportunities — without spending hours reading feeds, and without ever letting an AI speak for them unsupervised.

The vision is a supervised assistant: the system watches the groups a business cares about, spots posts where someone is expressing a need the business can serve, drafts a helpful, business-specific comment, and hands that draft to the owner for a one-tap decision on their phone. AI does the tedious work of finding and drafting. The human keeps full authority over what is said in their name.

We are deliberately not building an autonomous marketing bot. We are building a tool that respects the owner's voice, their brand, and their judgement — while removing the drudgery that stops them from engaging with potential customers today.

---

## Customer Problem

Small business owners know that Facebook Groups are full of people asking for exactly what they sell — "Can anyone recommend a plumber in this area?", "Looking for a caterer for 40 people next month", "Which shop repairs this model?". These are high-intent moments where a timely, genuine comment can win a customer.

But capturing these moments is hard in practice:

- **The posts are buried.** An owner may belong to many groups, each with a fast-moving feed. Relevant posts scroll past unseen.
- **Watching is a full-time distraction.** Constantly refreshing groups pulls owners away from running the business.
- **Responding well takes effort.** A good comment is specific to the business — its service area, its products, its tone — and writing that repeatedly is tiring.
- **Owners often run more than one business.** Each has a different offer, and a comment meant for one business must never be posted with another's details.
- **Generic automation is dangerous.** Auto-posting bots damage reputations, break group rules, and can make false claims. Owners rightly distrust them.

The result: real opportunities are missed every day, and the owners who would benefit most have the least time to capture them.

---

## Proposed Solution

KMKT Social AI addresses this with a tightly-scoped, human-in-the-loop workflow:

1. The owner sets up one or more **businesses**, each with its own profile: what it sells, where it operates, its selling points, its tone, its keywords, and — importantly — the claims it must never make.
2. The owner connects **one Facebook account** and assigns the relevant **Facebook Groups** to each business.
3. The system **scans new posts** in those groups (read-only) and **matches** each post to the business or businesses it is relevant to, with a confidence score and a plain-English explanation.
4. For a matched post, the AI generates a **business-specific comment draft** using only that business's context.
5. The opportunity — post summary, matched business, score, reasons, and draft — is sent to the owner over **Telegram** for review.
6. The owner **approves, edits, or rejects** with a tap. Nothing is posted without an explicit approval.
7. On approval, an automated browser (**Playwright**) **publishes the comment** through the connected Facebook account, then captures a **screenshot** as evidence.
8. Every step is **recorded** in an audit history the owner can review, and a global **kill switch** can stop all new Facebook write actions instantly.

The core of the product is the **business** and its context. Facebook is simply the first platform adapter through which opportunities arrive and comments are published.

---

## Value Proposition

- **Never miss a lead.** The system watches the groups so the owner does not have to.
- **Respond in your own voice.** Drafts are shaped by each business's tone, selling points, and rules — not generic marketing copy.
- **Stay in control.** Every comment is approved by a human before it is posted. There is no autonomous posting.
- **Trust what happened.** Every attempt is auditable and every successful comment has screenshot evidence.
- **Manage several businesses safely.** One account, one inbox of opportunities, with a hard guarantee that a business's details are never mixed up with another's.
- **One tap from your phone.** Approval happens in Telegram, where owners already are.

---

## Product Positioning

KMKT Social AI is positioned as a **supervised lead-engagement assistant for small businesses on Facebook Groups**.

- It is **not** a social media scheduler (it does not plan and post content on a calendar).
- It is **not** an autonomous marketing bot (it never posts without human approval).
- It is **not** an analytics suite (measuring engagement performance is out of scope for the MVP).
- It is **not** a CRM (it does not manage the full customer lifecycle).

It sits in the narrow, underserved space between "manually watching groups all day" and "reckless auto-posting bots": an assistant that finds and drafts, while the human decides and approves.

---

## MVP Objective

Prove that a small business owner can:

1. Set up at least one business with a meaningful profile.
2. Connect one Facebook account and assign groups.
3. Receive genuinely relevant opportunities with useful AI drafts over Telegram.
4. Approve a comment and have it reliably published to Facebook with screenshot evidence.
5. Review a trustworthy history of what happened.

If a pilot owner completes this loop and feels the opportunities and drafts are worth their attention, the core hypothesis is validated.

---

## Product Principles

The seven governing principles in [project-principles.md](project-principles.md) apply in full. As they express in this product specifically:

- **Business First** — the business and its context are the core; every feature serves capturing real leads for a real business.
- **Human Approval** — no Facebook comment is ever posted without an explicit human approval. This is non-negotiable in the MVP.
- **Platform Adapter** — Facebook is the first adapter behind a common internal contract, not the product core. The design must not assume Facebook is the only platform.
- **Documentation First** — this foundation exists before any code.
- **Keep MVP Small** — one Facebook account, one approval channel, concurrency of one, no scaling features.
- **No Feature Creep** — TikTok, Instagram, LINE, billing, teams, browser farms, and auto-commenting are explicitly out.
- **Everything Auditable** — every comment attempt is recorded; every success has a screenshot.

---

## Success Definition for the First Usable Release

The first usable release is successful when **all** of the following are true for a pilot customer:

- The owner can register, create a workspace, and create one or more businesses with complete profiles.
- The owner can connect one Facebook account and assign at least one group per business.
- The scanner reliably discovers new posts in assigned groups without posting anything.
- At least a meaningful proportion of surfaced opportunities are judged relevant by the owner, and drafts are usable with light editing or less.
- When a post matches multiple businesses, the owner is never shown a silently-chosen wrong business — ambiguity is surfaced explicitly.
- The owner can approve, edit, or reject each opportunity from Telegram.
- Approved comments are published to Facebook with a success confirmation and a screenshot.
- Every attempt, successful or not, appears in an auditable history.
- The kill switch reliably halts all new Facebook write actions.
- The system runs within the current VPS constraints (2 CPU cores, 3.8 GiB RAM) without instability.

Success is defined by a **trustworthy, complete loop for one pilot customer** — not by scale, breadth of platforms, or volume of comments.
