/**
 * Action Worker (formerly "Comment Worker") — DISABLED PLACEHOLDER.
 *
 * The Action Worker is the WRITE half of the Facebook adapter
 * (docs/10-playwright-design.md). It is NOT implemented yet:
 *   - It does NOT import or execute Playwright.
 *   - It performs NO Facebook login, navigation, or commenting.
 *   - It exits immediately and safely with a clear message.
 *
 * When implemented it will publish ONLY human-approved actions, at concurrency
 * one, with idempotency, verification and screenshot evidence — gated by BOTH
 * the global kill switch and FACEBOOK_WRITE_ACTION_ENABLED. Those default to the
 * safe state (kill switch ON, write actions OFF), so the worker refuses to run.
 */

function main(): void {
  const killSwitchOn = (process.env.GLOBAL_KILL_SWITCH ?? 'true') === 'true';
  const writeEnabled = process.env.FACEBOOK_WRITE_ACTION_ENABLED === 'true';
  const approvalRequired = (process.env.COMMENT_APPROVAL_REQUIRED ?? 'true') === 'true';

  console.log(
    JSON.stringify({
      worker: 'action-worker',
      status: 'disabled',
      reason: 'Not implemented yet (write actions remain disabled).',
      globalKillSwitch: killSwitchOn ? 'ON' : 'OFF',
      facebookWriteActionEnabled: writeEnabled,
      commentApprovalRequired: approvalRequired,
      note: 'This placeholder does not import or execute Playwright. No write action is possible. Exiting safely.',
    }),
  );

  // Exit cleanly (success) without doing any work.
  process.exit(0);
}

main();
