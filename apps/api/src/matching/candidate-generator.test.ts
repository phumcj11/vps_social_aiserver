import { describe, expect, it } from 'vitest';
import { selectCandidates } from './candidate-generator';
import type { CandidateBusiness } from './types';

describe('CandidateGenerator (pure, deterministic)', () => {
  const businesses: CandidateBusiness[] = [
    { id: 'a', name: 'Active One', status: 'active' },
    { id: 'b', name: 'Disabled', status: 'disabled' },
    { id: 'c', name: 'Active Two', status: 'active' },
    { id: 'd', name: 'Archived', status: 'archived' },
  ];

  it('selects only active businesses', () => {
    const out = selectCandidates(businesses);
    expect(out.map((b) => b.id)).toEqual(['a', 'c']);
  });

  it('preserves input order', () => {
    const out = selectCandidates([
      { id: 'c', name: 'Active Two', status: 'active' },
      { id: 'a', name: 'Active One', status: 'active' },
    ]);
    expect(out.map((b) => b.id)).toEqual(['c', 'a']);
  });

  it('returns an empty array for no businesses', () => {
    expect(selectCandidates([])).toEqual([]);
  });
});
