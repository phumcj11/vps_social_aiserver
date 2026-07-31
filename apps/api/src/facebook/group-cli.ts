import { loadApiEnv } from '../lib/env';
import { loadDotenv } from '../lib/load-dotenv';
import { createLogger } from '../lib/logger';
import { createDb } from '../db/client';
import { DrizzleStore } from '../store/drizzle-store';
import { AuditService, AuditEventTypes } from '../lib/audit';
import { ProfileService } from './profile';
import { PlaywrightBrowserDriver } from './driver';
import { GroupValidationService } from './group-validation';
import { normaliseGroupUrl } from './group-url';
import { newId } from '../lib/tokens';
import { FacebookError } from './errors';

/**
 * Operator CLI for Facebook Groups (SPRINT 005).
 *
 *   pnpm facebook:group:add      --workspace <uuid> --url <url>
 *   pnpm facebook:group:list     --workspace <uuid>
 *   pnpm facebook:group:validate --workspace <uuid> --group <uuid>
 *   pnpm facebook:group:assign   --workspace <uuid> --group <uuid> --business <uuid>
 *   pnpm facebook:group:unassign --workspace <uuid> --group <uuid> --business <uuid>
 *
 * Safety: validates UUIDs, rejects unsafe URLs, enforces workspace ownership,
 * never prints credentials/cookies/profile paths/raw HTML, never scans or
 * comments. Returns useful exit codes.
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

  const commands = ['add', 'list', 'validate', 'assign', 'unassign'];
  if (!command || !commands.includes(command)) {
    console.error(`Usage: facebook:group <${commands.join('|')}> --workspace <uuid> [...]`);
    process.exit(2);
  }
  if (!workspaceId || !UUID_RE.test(workspaceId)) {
    console.error('Refusing: --workspace must be a valid workspace UUID.');
    process.exit(2);
  }

  const env = loadApiEnv();
  const { pool, db } = createDb(env.DATABASE_URL);
  const store = new DrizzleStore(db);
  const audit = new AuditService(store);

  let exitCode = 0;
  try {
    if (command === 'add') {
      const url = arg('url');
      if (!url) {
        console.error('Refusing: --url is required.');
        exitCode = 2;
      } else {
        const normalised = normaliseGroupUrl(url); // throws on unsafe/invalid
        if (await store.isGroupCanonicalUrlTaken(workspaceId, normalised.canonicalUrl)) {
          console.error('Refusing: this group is already added to the workspace.');
          exitCode = 2;
        } else {
          const group = await store.createFacebookGroup({
            id: newId(),
            workspaceId,
            facebookGroupId:
              normalised.groupIdentifier && /^\d+$/.test(normalised.groupIdentifier)
                ? normalised.groupIdentifier
                : null,
            canonicalUrl: normalised.canonicalUrl,
            originalUrl: url,
          });
          await audit.record(AuditEventTypes.FacebookGroupCreated, {
            workspaceId,
            payload: { groupId: group.id, canonicalUrl: group.canonicalUrl },
          });
          console.log(
            `Added group ${group.id}: ${group.canonicalUrl} (access_state=${group.accessState})`,
          );
        }
      }
    } else if (command === 'list') {
      const groups = await store.listFacebookGroupsByWorkspace(workspaceId);
      if (groups.length === 0) console.log('No groups.');
      for (const g of groups) {
        console.log(
          `  ${g.id}  ${g.canonicalUrl}  status=${g.status}  access=${g.accessState}  name=${g.name ?? '(none)'}`,
        );
      }
    } else if (command === 'validate') {
      const groupId = arg('group');
      if (!groupId || !UUID_RE.test(groupId)) {
        console.error('Refusing: --group must be a valid UUID.');
        exitCode = 2;
      } else {
        const service = new GroupValidationService({
          store,
          profiles: new ProfileService(env.BROWSER_PROFILE_ROOT),
          driver: new PlaywrightBrowserDriver(),
          audit,
          env,
          logger: createLogger('info'),
        });
        if (!env.FACEBOOK_LOGIN_ENABLED) {
          console.log(
            'NOTE: FACEBOOK_LOGIN_ENABLED is false; no browser will launch (login-disabled result).',
          );
        }
        const s = await service.validateGroupAccess(workspaceId, groupId);
        console.log(
          `  access_state=${s.accessState}  name=${s.name ?? '(none)'}  error=${s.lastErrorCode ?? '(none)'}`,
        );
        exitCode = s.accessState === 'accessible' ? 0 : 1;
      }
    } else {
      // assign / unassign
      const groupId = arg('group');
      const businessId = arg('business');
      if (!groupId || !UUID_RE.test(groupId) || !businessId || !UUID_RE.test(businessId)) {
        console.error('Refusing: --group and --business must be valid UUIDs.');
        exitCode = 2;
      } else {
        const group = await store.getFacebookGroupById(groupId);
        const business = await store.getBusinessById(businessId);
        if (!group || group.workspaceId !== workspaceId) {
          console.error('Refusing: group not found in this workspace.');
          exitCode = 2;
        } else if (!business || business.workspaceId !== workspaceId) {
          console.error('Refusing: business not found in this workspace.');
          exitCode = 2;
        } else if (command === 'assign') {
          const existing = await store.getGroupAssignment(businessId, groupId);
          if (existing) {
            console.error('Refusing: group is already assigned to that business.');
            exitCode = 2;
          } else {
            await store.assignGroupToBusiness({
              id: newId(),
              workspaceId,
              businessId,
              facebookGroupId: groupId,
            });
            await audit.record(AuditEventTypes.FacebookGroupAssignedToBusiness, {
              workspaceId,
              payload: { groupId, businessId },
            });
            console.log(`Assigned group ${groupId} to business ${businessId}.`);
          }
        } else {
          await store.unassignGroupFromBusiness(businessId, groupId);
          await audit.record(AuditEventTypes.FacebookGroupUnassignedFromBusiness, {
            workspaceId,
            payload: { groupId, businessId },
          });
          console.log(`Unassigned group ${groupId} from business ${businessId}.`);
        }
      }
    }
  } catch (err) {
    if (err instanceof FacebookError) console.error(`Error [${err.code}]: ${err.message}`);
    else console.error(`Error: ${(err as Error).message}`);
    exitCode = 2;
  } finally {
    await pool.end().catch(() => undefined);
  }

  process.exit(exitCode);
}

void main();
