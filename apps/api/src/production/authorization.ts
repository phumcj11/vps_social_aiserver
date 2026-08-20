import { createHash } from 'node:crypto';
import { newId } from '../lib/tokens';

/**
 * One-shot production submit authorization (SPRINT 014, Phase I) — pure.
 *
 * One authorization permits AT MOST ONE submit. It binds the workspace,
 * operator, Action Job, target_post_key, and approved-content HASH (never the
 * content or any credential), with an expiry, a one-use nonce, the release
 * version, and a reference to the prepare_only result. Validation refuses an
 * expired, consumed, or mismatched authorization. Consumption is atomic in the
 * store; this module provides the deterministic decision.
 */

export interface ProductionSubmitAuthorization {
  id: string;
  workspaceId: string;
  operatorEmail: string;
  actionJobId: string;
  targetPostKey: string;
  approvedContentHash: string;
  authorizedAtMs: number;
  expiresAtMs: number;
  /** One-use nonce — consumed atomically on the single permitted submit. */
  nonce: string;
  releaseVersion: string;
  prepareOnlyRef: string;
  consumed: boolean;
}

/** SHA-256 of the EXACT approved content (binds authorization to content). */
export function approvedContentHash(exactContent: string): string {
  return createHash('sha256').update(exactContent, 'utf8').digest('hex');
}

export interface CreateAuthorizationInput {
  workspaceId: string;
  operatorEmail: string;
  actionJobId: string;
  targetPostKey: string;
  exactApprovedContent: string;
  releaseVersion: string;
  prepareOnlyRef: string;
  ttlSeconds: number;
}

export function createAuthorization(
  input: CreateAuthorizationInput,
  nowMs: number,
): ProductionSubmitAuthorization {
  return {
    id: newId(),
    workspaceId: input.workspaceId,
    operatorEmail: input.operatorEmail,
    actionJobId: input.actionJobId,
    targetPostKey: input.targetPostKey,
    approvedContentHash: approvedContentHash(input.exactApprovedContent),
    authorizedAtMs: nowMs,
    expiresAtMs: nowMs + input.ttlSeconds * 1000,
    nonce: newId(),
    releaseVersion: input.releaseVersion,
    prepareOnlyRef: input.prepareOnlyRef,
    consumed: false,
  };
}

/** The exact submit being attempted, checked against a stored authorization. */
export interface SubmitAttempt {
  actionJobId: string;
  targetPostKey: string;
  exactApprovedContent: string;
  nonce: string;
}

export interface AuthorizationDecision {
  ok: boolean;
  blockers: string[];
}

/** Decide whether an authorization permits this exact attempt right now. */
export function validateAuthorization(
  auth: ProductionSubmitAuthorization,
  attempt: SubmitAttempt,
  nowMs: number,
): AuthorizationDecision {
  const blockers: string[] = [];
  if (auth.consumed) blockers.push('authorization already used (one submit per authorization)');
  if (nowMs >= auth.expiresAtMs) blockers.push('authorization expired');
  if (attempt.nonce !== auth.nonce) blockers.push('authorization nonce mismatch');
  if (attempt.actionJobId !== auth.actionJobId) blockers.push('Action Job mismatch');
  if (attempt.targetPostKey !== auth.targetPostKey) blockers.push('target_post_key mismatch');
  if (approvedContentHash(attempt.exactApprovedContent) !== auth.approvedContentHash) {
    blockers.push('approved-content hash mismatch');
  }
  return { ok: blockers.length === 0, blockers };
}

/**
 * Consume the authorization for one attempt. Returns the consumed record ONLY
 * when validation passes — the store persists this atomically (a second call
 * with the same nonce fails because `consumed` is now true).
 */
export function consumeAuthorization(
  auth: ProductionSubmitAuthorization,
  attempt: SubmitAttempt,
  nowMs: number,
): { ok: boolean; blockers: string[]; consumed: ProductionSubmitAuthorization | null } {
  const decision = validateAuthorization(auth, attempt, nowMs);
  if (!decision.ok) return { ok: false, blockers: decision.blockers, consumed: null };
  return { ok: true, blockers: [], consumed: { ...auth, consumed: true } };
}
