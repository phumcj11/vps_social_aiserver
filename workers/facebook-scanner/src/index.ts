/**
 * Facebook Group Scanner worker — DISABLED PLACEHOLDER (SPRINT 001).
 *
 * The scanner is the READ-ONLY half of the Facebook adapter
 * (docs/10-playwright-design.md). It is NOT implemented in this sprint:
 *   - It does NOT import or execute Playwright.
 *   - It performs NO Facebook login, navigation, reading, or writing.
 *   - It exits immediately and safely with a clear message.
 *
 * It will only ever perform read actions (never comments), at concurrency one,
 * gated by FACEBOOK_READER_ENABLED, when implemented in a later sprint.
 */

function main(): void {
  const readerEnabled = process.env.FACEBOOK_READER_ENABLED === 'true';

  console.log(
    JSON.stringify({
      worker: 'facebook-scanner',
      status: 'disabled',
      reason: 'Not implemented in SPRINT 001 (Technical Bootstrap).',
      facebookReaderEnabled: readerEnabled,
      note: 'This placeholder does not import or execute Playwright. Exiting safely.',
    }),
  );

  // Exit cleanly (success) without doing any work.
  process.exit(0);
}

main();
