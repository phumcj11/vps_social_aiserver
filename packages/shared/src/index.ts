/**
 * Shared TypeScript helpers for KMKT Social AI.
 *
 * Small, dependency-free utilities that multiple apps/workers can rely on.
 * Deliberately minimal for the technical-bootstrap sprint — no product logic.
 */

/** Type guard: true when a value is neither null nor undefined. */
export function isDefined<T>(value: T | null | undefined): value is T {
  return value !== null && value !== undefined;
}

/**
 * Exhaustiveness helper. Call in the default branch of a switch over a union
 * to get a compile-time error if a case is ever left unhandled.
 */
export function assertNever(value: never, message = 'Unexpected value'): never {
  throw new Error(`${message}: ${String(value)}`);
}

/** A simple discriminated result type for operations that can fail. */
export type Result<T, E = Error> = { ok: true; value: T } | { ok: false; error: E };

export function ok<T>(value: T): Result<T, never> {
  return { ok: true, value };
}

export function err<E>(error: E): Result<never, E> {
  return { ok: false, error };
}
