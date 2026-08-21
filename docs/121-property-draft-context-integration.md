# 121 — Property Draft-Context Integration

**Status:** SPRINT 016B — SHIPPED. The selected Property is wired into the REAL
draft pipeline (`AiDraftCoordinator.assembleContext` → `buildDraftContext` →
`buildDraftPrompt` → `checkDraft`). Prompt version bumped to `rules-v2-property`.
AI stays mock/disabled this sprint.

## Context assembly

For a Business MATCH, the coordinator loads the persisted Property match
(`getPropertyMatchByBusinessMatch`), the selected `Property` (only when
`decision = MATCH`), the Business policies, and the structured contacts, then
builds the context with precedence:

**Property explicit fact → Property policy override → Business policy →
Business profile → safe generic fallback.**

The full context is persisted as the draft's `inputSnapshot`.

## What a draft may state

Only facts that are **persisted**: Property name, area, max guests, bedrooms,
amenities, approved contact, and a price **only** when the effective pricing
policy permits AND a real number exists. The context emits a `mustNotClaim` list;
the draft may never assert: availability, price, promotion, capacity (when absent),
distance, or any prohibited claim.

## Contact safety

`approvedContacts` = channels that are `enabled && approvedForDrafts`. Nothing
else is ever placed in a draft. See [ADR-037] and doc 122.

## Enforcement

`checkDraft` (deterministic) blocks guaranteed availability/price and prohibited
claims, and marks NEEDS_REVIEW for `MUSTNOTCLAIM_*` violations
(availability/price/promotion/capacity), unsupported contacts, and every
NO_PROPERTY_MATCH draft (doc 123). No auto-approval.
