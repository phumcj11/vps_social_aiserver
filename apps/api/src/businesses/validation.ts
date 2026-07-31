import { z } from 'zod';

/**
 * Validation for the Business domain (SPRINT 003).
 *
 * These are STRUCTURED business data rules — not AI. Matching-rule types are a
 * fixed, deterministic set.
 */

/** Allowed matching-rule types (deterministic; NOT AI). */
export const RULE_TYPES = [
  'province',
  'district',
  'keyword',
  'guest_count',
  'budget',
  'facility',
  'custom',
] as const;

export const BUSINESS_STATUSES = ['active', 'disabled'] as const;
export const KNOWLEDGE_STATUSES = ['active', 'archived'] as const;
export const RULE_STATUSES = ['active', 'disabled'] as const;

const optionalText = (max: number) => z.string().trim().max(max).optional();
const nullableText = (max: number) => z.string().trim().max(max).nullable().optional();

export const createBusinessSchema = z.object({
  name: z.string().trim().min(1).max(120),
  category: z.string().trim().min(1).max(120),
  description: optionalText(5000),
});

export const updateBusinessSchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    status: z.enum(BUSINESS_STATUSES).optional(),
  })
  .refine((v) => v.name !== undefined || v.status !== undefined, {
    message: 'Provide at least one field to update',
  });

export const updateProfileSchema = z.object({
  category: z.string().trim().min(1).max(120).optional(),
  description: nullableText(5000),
  sellingPoints: z.array(z.string().trim().min(1).max(300)).max(50).optional(),
  serviceArea: nullableText(2000),
  contactInformation: nullableText(2000),
  responseTone: z.string().trim().max(120).nullable().optional(),
  prohibitedClaims: z.array(z.string().trim().min(1).max(300)).max(50).optional(),
});

export const createKnowledgeSchema = z.object({
  title: z.string().trim().min(2).max(200),
  content: nullableText(20000),
  status: z.enum(KNOWLEDGE_STATUSES).default('active'),
});

export const updateKnowledgeSchema = z
  .object({
    title: z.string().trim().min(2).max(200).optional(),
    content: nullableText(20000),
    status: z.enum(KNOWLEDGE_STATUSES).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'Provide at least one field to update' });

export const createRuleSchema = z.object({
  ruleType: z.enum(RULE_TYPES),
  ruleValue: z.string().trim().min(1).max(255),
  priority: z.coerce.number().int().min(0).max(1_000_000).default(0),
  status: z.enum(RULE_STATUSES).default('active'),
});

export const updateRuleSchema = z
  .object({
    ruleType: z.enum(RULE_TYPES).optional(),
    ruleValue: z.string().trim().min(1).max(255).optional(),
    priority: z.coerce.number().int().min(0).max(1_000_000).optional(),
    status: z.enum(RULE_STATUSES).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'Provide at least one field to update' });
