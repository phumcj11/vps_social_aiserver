import { describe, expect, it } from 'vitest';
import { recommendPilotGroups } from './group-selection';
import type { CandidateGroup, PilotArea } from './types';

function group(over: Partial<CandidateGroup>, area: PilotArea, id: string): CandidateGroup {
  return {
    internalId: id,
    facebookGroupId: id + '0',
    name: 'g-' + id,
    area,
    accessState: 'accessible',
    accountHasAccess: true,
    hasGenuineSeekingPosts: true,
    stableCollectorParsing: true,
    rulesAllowBusinessResponses: true,
    manageablePostVolume: true,
    noCheckpointHistory: true,
    accessStable: true,
    ...over,
  };
}

describe('recommendPilotGroups', () => {
  it('recommends at most one qualified group per area, max 3', () => {
    const r = recommendPilotGroups([
      group({}, 'บางแสน', 'a'),
      group({}, 'บางแสน', 'a2'), // second in same area → not recommended
      group({}, 'พัทยา', 'b'),
      group({}, 'ชะอำ', 'c'),
    ]);
    expect(r.recommended.map((g) => g.area)).toEqual(['บางแสน', 'พัทยา', 'ชะอำ']);
    expect(r.recommended).toHaveLength(3);
  });

  it('never enables all six existing groups (caps at maxGroups)', () => {
    const many = ['บางแสน', 'พัทยา', 'ชะอำ'].flatMap((a, i) => [
      group({}, a as PilotArea, `x${i}`),
      group({}, a as PilotArea, `y${i}`),
    ]);
    const r = recommendPilotGroups(many, 3);
    expect(r.recommended.length).toBeLessThanOrEqual(3);
  });

  it('rejects a group that fails any selection criterion', () => {
    const r = recommendPilotGroups([
      group({ noCheckpointHistory: false }, 'บางแสน', 'a'),
      group({ rulesAllowBusinessResponses: false }, 'พัทยา', 'b'),
      group({ hasGenuineSeekingPosts: false }, 'ชะอำ', 'c'),
    ]);
    expect(r.recommended).toHaveLength(0);
    expect(r.rejected.length).toBe(3);
    expect(r.rejected[0]!.reasons.join(' ')).toMatch(/checkpoint/i);
  });

  it('rejects a group with no access', () => {
    const r = recommendPilotGroups([group({ accountHasAccess: false }, 'บางแสน', 'a')]);
    expect(r.recommended).toHaveLength(0);
    expect(r.rejected[0]!.reasons.join(' ')).toMatch(/access/i);
  });
});
