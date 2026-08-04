import { loadApiEnv } from '../lib/env';
import { loadDotenv } from '../lib/load-dotenv';
import { createLogger } from '../lib/logger';
import { createDb } from '../db/client';
import { DrizzleStore } from '../store/drizzle-store';
import { OpportunityRepository } from './repository';
import { OpportunityCoordinator } from './coordinator';

/**
 * Opportunity CLI (Pilot 0 corrective fix).
 *
 *   pnpm opportunity:classify   --workspace <uuid>   # classify NEW signals only
 *   pnpm opportunity:reclassify --workspace <uuid>   # re-evaluate EXISTING opportunities
 *
 * `reclassify` re-runs the current deterministic classifier over the workspace's
 * existing Opportunities. A changed decision updates the same Opportunity (one
 * per Signal) and records an OpportunityReclassified event that keeps the prior
 * decision — earlier events are never rewritten. Idempotent. NEVER calls AI,
 * Facebook, or Telegram; prints no secrets.
 */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 ? process.argv[i + 1] : undefined;
}

async function main(): Promise<void> {
  loadDotenv();
  const command = process.argv[2];
  const workspaceId = arg('workspace');
  if (!command || !['classify', 'reclassify'].includes(command)) {
    console.error('Usage: opportunity <classify|reclassify> --workspace <uuid>');
    process.exit(2);
  }
  if (!workspaceId || !UUID_RE.test(workspaceId)) {
    console.error('Refusing: --workspace must be a valid workspace UUID.');
    process.exit(2);
  }

  const env = loadApiEnv();
  const { pool, db } = createDb(env.DATABASE_URL);
  const store = new DrizzleStore(db);
  const coordinator = new OpportunityCoordinator({
    repo: new OpportunityRepository(store),
    env,
    logger: createLogger('info'),
  });

  let exitCode = 0;
  try {
    if (command === 'classify') {
      const s = await coordinator.classifyAll(workspaceId);
      console.log(
        `Classified: processed=${s.processed} accepted=${s.accepted} rejected=${s.rejected}`,
      );
    } else {
      const s = await coordinator.reclassifyAll(workspaceId);
      console.log(
        `Reclassified: processed=${s.processed} changed=${s.changed} ` +
          `accepted=${s.accepted} rejected=${s.rejected}`,
      );
    }
  } catch (err) {
    console.error(`Error: ${(err as Error).message}`);
    exitCode = 1;
  } finally {
    await pool.end().catch(() => undefined);
  }
  process.exit(exitCode);
}

void main();
