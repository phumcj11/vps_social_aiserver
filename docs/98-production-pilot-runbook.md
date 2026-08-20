# 98 — Production Pilot Operator Runbook

**Status:** SPRINT 014. Commands default SAFE. No step enables a Facebook write except the explicit, gated write sequence (7). No Execute-Now surface exists.

> All read-only browser steps run as the non-root browser user. Under safe defaults every prepare/execute returns BLOCKED. `<ws>` = workspace, `<job>` = Action Job.

### 1. Start-of-day
`pnpm run doctor` · `pnpm db:status` · verify safe flags (writes off, kill switch on, adapter fake) · confirm no stuck Collector/Action Job, no ambiguous execution, profile lock free · check Facebook session status.

### 2. Collector-only operation (read-only)
Run the Collector for the ≤3 pilot groups (reader enabled per-process only). No writes. Review Signals, duplicates skipped.

### 3. Review queue
For each production candidate the console shows source group/post URL/summary, Opportunity reasons, matched Business + reasons, Draft text + policy, prohibited-claim warnings, draft provider (mock/manual), Action target, and “No Facebook action has occurred.” Decide APPROVE_AS_IS / EDIT_AND_APPROVE / REJECT. **Prefer EDIT_AND_APPROVE when provider=mock.** No auto-approval.

### 4. Prepare production Action
Create exactly one Action Job from an APPROVED review (`action:create`). It is created BLOCKED. Verify exact target URL + `target_post_key` + immutable approved content. Only one queued production job at a time.

### 5. Open Write Window
Provide operator identity, reason, exact `<job>`, exact `target_post_key`, expiry (≤5 min), and acknowledge the kill switch. Requires a fresh verified backup (step 15), health OK, prepare_only PASS (step 6), no duplicate, no ambiguous. See [94](94-production-write-window.md).

### 6. prepare_only (live, read-only)
`pnpm --filter @kmkt/api action:execution:prepare-live --workspace <ws> --action <job>` → require `ready=true`, identity exact, comments available, one unique composer, typed=false, submitted=false. Browser closes; lock released.

### 7. Authorize one submit
Issue a one-shot authorization bound to `<job>` + `target_post_key` + approved-content hash ([95](95-production-submit-authorization.md)). Then perform exactly one gated `submit_once` (write flags enabled per-process only, never in .env; kill switch acknowledged). One authorization = one submit; no retry.

### 8. Verify comment
Post-submit verification runs automatically (normalized, exactly-one match). If verified_success → job succeeded. If ambiguous → step 11 (do NOT retry).

### 9. Close Write Window
Explicitly close the window immediately after the attempt. Restore safe flags (writes off, kill switch on, adapter fake). Verify restored.

### 10. End-of-day
Confirm all comments trace to Review + Authorization + Action Job. Produce the daily report (step 16). Stop services; MySQL stopped.

### 11. Ambiguous recovery
Do NOT retry. Keep the idempotency reservation live. Read-only re-verify whether the comment exists (normalized). If exactly one exists → recover the job to succeeded/verified. If 0 or >1 → keep ambiguous, MANUAL_INVESTIGATION. Close the write window; stop writes for the day.

### 12. Checkpoint / CAPTCHA response
Stop Facebook operations immediately. Enter LOCKDOWN. Do not attempt automated bypass. Manual operator recovery only.

### 13. Emergency kill switch
Engage incident lockdown / set `GLOBAL_KILL_SWITCH=true`. All execution refuses. (See [80-incident-lockdown](80-incident-lockdown.md).)

### 14. Account / session reconnect
Operator-assisted, read-only, via the controlled desktop; never handle raw credentials in automation.

### 15. Backup before write
`pnpm backup:all` then `pnpm backup:verify`; confirm the fresh DB/config/audit backups and checksums. Required before opening a write window.

### 16. Pilot daily report
Summarize the observability read model ([97](97-production-pilot-observability.md)): scans, Signals, Opportunities, Matches, Reviews, Action Jobs by state, comments verified, ambiguous count, limits used, write-window activity, backups.
