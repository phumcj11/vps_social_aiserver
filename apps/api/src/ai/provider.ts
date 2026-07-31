import type { DraftProviderInput, DraftProviderResult } from './types';
import { AiDraftError, AiDraftErrorCode } from './errors';

/**
 * AiDraftProvider (SPRINT 009) — the boundary between the engine and whatever
 * produces draft text. The default implementation is the deterministic Mock;
 * a real external provider is a disabled boundary this sprint (never connected).
 */
export interface AiDraftProvider {
  readonly name: string;
  generateDraft(input: DraftProviderInput): Promise<DraftProviderResult>;
}

/**
 * MockAiDraftProvider — DETERMINISTIC, no network, safe for tests and local use.
 *
 * It composes a concise, natural Thai comment from ONLY the supplied business
 * context. It NEVER claims confirmed availability or price, NEVER invents
 * contact information (it repeats only the business-provided contact, if any),
 * and NEVER asserts facilities/locations not present in the context.
 */
export class MockAiDraftProvider implements AiDraftProvider {
  readonly name = 'mock';

  constructor(private readonly model = 'mock-draft-v1') {}

  async generateDraft(input: DraftProviderInput): Promise<DraftProviderResult> {
    const { context, prompt, maxLength } = input;
    await Promise.resolve();
    const b = context.business;
    const usedFields: string[] = ['business.name'];

    let serviceLine: string;
    if (b.category) {
      serviceLine = `ให้บริการด้าน${b.category}`;
      usedFields.push('business.category');
    } else if (b.sellingPoints.length > 0) {
      serviceLine = `มีจุดเด่นเรื่อง${b.sellingPoints[0]}`;
      usedFields.push('business.sellingPoints');
    } else {
      serviceLine = 'ยินดีให้บริการ';
    }

    // Contact line uses ONLY business-provided contact; never invented.
    let contactLine = '';
    if (b.contactInformation && b.contactInformation.trim().length > 0) {
      contactLine = ` ติดต่อสอบถามได้ที่ ${b.contactInformation.trim()}`;
      usedFields.push('business.contactInformation');
    }

    // No guarantees of availability or price; an invitation to ask, only.
    const parts = [
      `สวัสดีค่ะ ทาง${b.name} ${serviceLine}ค่ะ`,
      'หากสนใจ สามารถสอบถามรายละเอียดเพิ่มเติมได้เลยนะคะ ทางเรายินดีให้ข้อมูลค่ะ 😊',
    ];
    let content = parts.join(' ') + contactLine;
    if (content.length > maxLength) content = content.slice(0, maxLength).trimEnd();

    return {
      content,
      provider: this.name,
      model: this.model,
      promptVersion: prompt.promptVersion,
      policyMetadata: {
        usedFields,
        toneApplied: b.responseTone ?? 'default',
        knowledgeItemsAvailable: context.knowledge.length,
      },
    };
  }
}

/**
 * ExternalAiDraftProvider — the disabled boundary for a real provider. It is
 * intentionally NOT connected in this sprint. It REFUSES to run whenever AI is
 * disabled; even when enabled, no real provider is wired here, so it refuses.
 * Real provider credentials (e.g. ANTHROPIC_API_KEY) are documented but never
 * populated. See ADR-015.
 */
export class ExternalAiDraftProvider implements AiDraftProvider {
  readonly name: string;

  constructor(private readonly opts: { aiEnabled: boolean; provider: string; model: string }) {
    this.name = opts.provider;
  }

  async generateDraft(_input: DraftProviderInput): Promise<DraftProviderResult> {
    await Promise.resolve();
    if (!this.opts.aiEnabled) {
      throw new AiDraftError(
        AiDraftErrorCode.PROVIDER_DISABLED,
        'AI is disabled (AI_ENABLED=false); the external provider will not run.',
      );
    }
    // Even when enabled, no real provider is connected in this sprint.
    throw new AiDraftError(
      AiDraftErrorCode.PROVIDER_DISABLED,
      `External AI provider "${this.opts.provider}" is not connected in this build.`,
    );
  }
}

/**
 * Select the provider from configuration. Default (AI_PROVIDER=mock) uses the
 * deterministic Mock. Any other provider name resolves to the disabled external
 * boundary, which refuses to run while AI is disabled.
 */
export function selectAiDraftProvider(env: {
  AI_ENABLED: boolean;
  AI_PROVIDER: string;
  AI_MODEL: string;
}): AiDraftProvider {
  if (env.AI_PROVIDER === 'mock') return new MockAiDraftProvider(env.AI_MODEL);
  return new ExternalAiDraftProvider({
    aiEnabled: env.AI_ENABLED,
    provider: env.AI_PROVIDER,
    model: env.AI_MODEL,
  });
}
