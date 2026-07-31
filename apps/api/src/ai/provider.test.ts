import { describe, expect, it } from 'vitest';
import { MockAiDraftProvider, ExternalAiDraftProvider, selectAiDraftProvider } from './provider';
import { buildDraftPrompt } from './prompt-builder';
import { AiDraftError } from './errors';
import type { DraftContext } from './types';

function context(overrides: Partial<DraftContext['business']> = {}): DraftContext {
  return {
    business: {
      name: 'ร้านช่างประปา',
      category: 'ประปา',
      description: null,
      sellingPoints: [],
      serviceArea: 'กรุงเทพ',
      contactInformation: null,
      responseTone: 'friendly',
      ...overrides,
    },
    prohibitedClaims: [],
    knowledge: [],
    matchingRules: [],
    matchingReasons: [{ ruleType: 'keyword', ruleValue: 'ประปา', matched: true }],
    opportunity: { decision: 'ACCEPT', reasons: [] },
    signal: {
      message: 'หาช่างประปา',
      sourceUrl: 'https://www.facebook.com/groups/1/posts/abc',
      group: { name: 'กลุ่มบ้าน', url: 'https://www.facebook.com/groups/1' },
    },
  };
}

function input(ctx: DraftContext, maxLength = 500) {
  return { context: ctx, prompt: buildDraftPrompt(ctx, maxLength), maxLength };
}

describe('MockAiDraftProvider', () => {
  it('produces deterministic output for identical input', async () => {
    const p = new MockAiDraftProvider();
    const ctx = context();
    const a = await p.generateDraft(input(ctx));
    const b = await p.generateDraft(input(ctx));
    expect(a.content).toBe(b.content);
    expect(a.provider).toBe('mock');
    expect(a.model).toBe('mock-draft-v1');
    expect(a.promptVersion).toBe('rules-v1');
  });

  it('uses only supplied business context and preserves Thai', async () => {
    const p = new MockAiDraftProvider();
    const out = await p.generateDraft(input(context()));
    expect(out.content).toContain('ร้านช่างประปา');
    expect(out.content).toContain('ประปา');
  });

  it('never claims guaranteed availability or price', async () => {
    const p = new MockAiDraftProvider();
    const out = await p.generateDraft(input(context()));
    expect(out.content).not.toMatch(/รับประกัน|การันตี|ถูกที่สุด|guarantee/i);
  });

  it('never invents contact information (omits when none supplied)', async () => {
    const p = new MockAiDraftProvider();
    const out = await p.generateDraft(input(context({ contactInformation: null })));
    expect(out.content).not.toMatch(/\d{6,}|@|https?:\/\//);
  });

  it('includes business-provided contact verbatim when present', async () => {
    const p = new MockAiDraftProvider();
    const out = await p.generateDraft(input(context({ contactInformation: 'LINE @plumber' })));
    expect(out.content).toContain('LINE @plumber');
  });

  it('respects the max length', async () => {
    const p = new MockAiDraftProvider();
    const out = await p.generateDraft(input(context(), 40));
    expect(out.content.length).toBeLessThanOrEqual(40);
  });
});

describe('ExternalAiDraftProvider (disabled boundary)', () => {
  it('refuses to run when AI is disabled', async () => {
    const p = new ExternalAiDraftProvider({ aiEnabled: false, provider: 'anthropic', model: 'x' });
    await expect(p.generateDraft(input(context()))).rejects.toBeInstanceOf(AiDraftError);
  });

  it('refuses even when enabled (no real provider connected this sprint)', async () => {
    const p = new ExternalAiDraftProvider({ aiEnabled: true, provider: 'anthropic', model: 'x' });
    await expect(p.generateDraft(input(context()))).rejects.toBeInstanceOf(AiDraftError);
  });
});

describe('selectAiDraftProvider', () => {
  it('returns the Mock provider by default', () => {
    const p = selectAiDraftProvider({
      AI_ENABLED: false,
      AI_PROVIDER: 'mock',
      AI_MODEL: 'mock-draft-v1',
    });
    expect(p.name).toBe('mock');
  });

  it('returns the disabled external boundary for a non-mock provider', () => {
    const p = selectAiDraftProvider({ AI_ENABLED: false, AI_PROVIDER: 'anthropic', AI_MODEL: 'm' });
    expect(p).toBeInstanceOf(ExternalAiDraftProvider);
  });
});
