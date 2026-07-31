import { describe, expect, it } from 'vitest';
import {
  TelegramReviewAdapter,
  FakeTelegramTransport,
  DisabledTelegramTransport,
  selectTelegramTransport,
} from './telegram-adapter';
import { ReviewError } from './errors';
import type { ReviewPresentation } from './types';

function presentation(overrides: Partial<ReviewPresentation> = {}): ReviewPresentation {
  return {
    reviewTaskId: 'rt-1',
    status: 'PENDING',
    business: { name: 'ร้านช่างประปา' },
    opportunity: { decision: 'ACCEPT', message: 'หาช่างประปา' },
    draft: { content: 'สวัสดีค่ะ ยินดีให้บริการ', version: 1, status: 'draft' },
    editedContent: null,
    links: {
      facebookPostUrl: 'https://www.facebook.com/groups/1/posts/abc',
      businessUrl: 'http://localhost:3000/businesses/b1',
    },
    ...overrides,
  };
}

describe('TelegramReviewAdapter (render — pure)', () => {
  it('renders business, opportunity, draft, and the five buttons', () => {
    const adapter = new TelegramReviewAdapter(new FakeTelegramTransport());
    const msg = adapter.renderMessage(presentation());
    expect(msg.text).toContain('ร้านช่างประปา');
    expect(msg.text).toContain('ACCEPT');
    expect(msg.text).toContain('สวัสดีค่ะ ยินดีให้บริการ');

    const labels = msg.buttons.flat().map((b) => b.text);
    expect(labels.some((l) => l.includes('Approve'))).toBe(true);
    expect(labels.some((l) => l.includes('Reject'))).toBe(true);
    expect(labels.some((l) => l.includes('Edit'))).toBe(true);
    expect(labels.some((l) => l.includes('Open Facebook Post'))).toBe(true);
    expect(labels.some((l) => l.includes('Open Business'))).toBe(true);
  });

  it('decision buttons carry callback data routing to the Review API (never a DB write)', () => {
    const adapter = new TelegramReviewAdapter(new FakeTelegramTransport());
    const msg = adapter.renderMessage(presentation());
    const approve = msg.buttons.flat().find((b) => b.text.includes('Approve'));
    expect(approve?.callbackData).toBe('review:rt-1:approve');
    const openPost = msg.buttons.flat().find((b) => b.text.includes('Open Facebook Post'));
    expect(openPost?.url).toBe('https://www.facebook.com/groups/1/posts/abc');
    expect(openPost?.callbackData).toBeUndefined();
  });

  it('shows edited content when present', () => {
    const adapter = new TelegramReviewAdapter(new FakeTelegramTransport());
    const msg = adapter.renderMessage(presentation({ editedContent: 'ข้อความที่แก้ไขแล้ว' }));
    expect(msg.text).toContain('ข้อความที่แก้ไขแล้ว');
  });

  it('sendReview relays via the transport and returns a ref', async () => {
    const transport = new FakeTelegramTransport();
    const adapter = new TelegramReviewAdapter(transport);
    const ref = await adapter.sendReview(presentation());
    expect(ref.adapter).toBe('telegram');
    expect(ref.ref).toBe('tg-1');
    expect(transport.sent).toHaveLength(1);
  });

  it('updateReview and closeReview relay via the transport', async () => {
    const transport = new FakeTelegramTransport();
    const adapter = new TelegramReviewAdapter(transport);
    await adapter.updateReview({ adapter: 'telegram', ref: 'tg-1' }, presentation());
    await adapter.closeReview({ adapter: 'telegram', ref: 'tg-1' }, 'APPROVED');
    expect(transport.edited).toHaveLength(1);
    expect(transport.closed).toEqual(['tg-1']);
  });
});

describe('Telegram transport boundary', () => {
  it('the disabled transport refuses to send while Telegram is disabled', async () => {
    const t = new DisabledTelegramTransport(false);
    await expect(t.send({ text: 'x', buttons: [] })).rejects.toBeInstanceOf(ReviewError);
  });

  it('selectTelegramTransport returns the disabled boundary (no bot connected)', () => {
    const t = selectTelegramTransport({ TELEGRAM_ENABLED: false });
    expect(t).toBeInstanceOf(DisabledTelegramTransport);
  });
});
