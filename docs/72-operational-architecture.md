# 72 — Operational Architecture

KMKT Social AI runs on **one VPS** (2 vCPU, ~3.8 GiB RAM): one application instance, one MySQL, and — at most — **one Chromium process**. This document defines the approved runtime modes and the hard concurrency rules that keep a single small machine safe (ADR-027).

## Fixed constraints

- **One Action Execution Session** active at a time (`ACTION_EXECUTION_CONCURRENCY=1`).
- **One browser profile locked** at a time (`PLAYWRIGHT_CONCURRENCY=1`); the Collector and the Comment Executor never share it.
- **Collector and Comment Executor never run simultaneously.**
- **n8n and Chromium never run simultaneously** on this VPS.
- The **production build must not run while Chromium is active** (memory).
- The **global kill switch overrides all execution**.

## Runtime modes

1. **Normal Idle** — API + Web + MySQL up; no browser; nothing executing. The steady state.
2. **Read-only Collector** — one Collector run reads a group (no writes). No Executor, no n8n concurrently.
3. **Controlled Comment Test** — the single, operator-supervised real-write test ([81](81-controlled-facebook-write-test.md)). One Chromium, one session, write flags temporarily on, restored immediately after.
4. **Maintenance** — new Collector / AI Draft / Review / Action / execution work rejected; health, backup, restore, and the operator surface stay up ([79](79-maintenance-mode.md)).
5. **Incident Lockdown** — all Facebook access blocked; write flags forced off and kill switch forced on; only operator health/audit remain ([80](80-incident-lockdown.md)).
6. **Recovery** — resolving an ambiguous execution or a `reconnect_required` profile. Human-driven; never automatic.

## Enforcement

- Maintenance and Lockdown are persisted in a runtime **state file** (survives restart) and enforced by a single request hook (`operations/guard.ts`). Lockdown’s effective-safety override forces `actionEngine/write/comment = false` and `killSwitch = true` regardless of configuration.
- Process supervision ([78](78-process-supervision.md)) restarts only mysql/api/web; the Collector and Executor are always explicit operator actions with **no auto-restart and no auto-resume**.

See [ADR-027](adr/ADR-027-single-vps-operational-model.md).
