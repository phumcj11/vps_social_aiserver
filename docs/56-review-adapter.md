# 56 — Review Adapter

**Document status:** SPRINT 010 — Human Review Engine
**Applies to:** KMKT Social AI
**Date:** 2026-07-31

A **Review Adapter** is the boundary between the Review Engine and a presentation/notification channel. It **only presents** reviews and relays them; it holds **NO business logic**, stores **NO authoritative state**, and **NEVER writes to the database**. Human decisions always flow back through the **Review API → Coordinator → Repository**.

> The Review Engine works with **NO adapter at all** — the web Review Queue is a complete review surface. An adapter is purely additive.

---

## Interface

```
ReviewAdapter.sendReview(presentation)      → AdapterRef   // present a new review
ReviewAdapter.updateReview(ref, presentation) → void       // reflect an edit
ReviewAdapter.closeReview(ref, outcome)     → void         // close after a decision
```

The adapter receives a **safe, channel-agnostic `ReviewPresentation`** — only reviewable content (business name, opportunity, draft/edited text, and safe links). It contains no secrets, no session data, no internal database metadata.

`AdapterRef` is an opaque handle (e.g. a message id) the engine stores in a `review_sent` event so later updates/closes can target the same message.

---

## Best-effort delivery

The Coordinator calls the adapter **best-effort**: delivery runs inside a try/catch and any failure (e.g. Telegram disabled, network error) is logged (`review.adapter_skipped`) and swallowed. **An adapter never blocks a review or its decision.** This is what guarantees the engine works without Telegram.

---

## Implementations

- **NoopReviewAdapter** — the default when no channel is configured; does nothing. The review lives entirely in the database and web UI.
- **TelegramReviewAdapter** — the first real adapter ([58](58-telegram-review-adapter.md)). Renders a Telegram message with Approve/Reject/Edit/Open-Post/Open-Business buttons and relays it via a transport that is **disabled by default**.

Additional adapters (email, LINE, …) can be added later with **no change** to the engine, the API, or the storage — they only implement this interface.

See [54-review-engine.md](54-review-engine.md), [ADR-018](adr/ADR-018-review-engine.md), [ADR-019](adr/ADR-019-telegram-adapter.md).
