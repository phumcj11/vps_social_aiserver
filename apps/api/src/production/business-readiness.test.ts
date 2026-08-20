import { describe, expect, it } from 'vitest';
import { evaluateProductionBusinessReadiness, evaluateDraftMode } from './business-readiness';
import type { ProductionBusinessInput } from './types';

const complete: ProductionBusinessInput = {
  isTestBusiness: false,
  realBusinessName: 'Real Homestay Co.',
  category: 'accommodation',
  serviceArea: 'บางแสน',
  verifiedDescription: 'A real homestay near the beach.',
  verifiedSellingPoints: ['near beach', 'family friendly'],
  actualContactChannel: 'https://facebook.com/realhomestay',
  contactChannelOwnerApproved: true,
  approvedResponseTone: 'polite, concise',
  prohibitedClaims: ['no fake availability', 'no fake price'],
  realAvailabilityPolicy: 'confirm by DM only',
  realPricingPolicy: 'quote on request',
  promotionPolicy: 'none',
  bookingPolicy: 'deposit required',
  escalationContactOwner: 'owner@example.com',
  operatingHours: '09:00-18:00',
  maxResponseSlaMinutes: 120,
};

describe('evaluateProductionBusinessReadiness', () => {
  it('READY when every required real field is supplied and approved', () => {
    const v = evaluateProductionBusinessReadiness(complete);
    expect(v.status).toBe('READY');
    expect(v.missing).toHaveLength(0);
  });

  it('NOT_READY for a test Business (never substitute test Businesses)', () => {
    const v = evaluateProductionBusinessReadiness({ ...complete, isTestBusiness: true });
    expect(v.status).toBe('NOT_READY');
    expect(v.missing.join(' ')).toMatch(/test Businesses must not/i);
  });

  it('NOT_READY when production Business info has not been supplied', () => {
    const v = evaluateProductionBusinessReadiness({ isTestBusiness: false });
    expect(v.status).toBe('NOT_READY');
    expect(v.missing.length).toBeGreaterThan(5);
  });

  it('NOT_READY without contact-owner approval', () => {
    const v = evaluateProductionBusinessReadiness({
      ...complete,
      contactChannelOwnerApproved: false,
    });
    expect(v.status).toBe('NOT_READY');
    expect(v.missing.join(' ')).toMatch(/contact channel owner approval/i);
  });

  it('NOT_READY without a response SLA', () => {
    const v = evaluateProductionBusinessReadiness({ ...complete, maxResponseSlaMinutes: 0 });
    expect(v.status).toBe('NOT_READY');
    expect(v.missing.join(' ')).toMatch(/response SLA/i);
  });
});

describe('evaluateDraftMode', () => {
  it('allows mock with mandatory human review', () => {
    const v = evaluateDraftMode('mock');
    expect(v.ready).toBe(true);
    expect(v.reasons.join(' ')).toMatch(/EDIT_AND_APPROVE|human review/i);
  });
  it('allows manual with human review', () => {
    expect(evaluateDraftMode('manual').ready).toBe(true);
  });
  it('refuses external_ai (not configured this sprint)', () => {
    const v = evaluateDraftMode('external_ai');
    expect(v.ready).toBe(false);
    expect(v.status).toBe('NOT_READY');
  });
});
