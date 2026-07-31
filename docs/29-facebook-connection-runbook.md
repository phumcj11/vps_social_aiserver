# 29 — Facebook Connection Runbook (Operator)

**Document status:** SPRINT 004 — Facebook Connection Foundation
**Applies to:** KMKT Social AI operators
**Date:** 2026-07-30

This runbook is for the **operator** performing the assisted Facebook login for a pilot customer ([ADR-007](adr/ADR-007-operator-assisted-facebook-login-mvp.md)). It covers connect, validate, reconnect, disconnect, and incident handling.

> **Safety:** connecting a Facebook session does **not** enable scanning or commenting. The reader/comment/write flags and the global kill switch remain disabled/on. Never share a profile between workspaces. Never store or type the customer's password anywhere except directly into the browser.

---

## Prerequisites

- The customer has registered, created a workspace, and (optionally) their businesses.
- You have the workspace UUID (from the database or the customer's account).
- Playwright Chromium is installed (`pnpm --filter @kmkt/api exec playwright install chromium`). On a fresh host you may also need system libraries: `pnpm --filter @kmkt/api exec playwright install-deps chromium` (installs apt packages; run with appropriate privileges). A headless server also needs a virtual display (e.g. `xvfb-run`) to run a headed browser.

---

## Enabling assisted login

By default `FACEBOOK_LOGIN_ENABLED=false` and **no browser launches** — a connect attempt is recorded as `LOGIN_DISABLED`. To perform the assisted login, set in your **local** `.env` (never committed):

```
FACEBOOK_LOGIN_ENABLED=true
```

Leave every other flag unchanged: `FACEBOOK_WRITE_ACTION_ENABLED=false`, `GLOBAL_KILL_SWITCH=true`, scanner/comment workers stay off. When done, set `FACEBOOK_LOGIN_ENABLED=false` again.

---

## Commands

```bash
pnpm facebook:status     --workspace <uuid>            # show current safe status
pnpm facebook:connect    --workspace <uuid>            # start assisted login (concurrency one)
pnpm facebook:validate   --workspace <uuid>            # re-check the session
pnpm facebook:disconnect --workspace <uuid> --confirm  # disconnect + clean the profile
```

The commands refuse invalid workspace ids, never print passwords/cookies/absolute profile paths, time out safely, and perform no scanning or commenting. Exit codes: `0` connected/ok, `1` action required (checkpoint/reconnect/validation failed), `2` usage/guard error, `5` profile cleanup failed.

---

## Connect flow

1. Run `pnpm facebook:connect --workspace <uuid>`.
2. A Chromium window opens on the Facebook page. **Hand the browser to the customer** (or have them drive it) to enter their credentials. You never type their password.
3. On success the state becomes `connected` and a display name may be captured.
4. If a checkpoint appears, the state becomes `checkpoint_required`: the customer completes it, then you re-run connect.
5. On timeout the state becomes `reconnect_required`: re-run connect.

---

## Validate / reconnect

- Run `pnpm facebook:validate --workspace <uuid>` (or the customer clicks **Validate Session** in the web app).
- `connected` → session is healthy. `reconnect_required` → session expired; run connect again. `checkpoint_required` → customer completes the checkpoint, then reconnect.

---

## Disconnect

- Run `pnpm facebook:disconnect --workspace <uuid> --confirm` (or the customer confirms **Disconnect** in the web app).
- The active browser (if any) is stopped, the account is marked `disconnected`, and the profile directory is removed.
- If cleanup fails (exit `5` / `PROFILE_CLEANUP_FAILED`), remove the directory manually: the path is `storage/browser-profiles/<workspace-id>/` under the deployment. Then confirm status shows `cleanupRequired: false` after a subsequent connect/disconnect.

---

## Incidents

- **Account blocked** (`status=blocked`): stop. Do not retry automatically. Advise the customer; investigate before any further attempt.
- **Checkpoint loops:** never attempt to bypass. Only the human completes the checkpoint.
- **Emergency stop:** the global kill switch remains on and blocks all future write actions regardless of connection state. Disconnect removes the session.

---

## Known limitation (this sprint)

A fully self-service, remote, in-browser login for customers is **not** provided (the VPS is headless and no authenticated remote-browser viewer is exposed — see [ADR-007](adr/ADR-007-operator-assisted-facebook-login-mvp.md)). For the first pilot, this operator-assisted flow is the supported method. A future sprint may add a secured remote-browser experience.
