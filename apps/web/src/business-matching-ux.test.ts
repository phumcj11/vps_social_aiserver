import { describe, expect, it } from 'vitest';
import type { MatchingRule } from '../lib/api';
import {
  TYPE_OPTIONS,
  OWNER_CATEGORY_LABEL,
  normalizeToken,
  dedupeTokens,
  configToDesiredRules,
  rulesToConfig,
  reconcile,
  matchingStatus,
  suggestConfig,
  previewMatch,
  wouldMatch,
  hasAnyCriterion,
  isDuplicateToken,
  MATCHING_SAVE_MESSAGES,
  type MatchingConfig,
} from '../app/settings/businesses/business-matching-ui';

const RULE_TYPES = [
  'province',
  'district',
  'keyword',
  'guest_count',
  'budget',
  'facility',
  'custom',
];

function rule(over: Partial<MatchingRule>): MatchingRule {
  return {
    id: over.id ?? 'r1',
    businessId: 'b1',
    ruleType: over.ruleType ?? 'keyword',
    ruleValue: over.ruleValue ?? 'บางแสน',
    priority: 0,
    status: over.status ?? 'active',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

const cfg: MatchingConfig = {
  province: 'ชลบุรี',
  areas: ['บางแสน'],
  types: ['พูลวิลล่า'],
  keywords: ['บางแสน', 'พูลวิลล่า', 'บ้านพักบางแสน'],
};

describe('rule contract mapping (existing RULE_TYPES only)', () => {
  it('only emits province/district/keyword — never a new rule type', () => {
    for (const d of configToDesiredRules(cfg)) {
      expect(['province', 'district', 'keyword']).toContain(d.ruleType);
      expect(RULE_TYPES).toContain(d.ruleType); // subset of the API contract
    }
  });

  it('maps province → province, areas → district, types+keywords → keyword (deduped)', () => {
    const d = configToDesiredRules(cfg);
    expect(d.find((r) => r.ruleType === 'province')?.ruleValue).toBe('ชลบุรี');
    expect(d.filter((r) => r.ruleType === 'district').map((r) => r.ruleValue)).toEqual(['บางแสน']);
    const kw = d.filter((r) => r.ruleType === 'keyword').map((r) => r.ruleValue);
    // พูลวิลล่า appears in both types and keywords → only once; บางแสน once.
    expect(kw).toEqual(['พูลวิลล่า', 'บางแสน', 'บ้านพักบางแสน']);
  });

  it('round-trips config → rules → config for active rules', () => {
    const rules: MatchingRule[] = [
      rule({ id: 'p', ruleType: 'province', ruleValue: 'ชลบุรี' }),
      rule({ id: 'a', ruleType: 'district', ruleValue: 'บางแสน' }),
      rule({ id: 't', ruleType: 'keyword', ruleValue: 'พูลวิลล่า' }),
      rule({ id: 'k', ruleType: 'keyword', ruleValue: 'บ้านพักบางแสน' }),
    ];
    const back = rulesToConfig(rules);
    expect(back.province).toBe('ชลบุรี');
    expect(back.areas).toEqual(['บางแสน']);
    expect(back.types).toEqual(['พูลวิลล่า']); // recognised as a known type
    expect(back.keywords).toEqual(['บ้านพักบางแสน']); // non-type keyword
  });
});

describe('normalization + dedup', () => {
  it('normalizes case and whitespace', () => {
    expect(normalizeToken('  บางแสน  ')).toBe('บางแสน');
    expect(normalizeToken('Pool  Villa')).toBe('pool villa');
  });
  it('dedupes blanks and case-insensitive duplicates, keeping the first spelling', () => {
    expect(dedupeTokens(['บางแสน', ' บางแสน ', '', 'Pool', 'pool'])).toEqual(['บางแสน', 'Pool']);
  });
  it('detects a duplicate token', () => {
    expect(isDuplicateToken(['บางแสน'], ' บางแสน ')).toBe(true);
    expect(isDuplicateToken(['บางแสน'], 'พัทยา')).toBe(false);
    expect(isDuplicateToken(['บางแสน'], '   ')).toBe(false);
  });
});

describe('reconciliation (create / reactivate / deactivate, no hard delete)', () => {
  it('creates only the missing rules', () => {
    const existing = [rule({ id: 'p', ruleType: 'province', ruleValue: 'ชลบุรี' })];
    const r = reconcile(existing, configToDesiredRules(cfg));
    expect(r.toCreate.length).toBe(4); // district บางแสน + 3 keyword
    expect(r.toDeactivate).toEqual([]);
    expect(r.toReactivate).toEqual([]);
  });
  it('reactivates a disabled rule instead of creating a duplicate', () => {
    const existing = [
      rule({ id: 'x', ruleType: 'district', ruleValue: 'บางแสน', status: 'disabled' }),
    ];
    const r = reconcile(existing, [{ ruleType: 'district', ruleValue: ' บางแสน ' }]);
    expect(r.toReactivate).toEqual(['x']);
    expect(r.toCreate).toEqual([]);
  });
  it('deactivates an active rule the owner removed', () => {
    const existing = [rule({ id: 'gone', ruleType: 'keyword', ruleValue: 'พัทยา' })];
    const r = reconcile(existing, [{ ruleType: 'province', ruleValue: 'ชลบุรี' }]);
    expect(r.toDeactivate).toEqual(['gone']);
    expect(r.toCreate).toEqual([{ ruleType: 'province', ruleValue: 'ชลบุรี' }]);
  });
});

describe('status + suggestions', () => {
  it('reports UNSET with zero active rules, ACTIVE otherwise', () => {
    expect(matchingStatus([])).toBe('UNSET');
    expect(matchingStatus([rule({ status: 'disabled' })])).toBe('UNSET');
    expect(matchingStatus([rule({ status: 'active' })])).toBe('ACTIVE');
  });
  it('suggests a config from persisted facts (no fabricated values)', () => {
    const s = suggestConfig({
      province: 'ชลบุรี',
      areas: ['บางแสน', 'บางแสน'],
      propertyTypes: ['พูลวิลล่า'],
    });
    expect(s.province).toBe('ชลบุรี');
    expect(s.areas).toEqual(['บางแสน']);
    expect(s.types).toEqual(['พูลวิลล่า']);
    expect(s.keywords).toEqual(['บางแสน', 'พูลวิลล่า']);
  });
});

describe('preview explainability (mirrors matcher, no ids/scores)', () => {
  it('explains an area + type match for the canonical lead', () => {
    const lines = previewMatch(cfg, 'หาพูลวิลล่าบางแสน 12 คน');
    expect(lines.some((l) => l.ok && l.label === 'พื้นที่ตรง: บางแสน')).toBe(true);
    expect(lines.some((l) => l.ok && l.label === 'ประเภทตรง: พูลวิลล่า')).toBe(true);
    // No internal ids/scores leak into labels.
    for (const l of lines) expect(l.label).not.toMatch(/rule|_id|score|province|district|keyword/i);
  });
  it('wouldMatch is true when any criterion is contained in the lead', () => {
    expect(wouldMatch(cfg, 'หาพูลวิลล่าบางแสน 12 คน')).toBe(true);
    expect(wouldMatch(cfg, 'หาบ้านเชียงใหม่')).toBe(false);
  });
});

describe('owner-safe messages + guards', () => {
  it('exposes plain Thai feedback and no raw internals', () => {
    expect(MATCHING_SAVE_MESSAGES.saved).toBe('บันทึกเรียบร้อย');
    expect(MATCHING_SAVE_MESSAGES.empty).toBe('กรุณาเลือกอย่างน้อย 1 เกณฑ์การจับคู่');
    expect(MATCHING_SAVE_MESSAGES.duplicate).toBe('มีข้อมูลนี้อยู่แล้ว');
  });
  it('hasAnyCriterion reflects whether the config would create any rule', () => {
    expect(hasAnyCriterion({ province: '', areas: [], types: [], keywords: [] })).toBe(false);
    expect(hasAnyCriterion({ province: 'ชลบุรี', areas: [], types: [], keywords: [] })).toBe(true);
  });
  it('owner category labels and type options are plain Thai, not enum tokens', () => {
    for (const v of Object.values(OWNER_CATEGORY_LABEL)) expect(v).not.toMatch(/_|[a-z]/i);
    expect(TYPE_OPTIONS).toContain('พูลวิลล่า');
    for (const t of TYPE_OPTIONS) expect(t).not.toMatch(/_/);
  });
});
