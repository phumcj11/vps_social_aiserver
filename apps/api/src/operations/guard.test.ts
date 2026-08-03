import { describe, expect, it } from 'vitest';
import { loadApiEnv } from '../lib/env';
import {
  isOperator,
  operatorEmails,
  isBlockedByMaintenance,
  isBlockedByLockdown,
  effectiveSafety,
} from './guard';
import { emptyOperationalState } from './state';

describe('operator allowlist', () => {
  it('matches configured emails case-insensitively', () => {
    const env = loadApiEnv({ OPERATIONS_OPERATOR_EMAILS: 'ops@example.com, Boss@Example.com' });
    expect(operatorEmails(env)).toEqual(['ops@example.com', 'boss@example.com']);
    expect(isOperator(env, 'OPS@example.com')).toBe(true);
    expect(isOperator(env, 'stranger@example.com')).toBe(false);
    expect(isOperator(env, null)).toBe(false);
  });
  it('empty allowlist means nobody is an operator', () => {
    const env = loadApiEnv({ OPERATIONS_OPERATOR_EMAILS: '' });
    expect(isOperator(env, 'anyone@example.com')).toBe(false);
  });
});

describe('route blocking', () => {
  it('maintenance blocks new work-initiating POSTs, not reads/health', () => {
    expect(isBlockedByMaintenance('POST', '/collector/start')).toBe(true);
    expect(isBlockedByMaintenance('POST', '/actions')).toBe(true);
    expect(isBlockedByMaintenance('POST', '/actions/abc/prepare-execution')).toBe(true);
    expect(isBlockedByMaintenance('GET', '/actions')).toBe(false);
    expect(isBlockedByMaintenance('GET', '/health')).toBe(false);
    expect(isBlockedByMaintenance('POST', '/operations/maintenance/disable')).toBe(false);
  });
  it('lockdown blocks every Facebook-touching endpoint', () => {
    expect(isBlockedByLockdown('POST', '/facebook/connect/start')).toBe(true);
    expect(isBlockedByLockdown('POST', '/facebook/validate')).toBe(true);
    expect(isBlockedByLockdown('POST', '/facebook/groups/abc/validate')).toBe(true);
    expect(isBlockedByLockdown('POST', '/actions/abc/prepare-execution')).toBe(true);
    expect(isBlockedByLockdown('POST', '/collector/start')).toBe(true);
    expect(isBlockedByLockdown('GET', '/facebook/account')).toBe(false);
  });
});

describe('effective safety', () => {
  it('lockdown forces write flags off and the kill switch on', () => {
    const env = loadApiEnv({
      ACTION_ENGINE_ENABLED: 'true',
      FACEBOOK_WRITE_ACTION_ENABLED: 'true',
      FACEBOOK_COMMENT_ENABLED: 'true',
      GLOBAL_KILL_SWITCH: 'false',
    });
    const state = emptyOperationalState();
    state.lockdown.enabled = true;
    const eff = effectiveSafety(env, state);
    expect(eff.actionEngineEnabled).toBe(false);
    expect(eff.facebookWriteEnabled).toBe(false);
    expect(eff.facebookCommentEnabled).toBe(false);
    expect(eff.killSwitchOn).toBe(true);
    expect(eff.lockdown).toBe(true);
  });
  it('without lockdown, effective flags mirror configuration', () => {
    const env = loadApiEnv({}); // safe defaults
    const eff = effectiveSafety(env, emptyOperationalState());
    expect(eff.actionEngineEnabled).toBe(false);
    expect(eff.killSwitchOn).toBe(true);
    expect(eff.adapter).toBe('fake');
  });
});
