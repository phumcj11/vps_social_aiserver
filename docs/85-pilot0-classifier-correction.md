# 85 — Pilot 0 Opportunity-Classifier Correction (rules-v2)

## The Pilot finding

Pilot 0 Phase 3 (real read-only collection over six pilot groups) revealed the deterministic Opportunity Classifier was doing the **wrong** thing: it **accepted advertiser/property-listing posts** and **rejected genuine customer accommodation-seeking posts**.

Root cause: `rules-v1` decided on **structural completeness** — a post was ACCEPTed only when it had text, a minimum length, **an author**, a URL, was not deleted, and was not a duplicate. It had **no concept of customer intent**. Genuine seeking posts ("หาที่พัก บางแสน…") frequently arrive **without a visible author** and are **short**, so they were rejected; advertiser listings ("รหัสที่พัก DV-1952") are structurally complete, so they were accepted. Result: 6 accepted (all ads), 0 business matches, 0 drafts.

## The fix (`rules-v2`)

The classifier now decides on **customer demand**, deterministically, with **no AI, no score, no confidence**:

1. **Structural gate** (unchanged, minimal): the post must be real — has text, has a URL, is not deleted, is a supported language, is not duplicate content. Author presence and minimum length **no longer gate ACCEPT**.
2. **Intent analysis** (`opportunity/intent.ts`, pure): detects Thai customer-search verbs/phrases vs advertiser/owner/agent language.

Decision order:

- **Property-code-only** text (e.g. "ZA37 MY-5072") → REJECT `PROPERTY_CODE_ONLY`.
- **Agent / on-behalf** context ("หาที่พักให้ลูกค้า", "มีลูกค้า…") → REJECT `OWNER_OR_AGENT_LISTING` — even with a search verb.
- **First-person demand** ("หา…", "ขอที่พัก…", "…ว่างไหม") and **not** a strong advertiser marker → **ACCEPT** `CUSTOMER_SEARCH_INTENT` (plus corroborating `CUSTOMER_REQUIREMENT/DATE/GUEST_COUNT/LOCATION_PRESENT`). A soft ad word like "โปร" alone does **not** block a genuine seeker.
- First-person demand **quoted alongside** a hard advertiser marker ("จองด่วน", "รหัสที่พัก") → REJECT `INTENT_AD_CONFLICT` (a customer never writes those).
- **Advertiser language** with no demand → REJECT `ADVERTISER_LANGUAGE` / `BOOKING_PROMOTION`.
- Neither → REJECT `NO_CUSTOMER_INTENT`.

Ambiguous posts default to **REJECT** — a lead-gen product must not flood the queue with advertisements.

## Reclassifying existing data (safe)

`pnpm opportunity:reclassify --workspace <uuid>` re-evaluates **existing** Opportunities. One Opportunity per Signal is preserved; a changed decision updates that Opportunity in place and records an **`OpportunityReclassified`** event holding the prior decision. **Earlier events are never rewritten**; no destructive SQL. Idempotent. Distinct from `opportunity:classify`, which only processes *new*, unclassified signals.

## Retest result

Reclassifying the 9 Pilot signals: **6→2 ACCEPT**, **3→7 REJECT** (8 decisions changed) — the two accepted are the genuine "หาที่พัก…" posts. Deterministic matching then produced **1 correct MATCH** (Bangsaen intent → บางแสน Test), **0 wrong-area matches**, and **1 Mock AI Draft** (policy PASS). See [PILOT-000-phase3-corrective-fixes](sprints/PILOT-000-phase3-corrective-fixes.md).

## Limitations

- Matching is keyword-based on the post **text**, not the group. A seeker who omits the area word ("หาที่พัก 7 คน ใกล้หาด") is correctly ACCEPTed but yields NO_MATCH if the text lacks an area keyword — expected, and safe (no wrong-area match).
- Intent indicators are Thai/market-specific; extending markets means extending the indicator lists (still deterministic).
