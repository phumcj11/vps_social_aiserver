import { describe, expect, it } from 'vitest';
import { computeOnboarding, type OnboardingInput } from '../app/settings/businesses/onboarding';
import {
  propertyTypeLabel,
  PROPERTY_TYPE_LABELS,
  PROPERTY_TYPE_ORDER,
  readinessTab,
  READINESS_CTA,
  CONTACT_APPROVAL_LABELS,
  AVAILABILITY_OPTIONS,
  PRICING_OPTIONS,
} from '../app/settings/businesses/ui';

const activeProp = {
  status: 'active',
  capacity: { maxGuests: 15, bedrooms: 5 },
  location: { area: 'บางแสน', province: 'ชลบุรี' },
} as unknown as OnboardingInput['properties'][number];

function input(over: Partial<OnboardingInput> = {}): OnboardingInput {
  return {
    business: { name: 'Demo Bangsaen Pool Villa', status: 'active' },
    profile: { serviceArea: 'บางแสน', responseTone: 'สุภาพ' },
    policies: {} as OnboardingInput['policies'],
    contacts: [{ enabled: true, approvedForDrafts: true } as OnboardingInput['contacts'][number]],
    properties: [activeProp],
    readiness: { ready: false, status: 'NOT_READY', missing: ['production environment'] },
    ...over,
  };
}

describe('onboarding progress', () => {
  it('counts 7 steps and computes progress from real data', () => {
    const r = computeOnboarding(input());
    expect(r.total).toBe(7);
    // All but the final readiness step are complete here.
    expect(r.done).toBe(6);
  });

  it('an empty business is 0/7 with business info as the next step', () => {
    const r = computeOnboarding(
      input({
        business: { name: '', status: 'active' },
        profile: null,
        policies: null,
        contacts: [],
        properties: [],
        readiness: null,
      }),
    );
    expect(r.done).toBe(0);
    expect(r.next?.key).toBe('business');
  });

  it('recommends the first incomplete step', () => {
    const r = computeOnboarding(input({ contacts: [] }));
    expect(r.next?.title).toBe('ช่องทางติดต่อ');
  });

  it('onboarding completion is NOT the same as Production READY', () => {
    // Everything else done, but readiness NOT ready → readiness step incomplete.
    const notReady = computeOnboarding(input());
    expect(notReady.steps.find((s) => s.key === 'readiness')?.done).toBe(false);
    // Flip readiness → the final step completes, without changing any other data.
    const ready = computeOnboarding(
      input({ readiness: { ready: true, status: 'READY', missing: [] } }),
    );
    expect(ready.steps.find((s) => s.key === 'readiness')?.done).toBe(true);
    expect(ready.done).toBe(7);
  });

  it('requires an APPROVED contact (not merely present) for the contact step', () => {
    const r = computeOnboarding(
      input({
        contacts: [
          { enabled: true, approvedForDrafts: false } as OnboardingInput['contacts'][number],
        ],
      }),
    );
    expect(r.steps.find((s) => s.key === 'contacts')?.done).toBe(false);
  });
});

describe('property type labels', () => {
  it('never returns a raw enum for a known type', () => {
    expect(propertyTypeLabel('pool_villa')).toBe('พูลวิลล่า');
    expect(propertyTypeLabel('hotel_room')).toBe('ห้องพักโรงแรม');
    expect(propertyTypeLabel('resort')).toBe('รีสอร์ท');
  });
  it('falls back safely for unknown / null', () => {
    expect(propertyTypeLabel(null)).toBe('—');
    expect(propertyTypeLabel('weird')).toBe('weird');
  });
  it('orders common types first and every order key has a label', () => {
    expect(PROPERTY_TYPE_ORDER[0]).toBe('pool_villa');
    for (const t of PROPERTY_TYPE_ORDER) expect(PROPERTY_TYPE_LABELS[t]).toBeTruthy();
  });
});

describe('readiness click-to-fix routing', () => {
  it('routes each requirement to the tab that fixes it', () => {
    expect(readinessTab('at least one approved contact channel')).toBe('ช่องทางติดต่อ');
    expect(readinessTab('availability policy')).toBe('นโยบาย');
    expect(readinessTab('at least one active Property')).toBe('ที่พัก');
    expect(readinessTab('response tone')).toBe('ข้อมูลธุรกิจ');
    expect(readinessTab('production environment')).toBe('ข้อมูลธุรกิจ');
  });
  it('has a Thai CTA for every tab', () => {
    for (const tab of ['ข้อมูลธุรกิจ', 'ช่องทางติดต่อ', 'นโยบาย', 'ที่พัก'] as const) {
      expect(READINESS_CTA[tab]).toMatch(/ไป/);
    }
  });
});

describe('policy + contact guidance', () => {
  it('every policy option has a plain-Thai description', () => {
    for (const o of [...AVAILABILITY_OPTIONS, ...PRICING_OPTIONS]) {
      expect(o.description.length).toBeGreaterThan(5);
    }
  });
  it('marks exactly one recommended default per policy group', () => {
    expect(AVAILABILITY_OPTIONS.filter((o) => o.recommended)).toHaveLength(1);
    expect(PRICING_OPTIONS.filter((o) => o.recommended)).toHaveLength(1);
  });
  it('contact approvals use plain-language Thai labels', () => {
    expect(CONTACT_APPROVAL_LABELS.approvedForDrafts).toContain('ข้อความตอบ');
    expect(CONTACT_APPROVAL_LABELS.ownerVerified).toContain('ยืนยัน');
  });
});
