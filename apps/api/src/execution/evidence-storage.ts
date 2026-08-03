import { createHash } from 'node:crypto';

/**
 * Controlled evidence storage keys (SPRINT 012).
 *
 * Evidence files (screenshots/snapshots) live under a fixed, server-owned root:
 *   storage/screenshots/actions/{workspace}/{job}/{session}/{name}
 *
 * We store an opaque, RELATIVE storage KEY — never an absolute filesystem path,
 * never a client-supplied path. Every path component is validated against
 * traversal (`..`, separators, absolute markers). Filenames are server-derived
 * from a hash, so a caller can never influence where bytes land.
 *
 * This sprint writes only SYNTHETIC evidence (the fake adapter). Real capture is
 * out of scope and disabled; this module exists so keys are safe by construction
 * the moment real capture is ever added.
 */

export const EVIDENCE_STORAGE_ROOT = 'storage/screenshots/actions';

/** A UUID-shaped identifier — the only shape we accept for path components. */
const ID_RE = /^[0-9a-fA-F-]{36}$/;

function assertId(kind: string, value: string): void {
  if (!ID_RE.test(value)) {
    throw new Error(`Unsafe ${kind} component for evidence key: "${value}"`);
  }
}

export interface EvidenceStorageKey {
  /** Relative storage key persisted on the evidence record. */
  storageKey: string;
  /** SHA-256 of the (synthetic) evidence bytes. */
  evidenceHash: string;
}

/**
 * Build a safe, deterministic storage key for a piece of evidence. The filename
 * is derived from a hash of the identity + label so it is stable and cannot
 * carry traversal. `bytes` is optional; when omitted a synthetic marker is
 * hashed (this sprint captures no real bytes).
 */
export function buildEvidenceStorageKey(input: {
  workspaceId: string;
  actionJobId: string;
  sessionId: string;
  label: string;
  bytes?: Buffer | string | null;
}): EvidenceStorageKey {
  assertId('workspace', input.workspaceId);
  assertId('job', input.actionJobId);
  assertId('session', input.sessionId);
  const label = input.label.replace(/[^a-z0-9_-]/gi, '_').slice(0, 40) || 'evidence';

  const source = input.bytes != null ? input.bytes : `synthetic:${input.sessionId}:${label}`;
  const evidenceHash = createHash('sha256').update(source).digest('hex');
  const fileName = `${label}-${evidenceHash.slice(0, 16)}.bin`;

  const storageKey = [
    EVIDENCE_STORAGE_ROOT,
    input.workspaceId,
    input.actionJobId,
    input.sessionId,
    fileName,
  ].join('/');

  return { storageKey, evidenceHash };
}

/** True when a value is a safe relative evidence storage key we produced. */
export function isSafeEvidenceStorageKey(key: string): boolean {
  if (key.includes('..') || key.startsWith('/') || key.includes('\\')) return false;
  return key.startsWith(`${EVIDENCE_STORAGE_ROOT}/`);
}
