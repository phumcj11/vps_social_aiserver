# ADR-037 — Structured Contact & Policy Model

**Status:** Accepted (SPRINT 015). **Date:** 2026-08-20.

## Context

Contact info and policies as free-text strings cannot be validated, approved, or safely used by Draft generation, and invite fabricated availability/price claims.

## Decision

Store **structured contact channels** (typed PHONE/LINE/FACEBOOK_PAGE/WEBSITE/EMAIL/OTHER with per-channel `enabled` / `approvedForDrafts` / `approvedForPublicResponse` / `ownerVerifiedAt`) and **structured policies** (availability/pricing/promotion/booking enums + prohibited claims, with Property overrides that inherit from the Business). Draft generation may use ONLY approved channels and may NOT invent values absent from the policy/data.

## Consequences

- Draft/AI context exposes only enabled + draft-approved channels; a public response needs stricter approval.
- Policy inheritance avoids data duplication (null override = inherit) and makes readiness deterministic.
- The draft context builder emits price/availability/promotion/amenity/capacity facts only when stored data + policy permit, and otherwise lists `mustNotClaim` — preventing fabricated claims by construction.
