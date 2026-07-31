import type { ReviewAdapter } from './adapter';
import type { ReviewPresentation, AdapterRef, ReviewStatus } from './types';
import { ReviewError, ReviewErrorCode } from './errors';

/**
 * TelegramReviewAdapter (SPRINT 010) — the FIRST Review Adapter.
 *
 * It RENDERS a review into a Telegram message (business, opportunity, draft, and
 * Approve/Reject/Edit/Open-Post/Open-Business buttons) and relays it via a
 * transport. It contains NO business logic and NEVER touches the database.
 * Button taps are delivered by a Telegram webhook to the Review API, which calls
 * the Coordinator — i.e. Telegram → Review API → Coordinator → Repository.
 *
 * Telegram is DISABLED by default: the transport refuses to send while
 * TELEGRAM_ENABLED=false, and no bot is connected this sprint. Rendering is pure
 * and always available (and unit-tested).
 */

export interface TelegramButton {
  text: string;
  /** Callback taps route to the Review API (review:<id>:<action>). */
  callbackData?: string;
  /** URL buttons open external pages (read-only; decide nothing). */
  url?: string;
}

export interface TelegramMessage {
  text: string;
  buttons: TelegramButton[][];
}

/** The network boundary. The real transport resolves the workspace's paired chat. */
export interface TelegramTransport {
  readonly name: string;
  send(message: TelegramMessage): Promise<{ messageId: string }>;
  edit(messageId: string, message: TelegramMessage): Promise<void>;
  close(messageId: string): Promise<void>;
}

/** Disabled boundary — refuses to send while Telegram is disabled / not connected. */
export class DisabledTelegramTransport implements TelegramTransport {
  readonly name = 'telegram';

  constructor(private readonly telegramEnabled: boolean) {}

  async send(): Promise<{ messageId: string }> {
    await Promise.resolve();
    if (!this.telegramEnabled) {
      throw new ReviewError(
        ReviewErrorCode.ADAPTER_DISABLED,
        'Telegram is disabled (TELEGRAM_ENABLED=false); the adapter will not send.',
      );
    }
    // Even when enabled, no bot is connected in this build.
    throw new ReviewError(
      ReviewErrorCode.ADAPTER_DISABLED,
      'Telegram bot is not connected in this build.',
    );
  }

  async edit(): Promise<void> {
    await Promise.resolve();
    throw new ReviewError(ReviewErrorCode.ADAPTER_DISABLED, 'Telegram is not connected.');
  }

  async close(): Promise<void> {
    await Promise.resolve();
    throw new ReviewError(ReviewErrorCode.ADAPTER_DISABLED, 'Telegram is not connected.');
  }
}

/** Deterministic in-memory transport for tests — records calls, no network. */
export class FakeTelegramTransport implements TelegramTransport {
  readonly name = 'telegram';
  readonly sent: TelegramMessage[] = [];
  readonly edited: { messageId: string; message: TelegramMessage }[] = [];
  readonly closed: string[] = [];
  private counter = 0;

  async send(message: TelegramMessage): Promise<{ messageId: string }> {
    await Promise.resolve();
    this.counter += 1;
    this.sent.push(message);
    return { messageId: `tg-${this.counter}` };
  }

  async edit(messageId: string, message: TelegramMessage): Promise<void> {
    await Promise.resolve();
    this.edited.push({ messageId, message });
  }

  async close(messageId: string): Promise<void> {
    await Promise.resolve();
    this.closed.push(messageId);
  }
}

export function selectTelegramTransport(env: { TELEGRAM_ENABLED: boolean }): TelegramTransport {
  // No real bot is connected this sprint; the disabled boundary refuses to send.
  return new DisabledTelegramTransport(env.TELEGRAM_ENABLED);
}

export class TelegramReviewAdapter implements ReviewAdapter {
  readonly name = 'telegram';

  constructor(private readonly transport: TelegramTransport) {}

  /** PURE — build the Telegram message and buttons from a safe presentation. */
  renderMessage(p: ReviewPresentation): TelegramMessage {
    const lines = [
      `📋 Review needed`,
      `Business: ${p.business.name}`,
      `Opportunity: ${p.opportunity.decision}`,
      p.opportunity.message ? `Post: ${p.opportunity.message}` : null,
      ``,
      `Draft (v${p.draft.version}, ${p.draft.status}):`,
      p.editedContent ?? p.draft.content ?? '(no draft content)',
    ].filter((l): l is string => l !== null);

    const buttons: TelegramButton[][] = [
      [
        { text: '✅ Approve', callbackData: `review:${p.reviewTaskId}:approve` },
        { text: '❌ Reject', callbackData: `review:${p.reviewTaskId}:reject` },
      ],
      [{ text: '✏️ Edit', callbackData: `review:${p.reviewTaskId}:edit` }],
    ];
    const linkRow: TelegramButton[] = [];
    if (p.links.facebookPostUrl) {
      linkRow.push({ text: '🔗 Open Facebook Post', url: p.links.facebookPostUrl });
    }
    if (p.links.businessUrl) linkRow.push({ text: '🏢 Open Business', url: p.links.businessUrl });
    if (linkRow.length > 0) buttons.push(linkRow);

    return { text: lines.join('\n'), buttons };
  }

  async sendReview(presentation: ReviewPresentation): Promise<AdapterRef> {
    const { messageId } = await this.transport.send(this.renderMessage(presentation));
    return { adapter: this.name, ref: messageId };
  }

  async updateReview(ref: AdapterRef, presentation: ReviewPresentation): Promise<void> {
    await this.transport.edit(ref.ref, this.renderMessage(presentation));
  }

  async closeReview(ref: AdapterRef, _outcome: ReviewStatus): Promise<void> {
    await this.transport.close(ref.ref);
  }
}
