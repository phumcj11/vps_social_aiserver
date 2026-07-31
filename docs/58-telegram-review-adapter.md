# 58 — Telegram Review Adapter

**Document status:** SPRINT 010 — Human Review Engine
**Applies to:** KMKT Social AI
**Date:** 2026-07-31

The **TelegramReviewAdapter** is the FIRST Review Adapter ([56](56-review-adapter.md)). It renders a review into a Telegram message and relays it. **It is only an adapter** — it contains no business logic, stores no authoritative state, and **NEVER writes to the database**.

> **Telegram is NOT the Review Engine.** The engine works entirely without it ([54](54-review-engine.md)). Telegram is **disabled by default** this sprint: no bot is connected and the transport refuses to send.

---

## What it shows

Rendered from the safe `ReviewPresentation`:

- **Business** — which business the review is for.
- **Opportunity** — the decision and the source post message.
- **Draft** — the AI draft text (or the edited text, if any).

## Buttons

| Button | Kind | Effect |
| ------ | ---- | ------ |
| **✅ Approve** | callback | `review:<id>:approve` → Review API |
| **❌ Reject** | callback | `review:<id>:reject` → Review API |
| **✏️ Edit** | callback | `review:<id>:edit` → Review API |
| **🔗 Open Facebook Post** | url | opens the original post (read-only; decides nothing) |
| **🏢 Open Business** | url | opens the business page (read-only) |

Decision buttons carry **callback data**, not database writes. A Telegram webhook maps a tap to the corresponding Review API call:

```
Telegram tap → Review API → Coordinator → Repository
```

The adapter never bypasses this path.

---

## The transport boundary

The adapter relays via a `TelegramTransport`:

- **DisabledTelegramTransport** — the default. **Refuses to send** while `TELEGRAM_ENABLED=false`; even when enabled, no bot is connected in this build, so it refuses.
- **FakeTelegramTransport** — deterministic, in-memory, no network — used by tests to assert rendering and relay.

Rendering (`renderMessage`) is **pure** and always available (and unit-tested). Because delivery is **best-effort** in the Coordinator, a disabled transport is logged (`review.adapter_skipped`) and never blocks the review.

---

## Safety

- **No bot connected**, no token populated, no network call this sprint.
- **Never** the source of truth; the Backend validates every decision, enforces ownership, idempotency, and duplicate-decision protection (BR-31).
- A decision made via Telegram records the human's choice only — it **never** posts to Facebook, sends a message, or triggers a write action.

Future real-transport secret (documented, never populated): `TELEGRAM_BOT_TOKEN`. See [16-environment-configuration.md](16-environment-configuration.md), [ADR-019](adr/ADR-019-telegram-adapter.md), [11-telegram-design.md](11-telegram-design.md).
