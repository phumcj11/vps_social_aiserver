/**
 * Collector Worker (formerly "Scanner") — thin worker entrypoint.
 *
 * The Collector Engine itself lives in the backend (apps/api/src/collector/*),
 * so the worker delegates rather than re-implementing the pipeline. It performs
 * ONLY read-only collection and is gated by FACEBOOK_READER_ENABLED (default
 * off → no browser). It NEVER comments, messages, likes, shares, joins, or
 * writes to Facebook.
 *
 * To run a real collection, use the operator command:
 *   pnpm collector:run --workspace <workspace-id>
 *
 * This process is a disabled placeholder by default: it prints its status and
 * exits, importing no Playwright and contacting nothing.
 */

function main(): void {
  const readerEnabled = process.env.FACEBOOK_READER_ENABLED === 'true';

  console.log(
    JSON.stringify({
      worker: 'collector',
      status: 'idle',
      readOnly: true,
      facebookReaderEnabled: readerEnabled,
      note:
        'Collector Worker placeholder. Read-only. Never comments/likes/shares/joins/writes. ' +
        'Run a collection with `pnpm collector:run --workspace <id>`. Exiting safely.',
    }),
  );

  process.exit(0);
}

main();
