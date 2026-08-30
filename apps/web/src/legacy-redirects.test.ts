import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { legacyBusinessTarget, LEGACY_BUSINESS_REDIRECTS } from '../lib/legacy-redirects';

describe('legacy /businesses redirect (M10B)', () => {
  it('maps the legacy list to the Thai settings hub', () => {
    expect(legacyBusinessTarget()).toBe('/settings/businesses');
    expect(legacyBusinessTarget(null)).toBe('/settings/businesses');
    expect(legacyBusinessTarget('')).toBe('/settings/businesses');
    expect(legacyBusinessTarget('   ')).toBe('/settings/businesses');
  });

  it('maps a legacy business id directly to the new settings route', () => {
    expect(legacyBusinessTarget('abc-123')).toBe('/settings/businesses/abc-123');
    expect(legacyBusinessTarget('  abc-123  ')).toBe('/settings/businesses/abc-123');
  });

  it('never points a customer back at the legacy surface', () => {
    for (const id of [undefined, 'x', 'c2cf0e54']) {
      expect(legacyBusinessTarget(id)).toMatch(/^\/settings\/businesses/);
      expect(legacyBusinessTarget(id)).not.toBe('/businesses');
    }
  });

  it('next.config.mjs redirects stay in sync with the declared rules', () => {
    const cfg = readFileSync(join(__dirname, '../next.config.mjs'), 'utf8');
    // Every declared legacy rule must appear in the server-level redirect config.
    expect(LEGACY_BUSINESS_REDIRECTS).toHaveLength(2);
    expect(cfg).toContain("source: '/businesses'");
    expect(cfg).toContain("destination: '/settings/businesses'");
    expect(cfg).toContain("source: '/businesses/:id'");
    expect(cfg).toContain("destination: '/settings/businesses/:id'");
  });
});
