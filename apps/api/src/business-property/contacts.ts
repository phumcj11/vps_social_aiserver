import type { ContactChannel, ContactChannelType } from './types';

/**
 * Structured contact-channel rules (SPRINT 015, Phase J).
 *
 * Draft/AI generation may use ONLY channels that are enabled AND approved for
 * drafts. Disabled or unapproved channels are never exposed.
 */

/** Channels an AI/manual DRAFT may reference. */
export function approvedDraftChannels(contacts: ContactChannel[]): ContactChannel[] {
  return contacts.filter((c) => c.enabled && c.approvedForDrafts);
}

/** Channels approved for a public response (a stricter approval). */
export function publicResponseChannels(contacts: ContactChannel[]): ContactChannel[] {
  return contacts.filter((c) => c.enabled && c.approvedForPublicResponse);
}

/** A channel counts as owner-approved when it is enabled + verified by the owner. */
export function ownerApprovedChannels(contacts: ContactChannel[]): ContactChannel[] {
  return contacts.filter((c) => c.enabled && c.ownerVerifiedAt != null);
}

const VALUE_RULES: Record<ContactChannelType, (v: string) => boolean> = {
  PHONE: (v) => /^[+()\-.\s\d]{6,}$/.test(v),
  LINE_ID: (v) => v.trim().length > 0,
  LINE_OA: (v) => v.trim().length > 0,
  FACEBOOK_PAGE: (v) => /facebook\.com\//i.test(v) || v.trim().length > 0,
  WEBSITE: (v) => /^https?:\/\//i.test(v),
  EMAIL: (v) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v),
  OTHER: (v) => v.trim().length > 0,
};

/** Validate a contact-channel value for its type. */
export function isValidContactValue(type: ContactChannelType, value: string): boolean {
  const rule = VALUE_RULES[type];
  return !!rule && rule(value ?? '');
}

/** Safe public projection of a channel (no internal-only fields beyond ids). */
export function publicContactChannel(c: ContactChannel) {
  return {
    id: c.id,
    businessId: c.businessId,
    type: c.type,
    value: c.value,
    label: c.label,
    enabled: c.enabled,
    approvedForDrafts: c.approvedForDrafts,
    approvedForPublicResponse: c.approvedForPublicResponse,
    ownerVerifiedAt: c.ownerVerifiedAt ? c.ownerVerifiedAt.toISOString() : null,
  };
}
