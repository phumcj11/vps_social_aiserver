import { describe, expect, it } from 'vitest';
import { classifySignal, CLASSIFIER_VERSION } from './classifier';
import { ReasonCode, type ClassifierSignal, type ClassifierContext } from './types';

const CTX: ClassifierContext = { minTextLength: 15, isDuplicate: false };

function signal(overrides: Partial<ClassifierSignal> = {}): ClassifierSignal {
  return {
    message: 'Looking for a plumber in Bangkok this weekend',
    authorName: 'Jane Doe',
    postUrl: 'https://www.facebook.com/groups/123/posts/456',
    ...overrides,
  };
}

function passed(result: ReturnType<typeof classifySignal>, code: string): boolean {
  return result.reasons.find((r) => r.code === code)?.passed ?? false;
}

describe('classifySignal (deterministic, no AI)', () => {
  it('ACCEPTs when every rule passes', () => {
    const r = classifySignal(signal(), CTX);
    expect(r.decision).toBe('ACCEPT');
    expect(r.reasons).toHaveLength(7);
    expect(r.reasons.every((x) => x.passed)).toBe(true);
  });

  it('REJECTs when the message is empty (no text)', () => {
    const r = classifySignal(signal({ message: '   ' }), CTX);
    expect(r.decision).toBe('REJECT');
    expect(passed(r, ReasonCode.HAS_TEXT)).toBe(false);
  });

  it('REJECTs when the text is shorter than the minimum', () => {
    const r = classifySignal(signal({ message: 'help me' }), CTX);
    expect(r.decision).toBe('REJECT');
    expect(passed(r, ReasonCode.TEXT_MIN_LENGTH)).toBe(false);
  });

  it('REJECTs when there is no author', () => {
    const r = classifySignal(signal({ authorName: null }), CTX);
    expect(r.decision).toBe('REJECT');
    expect(passed(r, ReasonCode.HAS_AUTHOR)).toBe(false);
  });

  it('REJECTs when there is no URL', () => {
    const r = classifySignal(signal({ postUrl: '' }), CTX);
    expect(r.decision).toBe('REJECT');
    expect(passed(r, ReasonCode.HAS_URL)).toBe(false);
  });

  it('REJECTs deleted / unavailable content', () => {
    const r = classifySignal(signal({ message: "This content isn't available right now." }), CTX);
    expect(r.decision).toBe('REJECT');
    expect(passed(r, ReasonCode.NOT_DELETED)).toBe(false);
  });

  it('REJECTs unsupported-language text (no Latin/Thai letters)', () => {
    const r = classifySignal(signal({ message: '1234567890 !!! 😀😀😀😀😀' }), CTX);
    expect(r.decision).toBe('REJECT');
    expect(passed(r, ReasonCode.SUPPORTED_LANGUAGE)).toBe(false);
  });

  it('accepts Thai-language text', () => {
    const r = classifySignal(signal({ message: 'หาช่างประปาแถวกรุงเทพด่วนครับ' }), CTX);
    expect(passed(r, ReasonCode.SUPPORTED_LANGUAGE)).toBe(true);
  });

  it('REJECTs a duplicate (context flag)', () => {
    const r = classifySignal(signal(), { ...CTX, isDuplicate: true });
    expect(r.decision).toBe('REJECT');
    expect(passed(r, ReasonCode.NOT_DUPLICATE)).toBe(false);
  });

  it('exposes a stable classifier version string', () => {
    expect(CLASSIFIER_VERSION).toMatch(/^rules-/);
  });
});
