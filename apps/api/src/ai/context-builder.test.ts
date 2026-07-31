import { describe, expect, it } from 'vitest';
import { buildDraftContext, type ContextBuilderInput } from './context-builder';
import { AiDraftError } from './errors';
import type {
  BusinessMatchRecord,
  OpportunityRecord,
  SignalRecord,
  FacebookGroupRecord,
  BusinessRecord,
  BusinessProfileRecord,
  BusinessKnowledgeRecord,
  BusinessMatchingRuleRecord,
} from '../store/types';

const WS = 'ws-1';
const BID = 'biz-1';
const d = (ms: number) => new Date(1_700_000_000_000 + ms);

function baseInput(overrides: Partial<ContextBuilderInput> = {}): ContextBuilderInput {
  const match: BusinessMatchRecord = {
    id: 'm1',
    workspaceId: WS,
    businessId: BID,
    opportunityId: 'o1',
    decision: 'MATCH',
    reasons: [{ ruleType: 'keyword', ruleValue: 'ประปา', matched: true }],
    matcherVersion: 'rules-v1',
    matchedAt: d(0),
  };
  const opportunity: OpportunityRecord = {
    id: 'o1',
    workspaceId: WS,
    signalId: 's1',
    decision: 'ACCEPT',
    status: 'READY',
    classifierVersion: 'rules-v1',
    createdAt: d(0),
    updatedAt: d(0),
  };
  const signal: SignalRecord = {
    id: 's1',
    workspaceId: WS,
    groupId: 'g1',
    facebookPostId: null,
    postUrl: 'https://www.facebook.com/groups/1/posts/abc',
    authorName: 'A',
    authorProfile: null,
    message: 'หาช่างประปา',
    mediaUrls: [],
    createdTime: null,
    normalizedHash: 'h',
    normalizedAt: d(0),
  };
  const group: FacebookGroupRecord = {
    id: 'g1',
    workspaceId: WS,
    facebookGroupId: '1',
    name: 'กลุ่มบ้าน',
    canonicalUrl: 'https://www.facebook.com/groups/1',
    originalUrl: 'https://www.facebook.com/groups/1',
    status: 'active',
    accessState: 'accessible',
    lastValidatedAt: null,
    lastErrorCode: null,
    lastErrorMessage: null,
    createdAt: d(0),
    updatedAt: d(0),
  };
  const business: BusinessRecord = {
    id: BID,
    workspaceId: WS,
    name: 'ร้านช่างประปา',
    slug: 'plumber',
    status: 'active',
    createdAt: d(0),
    updatedAt: d(0),
  };
  const profile: BusinessProfileRecord = {
    businessId: BID,
    category: 'ประปา',
    description: 'บริการซ่อมประปา',
    sellingPoints: ['มาไว'],
    serviceArea: 'กรุงเทพ',
    contactInformation: 'LINE @plumber',
    responseTone: 'สุภาพ',
    prohibitedClaims: ['รับประกัน 100%'],
    createdAt: d(0),
    updatedAt: d(0),
  };
  const knowledge: BusinessKnowledgeRecord[] = [
    {
      id: 'k2',
      businessId: BID,
      title: 'ราคา',
      content: 'เริ่มต้น 300',
      status: 'active',
      createdAt: d(2),
      updatedAt: d(2),
    },
    {
      id: 'k1',
      businessId: BID,
      title: 'เวลา',
      content: '9-18',
      status: 'active',
      createdAt: d(1),
      updatedAt: d(1),
    },
    {
      id: 'k3',
      businessId: BID,
      title: 'เก่า',
      content: 'ยกเลิก',
      status: 'archived',
      createdAt: d(3),
      updatedAt: d(3),
    },
  ];
  const rules: BusinessMatchingRuleRecord[] = [
    {
      id: 'r1',
      businessId: BID,
      ruleType: 'keyword',
      ruleValue: 'ประปา',
      priority: 10,
      status: 'active',
      createdAt: d(0),
      updatedAt: d(0),
    },
    {
      id: 'r2',
      businessId: BID,
      ruleType: 'keyword',
      ruleValue: 'เก่า',
      priority: 5,
      status: 'disabled',
      createdAt: d(0),
      updatedAt: d(0),
    },
  ];
  return {
    workspaceId: WS,
    match,
    opportunity,
    opportunityReasons: [{ code: 'HAS_TEXT', passed: true }],
    signal,
    group,
    business,
    profile,
    knowledge,
    rules,
    ...overrides,
  };
}

const config = { maxKnowledgeItems: 20, maxCharacters: 12_000 };

describe('BusinessContextBuilder', () => {
  it('assembles safe structured context using only same-workspace data', () => {
    const ctx = buildDraftContext(baseInput(), config);
    expect(ctx.business.name).toBe('ร้านช่างประปา');
    expect(ctx.business.contactInformation).toBe('LINE @plumber');
    expect(ctx.prohibitedClaims).toEqual(['รับประกัน 100%']);
    expect(ctx.signal.sourceUrl).toBe('https://www.facebook.com/groups/1/posts/abc');
    expect(ctx.signal.group.name).toBe('กลุ่มบ้าน');
  });

  it('excludes archived knowledge and disabled rules', () => {
    const ctx = buildDraftContext(baseInput(), config);
    expect(ctx.knowledge.map((k) => k.title)).not.toContain('เก่า');
    expect(ctx.matchingRules.map((r) => r.ruleValue)).toEqual(['ประปา']);
  });

  it('orders knowledge deterministically by createdAt then id', () => {
    const ctx = buildDraftContext(baseInput(), config);
    expect(ctx.knowledge.map((k) => k.title)).toEqual(['เวลา', 'ราคา']);
  });

  it('bounds the number of knowledge items', () => {
    const ctx = buildDraftContext(baseInput(), { maxKnowledgeItems: 1, maxCharacters: 12_000 });
    expect(ctx.knowledge).toHaveLength(1);
    expect(ctx.knowledge[0]?.title).toBe('เวลา');
  });

  it('preserves Thai text unchanged', () => {
    const ctx = buildDraftContext(baseInput(), config);
    expect(ctx.knowledge[0]?.content).toBe('9-18');
    expect(ctx.business.description).toBe('บริการซ่อมประปา');
  });

  it('throws when records span more than one workspace', () => {
    const bad = baseInput();
    bad.business = { ...bad.business, workspaceId: 'other-ws' };
    expect(() => buildDraftContext(bad, config)).toThrow(AiDraftError);
  });

  it('emits no secrets, session data, or file paths', () => {
    const ctx = buildDraftContext(baseInput(), config);
    const json = JSON.stringify(ctx);
    expect(json).not.toMatch(/password|cookie|session|api[_-]?key|\/root\/|storage\/browser/i);
  });
});
