import { loadApiEnv } from '../lib/env';
import { loadDotenv } from '../lib/load-dotenv';
import { createLogger } from '../lib/logger';
import { createDb } from '../db/client';
import { DrizzleStore } from '../store/drizzle-store';
import { AiDraftRepository } from './repository';
import { AiDraftCoordinator } from './coordinator';
import { selectAiDraftProvider } from './provider';
import { AiDraftError } from './errors';
import type { AiDraftRecord } from '../store/types';

/**
 * AI Draft CLI (SPRINT 009).
 *
 *   pnpm ai-draft:generate   --workspace <uuid> --business-match <uuid>
 *   pnpm ai-draft:list       --workspace <uuid> --business-match <uuid>
 *   pnpm ai-draft:show       --workspace <uuid> --draft <uuid>
 *   pnpm ai-draft:regenerate --workspace <uuid> --draft <uuid>
 *
 * DRAFT ONLY. Uses the deterministic Mock provider unless AI is explicitly
 * configured otherwise (and a real provider refuses while AI_ENABLED=false).
 * It NEVER approves, NEVER sends Telegram, NEVER calls Facebook, and NEVER
 * prints secrets or hidden prompt internals.
 */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 ? process.argv[i + 1] : undefined;
}

function printDraft(d: AiDraftRecord): void {
  // Safe fields only — no input snapshot dump, no prompt internals, no secrets.
  console.log(
    `  draft=${d.id} version=${d.version} status=${d.status} ` +
      `provider=${d.provider} model=${d.model} promptVersion=${d.promptVersion} ` +
      `policy=${d.policyResult?.decision ?? '(none)'}`,
  );
  if (d.content) console.log(`  content: ${d.content}`);
}

async function main(): Promise<void> {
  loadDotenv();
  const command = process.argv[2];
  const workspaceId = arg('workspace');
  const businessMatch = arg('business-match');
  const draftId = arg('draft');

  if (!command || !['generate', 'list', 'show', 'regenerate'].includes(command)) {
    console.error('Usage: ai-draft <generate|list|show|regenerate> --workspace <uuid> [...]');
    process.exit(2);
  }
  if (!workspaceId || !UUID_RE.test(workspaceId)) {
    console.error('Refusing: --workspace must be a valid workspace UUID.');
    process.exit(2);
  }

  const env = loadApiEnv();
  const { pool, db } = createDb(env.DATABASE_URL);
  const store = new DrizzleStore(db);
  const coordinator = new AiDraftCoordinator({
    repo: new AiDraftRepository(store),
    provider: selectAiDraftProvider(env),
    env,
    logger: createLogger('info'),
  });

  let exitCode = 0;
  try {
    if (command === 'generate') {
      if (!businessMatch || !UUID_RE.test(businessMatch)) {
        console.error('Refusing: --business-match must be a valid UUID.');
        process.exit(2);
      }
      const { draft, created, skipped } = await coordinator.generate(
        workspaceId,
        businessMatch,
        null,
      );
      if (!draft) {
        console.log(`No draft created (response strategy: ${skipped ?? 'suppressed'}).`);
      } else {
        console.log(created ? 'Generated new draft:' : 'Existing draft (not overwritten):');
        printDraft(draft);
      }
    } else if (command === 'regenerate') {
      if (!draftId || !UUID_RE.test(draftId)) {
        console.error('Refusing: --draft must be a valid UUID.');
        process.exit(2);
      }
      const { draft } = await coordinator.regenerate(workspaceId, draftId, null);
      if (!draft) {
        console.log('No draft created (response strategy suppressed drafting).');
      } else {
        console.log('Regenerated (new version):');
        printDraft(draft);
      }
    } else if (command === 'list') {
      if (!businessMatch || !UUID_RE.test(businessMatch)) {
        console.error('Refusing: --business-match must be a valid UUID.');
        process.exit(2);
      }
      const drafts = await coordinator.listForMatch(workspaceId, businessMatch);
      console.log(`${drafts.length} draft version(s):`);
      for (const d of drafts) printDraft(d);
    } else {
      // show
      if (!draftId || !UUID_RE.test(draftId)) {
        console.error('Refusing: --draft must be a valid UUID.');
        process.exit(2);
      }
      const detail = await coordinator.getDetail(workspaceId, draftId);
      printDraft(detail.draft);
      console.log(`  events: ${detail.events.map((e) => e.event).join(', ')}`);
    }
  } catch (err) {
    if (err instanceof AiDraftError) console.error(`Error [${err.code}]: ${err.message}`);
    else console.error(`Error: ${(err as Error).message}`);
    exitCode = 1;
  } finally {
    await pool.end().catch(() => undefined);
  }

  process.exit(exitCode);
}

void main();
