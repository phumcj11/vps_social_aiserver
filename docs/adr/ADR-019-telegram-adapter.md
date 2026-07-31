# ADR-019 — Telegram Review Adapter (disabled boundary)

- **Status:** Accepted
- **Date:** 2026-07-31
- **Sprint:** SPRINT 010 — Human Review Engine
- **Deciders:** Principal Product Architect / Senior Full Stack Engineer
- **Related principles:** Backend is the Source of Truth, No Silent Failure, Keep MVP Small
- **Relates to:** [ADR-018](ADR-018-review-engine.md), [ADR-006](ADR-006-telegram-human-approval.md), [11-telegram-design.md](../11-telegram-design.md), [58-telegram-review-adapter.md](../58-telegram-review-adapter.md)

---

## Context

Telegram is the first channel for presenting reviews and collecting decisions. We must decide how it plugs into the Review Engine ([ADR-018](ADR-018-review-engine.md)) without becoming the source of truth, and how it behaves this sprint given that no bot is connected and `TELEGRAM_ENABLED=false`.

Options:
- **A — A Telegram integration that reads/writes review state directly.**
- **B — A thin adapter that only renders and relays**, behind a transport that is disabled by default; all decisions route back through the Review API.

---

## Decision

**Adopt a thin, disabled-by-default Telegram adapter (Option B).**

- **TelegramReviewAdapter** implements the `ReviewAdapter` interface (`sendReview` / `updateReview` / `closeReview`). It **renders** a review (business, opportunity, draft, and Approve/Reject/Edit/Open-Post/Open-Business buttons) and relays it via a **transport**.
- It contains **no business logic**, stores **no authoritative state**, and **never writes to the database**. Decision buttons carry callback data; a Telegram webhook maps a tap to the Review API: **Telegram → Review API → Coordinator → Repository**.
- The **transport is disabled by default**: `DisabledTelegramTransport` refuses to send while `TELEGRAM_ENABLED=false`, and no bot is connected in this build. A deterministic `FakeTelegramTransport` powers tests.
- Rendering is **pure** and always available (unit-tested). Delivery is **best-effort** in the Coordinator — a disabled/failed transport is logged (`review.adapter_skipped`) and never blocks a review.
- No bot token is populated; the future secret name (`TELEGRAM_BOT_TOKEN`) is documented only.

---

## Consequences

**Positive**
- **Safe by default** — no bot, no token, no network call; the adapter cannot act on its own.
- **Faithful to the source-of-truth rule** — every decision is validated and recorded by the Backend, never by Telegram ([11-telegram-design.md](../11-telegram-design.md)).
- **Testable** — pure rendering plus a fake transport verify the message and buttons with no network.
- **Swappable** — the adapter is one implementation of a general interface; other channels follow the same pattern.

**Negative / trade-offs**
- Real delivery (a live bot, pairing, webhook) is deferred. Intended — this sprint proves the engine and the adapter boundary, not a production Telegram deployment.

**Explicitly out of scope:** connecting a real bot, pairing/destinations, live webhooks, and — as always — any Facebook write, comment, message, or Action Engine execution.
