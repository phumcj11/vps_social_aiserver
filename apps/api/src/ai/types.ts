/**
 * AI Draft Engine types (SPRINT 009).
 *
 * The engine turns a MATCH Business Match into a DRAFT comment suggestion for
 * human review. The output is a DRAFT ONLY — never sent to Telegram, never
 * posted to Facebook, never a write action. AI is disabled by default and the
 * deterministic Mock provider is used for tests/local use (docs/09-ai-design.md).
 */

import type { DraftPolicyDecision, DraftPolicyResult } from '../store/types';

export type { DraftPolicyDecision, DraftPolicyResult };

/**
 * Safe, structured business/opportunity context. Contains ONLY reviewable
 * content — no secrets, no cookies, no session data, no absolute file paths,
 * no internal DB metadata, no chain-of-thought.
 */
export interface DraftContext {
  business: {
    name: string;
    category: string | null;
    description: string | null;
    sellingPoints: string[];
    serviceArea: string | null;
    contactInformation: string | null;
    responseTone: string | null;
  };
  prohibitedClaims: string[];
  knowledge: { title: string; content: string }[];
  matchingRules: { ruleType: string; ruleValue: string }[];
  matchingReasons: { ruleType: string; ruleValue: string; matched: boolean }[];
  opportunity: {
    decision: string;
    reasons: { code: string; passed: boolean }[];
  };
  signal: {
    message: string | null;
    sourceUrl: string;
    group: { name: string | null; url: string };
  };
  /**
   * SPRINT 016B — the selected Property + effective policies + approved contacts.
   * `property` is null when there was NO_PROPERTY_MATCH (the Draft must then make
   * NO Property-specific claim). Only persisted facts appear here; `mustNotClaim`
   * lists what the Draft may never assert (availability/price/promotion/capacity
   * plus prohibited claims), enforced by the policy checker.
   */
  property: {
    name: string;
    area: string | null;
    propertyType: string | null;
    maxGuests: number | null;
    bedrooms: number | null;
    amenities: string[];
    priceFact: string | null;
    sellingPoints: string[];
  } | null;
  policies: {
    availabilityPolicy: string;
    pricingPolicy: string;
    promotionPolicy: string;
    bookingPolicy: string;
  } | null;
  /** Contacts approved for drafts (enabled && approvedForDrafts) — safe projection. */
  approvedContacts: { type: string; value: string; label: string | null }[];
  mustNotClaim: string[];
  /** True when a Business MATCH produced NO Property MATCH (review should flag it). */
  noPropertyMatch: boolean;
  /**
   * v2 (M9E) — the recommended Property is a NEEDS_CONFIRMATION result: its
   * confirmed facts MAY be stated, but `unconfirmedRequirements` lists the
   * REQUIRED facts the owner has not confirmed (matcher `*_UNKNOWN` codes). The
   * draft must phrase those as "needs verification", never as satisfied. Absent
   * on MATCH (all confirmed) and NO_MATCH (business-level only).
   */
  propertyNeedsConfirmation?: boolean;
  unconfirmedRequirements?: string[];
}

/** A single layer of the layered prompt (system → context → task). */
export interface PromptLayer {
  label: string;
  content: string;
}

export interface BuiltPrompt {
  promptVersion: string;
  layers: PromptLayer[];
  /** Flat text form of the layers (what a provider would receive). */
  text: string;
  /** Hard limit passed to the provider/output contract. */
  maxLength: number;
}

/** Input handed to a provider — safe context + the built prompt. */
export interface DraftProviderInput {
  context: DraftContext;
  prompt: BuiltPrompt;
  maxLength: number;
}

/** Provider output. No chain-of-thought, no hidden reasoning. */
export interface DraftProviderResult {
  content: string;
  provider: string;
  model: string;
  promptVersion: string;
  /** Safe, structured metadata only (e.g. which profile fields were used). */
  policyMetadata: Record<string, unknown>;
}

export type { DraftPolicyResult as PolicyResult };
