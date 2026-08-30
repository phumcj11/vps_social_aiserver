/**
 * Property tri-state facts (M9B) — the DATA-SEMANTICS foundation for Matching
 * Semantics v2.
 *
 * A handful of Property facts (private pool, near beach, beachfront, riverfront)
 * are genuinely three-valued: the owner can confirm the feature is present, can
 * confirm it is absent, or may simply not have told us yet. The historical
 * `boolean NOT NULL DEFAULT false` storage could not express the third state and
 * silently conflated "confirmed absent" with "unknown". This module makes the
 * three states explicit and type-safe.
 *
 * IMPORTANT: the domain value is the string enum below — never a JS boolean and
 * never JS truthiness. `'NO'` and `'UNKNOWN'` are both truthy strings, so any
 * `if (fact)` test is a bug. Use the explicit predicates here.
 *
 * This module is PURE. It performs no I/O, changes no matching decision, and is
 * shared by the store (DB codec), the API (input coercion), and the v1 matcher
 * compatibility adapter.
 */

/** Confirmed present · confirmed absent · owner has not provided / unverifiable. */
export type PropertyFact = 'YES' | 'NO' | 'UNKNOWN';

export const PROPERTY_FACT_VALUES = ['YES', 'NO', 'UNKNOWN'] as const;

/** The Property amenity fields that are tri-state (everything else stays boolean). */
export const TRISTATE_AMENITY_KEYS = [
  'privatePool',
  'nearBeach',
  'beachfront',
  'riverfront',
] as const;
export type TristateAmenityKey = (typeof TRISTATE_AMENITY_KEYS)[number];

export function isPropertyFact(v: unknown): v is PropertyFact {
  return v === 'YES' || v === 'NO' || v === 'UNKNOWN';
}

// ── DB codec: nullable boolean column ⇆ fact ─────────────────────────────────
// Storage is a nullable boolean (tinyint(1) NULL): true = YES, false = NO,
// NULL = UNKNOWN. The column NULL-ability is what carries the third state; the
// domain never sees the raw boolean.

/** Column value (true/false/NULL) → domain fact. NULL/undefined ⇒ UNKNOWN. */
export function factFromColumn(v: boolean | null | undefined): PropertyFact {
  if (v === true) return 'YES';
  if (v === false) return 'NO';
  return 'UNKNOWN';
}

/** Domain fact → column value. UNKNOWN ⇒ NULL (never a boolean). */
export function factToColumn(f: PropertyFact): boolean | null {
  if (f === 'YES') return true;
  if (f === 'NO') return false;
  return null;
}

// ── v1 matcher compatibility ─────────────────────────────────────────────────
// The Sprint-016 matcher treated the fact as a boolean where only a confirmed
// feature counted (legacy `true`). Post-migration a legacy `false` is UNKNOWN,
// which must behave EXACTLY as the old `false` did (feature not usable) — so v1
// treats anything other than a confirmed YES as "not present". This deliberately
// does NOT distinguish NO from UNKNOWN; Matcher v2 (M9C) will. It also never uses
// truthiness of the enum string.

/** v1 semantics: ONLY a confirmed `YES` is a present feature. */
export function factIsPresentV1(f: PropertyFact): boolean {
  return f === 'YES';
}

// ── Legacy / input coercion ──────────────────────────────────────────────────
// Older API clients (and legacy stored blobs) send plain booleans. Map them
// deterministically: true → YES, false → UNKNOWN. Legacy `false` is NEVER read
// as a confirmed NO — a confirmed NO can only come from an explicit 'NO' value,
// because historical `false` was ambiguous.

/** Legacy boolean → fact. true ⇒ YES; false ⇒ UNKNOWN (never NO). */
export function factFromLegacyBoolean(b: boolean): PropertyFact {
  return b ? 'YES' : 'UNKNOWN';
}

/**
 * Coerce an untyped incoming value (from a loosely-typed API record) into a
 * fact. Accepts the explicit enum ('YES'|'NO'|'UNKNOWN') and legacy booleans
 * (true→YES, false→UNKNOWN). Returns undefined for anything else so the caller
 * can reject/ignore it — never silently coerces junk to a fact.
 */
export function coercePropertyFact(v: unknown): PropertyFact | undefined {
  if (v === true) return 'YES';
  if (v === false) return 'UNKNOWN';
  if (isPropertyFact(v)) return v;
  return undefined;
}
