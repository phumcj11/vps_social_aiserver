import { describe, expect, it } from 'vitest';
import {
  parsePropertyRequirement,
  evaluatePropertyCandidate,
  selectBestProperty,
  PROPERTY_MATCHER_VERSION,
} from './property-selection';
import { emptyPropertyDefaults } from '../business-property/store';
import type { Property } from '../business-property/types';

function property(id: string, over: Partial<Property> = {}): Property {
  return {
    ...emptyPropertyDefaults(),
    id,
    workspaceId: 'ws',
    businessId: 'biz',
    name: id,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    ...over,
  } as Property;
}

function loc(area: string): Property['location'] {
  return { ...emptyPropertyDefaults().location, area };
}
function cap(maxGuests: number, bedrooms: number | null = null): Property['capacity'] {
  return { ...emptyPropertyDefaults().capacity, maxGuests, bedrooms };
}

// The Sprint-016B canonical scenario (spec Phase Q).
const villaA = property('villa-a', {
  name: 'Villa A',
  propertyType: 'pool_villa',
  location: loc('บางแสน'),
  capacity: cap(8),
  amenities: { ...emptyPropertyDefaults().amenities, privatePool: 'YES' },
});
const villaB = property('villa-b', {
  name: 'Villa B',
  propertyType: 'pool_villa',
  location: loc('บางแสน'),
  capacity: cap(15),
  amenities: { ...emptyPropertyDefaults().amenities, privatePool: 'YES', karaoke: true },
});
const villaC = property('villa-c', {
  name: 'Villa C',
  propertyType: 'pool_villa',
  location: loc('พัทยา'),
  capacity: cap(20),
  amenities: { ...emptyPropertyDefaults().amenities, privatePool: 'YES' },
});

const KNOWN_AREAS = ['บางแสน', 'พัทยา'];
const REQUEST = 'หาพูลวิลล่าบางแสน 12 คน มีสระ คาราโอเกะ';

describe('parsePropertyRequirement', () => {
  it('parses area (from known areas), guests, type, pool, and requested amenities', () => {
    const req = parsePropertyRequirement(REQUEST, KNOWN_AREAS);
    expect(req.area).toBe('บางแสน');
    expect(req.guests).toBe(12);
    expect(req.accommodationType).toBe('pool_villa');
    expect(req.needsPrivatePool).toBe(true);
    expect(req.requestedAmenities).toContain('karaoke');
  });

  it('recognises a served area or a seed-lexicon area, and null for an unknown place', () => {
    // Served by a candidate Property.
    expect(parsePropertyRequirement('หาบ้านพัทยา', KNOWN_AREAS).area).toBe('พัทยา');
    // In the seed lexicon even if no candidate serves it (→ enables AREA_MISMATCH).
    expect(parsePropertyRequirement('หาบ้านเชียงใหม่', KNOWN_AREAS).area).toBe('เชียงใหม่');
    // A made-up place is not recognised as an area.
    expect(parsePropertyRequirement('หาบ้านเมืองสมมติแห่งหนึ่ง', KNOWN_AREAS).area).toBeNull();
  });

  it('parses bedrooms and beach/river requirements', () => {
    const req = parsePropertyRequirement('บ้านริมทะเล 3 ห้องนอน', ['หัวหิน']);
    expect(req.bedrooms).toBe(3);
    expect(req.needsBeach).toBe(true);
    expect(req.needsRiver).toBe(false);
  });
});

describe('evaluatePropertyCandidate', () => {
  const req = parsePropertyRequirement(REQUEST, KNOWN_AREAS);

  it('MATCHes a qualifying property with positive reasons', () => {
    const e = evaluatePropertyCandidate(villaB, req);
    expect(e.decision).toBe('MATCH');
    expect(e.reasons.some((r) => r.startsWith('AREA_MATCH'))).toBe(true);
    expect(e.reasons.some((r) => r.startsWith('CAPACITY_MATCH'))).toBe(true);
    expect(e.reasons).toContain('AMENITY_MATCH: karaoke');
  });

  it('NO_MATCH when capacity is too low (disqualifier)', () => {
    const e = evaluatePropertyCandidate(villaA, req);
    expect(e.decision).toBe('NO_MATCH');
    expect(e.reasons.some((r) => r.startsWith('CAPACITY_MISMATCH'))).toBe(true);
  });

  it('NO_MATCH when the area mismatches (disqualifier)', () => {
    const e = evaluatePropertyCandidate(villaC, req);
    expect(e.decision).toBe('NO_MATCH');
    expect(e.reasons.some((r) => r.startsWith('AREA_MISMATCH'))).toBe(true);
  });

  it('records a soft AMENITY_MISSING for a requested amenity the property lacks', () => {
    const noKaraoke = property('villa-d', {
      location: loc('บางแสน'),
      capacity: cap(15),
      amenities: { ...emptyPropertyDefaults().amenities, privatePool: 'YES' },
    });
    const e = evaluatePropertyCandidate(noKaraoke, req);
    expect(e.decision).toBe('MATCH'); // missing amenity is soft, not disqualifying
    expect(e.reasons).toContain('AMENITY_MISSING: karaoke');
  });
});

describe('selectBestProperty', () => {
  const req = parsePropertyRequirement(REQUEST, KNOWN_AREAS);

  it('selects the single qualifying property (Villa B) in the canonical scenario', () => {
    const sel = selectBestProperty([villaA, villaB, villaC], req);
    expect(sel.decision).toBe('MATCH');
    expect(sel.selected?.property.id).toBe('villa-b');
    expect(sel.candidatesEvaluated).toBe(3);
  });

  it('NO_PROPERTY_MATCH when nothing qualifies (never fabricates a property)', () => {
    const sel = selectBestProperty([villaA, villaC], req); // A fails capacity, C fails area
    expect(sel.decision).toBe('NO_MATCH');
    expect(sel.selected).toBeNull();
    expect(sel.reasons).toContain('NO_PROPERTY_MATCH');
  });

  it('ranks amenity/feature coverage above a bare match, deterministically', () => {
    const plain = property('villa-plain', {
      location: loc('บางแสน'),
      capacity: cap(15),
      amenities: { ...emptyPropertyDefaults().amenities, privatePool: 'YES' },
    });
    const richer = property('villa-rich', {
      location: loc('บางแสน'),
      capacity: cap(15),
      amenities: { ...emptyPropertyDefaults().amenities, privatePool: 'YES', karaoke: true },
    });
    const sel = selectBestProperty([plain, richer], req);
    expect(sel.selected?.property.id).toBe('villa-rich');
  });

  it('uses a stable id tie-break when candidates rank identically', () => {
    const p1 = property('aaa', { location: loc('บางแสน'), capacity: cap(12) });
    const p2 = property('bbb', { location: loc('บางแสน'), capacity: cap(12) });
    const bare = parsePropertyRequirement('หาที่พักบางแสน 12 คน', KNOWN_AREAS);
    const sel = selectBestProperty([p2, p1], bare);
    expect(sel.selected?.property.id).toBe('aaa'); // 'aaa' < 'bbb'
  });

  it('prefers the snuggest sufficient capacity', () => {
    const snug = property('snug', { location: loc('บางแสน'), capacity: cap(12) });
    const huge = property('huge', { location: loc('บางแสน'), capacity: cap(40) });
    const bare = parsePropertyRequirement('หาที่พักบางแสน 12 คน', KNOWN_AREAS);
    const sel = selectBestProperty([huge, snug], bare);
    expect(sel.selected?.property.id).toBe('snug');
  });
});

describe('matcher version', () => {
  it('is the stable property-rules-v2 constant', () => {
    expect(PROPERTY_MATCHER_VERSION).toBe('property-rules-v2');
  });
});

// ── Matching Semantics v2 (M9C) ──────────────────────────────────────────────
function codes(reasons: string[]): string[] {
  return reasons.map((r) => (r.split(':')[0] ?? '').trim());
}

describe('tri-state fact semantics (M9C)', () => {
  const req = parsePropertyRequirement('หาที่พักบางแสน 8 คน มีสระส่วนตัว', KNOWN_AREAS);

  it('private pool: YES → MATCH, NO → hard failure, UNKNOWN → needs confirmation', () => {
    const base = { location: loc('บางแสน'), capacity: cap(10) };
    const yes = evaluatePropertyCandidate(
      property('y', {
        ...base,
        amenities: { ...emptyPropertyDefaults().amenities, privatePool: 'YES' },
      }),
      req,
    );
    expect(codes(yes.reasons)).toContain('PRIVATE_POOL_MATCH');
    expect(yes.decision).toBe('MATCH');

    const no = evaluatePropertyCandidate(
      property('n', {
        ...base,
        amenities: { ...emptyPropertyDefaults().amenities, privatePool: 'NO' },
      }),
      req,
    );
    expect(codes(no.reasons)).toContain('PRIVATE_POOL_MISSING');
    expect(no.decision).toBe('NO_MATCH');

    const unknown = evaluatePropertyCandidate(
      property('u', {
        ...base,
        amenities: { ...emptyPropertyDefaults().amenities, privatePool: 'UNKNOWN' },
      }),
      req,
    );
    expect(codes(unknown.reasons)).toContain('PRIVATE_POOL_UNKNOWN');
    expect(codes(unknown.reasons)).not.toContain('PRIVATE_POOL_MISSING');
    expect(unknown.decision).toBe('NEEDS_CONFIRMATION');
  });

  it('near beach: YES → BEACH_MATCH, NO → BEACH_MISSING, UNKNOWN → BEACH_UNKNOWN', () => {
    const beachReq = parsePropertyRequirement('หาที่พักบางแสน 8 คน ใกล้ทะเล', KNOWN_AREAS);
    const base = { location: loc('บางแสน'), capacity: cap(10) };
    const yes = evaluatePropertyCandidate(
      property('by', {
        ...base,
        amenities: { ...emptyPropertyDefaults().amenities, nearBeach: 'YES' },
      }),
      beachReq,
    );
    expect(codes(yes.reasons)).toContain('BEACH_MATCH');
    expect(yes.decision).toBe('MATCH');

    // A confirmed NO on BOTH beach facts is a confirmed mismatch.
    const no = evaluatePropertyCandidate(
      property('bn', {
        ...base,
        amenities: { ...emptyPropertyDefaults().amenities, nearBeach: 'NO', beachfront: 'NO' },
      }),
      beachReq,
    );
    expect(codes(no.reasons)).toContain('BEACH_MISSING');
    expect(no.decision).toBe('NO_MATCH');

    // Default UNKNOWN → BEACH_UNKNOWN, NEVER BEACH_MISSING.
    const unknown = evaluatePropertyCandidate(property('bu', base), beachReq);
    expect(codes(unknown.reasons)).toContain('BEACH_UNKNOWN');
    expect(codes(unknown.reasons)).not.toContain('BEACH_MISSING');
    expect(unknown.decision).toBe('NEEDS_CONFIRMATION');
  });

  it('capacity stays a hard factual constraint (10>8 fails, 10<=15 passes)', () => {
    const capReq = parsePropertyRequirement('หาที่พักบางแสน 10 คน', KNOWN_AREAS);
    const tooSmall = evaluatePropertyCandidate(
      property('small', { location: loc('บางแสน'), capacity: cap(8) }),
      capReq,
    );
    expect(codes(tooSmall.reasons)).toContain('CAPACITY_MISMATCH');
    expect(tooSmall.decision).toBe('NO_MATCH');
    const bigEnough = evaluatePropertyCandidate(
      property('big', { location: loc('บางแสน'), capacity: cap(15) }),
      capReq,
    );
    expect(codes(bigEnough.reasons)).toContain('CAPACITY_MATCH');
    expect(bigEnough.decision).toBe('MATCH');
  });

  it('UNKNOWN is never treated as YES through truthiness (no BEACH_MATCH from UNKNOWN)', () => {
    const beachReq = parsePropertyRequirement('หาที่พักบางแสน 8 คน ใกล้ทะเล', KNOWN_AREAS);
    const ev = evaluatePropertyCandidate(
      property('t', { location: loc('บางแสน'), capacity: cap(10) }), // nearBeach defaults UNKNOWN
      beachReq,
    );
    expect(codes(ev.reasons)).not.toContain('BEACH_MATCH');
    expect(codes(ev.reasons)).toContain('BEACH_UNKNOWN');
  });

  it('unknown property location is NOT a confirmed mismatch (AREA_UNKNOWN)', () => {
    const areaReq = parsePropertyRequirement('หาที่พักบางแสน 8 คน', KNOWN_AREAS);
    const noLoc = evaluatePropertyCandidate(property('nl', { capacity: cap(10) }), areaReq);
    expect(codes(noLoc.reasons)).toContain('AREA_UNKNOWN');
    expect(codes(noLoc.reasons)).not.toContain('AREA_MISMATCH');
    expect(noLoc.decision).toBe('NEEDS_CONFIRMATION');
  });

  it('บ้านพัก is compatible with pool_villa (soft TYPE_COMPATIBLE, never a failure)', () => {
    const houseReq = parsePropertyRequirement('หาบ้านพักบางแสน 8 คน', KNOWN_AREAS);
    expect(houseReq.accommodationType).toBe('house');
    const ev = evaluatePropertyCandidate(
      property('pv', {
        propertyType: 'pool_villa',
        location: loc('บางแสน'),
        capacity: cap(10),
      }),
      houseReq,
    );
    expect(codes(ev.reasons)).toContain('TYPE_COMPATIBLE');
    expect(codes(ev.reasons)).not.toContain('TYPE_MISMATCH');
  });

  it('a NEEDS_CONFIRMATION candidate ranks above a hard-failed candidate', () => {
    const beachReq = parsePropertyRequirement('หาที่พักบางแสน 10 คน ใกล้ทะเล', KNOWN_AREAS);
    const hardFail = property('hf', { location: loc('บางแสน'), capacity: cap(8) }); // 10>8
    const needsConf = property('nc', { location: loc('บางแสน'), capacity: cap(15) }); // beach UNKNOWN
    const sel = selectBestProperty([hardFail, needsConf], beachReq);
    expect(sel.decision).toBe('NEEDS_CONFIRMATION');
    expect(sel.selected?.property.id).toBe('nc');
  });
});

describe('real M7 regression (M9C)', () => {
  // The live M7 lead — both Bangsaen pool villas have nearBeach UNKNOWN (owner
  // never set the fact); Villa A also fails capacity.
  const M7_REQUEST = 'หาบ้านพักบางแสน 10 คน มีสระส่วนตัว ขอที่พักใกล้ทะเลครับ';
  const m7VillaA = property('m7-a', {
    name: 'Villa A',
    propertyType: 'pool_villa',
    location: loc('บางแสน'),
    capacity: cap(8),
    amenities: { ...emptyPropertyDefaults().amenities, privatePool: 'YES' }, // nearBeach UNKNOWN
  });
  const m7VillaB = property('m7-b', {
    name: 'Villa B',
    propertyType: 'pool_villa',
    location: loc('บางแสน'),
    capacity: cap(15),
    amenities: { ...emptyPropertyDefaults().amenities, privatePool: 'YES' }, // nearBeach UNKNOWN
  });
  const req = parsePropertyRequirement(M7_REQUEST, ['บางแสน']);

  it('parses the M7 requirement (house, 10, private pool, near beach, บางแสน)', () => {
    expect(req.area).toBe('บางแสน');
    expect(req.guests).toBe(10);
    expect(req.accommodationType).toBe('house');
    expect(req.needsPrivatePool).toBe(true);
    expect(req.needsBeach).toBe(true);
  });

  it('Villa A → NO_MATCH on capacity; UNKNOWN beach is NOT the rejection reason', () => {
    const ev = evaluatePropertyCandidate(m7VillaA, req);
    expect(ev.decision).toBe('NO_MATCH');
    expect(codes(ev.reasons)).toContain('CAPACITY_MISMATCH');
    // It may also carry BEACH_UNKNOWN, but UNKNOWN must not be a failure.
    expect(codes(ev.reasons)).toContain('BEACH_UNKNOWN');
    expect(codes(ev.reasons)).not.toContain('BEACH_MISSING');
  });

  it('Villa B → NEEDS_CONFIRMATION with the expected reasons and NO BEACH_MISSING', () => {
    const ev = evaluatePropertyCandidate(m7VillaB, req);
    expect(ev.decision).toBe('NEEDS_CONFIRMATION');
    const c = codes(ev.reasons);
    expect(c).toContain('AREA_MATCH');
    expect(c).toContain('CAPACITY_MATCH');
    expect(c).toContain('PRIVATE_POOL_MATCH');
    expect(c).toContain('BEACH_UNKNOWN');
    expect(c).not.toContain('BEACH_MISSING');
  });

  it('recommends Villa B (NEEDS_CONFIRMATION) above Villa A (NO_MATCH)', () => {
    const sel = selectBestProperty([m7VillaA, m7VillaB], req);
    expect(sel.decision).toBe('NEEDS_CONFIRMATION');
    expect(sel.selected?.property.name).toBe('Villa B');
    // Villa A appears in the audited rejections as a hard NO_MATCH.
    const villaAEval = sel.evaluations.find((e) => e.property.name === 'Villa A');
    expect(villaAEval?.decision).toBe('NO_MATCH');
  });
});

describe('historical reason-blob compatibility (M9C)', () => {
  it('an old v1 NO_MATCH blob with BEACH_MISSING is still readable (codes unchanged)', () => {
    // Old stored M7 blob (property-rules-v1). The reason CODES are stable — v2
    // never rewrites or reinterprets a persisted blob; it only adds new codes.
    const legacy = {
      reasons: ['NO_PROPERTY_MATCH'],
      rejected: [
        {
          propertyId: 'a',
          propertyName: 'Villa A',
          decision: 'NO_MATCH' as const,
          reasons: ['AREA_MATCH: บางแสน', 'CAPACITY_MISMATCH: 10 > 8', 'BEACH_MISSING'],
        },
      ],
      requirement: {},
    };
    // The consumer just reads codes; BEACH_MISSING remains a legible historical
    // code even though v2 would now emit BEACH_UNKNOWN for the same input.
    expect(codes(legacy.rejected[0]!.reasons)).toEqual([
      'AREA_MATCH',
      'CAPACITY_MISMATCH',
      'BEACH_MISSING',
    ]);
    expect(legacy.rejected[0]!.decision).toBe('NO_MATCH');
  });
});
