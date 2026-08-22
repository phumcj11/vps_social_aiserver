import { promises as fs } from 'node:fs';
import { join, resolve, sep } from 'node:path';
import type { AllowedImageMime } from './types';

/**
 * Safe media storage keys (mirrors execution/evidence-storage.ts).
 *
 *   storage/media/{workspaceId}/{businessId}/{assetId}.{ext}
 *
 * The KEY is opaque and RELATIVE. Every path component is a validated UUID and
 * the filename is server-derived from the asset id + a MIME-derived extension —
 * the client can never influence where bytes land, and the client filename is
 * never used in a path. Serving reads by key only after ownership checks.
 */
export const MEDIA_STORAGE_ROOT = 'storage/media';

const ID_RE = /^[0-9a-fA-F-]{36}$/;

function assertId(kind: string, value: string): void {
  if (!ID_RE.test(value)) throw new Error(`Unsafe ${kind} component for media key: "${value}"`);
}

const EXT_BY_MIME: Record<AllowedImageMime, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

export function extForMime(mime: AllowedImageMime): string {
  return EXT_BY_MIME[mime];
}

/** Build a safe, deterministic relative storage key. Never accepts a client path. */
export function buildMediaStorageKey(input: {
  workspaceId: string;
  businessId: string;
  assetId: string;
  mime: AllowedImageMime;
}): string {
  assertId('workspace', input.workspaceId);
  assertId('business', input.businessId);
  assertId('asset', input.assetId);
  const key = [
    MEDIA_STORAGE_ROOT,
    input.workspaceId,
    input.businessId,
    `${input.assetId}.${extForMime(input.mime)}`,
  ].join('/');
  return key;
}

/**
 * Resolve a stored key to an absolute path, refusing anything that escapes the
 * media root (defence in depth even though keys are server-generated).
 */
export function resolveMediaPath(baseDir: string, storageKey: string): string {
  if (storageKey.includes('..') || storageKey.includes('\0')) {
    throw new Error('Unsafe media storage key');
  }
  const root = resolve(baseDir, MEDIA_STORAGE_ROOT);
  const abs = resolve(baseDir, storageKey);
  if (abs !== root && !abs.startsWith(root + sep)) {
    throw new Error('Media key escapes the storage root');
  }
  return abs;
}

/** Write bytes to the key, creating parent dirs (owner-only mode). */
export async function writeMediaFile(
  baseDir: string,
  storageKey: string,
  bytes: Buffer,
): Promise<void> {
  const abs = resolveMediaPath(baseDir, storageKey);
  const dir = abs.slice(0, abs.lastIndexOf(sep));
  await fs.mkdir(dir, { recursive: true, mode: 0o750 });
  await fs.writeFile(abs, bytes, { mode: 0o640 });
}

export async function readMediaFile(baseDir: string, storageKey: string): Promise<Buffer> {
  return fs.readFile(resolveMediaPath(baseDir, storageKey));
}

export async function deleteMediaFile(baseDir: string, storageKey: string): Promise<void> {
  await fs.rm(resolveMediaPath(baseDir, storageKey), { force: true });
}

/** Absolute media root (for readiness/ops). */
export function mediaRootDir(baseDir: string): string {
  return join(baseDir, MEDIA_STORAGE_ROOT);
}
