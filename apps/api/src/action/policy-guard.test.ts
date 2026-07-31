import { describe, expect, it } from 'vitest';
import { evaluateActionPolicy } from './policy-guard';
import type { ActionIntent, ActionSafetyState } from './types';

function intent(overrides: Partial<ActionIntent> = {}): ActionIntent {
  return {
    workspaceId: 'ws-1',
    reviewTaskId: 'rt-1',
    aiDraftId: 'd-1',
    businessMatchId: 'm-1',
    actionType: 'facebook_comment',
    targetPlatform: 'facebook',
    targetUrl: 'https://www.facebook.com/groups/1/posts/abc',
    approvedContent: 'สวัสดีค่ะ ยินดีให้บริการ',
    ...overrides,
  };
}

function safety(overrides: Partial<ActionSafetyState> = {}): ActionSafetyState {
  return {
    actionEngineEnabled: true,
    facebookWriteEnabled: true,
    killSwitchOn: false,
    allowedTypes: ['facebook_comment'],
    maxContentLength: 2000,
    ...overrides,
  };
}

describe('ActionPolicyGuard', () => {
  it('ALLOWs when everything is safe and enabled', () => {
    const r = evaluateActionPolicy(intent(), safety(), { isDuplicate: false });
    expect(r.outcome).toBe('ALLOW');
  });

  it('BLOCKs when the kill switch is on', () => {
    const r = evaluateActionPolicy(intent(), safety({ killSwitchOn: true }), {
      isDuplicate: false,
    });
    expect(r.outcome).toBe('BLOCK');
    expect(r.reasons.map((x) => x.code)).toContain('KILL_SWITCH_ON');
  });

  it('BLOCKs when the Facebook write flag is false', () => {
    const r = evaluateActionPolicy(intent(), safety({ facebookWriteEnabled: false }), {
      isDuplicate: false,
    });
    expect(r.outcome).toBe('BLOCK');
    expect(r.reasons.map((x) => x.code)).toContain('WRITE_DISABLED');
  });

  it('BLOCKs when the action engine is disabled (current default posture)', () => {
    const r = evaluateActionPolicy(
      intent(),
      safety({ actionEngineEnabled: false, facebookWriteEnabled: false, killSwitchOn: true }),
      { isDuplicate: false },
    );
    expect(r.outcome).toBe('BLOCK');
    expect(r.reasons.map((x) => x.code)).toEqual(
      expect.arrayContaining(['ENGINE_DISABLED', 'WRITE_DISABLED', 'KILL_SWITCH_ON']),
    );
  });

  it('allows a supported action type', () => {
    const r = evaluateActionPolicy(intent({ actionType: 'facebook_comment' }), safety(), {
      isDuplicate: false,
    });
    expect(r.outcome).toBe('ALLOW');
  });

  it('REJECTs an unsupported action type', () => {
    const r = evaluateActionPolicy(intent({ actionType: 'facebook_message' }), safety(), {
      isDuplicate: false,
    });
    expect(r.outcome).toBe('REJECT');
    expect(r.reasons.map((x) => x.code)).toContain('UNSUPPORTED_TYPE');
  });

  it('REJECTs a duplicate active job', () => {
    const r = evaluateActionPolicy(intent(), safety(), { isDuplicate: true });
    expect(r.outcome).toBe('REJECT');
    expect(r.reasons.map((x) => x.code)).toContain('DUPLICATE_ACTIVE_JOB');
  });

  it('REJECTs excessive content', () => {
    const r = evaluateActionPolicy(intent({ approvedContent: 'ก'.repeat(2001) }), safety(), {
      isDuplicate: false,
    });
    expect(r.outcome).toBe('REJECT');
    expect(r.reasons.map((x) => x.code)).toContain('CONTENT_TOO_LONG');
  });

  it('REJECT takes priority over BLOCK (hard failures first)', () => {
    const r = evaluateActionPolicy(
      intent({ actionType: 'facebook_message' }),
      safety({ killSwitchOn: true }),
      {
        isDuplicate: false,
      },
    );
    expect(r.outcome).toBe('REJECT');
  });
});
