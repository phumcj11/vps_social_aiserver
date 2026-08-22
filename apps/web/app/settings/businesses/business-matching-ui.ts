import type { MatchingRule } from '../../../lib/api';

/**
 * Pure, testable owner-UX logic for the "การจับคู่ลูกค้า" (customer matching)
 * tab (Business Matching Self-Service). No JSX here so every mapping —
 * owner concept → existing matcher rule contract, keyword dedup, reconciliation,
 * preview explainability, owner-safe messages — is unit-testable.
 *
 * IMPORTANT: this only maps owner-facing Thai onto the EXISTING deterministic
 * rule contract (RULE_TYPES province/district/keyword/… + status active/disabled,
 * case-folded containment). It NEVER changes matcher semantics and adds no new
 * rule type. The owner never sees rule_type / operators / workspace ids.
 */

/** The existing rule-type tokens this UI uses (subset of the API's RULE_TYPES). */
export type UiRuleType = 'province' | 'district' | 'keyword';

/** Owner-facing accommodation types (values double as customer-search terms). */
export const TYPE_OPTIONS: string[] = [
  'พูลวิลล่า',
  'บ้านพัก',
  'รีสอร์ต',
  'โรงแรม',
  'โฮมสเตย์',
  'แพพัก',
  'เต็นท์/แคมป์',
];

const TYPE_SET = new Set(TYPE_OPTIONS.map((t) => t.toLowerCase()));

/** The four owner categories, each mapped onto an existing rule type. */
export const OWNER_CATEGORY_LABEL: Record<'area' | 'type' | 'keyword', string> = {
  area: 'พื้นที่',
  type: 'ประเภท',
  keyword: 'คำค้นหา',
};

/** Owner-editable matching configuration (what the tab manages). */
export interface MatchingConfig {
  province: string; // e.g. ชลบุรี  → rule {province}
  areas: string[]; // e.g. [บางแสน] → rules {district}
  types: string[]; // e.g. [พูลวิลล่า] → rules {keyword} (value ∈ TYPE_OPTIONS)
  keywords: string[]; // free keywords → rules {keyword}
}

export const EMPTY_CONFIG: MatchingConfig = { province: '', areas: [], types: [], keywords: [] };

/** Case/space-insensitive comparison key (mirrors the matcher's fold). */
export function normalizeToken(s: string): string {
  return s.trim().replace(/\s+/g, ' ').toLowerCase();
}

/** Remove blanks and case-insensitive duplicates, preserving the first spelling. */
export function dedupeTokens(list: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of list) {
    const v = raw.trim().replace(/\s+/g, ' ');
    if (!v) continue;
    const key = v.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(v);
  }
  return out;
}

/** A canonical rule the config wants to exist (ruleType + trimmed value). */
export interface DesiredRule {
  ruleType: UiRuleType;
  ruleValue: string;
}

/** Turn the owner config into the exact set of active rules it implies. */
export function configToDesiredRules(config: MatchingConfig): DesiredRule[] {
  const out: DesiredRule[] = [];
  const province = config.province.trim();
  if (province) out.push({ ruleType: 'province', ruleValue: province });
  for (const a of dedupeTokens(config.areas)) out.push({ ruleType: 'district', ruleValue: a });
  // Types and keywords both persist as `keyword` rules; deduped together so a
  // keyword equal to a chosen type never creates two rules.
  const keywordish = dedupeTokens([...config.types, ...config.keywords]);
  for (const k of keywordish) out.push({ ruleType: 'keyword', ruleValue: k });
  return out;
}

/** Reconstruct the owner config from persisted rules (active + disabled). */
export function rulesToConfig(rules: MatchingRule[]): MatchingConfig {
  const active = rules.filter((r) => r.status === 'active');
  const province = active.find((r) => r.ruleType === 'province')?.ruleValue ?? '';
  const areas = active.filter((r) => r.ruleType === 'district').map((r) => r.ruleValue);
  const keywordRules = active.filter((r) => r.ruleType === 'keyword').map((r) => r.ruleValue);
  const types = keywordRules.filter((v) => TYPE_SET.has(v.toLowerCase()));
  const keywords = keywordRules.filter((v) => !TYPE_SET.has(v.toLowerCase()));
  return { province, areas: dedupeTokens(areas), types, keywords };
}

export interface Reconciliation {
  toCreate: DesiredRule[];
  toReactivate: string[]; // rule ids currently disabled but desired again
  toDeactivate: string[]; // active rule ids no longer desired
}

/**
 * Compute the minimal set of create / reactivate / deactivate operations to make
 * the persisted rules match the desired config. Never hard-deletes (deactivates,
 * matching the archival-friendly schema).
 */
export function reconcile(existing: MatchingRule[], desired: DesiredRule[]): Reconciliation {
  const key = (t: string, v: string) => `${t}::${normalizeToken(v)}`;
  const desiredKeys = new Map(desired.map((d) => [key(d.ruleType, d.ruleValue), d]));

  const toCreate: DesiredRule[] = [];
  const toReactivate: string[] = [];
  const toDeactivate: string[] = [];

  // Index existing rules by key (prefer an active one when duplicates exist).
  const byKey = new Map<string, MatchingRule>();
  for (const r of existing) {
    const k = key(r.ruleType, r.ruleValue);
    const prev = byKey.get(k);
    if (!prev || (prev.status !== 'active' && r.status === 'active')) byKey.set(k, r);
  }

  for (const [k, d] of desiredKeys) {
    const found = byKey.get(k);
    if (!found) toCreate.push(d);
    else if (found.status !== 'active') toReactivate.push(found.id);
  }
  for (const r of existing) {
    if (r.status !== 'active') continue;
    if (!desiredKeys.has(key(r.ruleType, r.ruleValue))) toDeactivate.push(r.id);
  }
  return { toCreate, toReactivate, toDeactivate };
}

/** Matching status for the overview banner. */
export function matchingStatus(rules: MatchingRule[]): 'ACTIVE' | 'UNSET' {
  return rules.some((r) => r.status === 'active') ? 'ACTIVE' : 'UNSET';
}

// ---------------------------------------------------------------------------
// Suggestions from persisted facts (never auto-saved; owner must confirm).
// ---------------------------------------------------------------------------

export interface PersistedFacts {
  province: string | null;
  areas: string[]; // property areas/service areas
  propertyTypes: string[]; // owner-facing type labels from active properties
}

/** Build a suggested config from persisted Business/Property facts (no AI). */
export function suggestConfig(facts: PersistedFacts): MatchingConfig {
  const areas = dedupeTokens(facts.areas);
  const types = dedupeTokens(facts.propertyTypes).filter((t) => TYPE_SET.has(t.toLowerCase()));
  // Keyword suggestions: the areas + types themselves are the terms customers use.
  const keywords = dedupeTokens([...areas, ...types]);
  return { province: facts.province?.trim() ?? '', areas, types, keywords };
}

// ---------------------------------------------------------------------------
// Preview explainability (Phase N) — mirrors the matcher's containment check;
// pure, no matcher call, no scores/rule-ids exposed.
// ---------------------------------------------------------------------------

export interface PreviewLine {
  ok: boolean;
  label: string;
}

export function previewMatch(config: MatchingConfig, leadText: string): PreviewLine[] {
  const hay = normalizeToken(leadText);
  const contains = (v: string) => v.trim().length > 0 && hay.includes(normalizeToken(v));
  const lines: PreviewLine[] = [];

  const areaHit = [config.province, ...config.areas].find((a) => contains(a));
  if (config.province || config.areas.length > 0) {
    lines.push({
      ok: Boolean(areaHit),
      label: areaHit ? `พื้นที่ตรง: ${areaHit}` : 'พื้นที่: ยังไม่ตรงกับ Lead นี้',
    });
  }
  const typeHit = config.types.find((t) => contains(t));
  if (config.types.length > 0) {
    lines.push({
      ok: Boolean(typeHit),
      label: typeHit ? `ประเภทตรง: ${typeHit}` : 'ประเภท: ยังไม่ตรงกับ Lead นี้',
    });
  }
  const kwHit = config.keywords.find((k) => contains(k));
  if (config.keywords.length > 0 && kwHit) {
    lines.push({ ok: true, label: `คำค้นหาตรง: ${kwHit}` });
  }
  return lines;
}

/** Would this config cause the Business matcher to select this Business? */
export function wouldMatch(config: MatchingConfig, leadText: string): boolean {
  const hay = normalizeToken(leadText);
  return configToDesiredRules(config).some((r) => hay.includes(normalizeToken(r.ruleValue)));
}

// ---------------------------------------------------------------------------
// Owner-safe feedback (Phase I) — never raw rule_type / SQL / enum errors.
// ---------------------------------------------------------------------------

export const MATCHING_SAVE_MESSAGES = {
  saving: 'กำลังบันทึก...',
  saved: 'บันทึกเรียบร้อย',
  empty: 'กรุณาเลือกอย่างน้อย 1 เกณฑ์การจับคู่',
  duplicate: 'มีข้อมูลนี้อยู่แล้ว',
  serverError: 'ไม่สามารถบันทึกได้ กรุณาลองใหม่อีกครั้ง',
} as const;

export function matchingSaveError(): string {
  return MATCHING_SAVE_MESSAGES.serverError;
}

/** True when the config has at least one matching criterion. */
export function hasAnyCriterion(config: MatchingConfig): boolean {
  return configToDesiredRules(config).length > 0;
}

/** Would adding `value` to `existing` be a normalized duplicate? */
export function isDuplicateToken(existing: string[], value: string): boolean {
  const key = normalizeToken(value);
  if (!key) return false;
  return existing.some((e) => normalizeToken(e) === key);
}
