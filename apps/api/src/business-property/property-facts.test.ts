import { describe, expect, it } from 'vitest';
import {
  type PropertyFact,
  PROPERTY_FACT_VALUES,
  TRISTATE_AMENITY_KEYS,
  isPropertyFact,
  factFromColumn,
  factToColumn,
  factIsPresentV1,
  factFromLegacyBoolean,
  coercePropertyFact,
} from './property-facts';

describe('property tri-state facts (M9B)', () => {
  it('has exactly three explicit states', () => {
    expect([...PROPERTY_FACT_VALUES]).toEqual(['YES', 'NO', 'UNKNOWN']);
    expect([...TRISTATE_AMENITY_KEYS]).toEqual([
      'privatePool',
      'nearBeach',
      'beachfront',
      'riverfront',
    ]);
  });

  it('isPropertyFact guards the enum', () => {
    for (const v of ['YES', 'NO', 'UNKNOWN']) expect(isPropertyFact(v)).toBe(true);
    for (const v of [true, false, null, undefined, 0, 1, 'yes', 'maybe', '']) {
      expect(isPropertyFact(v)).toBe(false);
    }
  });

  describe('DB column codec (nullable boolean ⇆ fact)', () => {
    it('reads true=YES, false=NO, NULL/undefined=UNKNOWN', () => {
      expect(factFromColumn(true)).toBe('YES');
      expect(factFromColumn(false)).toBe('NO');
      expect(factFromColumn(null)).toBe('UNKNOWN');
      expect(factFromColumn(undefined)).toBe('UNKNOWN');
    });
    it('writes YES=true, NO=false, UNKNOWN=NULL', () => {
      expect(factToColumn('YES')).toBe(true);
      expect(factToColumn('NO')).toBe(false);
      expect(factToColumn('UNKNOWN')).toBe(null);
    });
    it('round-trips every state losslessly', () => {
      for (const f of PROPERTY_FACT_VALUES) {
        expect(factFromColumn(factToColumn(f))).toBe(f);
      }
    });
  });

  describe('legacy migration rule (CRITICAL)', () => {
    it('legacy true → YES', () => {
      expect(factFromLegacyBoolean(true)).toBe('YES');
    });
    it('legacy false → UNKNOWN, NEVER a confirmed NO', () => {
      expect(factFromLegacyBoolean(false)).toBe('UNKNOWN');
      expect(factFromLegacyBoolean(false)).not.toBe('NO');
    });
    it('the migration column mapping matches: 0 became NULL (UNKNOWN), 1 stayed YES', () => {
      // After the 0018 migration, a legacy false(0) row is NULL → UNKNOWN, and a
      // legacy true(1) row is still 1 → YES. A confirmed NO(0) only exists after
      // an explicit owner write.
      expect(factFromColumn(null)).toBe('UNKNOWN'); // migrated legacy false
      expect(factFromColumn(true)).toBe('YES'); // legacy true
    });
  });

  describe('v1 matcher compatibility + truthiness safety', () => {
    it('only a confirmed YES is present; NO and UNKNOWN are not', () => {
      expect(factIsPresentV1('YES')).toBe(true);
      expect(factIsPresentV1('NO')).toBe(false);
      expect(factIsPresentV1('UNKNOWN')).toBe(false);
    });
    it('UNKNOWN/NO never leak as present through string truthiness', () => {
      // 'NO' and 'UNKNOWN' are truthy strings — a naive `if (fact)` would be a
      // bug. factIsPresentV1 must not repeat it.
      const facts: PropertyFact[] = ['NO', 'UNKNOWN'];
      for (const f of facts) {
        expect(Boolean(f)).toBe(true); // the string IS truthy…
        expect(factIsPresentV1(f)).toBe(false); // …but the fact is not present.
      }
    });
  });

  describe('coercePropertyFact (loose API input)', () => {
    it('passes through the explicit enum', () => {
      expect(coercePropertyFact('YES')).toBe('YES');
      expect(coercePropertyFact('NO')).toBe('NO');
      expect(coercePropertyFact('UNKNOWN')).toBe('UNKNOWN');
    });
    it('coerces legacy booleans (true→YES, false→UNKNOWN)', () => {
      expect(coercePropertyFact(true)).toBe('YES');
      expect(coercePropertyFact(false)).toBe('UNKNOWN');
    });
    it('rejects junk instead of silently coercing it', () => {
      for (const v of ['yes', 'maybe', 1, 0, null, undefined, {}, []]) {
        expect(coercePropertyFact(v)).toBeUndefined();
      }
    });
  });
});
