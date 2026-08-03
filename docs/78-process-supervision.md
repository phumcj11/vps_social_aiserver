# 78 — Process Supervision

A minimal, native supervision strategy — no large orchestration platform (no Kubernetes). It uses Docker Compose restart/health policies, optionally wrapped by a systemd unit.

## What is supervised

Only the **long-lived** services: **mysql**, **api**, **web**. The override `docker/compose/docker-compose.supervision.yml` adds:

- `restart: on-failure:5` (bounded — recover from a crash without storming),
- an API healthcheck on `/health`,
- startup ordering (`api` waits for a healthy `mysql`; `web` waits for `api`),
- unit-level restart-storm protection (`StartLimitBurst=5` in the systemd template).

```
docker compose -f docker/compose/docker-compose.yml \
               -f docker/compose/docker-compose.supervision.yml up -d mysql api web
```

## What is NOT supervised (by design)

The **Collector** (`facebook-scanner`) and the **Comment Executor** (`facebook-comment`) keep `restart: 'no'`. They:

- require an **explicit operator start**,
- run to completion at **concurrency one**,
- **never auto-restart** and **never auto-resume** — an ambiguous Action result is resolved by a human, never by a restart loop (ADR-029, [69](69-execution-recovery.md)).

## systemd (template, disabled by default)

`scripts/supervision/kmkt-social-ai.service.example` wraps the compose up/down for mysql/api/web. It is a **template** — not enabled this sprint. Install deliberately on the VPS (`systemctl enable --now`) when going to a supervised deployment. It never starts the Collector or Executor.

## Maintenance & shutdown

Maintenance mode ([79](79-maintenance-mode.md)) does not stop containers; it rejects new work at the application layer while keeping health/backup/operator surfaces up. Clean shutdown is `docker compose … stop` (or `systemctl stop`), which lets in-flight requests drain.

No permanent production services are started during this sprint — the templates exist for the operator to adopt.
