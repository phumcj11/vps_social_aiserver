/**
 * M10B — retire the legacy English business UI from the CUSTOMER surface.
 *
 * The old `/businesses` and `/businesses/[id]` pages exposed raw matching-rule
 * enums, Priority, and slug/status. Customers are redirected to the Thai
 * self-service hub under `/settings/businesses`. Business APIs and backend
 * domain logic are unchanged — only the legacy customer routes are retired.
 */

/** Map a legacy business route to its new settings equivalent. */
export function legacyBusinessTarget(id?: string | null): string {
  const trimmed = typeof id === 'string' ? id.trim() : '';
  return trimmed.length > 0 ? `/settings/businesses/${trimmed}` : '/settings/businesses';
}

/** Static rules mirrored into next.config.mjs `redirects()` (kept in sync by test). */
export const LEGACY_BUSINESS_REDIRECTS: Array<{ source: string; destination: string }> = [
  { source: '/businesses', destination: '/settings/businesses' },
  { source: '/businesses/:id', destination: '/settings/businesses/:id' },
];
