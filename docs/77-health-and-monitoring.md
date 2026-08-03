# 77 — Health and Monitoring

## Health endpoints (public-safe)

All responses are safe — no secrets, no internal paths, no customer content. None launches a browser, contacts Facebook, or invokes AI/Telegram.

| Endpoint | Purpose |
| --- | --- |
| `GET /health` | Liveness — the process is up. |
| `GET /ready` | Readiness — DB up **and** not in maintenance/lockdown. |
| `GET /health/dependencies` | Dependency health (database); 503 when down. |
| `GET /health/safety` | Reports whether execution is **intentionally disabled** + effective flags. |
| `GET /health/storage` | Disk thresholds + backup staleness; 503 on critical. |
| `GET /health/queues` | Stuck action jobs, stuck collector runs, ambiguous executions — counts only. |

Browser-profile health is exposed via the CLI ([75](75-browser-profile-recovery-policy.md)), not a public endpoint, because it must never risk leaking session state.

## Monitoring CLI

Lightweight, dependency-free (no heavy stack). Meaningful exit codes: **0 OK, 1 WARNING, 2 CRITICAL**.

```
pnpm monitor:status   # per-check breakdown
pnpm monitor:check    # overall level only
pnpm monitor:report   # JSON (metrics + checks)
```

Monitors: free disk / disk %, RAM available, swap %, load average, backup age / last successful backup, browser-profile lock age, stuck collector runs, stuck action jobs, ambiguous & failed executions, evidence and log storage growth. Container/API/MySQL readiness are checked via the health endpoints.

## Default thresholds

| Metric | Warning | Critical |
| --- | --- | --- |
| Disk used | ≥ 80% | ≥ 90% |
| RAM available | ≤ 700 MB | ≤ 350 MB |
| Swap used | ≥ 25% | ≥ 60% |
| Load (1m) | ≥ 1.5 | ≥ 2.5 |
| Backup age | > 26h | — |
| Profile lock age | > execution timeout | — |
| Action processing | > execution timeout | — |

All are env-tunable (`MONITOR_*`, `BACKUP_STALE_HOURS`). The evaluators are pure and shared by the CLI and the health endpoints, so both reach identical verdicts.

## Alerts

**No Telegram alerts this sprint.** A future alert adapter (the same seam as the Review Adapter) would consume `monitor:report` output and dispatch WARNING/CRITICAL — documented as future scope, not built.
