import { z } from 'zod';

/**
 * Typed environment configuration foundation for KMKT Social AI.
 *
 * This is intentionally a *foundation* only (SPRINT 001): it defines the shape
 * of the environment and validates it, with SAFE defaults. It does not read
 * secrets, connect to anything, or enable any integration. All Facebook
 * actions, AI, Telegram and n8n default to disabled; the global kill switch
 * defaults to ON and approval is required.
 */

/** Coerce common truthy/falsy string spellings into a real boolean. */
const booleanish = (fallback: boolean) =>
  z
    .union([z.boolean(), z.string()])
    .transform((value) => {
      if (typeof value === 'boolean') return value;
      return ['1', 'true', 'yes', 'on'].includes(value.trim().toLowerCase());
    })
    .default(fallback);

const positiveIntFromString = (fallback: number) =>
  z
    .union([z.number(), z.string()])
    .transform((value) => (typeof value === 'number' ? value : Number.parseInt(value, 10)))
    .pipe(z.number().int().positive())
    .default(fallback);

export const envSchema = z.object({
  APP_ENV: z.enum(['development', 'test', 'production']).default('development'),

  WEB_PORT: positiveIntFromString(3000),
  API_PORT: positiveIntFromString(3001),

  // Development placeholder only — never a real credential.
  DATABASE_URL: z.string().default('mysql://kmkt_social_ai:change_me@mysql:3306/kmkt_social_ai'),

  // Facebook adapter — all disabled by default.
  FACEBOOK_READER_ENABLED: booleanish(false),
  FACEBOOK_COMMENT_ENABLED: booleanish(false),
  FACEBOOK_WRITE_ACTION_ENABLED: booleanish(false),
  FACEBOOK_LOGIN_ENABLED: booleanish(false),

  // Safety guarantees — safe by default.
  COMMENT_APPROVAL_REQUIRED: booleanish(true),
  GLOBAL_KILL_SWITCH: booleanish(true),

  // Conservative concurrency for a 2-core / 3.8 GiB host.
  PLAYWRIGHT_CONCURRENCY: positiveIntFromString(1),
  SCANNER_CONCURRENCY: positiveIntFromString(1),
  COMMENT_CONCURRENCY: positiveIntFromString(1),

  // External integrations — disabled by default.
  AI_ENABLED: booleanish(false),
  TELEGRAM_ENABLED: booleanish(false),
  N8N_ENABLED: booleanish(false),

  SCREENSHOT_RETENTION_DAYS: positiveIntFromString(30),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
});

export type AppEnv = z.infer<typeof envSchema>;

/**
 * Validate a raw environment record (defaults to process.env) and return a
 * typed, safe configuration object. Throws a descriptive error if invalid.
 */
export function loadEnv(source: Record<string, string | undefined> = process.env): AppEnv {
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  return parsed.data;
}
