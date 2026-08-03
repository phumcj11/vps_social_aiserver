# ADR-027 — Single-VPS Operational Model

- **Status:** Accepted
- **Date:** 2026-08-03
- **Sprint:** SPRINT 013 — Operational Hardening and Controlled Write Test Preparation
- **Deciders:** Principal Architect / DevOps / SRE / Security
- **Related principles:** Keep MVP Small, Safe by Default, No Feature Creep
- **Relates to:** [72-operational-architecture.md](../72-operational-architecture.md), [78-process-supervision.md](../78-process-supervision.md)

---

## Context

We must prepare for a first controlled write test and a first pilot customer on the existing **single VPS** (2 vCPU, ~3.8 GiB RAM). The temptation is to reach for horizontal scaling, Kubernetes, Kafka, a Redis cluster, or a browser farm. None is justified for one pilot customer, and each adds attack surface, cost, and operational complexity we cannot safely run.

## Decision

Adopt a **single-VPS operational model**: one application instance, one MySQL, at most **one Chromium**, strict **concurrency one**. Six documented runtime modes (Normal Idle, Read-only Collector, Controlled Comment Test, Maintenance, Incident Lockdown, Recovery) with hard rules: Collector and Executor never run together; n8n and Chromium never run together; the production build never runs while Chromium is active; one execution session and one locked profile at a time; the kill switch overrides all execution.

Supervision covers only mysql/api/web (bounded restart). The Collector and Executor are always explicit operator actions with no auto-restart and no auto-resume.

## Consequences

**Positive** — matches the real machine; minimal moving parts; every concurrency risk is bounded by construction; cheap to run and reason about.

**Negative / trade-offs** — no built-in horizontal scale; a second concurrent customer or heavier load is a future, deliberate re-architecture (Level 5, [82](../82-pilot-readiness.md)), not an accident.

**Out of scope:** Kubernetes, Kafka, Redis cluster, browser farm, multi-server deployment, horizontal scaling.
