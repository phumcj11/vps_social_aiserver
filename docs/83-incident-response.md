# 83 — Incident Response

A short, practical playbook for the single-VPS pilot. When in doubt, **engage lockdown first, investigate second**.

## Triage

1. **Engage incident lockdown** — `pnpm incident:lockdown --operator <email> --reason "<what you saw>" --yes`. This blocks all Facebook access and forces write flags off and the kill switch on immediately ([80](80-incident-lockdown.md)).
2. **Check health & monitoring** — `pnpm monitor:report`, `GET /health/*`. Identify resource, dependency, or queue problems.
3. **Check the operator console** — `/settings/operations`: mode, ambiguous executions, stuck jobs, backup age, last incident.

## Common incidents

| Symptom | Response |
| --- | --- |
| Ambiguous execution | Do **not** retry. Verify on Facebook whether the comment exists; then resolve via recovery ([69](69-execution-recovery.md)). |
| Checkpoint / CAPTCHA / account restriction | Never bypass. Lockdown, then operator reconnect ([75](75-browser-profile-recovery-policy.md)). |
| `reconnect_required` profile | Operator reconnects the account (default recovery). Never restore session material. |
| Stuck action job / collector run | Investigate via queue health; cancel the session/run explicitly. No auto-restart. |
| Disk/RAM critical | Free space (cleanup old backups/logs), confirm no Chromium is stranded, restore service. |
| DB down | `/health/dependencies` 503; bring MySQL back; verify with `pnpm db:status`. |
| Suspected data loss | Take a fresh backup if possible, then restore from the newest verified backup in a maintenance window ([74](74-database-restore-runbook.md)). |

## Recovery & unlock

Only after the cause is understood and resolved: `pnpm incident:unlock --operator <email> --reason "<resolution>" --yes`. Unlock is never automatic and is always audited. Record what happened for the audit trail ([84](84-audit-investigation.md)).

## Escalation

For anything touching a real customer’s account or data, stop, keep lockdown engaged, and escalate to the product owner before any further action.
