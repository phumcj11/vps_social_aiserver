import type {
  BrowserDriver,
  ConnectResult,
  ValidateResult,
  ConnectOutcome,
  ValidateOutcome,
  GroupValidateResult,
  GroupValidateOutcome,
} from '../facebook/driver';

/**
 * Fake browser driver for tests — no Playwright, no Chromium, no Facebook.
 * Programmable outcomes let tests exercise every connection/validation branch.
 */
export class FakeBrowserDriver implements BrowserDriver {
  public connectCalls = 0;
  public validateCalls = 0;
  public groupValidateCalls = 0;

  constructor(
    private opts: {
      connectOutcome?: ConnectOutcome;
      validateOutcome?: ValidateOutcome;
      groupOutcome?: GroupValidateOutcome;
      throwOnConnect?: string;
      throwOnValidate?: string;
      throwOnGroup?: string;
      throwOnGroupOnce?: string;
      connectDelayMs?: number;
      validateDelayMs?: number;
    } = {},
  ) {}

  async connectInteractive(): Promise<ConnectResult> {
    this.connectCalls += 1;
    if (this.opts.connectDelayMs) await new Promise((r) => setTimeout(r, this.opts.connectDelayMs));
    if (this.opts.throwOnConnect) throw new Error(this.opts.throwOnConnect);
    const outcome = this.opts.connectOutcome ?? 'connected';
    if (outcome === 'connected') {
      return { outcome, identity: { displayName: 'Test User', facebookUserId: '100000000000000' } };
    }
    return { outcome };
  }

  async validate(): Promise<ValidateResult> {
    this.validateCalls += 1;
    if (this.opts.validateDelayMs)
      await new Promise((r) => setTimeout(r, this.opts.validateDelayMs));
    if (this.opts.throwOnValidate) throw new Error(this.opts.throwOnValidate);
    return { outcome: this.opts.validateOutcome ?? 'connected' };
  }

  async validateGroupAccess(): Promise<GroupValidateResult> {
    this.groupValidateCalls += 1;
    // Fail only on the first call (to exercise the one-safe-retry path).
    if (this.opts.throwOnGroupOnce && this.groupValidateCalls === 1) {
      throw new Error(this.opts.throwOnGroupOnce);
    }
    if (this.opts.throwOnGroup) throw new Error(this.opts.throwOnGroup);
    const outcome = this.opts.groupOutcome ?? 'accessible';
    if (outcome === 'accessible') {
      return { outcome, groupName: 'Test Group', facebookGroupId: '123456789' };
    }
    return { outcome };
  }
}
