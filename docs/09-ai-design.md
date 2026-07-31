# 09 — AI Design

**Document status:** Foundation (SPRINT 000)
**Applies to:** KMKT Social AI MVP

This document describes how AI is used in the MVP to extract intent from posts, match posts to businesses, and generate comment drafts — and, just as importantly, the guardrails that keep it safe. It is provider-agnostic and contains **no provider-specific code and no prompts to be executed**; it defines concepts and contracts that a later sprint will implement. No AI service is called in this sprint.

The overriding rule: **AI proposes, a human disposes**. Every AI output is a draft for human review, never an action.

> **Implementation status (SPRINT 009).** The **Draft Generation**, **Prompt Layering**, **Prohibited Claims**, **Hallucination Prevention**, **Missing-Data**, **Safe Fallback**, and **AI Output Contract** concepts below are now implemented by the **AI Draft Engine** — as a **DRAFT ONLY** stage with **AI disabled by default** and a deterministic **Mock provider** (no real provider connected). See [48-ai-draft-engine.md](48-ai-draft-engine.md), [50-ai-prompt-design.md](50-ai-prompt-design.md), [51-draft-policy-checker.md](51-draft-policy-checker.md), [53-ai-provider-abstraction.md](53-ai-provider-abstraction.md), and [ADR-015](adr/ADR-015-ai-provider-abstraction.md)–[ADR-017](adr/ADR-017-human-approval-after-ai-draft.md). The **Extraction**, **Matching/confidence score**, and **Telegram** concepts remain design-only or are handled deterministically elsewhere: matching is deterministic and rules-only (Sprint 008, no AI, no score), and Telegram approval is a later sprint.

---

## Business Context Structure

For a given business, the AI's entire permitted context is that business's **Business Profile** (see [06-domain-model.md](06-domain-model.md)):

- Products or services offered.
- Service area (where the business operates).
- Selling points (what makes it a good choice).
- Contact information (as the business wishes to share it).
- Tone (how it wants to sound).
- Keywords (terms that signal relevance).
- Response rules (dos and don'ts for how it engages).
- Prohibited claims (statements it must never make — e.g. guarantees, medical/legal assertions, price promises it cannot keep).

The AI must use **only** the selected business's context when drafting for it (BR-22, BR-60). No other business's data, and no invented facts, may enter a draft.

---

## Lead / Post Extraction

Before matching, the system distils each discovered post into a compact, structured understanding:

- The apparent **need or intent** ("looking for", "recommend", "who does…").
- **Location cues** relevant to service area.
- **Product/service cues** relevant to what businesses offer.
- **Urgency or timing** cues, if present.
- A short neutral **summary** for human display.

Extraction is descriptive only — it interprets the post, it does not decide to act. Extraction output feeds matching and the human-facing opportunity summary.

---

## Business Matching

Matching evaluates a post against each candidate business (those whose assigned groups include the post's group, BR-15):

- Compares extracted intent, location, and product/service cues against each business's profile and keywords.
- Produces, per candidate business, a **confidence score** and a **match explanation**.
- Produces zero, one, or multiple matches (BR-17).

Matching combines simple, explainable signals (keyword and service-area overlap) with AI judgement of intent. The emphasis is on **explainability**: the customer must be able to see *why* a post was considered relevant.

## Match Confidence

- Each match carries a **confidence score** on a consistent scale, presented plainly to the human (e.g. low / medium / high, or a percentage — the exact presentation is a UX detail).
- Confidence reflects how well the post's intent and cues fit the business; it is a decision aid for the human, not an authorisation.
- Low-confidence matches may still be surfaced but are labelled as such; the human always decides.

## Match Explanation

- Every match includes a short, plain-English explanation of the signals that drove it (e.g. "asks for a plumber in your service area; mentions a leaking pipe, which matches your listed services").
- Explanations must be truthful about the signals used and must not overstate certainty.

## Multi-Business Ambiguity

- When a post matches multiple businesses, each match is presented **distinctly**, with its own score and explanation (BR-19).
- The system **never silently selects** one business (BR-20, principle: No Silent Failure).
- Each candidate becomes its own opportunity and its own approval decision; approving for one business never approves for another (BR-21).
- Drafts for different businesses are generated independently, each using only its own business context.

---

## Draft Generation

For an approved-to-draft business-and-post match, the AI generates a **comment draft**:

- Uses only the selected business's profile and tone.
- Addresses the poster's expressed need helpfully and specifically.
- Follows the business's response rules.
- Excludes every prohibited claim (BR-24).
- Stays appropriate for a public Facebook Group comment (concise, genuine, non-spammy).

The draft is always a proposal; it is delivered to Telegram for human approve/edit/reject.

## Tone Control

- The business's **tone** field steers voice (e.g. friendly, professional, casual).
- Tone is applied consistently but never at the expense of the prohibited-claims and response-rules constraints, which always take precedence.

## Prohibited Claims

- The business's **prohibited claims** are hard constraints. A draft must contain none of them.
- Prohibited claims typically include unverifiable guarantees, regulated assertions (medical, legal, financial), and promises the business cannot honour.
- If fulfilling the poster's request would require a prohibited claim, the draft stays within bounds (offering to help/contact) rather than making the claim, or the system flags that a safe draft is not possible for a human to handle.

## Hallucination Prevention

- The AI must not invent facts about the business (services it does not offer, areas it does not serve, prices, credentials, or outcomes).
- Only information present in the business profile may be asserted as fact.
- Where specificity is missing, the draft stays general and truthful rather than fabricating detail.
- The human review step is the final safeguard; drafts are written to be easy to verify against the profile.

## Missing-Data Behaviour

- If required business context is incomplete, the system does **not** guess. It either:
  - Produces a conservative, still-useful draft that avoids the missing specifics, or
  - Flags that human input is needed and surfaces what is missing.
- Missing data never causes a fabricated claim (BR-25).

## Safe Fallback

- If the AI cannot produce a compliant draft (e.g. every helpful phrasing would breach a constraint, or the provider is unavailable), the system falls back to surfacing the opportunity **without** a usable draft and asks the human to write the comment, clearly stating why no draft was produced.
- A failed or unavailable AI step never blocks the human from seeing the opportunity, and never results in an automated post.

---

## Prompt Layering Concept

The instructions given to the AI are layered, from most authoritative to most specific. Higher layers always override lower ones:

1. **System guardrails** — non-negotiable rules: never make prohibited claims, never invent facts, produce a proposal only, stay within one business's context.
2. **Business context layer** — the selected business's profile and tone.
3. **Post context layer** — the extracted intent and post summary.
4. **Task layer** — the specific ask (match, or draft a comment).

This layering keeps safety rules structurally above business voice, and business voice above the individual post, so a persuasive post can never override the business's constraints.

---

## AI Output Contract Concept

Every AI step returns a **structured, predictable result** the Backend can validate before use — not free-form text the system blindly trusts:

- **Extraction** returns the structured intent/cues/summary.
- **Matching** returns, per candidate business, a score and an explanation.
- **Draft generation** returns the proposed comment text plus a note of which profile elements it relied on, so it can be checked against prohibited claims.

The Backend validates each result (shape, and compliance checks such as prohibited-claim screening) before storing or surfacing it. Malformed or non-compliant output is rejected and handled by the safe fallback, never shown as if valid.

---

## Human Review Requirements

- Every draft is reviewed by a human before any comment is posted (BR-29). There is no exception.
- The human sees the matched business, the post summary, the score and reasons, and the draft, and can approve, edit, or reject (see [11-telegram-design.md](11-telegram-design.md)).
- Editing is expected and easy; the edited text is what gets posted, and both versions are retained (BR-27).
- The AI never triggers a post, never selects among ambiguous businesses, and never proceeds on missing or non-compliant data without a human.

---

## Summary of AI Guardrails

1. One business's context per draft; no cross-business leakage.
2. No invented facts; only profile-backed assertions.
3. No prohibited claims, ever — a hard constraint above tone.
4. Scores and explanations are honest decision aids, not authorisations.
5. Multi-business matches are surfaced distinctly, never silently resolved.
6. Structured, validated output; malformed output is rejected.
7. Safe fallback to human-written comments when a compliant draft is impossible.
8. A human approves before anything is posted.
