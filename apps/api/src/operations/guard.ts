import type { ApiEnv } from '../lib/env';
import type { OperationalState } from './state';

/**
 * Operator authorization and mode enforcement (SPRINT 013).
 *
 * There is no team/role system (out of scope). An "operator" is simply an email
 * present in the configured `OPERATIONS_OPERATOR_EMAILS` allowlist — a minimal,
 * explicit, safe guard. With an empty allowlist, nobody is an operator and the
 * operations surface is effectively locked.
 */

export function operatorEmails(env: ApiEnv): string[] {
  return env.OPERATIONS_OPERATOR_EMAILS.split(',')
    .map((e) => e.trim().toLowerCase())
    .filter((e) => e.length > 0);
}

export function isOperator(env: ApiEnv, email: string | null | undefined): boolean {
  if (!email) return false;
  return operatorEmails(env).includes(email.trim().toLowerCase());
}

/**
 * Work-initiating endpoints blocked while MAINTENANCE mode is on. Health,
 * backup/restore, operations, and auth remain available. Read-only GETs are
 * never blocked here.
 */
const MAINTENANCE_BLOCKED: Array<{ method: string; re: RegExp }> = [
  { method: 'POST', re: /^\/collector\/start$/ },
  { method: 'POST', re: /^\/ai-drafts\/generate$/ },
  { method: 'POST', re: /^\/ai-drafts\/[^/]+\/regenerate$/ },
  { method: 'POST', re: /^\/reviews$/ },
  { method: 'POST', re: /^\/actions$/ },
  { method: 'POST', re: /^\/actions\/[^/]+\/prepare-execution$/ },
  { method: 'POST', re: /^\/actions\/[^/]+\/dry-run$/ },
  { method: 'POST', re: /^\/facebook\/connect\/start$/ },
  { method: 'POST', re: /^\/facebook\/groups\/[^/]+\/validate$/ },
];

/**
 * Endpoints that touch Facebook (directly or by launching a browser), blocked
 * while INCIDENT LOCKDOWN is on — a strict superset of platform access.
 */
const LOCKDOWN_BLOCKED: Array<{ method: string; re: RegExp }> = [
  { method: 'POST', re: /^\/collector\/start$/ },
  { method: 'POST', re: /^\/facebook\/connect\/start$/ },
  { method: 'POST', re: /^\/facebook\/validate$/ },
  { method: 'POST', re: /^\/facebook\/groups\/[^/]+\/validate$/ },
  { method: 'POST', re: /^\/actions\/[^/]+\/prepare-execution$/ },
  { method: 'POST', re: /^\/actions\/[^/]+\/dry-run$/ },
  { method: 'POST', re: /^\/ai-drafts\/generate$/ },
];

function matches(
  list: Array<{ method: string; re: RegExp }>,
  method: string,
  path: string,
): boolean {
  return list.some((m) => m.method === method && m.re.test(path));
}

export function isBlockedByMaintenance(method: string, path: string): boolean {
  return matches(MAINTENANCE_BLOCKED, method.toUpperCase(), path);
}

export function isBlockedByLockdown(method: string, path: string): boolean {
  return matches(LOCKDOWN_BLOCKED, method.toUpperCase(), path);
}

/**
 * The EFFECTIVE safety posture once operational state is applied. Incident
 * lockdown forces every write flag off and the kill switch on, regardless of
 * configuration — a hard override an operator can engage instantly.
 */
export interface EffectiveSafety {
  actionEngineEnabled: boolean;
  facebookWriteEnabled: boolean;
  facebookCommentEnabled: boolean;
  killSwitchOn: boolean;
  adapter: string;
  maintenance: boolean;
  lockdown: boolean;
}

export function effectiveSafety(env: ApiEnv, state: OperationalState): EffectiveSafety {
  const lockdown = state.lockdown.enabled;
  return {
    actionEngineEnabled: lockdown ? false : env.ACTION_ENGINE_ENABLED,
    facebookWriteEnabled: lockdown ? false : env.FACEBOOK_WRITE_ACTION_ENABLED,
    facebookCommentEnabled: lockdown ? false : env.FACEBOOK_COMMENT_ENABLED,
    killSwitchOn: lockdown ? true : env.GLOBAL_KILL_SWITCH,
    adapter: env.FACEBOOK_COMMENT_ADAPTER,
    maintenance: state.maintenance.enabled,
    lockdown,
  };
}
