import { randomBytes } from 'node:crypto';

/**
 * Turn a workspace name into a URL-safe base slug.
 * Lowercases, strips diacritics, replaces non-alphanumeric runs with hyphens,
 * trims hyphens, and bounds the length. Falls back to "workspace" if nothing
 * usable remains.
 */
export function slugifyBase(name: string): string {
  const base = name
    .normalize('NFKD')
    .replace(/\p{M}+/gu, '') // strip combining marks / diacritics
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 100);
  return base.length > 0 ? base : 'workspace';
}

/** Short random suffix used to resolve slug collisions. */
export function slugSuffix(): string {
  return randomBytes(3).toString('hex'); // 6 hex chars
}

/**
 * Produce a unique slug for `name`, using `isTaken` to check availability.
 * Tries the base slug first, then appends short random suffixes.
 */
export async function generateUniqueSlug(
  name: string,
  isTaken: (slug: string) => Promise<boolean>,
): Promise<string> {
  const base = slugifyBase(name);
  if (!(await isTaken(base))) return base;
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const candidate = `${base}-${slugSuffix()}`.slice(0, 140);
    if (!(await isTaken(candidate))) return candidate;
  }
  // Extremely unlikely fallback: fully random slug.
  return `workspace-${slugSuffix()}${slugSuffix()}`;
}
