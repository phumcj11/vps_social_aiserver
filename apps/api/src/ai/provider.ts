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
    const sentences: string[] = ['สวัสดีค่ะ'];

    // SPRINT 017 — compose from the selected Property when there is a MATCH, using
    // ONLY persisted facts. On NO_PROPERTY_MATCH, stay strictly business-level.
    const p = context.noPropertyMatch ? null : context.property;
    if (p) {
      usedFields.push('property.name');
      let intro = `จากข้อมูลที่แจ้งมา ${p.name} ของ ${b.name}`;
      if (p.maxGuests != null) {
        intro += ` รองรับได้สูงสุด ${p.maxGuests} ท่าน`;
        usedFields.push('property.maxGuests');
      }
      const amenities = p.amenities.map(thaiAmenity).filter(Boolean);
      if (amenities.length > 0) {
        intro += ` และมี${amenities.join('และ')}`;
        usedFields.push('property.amenities');
      }
      sentences.push(intro + 'ค่ะ');
      // Price ONLY when the effective policy permitted it AND a number was stored.
      if (p.priceFact) {
        const num = p.priceFact.match(/(\d[\d,]*)/);
        if (num) {
          sentences.push(`ราคาเริ่มต้น ${num[1]} บาท`);
          usedFields.push('property.priceFact');
        }
      }
    } else {
      // Business-level only — no property/price/availability claim.
      const serviceLine = b.category
        ? `ทาง ${b.name} ให้บริการด้าน${b.category}ค่ะ`
        : `ทาง ${b.name} ยินดีให้บริการค่ะ`;
      if (b.category) usedFields.push('business.category');
      sentences.push(serviceLine);
    }

    // Contact: prefer an approved structured channel; fall back to the legacy
    // free-text contact. NEVER invent a channel. NEVER assert availability.
    const approved = context.approvedContacts[0];
    let closing: string;
    if (approved) {
      usedFields.push('approvedContacts');
      closing = `หากสนใจ สามารถสอบถามรายละเอียดเพิ่มเติมผ่าน ${thaiChannel(approved.type)} ${approved.value} ได้เลยค่ะ 😊`;
    } else if (b.contactInformation && b.contactInformation.trim().length > 0) {
      usedFields.push('business.contactInformation');
      closing = `หากสนใจ สามารถสอบถามรายละเอียดเพิ่มเติมได้ที่ ${b.contactInformation.trim()} ค่ะ 😊`;
    } else {
      closing = 'หากสนใจ สามารถสอบถามรายละเอียดเพิ่มเติมได้เลยนะคะ ทางเรายินดีให้ข้อมูลค่ะ 😊';
    }
    sentences.push(closing);

    let content = sentences.join(' ');
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

/** Map a stored English amenity label to Thai for the deterministic mock draft. */
function thaiAmenity(label: string): string {
  const map: Record<string, string> = {
    'private pool': 'สระส่วนตัว',
    beachfront: 'ติดทะเล',
    'near beach': 'ใกล้ทะเล',
    riverfront: 'ริมแม่น้ำ',
    wifi: 'Wi-Fi',
    parking: 'ที่จอดรถ',
    karaoke: 'คาราโอเกะ',
    bbq: 'พื้นที่ BBQ',
    kitchen: 'ครัว',
  };
  return map[label] ?? label;
}

/** Map a contact channel type to a short Thai label for the mock draft. */
function thaiChannel(type: string): string {
  const map: Record<string, string> = {
    PHONE: 'โทร',
    LINE_ID: 'LINE',
    LINE_OA: 'LINE OA',
    FACEBOOK_PAGE: 'เพจ Facebook',
    WEBSITE: 'เว็บไซต์',
    EMAIL: 'อีเมล',
    OTHER: '',
  };
  return map[type] ?? '';
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
