import type { CandidateGroup, PilotArea } from './types';
import { PILOT_AREAS } from './types';

/**
 * Level-1 pilot group selection (SPRINT 014, Phase C).
 *
 * Recommends AT MOST ONE validated group per area (บางแสน / พัทยา / ชะอำ), at
 * most three total. Pure and deterministic — it only RECOMMENDS; it activates
 * no writes and enables no flags. A group qualifies only if it meets every
 * selection criterion.
 */

export interface GroupSelectionResult {
  recommended: Array<{
    internalId: string;
    facebookGroupId: string;
    name: string;
    area: PilotArea;
  }>;
  rejected: Array<{ internalId: string; name: string; reasons: string[] }>;
  note: string;
}

function disqualifiers(g: CandidateGroup): string[] {
  const r: string[] = [];
  if (g.area == null) r.push('not mapped to a pilot area (บางแสน/พัทยา/ชะอำ)');
  if (!g.accountHasAccess || g.accessState !== 'accessible')
    r.push('connected account lacks access');
  if (!g.hasGenuineSeekingPosts) r.push('no genuine accommodation-seeking posts');
  if (!g.stableCollectorParsing) r.push('Collector parsing not stable');
  if (!g.rulesAllowBusinessResponses) r.push('group rules prohibit business responses');
  if (!g.manageablePostVolume) r.push('post volume not manageable');
  if (!g.noCheckpointHistory) r.push('has checkpoint/CAPTCHA history');
  if (!g.accessStable) r.push('access unstable');
  return r;
}

export function recommendPilotGroups(
  candidates: CandidateGroup[],
  maxGroups = 3,
): GroupSelectionResult {
  const rejected: GroupSelectionResult['rejected'] = [];
  const qualifiedByArea = new Map<PilotArea, CandidateGroup>();

  for (const g of candidates) {
    const reasons = disqualifiers(g);
    if (reasons.length > 0) {
      rejected.push({ internalId: g.internalId, name: g.name, reasons });
      continue;
    }
    const area = g.area as PilotArea;
    // One group per area — keep the first qualifying group deterministically.
    if (!qualifiedByArea.has(area)) qualifiedByArea.set(area, g);
    else
      rejected.push({
        internalId: g.internalId,
        name: g.name,
        reasons: ['area already has a selected group'],
      });
  }

  const recommended: GroupSelectionResult['recommended'] = [];
  for (const area of PILOT_AREAS) {
    const g = qualifiedByArea.get(area);
    if (g && recommended.length < maxGroups) {
      recommended.push({
        internalId: g.internalId,
        facebookGroupId: g.facebookGroupId,
        name: g.name,
        area,
      });
    }
  }

  return {
    recommended,
    rejected,
    note:
      `Recommendation only — production writes remain disabled. ` +
      `${recommended.length}/${maxGroups} groups (one per area); NOT all six existing groups are enabled.`,
  };
}
