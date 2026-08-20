/**
 * Production Pilot Readiness module (SPRINT 014).
 *
 * Pure, deterministic safety primitives + read models for a SMALL,
 * human-supervised production pilot. NOTHING here performs a Facebook write,
 * enables a flag, or executes an action — the write path stays gated by the
 * existing execution safety flags. See docs/92-99 and ADR-033..035.
 */
export * from './types';
export * from './business-readiness';
export * from './group-selection';
export * from './limits';
export * from './write-window';
export * from './authorization';
export * from './observability';
