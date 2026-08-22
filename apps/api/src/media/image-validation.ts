import type { AllowedImageMime } from './types';
import { ALLOWED_IMAGE_MIME, MAX_IMAGE_BYTES } from './types';

/**
 * Pure image validation — trusts the BYTES, never the filename or declared MIME.
 *
 * Detects the real format from magic bytes, rejects anything that is not a
 * pilot-allowed raster image (SVG, scripts, executables, etc.), enforces the
 * size limit, and best-effort reads dimensions. No native dependency.
 */

export interface ImageValidationOk {
  ok: true;
  mime: AllowedImageMime;
  width: number | null;
  height: number | null;
}
export interface ImageValidationErr {
  ok: false;
  code: 'EMPTY' | 'TOO_LARGE' | 'UNSUPPORTED_TYPE' | 'MIME_MISMATCH';
  detail: string;
}
export type ImageValidationResult = ImageValidationOk | ImageValidationErr;

function sniffMime(b: Buffer): AllowedImageMime | null {
  // JPEG: FF D8 FF
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    b.length >= 8 &&
    b[0] === 0x89 &&
    b[1] === 0x50 &&
    b[2] === 0x4e &&
    b[3] === 0x47 &&
    b[4] === 0x0d &&
    b[5] === 0x0a &&
    b[6] === 0x1a &&
    b[7] === 0x0a
  )
    return 'image/png';
  // WEBP: "RIFF" .... "WEBP"
  if (
    b.length >= 12 &&
    b.toString('ascii', 0, 4) === 'RIFF' &&
    b.toString('ascii', 8, 12) === 'WEBP'
  )
    return 'image/webp';
  return null;
}

function pngDimensions(b: Buffer): { width: number; height: number } | null {
  // IHDR width/height are big-endian 32-bit at offsets 16 and 20.
  if (b.length < 24) return null;
  return { width: b.readUInt32BE(16), height: b.readUInt32BE(20) };
}

function jpegDimensions(b: Buffer): { width: number; height: number } | null {
  // Walk JPEG markers to the first SOF (Start Of Frame).
  let i = 2;
  while (i + 9 < b.length) {
    if (b[i] !== 0xff) {
      i += 1;
      continue;
    }
    const marker = b[i + 1]!;
    // SOF0..SOF3, SOF5..SOF7, SOF9..SOF11, SOF13..SOF15 carry dimensions.
    if (
      (marker >= 0xc0 && marker <= 0xc3) ||
      (marker >= 0xc5 && marker <= 0xc7) ||
      (marker >= 0xc9 && marker <= 0xcb) ||
      (marker >= 0xcd && marker <= 0xcf)
    ) {
      if (i + 9 > b.length) return null;
      const height = b.readUInt16BE(i + 5);
      const width = b.readUInt16BE(i + 7);
      return { width, height };
    }
    const len = b.readUInt16BE(i + 2);
    if (len < 2) return null;
    i += 2 + len;
  }
  return null;
}

/**
 * Validate an uploaded buffer against the pilot rules. `declaredMime` is the
 * client-declared type; it must both be allowed AND match the sniffed bytes.
 */
export function validateImage(bytes: Buffer, declaredMime: string): ImageValidationResult {
  if (!bytes || bytes.length === 0) return { ok: false, code: 'EMPTY', detail: 'Empty upload' };
  if (bytes.length > MAX_IMAGE_BYTES) {
    return { ok: false, code: 'TOO_LARGE', detail: `Image exceeds ${MAX_IMAGE_BYTES} bytes` };
  }
  const sniffed = sniffMime(bytes);
  if (!sniffed) {
    return {
      ok: false,
      code: 'UNSUPPORTED_TYPE',
      detail: 'File is not a supported image (jpeg/png/webp)',
    };
  }
  // The declared MIME must be in the allow-list and agree with the real bytes.
  if (
    !(ALLOWED_IMAGE_MIME as readonly string[]).includes(declaredMime) ||
    declaredMime !== sniffed
  ) {
    return {
      ok: false,
      code: 'MIME_MISMATCH',
      detail: `Declared "${declaredMime}" but bytes are "${sniffed}"`,
    };
  }
  let dims: { width: number; height: number } | null = null;
  if (sniffed === 'image/png') dims = pngDimensions(bytes);
  else if (sniffed === 'image/jpeg') dims = jpegDimensions(bytes);
  return { ok: true, mime: sniffed, width: dims?.width ?? null, height: dims?.height ?? null };
}
