import { describe, expect, it } from 'vitest';
import {
  createAuthorization,
  validateAuthorization,
  consumeAuthorization,
  approvedContentHash,
  type SubmitAttempt,
} from './authorization';

const NOW = 1_000_000_000_000;
const CONTENT = 'สวัสดีค่ะ ทางร้านให้บริการค่ะ 😊';

const auth = createAuthorization(
  {
    workspaceId: 'a08bbd1f-9836-4c15-857e-065277fb1399',
    operatorEmail: 'op@example.com',
    actionJobId: '2a85a0dd-0681-4009-8328-e0a40f084cb8',
    targetPostKey: '0cc27c45',
    exactApprovedContent: CONTENT,
    releaseVersion: 'v0.9.3-pilot-write-verified',
    prepareOnlyRef: 'session-608b74b5',
    ttlSeconds: 300,
  },
  NOW,
);

const goodAttempt: SubmitAttempt = {
  actionJobId: auth.actionJobId,
  targetPostKey: auth.targetPostKey,
  exactApprovedContent: CONTENT,
  nonce: auth.nonce,
};

describe('one-shot production authorization', () => {
  it('binds workspace/operator/job/target/content-hash/nonce/version/prepare-ref', () => {
    expect(auth.approvedContentHash).toBe(approvedContentHash(CONTENT));
    expect(auth.nonce).toBeTruthy();
    expect(auth.releaseVersion).toMatch(/v0\.9\.3/);
    expect(auth.prepareOnlyRef).toBeTruthy();
    expect(auth.consumed).toBe(false);
  });

  it('validates a matching, unexpired, unused attempt', () => {
    expect(validateAuthorization(auth, goodAttempt, NOW + 1000).ok).toBe(true);
  });

  it('refuses an expired authorization', () => {
    const d = validateAuthorization(auth, goodAttempt, NOW + 300_001);
    expect(d.ok).toBe(false);
    expect(d.blockers.join(' ')).toMatch(/expired/i);
  });

  it('refuses a job mismatch', () => {
    const d = validateAuthorization(auth, { ...goodAttempt, actionJobId: 'other' }, NOW);
    expect(d.blockers.join(' ')).toMatch(/Action Job mismatch/i);
  });

  it('refuses a target mismatch', () => {
    const d = validateAuthorization(auth, { ...goodAttempt, targetPostKey: 'other' }, NOW);
    expect(d.blockers.join(' ')).toMatch(/target_post_key mismatch/i);
  });

  it('refuses a content-hash mismatch', () => {
    const d = validateAuthorization(
      auth,
      { ...goodAttempt, exactApprovedContent: CONTENT + ' x' },
      NOW,
    );
    expect(d.blockers.join(' ')).toMatch(/content hash mismatch/i);
  });

  it('refuses a nonce mismatch', () => {
    const d = validateAuthorization(auth, { ...goodAttempt, nonce: 'nope' }, NOW);
    expect(d.blockers.join(' ')).toMatch(/nonce mismatch/i);
  });

  it('is one-use: consuming marks it, a second consume is refused', () => {
    const first = consumeAuthorization(auth, goodAttempt, NOW);
    expect(first.ok).toBe(true);
    expect(first.consumed!.consumed).toBe(true);
    const second = consumeAuthorization(first.consumed!, goodAttempt, NOW);
    expect(second.ok).toBe(false);
    expect(second.blockers.join(' ')).toMatch(/already used/i);
  });
});
