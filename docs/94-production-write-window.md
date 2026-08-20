# 94 — Production Write Window

**Status:** SPRINT 014. Logic: `apps/api/src/production/write-window.ts`. ADR: [ADR-033](adr/ADR-033-production-write-window.md).

A production `submit_once` may only be attempted while a **Write Window** is `OPEN`. This bounds the blast radius of production writes to short, explicit, operator-opened intervals.

## States

- **CLOSED** — default. No production write may proceed.
- **OPEN** — a bounded interval during which one authorized submit may proceed.
- **LOCKDOWN** — all Facebook operations halted (checkpoint/CAPTCHA/restriction); sticky; cleared only by manual operator recovery.

## Opening a window requires ALL of

operator identity · reason · exact Action Job ID · exact `target_post_key` · expiration (window length) · a **fresh verified backup** (within the freshness bound) · health = OK · **prepare_only = PASS** · no duplicate matching comment · no ambiguous execution pending · **kill-switch acknowledgement**.

Any missing item ⇒ the window does not open, with the exact blockers listed. `openWriteWindow` clamps the requested length to `PILOT_WRITE_WINDOW_MAX_SECONDS` (Level-1 recommended maximum **5 minutes**).

## Expiry and safety invariants

- A window **auto-closes at expiry** (`effectiveWindowState` returns `CLOSED` once past `expiresAtMs`).
- **Automatic expiry NEVER auto-retries or submits anything** — it only disables further execution.
- Opening a window **does NOT turn `GLOBAL_KILL_SWITCH` off** — the kill switch is a separate, explicit control (opening merely requires acknowledging it).
- The operator **explicitly closes** the window after the attempt; LOCKDOWN overrides OPEN and is never auto-cleared.

There is no Execute-Now surface; a window only gates whether an already-authorized submit may run.
