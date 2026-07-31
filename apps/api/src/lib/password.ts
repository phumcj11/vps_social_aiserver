import { randomBytes, scrypt as scryptCb, timingSafeEqual, type ScryptOptions } from 'node:crypto';

/**
 * Password hashing using scrypt (Node.js core, no native build required).
 *
 * scrypt is a memory-hard, well-supported algorithm suitable for password
 * storage. Each password gets a unique random salt. The stored value is a
 * self-describing string that also records the parameters, so they can be
 * tuned later without breaking existing hashes.
 *
 * Format: scrypt$N$r$p$<saltBase64>$<hashBase64>
 */

function scrypt(
  password: string,
  salt: Buffer,
  keylen: number,
  options: ScryptOptions,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCb(password, salt, keylen, options, (err, derivedKey) => {
      if (err) reject(err);
      else resolve(derivedKey);
    });
  });
}

// Cost parameters. N must be a power of two. These are reasonable for a small
// VPS while remaining strong.
const N = 16384; // CPU/memory cost
const r = 8; // block size
const p = 1; // parallelisation
const KEYLEN = 32;
const SALT_BYTES = 16;

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_BYTES);
  const derived = await scrypt(password, salt, KEYLEN, { N, r, p, maxmem: 64 * 1024 * 1024 });
  return `scrypt$${N}$${r}$${p}$${salt.toString('base64')}$${derived.toString('base64')}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
  const n = Number.parseInt(parts[1]!, 10);
  const blockSize = Number.parseInt(parts[2]!, 10);
  const parallel = Number.parseInt(parts[3]!, 10);
  const salt = Buffer.from(parts[4]!, 'base64');
  const expected = Buffer.from(parts[5]!, 'base64');
  if (!Number.isFinite(n) || !Number.isFinite(blockSize) || !Number.isFinite(parallel))
    return false;

  const derived = await scrypt(password, salt, expected.length, {
    N: n,
    r: blockSize,
    p: parallel,
    maxmem: 64 * 1024 * 1024,
  });

  if (derived.length !== expected.length) return false;
  return timingSafeEqual(derived, expected);
}
