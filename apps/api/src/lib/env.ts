import { z } from 'zod';

/**
 * API environment configuration (SPRINT 002).
 *
 * Parsed and validated at process start. Safe, development-friendly defaults;
 * secrets are supplied via a local, gitignored `.env`. Nothing here is logged.
 */

const booleanish = (fallback: boolean) =>
  z
    .union([z.boolean(), z.string()])
    .transform((v) =>
      typeof v === 'boolean' ? v : ['1', 'true', 'yes', 'on'].includes(v.toLowerCase()),
    )
    .default(fallback);

const intFromString = (fallback: number) =>
  z
    .union([z.number(), z.string()])
    .transform((v) => (typeof v === 'number' ? v : Number.parseInt(v, 10)))
    .pipe(z.number().int().positive())
    .default(fallback);

export const apiEnvSchema = z.object({
  APP_ENV: z.enum(['development', 'test', 'production']).default('development'),

  API_PORT: intFromString(3001),
  API_HOST: z.string().default('127.0.0.1'),

  DATABASE_URL: z
    .string()
    .default('mysql://kmkt_social_ai:change_me@127.0.0.1:3306/kmkt_social_ai'),

  // Session & cookies
  SESSION_COOKIE_NAME: z.string().default('kmkt_session'),
  SESSION_TTL_HOURS: intFromString(168), // 7 days
  // Secure cookie is forced on in production; overridable elsewhere for testing.
  SESSION_COOKIE_SECURE: booleanish(false),

  // Password policy
  PASSWORD_MIN_LENGTH: intFromString(10),

  // CORS — the single known web origin (never a wildcard in production).
  WEB_ORIGIN: z.string().default('http://localhost:3000'),

  // Rate-limit foundation for auth endpoints
  AUTH_RATE_LIMIT_MAX: intFromString(10),
  AUTH_RATE_LIMIT_WINDOW_SECONDS: intFromString(900), // 15 minutes

  // Facebook connection (SPRINT 004). Login remains DISABLED by default; a real
  // browser is only launched when this is explicitly enabled (operator-assisted).
  FACEBOOK_LOGIN_ENABLED: booleanish(false),
  // Root directory for per-workspace persistent browser profiles (relative to cwd).
  BROWSER_PROFILE_ROOT: z.string().default('storage/browser-profiles'),
  // How long an interactive connection may run before timing out.
  FACEBOOK_CONNECT_TIMEOUT_MS: intFromString(180_000), // 3 minutes
  // How long a validation run may take before timing out.
  FACEBOOK_VALIDATE_TIMEOUT_MS: intFromString(60_000), // 1 minute

  // Collector Engine (SPRINT 006). Reading remains DISABLED by default; the
  // collector launches a (read-only) browser only when this is explicitly on.
  FACEBOOK_READER_ENABLED: booleanish(false),
  COLLECTOR_MAX_SCROLLS: intFromString(5),
  COLLECTOR_MAX_POSTS_PER_GROUP: intFromString(30),
  COLLECTOR_TIMEOUT_MS: intFromString(120_000), // 2 minutes per run

  // Opportunity Classification (SPRINT 007) — deterministic rules, NO AI.
  // Minimum message length for a Signal to be accepted as an Opportunity.
  OPPORTUNITY_MIN_TEXT_LENGTH: intFromString(15),

  // AI Draft Engine (SPRINT 009). AI is DISABLED by default; the deterministic
  // Mock provider is used for tests and local use. A real external provider
  // must REFUSE to run while AI_ENABLED=false. The output is a DRAFT ONLY —
  // never sent to Telegram, never posted to Facebook.
  AI_ENABLED: booleanish(false),
  AI_PROVIDER: z.string().default('mock'),
  AI_MODEL: z.string().default('mock-draft-v1'),
  AI_PROMPT_VERSION: z.string().default('rules-v1'),
  AI_DRAFT_MAX_LENGTH: intFromString(500),
  AI_CONTEXT_MAX_KNOWLEDGE_ITEMS: intFromString(20),
  AI_CONTEXT_MAX_CHARACTERS: intFromString(12_000),

  // Human Review Engine (SPRINT 010). Telegram is ONLY the first Review Adapter;
  // the Review Engine works WITHOUT it. Telegram is DISABLED by default — no bot
  // is connected and the adapter transport refuses to send while disabled. A
  // review decision NEVER posts to Facebook and NEVER triggers a write action.
  TELEGRAM_ENABLED: booleanish(false),

  // Action Queue Engine (SPRINT 011). A SAFE boundary between an approved Human
  // Review decision and future platform execution. This sprint does NOT execute
  // Facebook actions and runs NO Action Worker. Execution is disabled by default;
  // Facebook writes stay disabled and the global kill switch stays on, so every
  // Action Job is created BLOCKED (never queued for execution) under defaults.
  ACTION_ENGINE_ENABLED: booleanish(false),
  ACTION_DEFAULT_MAX_ATTEMPTS: intFromString(3),
  // Comma-separated allowed action types (only facebook_comment in the MVP).
  ACTION_ALLOWED_TYPES: z.string().default('facebook_comment'),
  ACTION_EXECUTION_CONCURRENCY: intFromString(1),

  // Safety gates the Action Policy Guard reads. Both stay in their safe state by
  // default: Facebook writes disabled, global kill switch on. Nothing here
  // executes any Facebook action this sprint.
  FACEBOOK_WRITE_ACTION_ENABLED: booleanish(false),
  FACEBOOK_COMMENT_ENABLED: booleanish(false),
  GLOBAL_KILL_SWITCH: booleanish(true),

  // Playwright browser concurrency — MUST stay 1 on the MVP VPS (one Chromium
  // at a time). Collector and Comment Executor share the single slot.
  PLAYWRIGHT_CONCURRENCY: intFromString(1),

  // Facebook Comment Adapter / Safe Execution Foundation (SPRINT 012). The
  // adapter defaults to the deterministic FAKE (no network, no Playwright). The
  // real 'playwright' adapter REFUSES to submit unless every enablement flag is
  // intentionally set (see PlaywrightFacebookCommentAdapter). No real write this
  // sprint. Ambiguous results NEVER auto-retry.
  FACEBOOK_COMMENT_ADAPTER: z.enum(['fake', 'playwright']).default('fake'),
  FACEBOOK_COMMENT_EXECUTION_TIMEOUT_MS: intFromString(90_000),
  FACEBOOK_COMMENT_VERIFY_TIMEOUT_MS: intFromString(30_000),
  FACEBOOK_COMMENT_MAX_ATTEMPTS: intFromString(1),
  ACTION_EVIDENCE_RETENTION_DAYS: intFromString(30),
  ACTION_AMBIGUOUS_AUTO_RETRY: booleanish(false),

  // Per-route rate limits for the write/expensive endpoints (SPRINT 012). Each
  // is a max-per-window guard on top of auth; windows are in seconds.
  ACTION_CREATE_RATE_LIMIT_MAX: intFromString(30),
  ACTION_CREATE_RATE_LIMIT_WINDOW_SECONDS: intFromString(60),
  EXECUTION_PREPARE_RATE_LIMIT_MAX: intFromString(10),
  EXECUTION_PREPARE_RATE_LIMIT_WINDOW_SECONDS: intFromString(60),
  EXECUTION_RECOVER_RATE_LIMIT_MAX: intFromString(10),
  EXECUTION_RECOVER_RATE_LIMIT_WINDOW_SECONDS: intFromString(60),
});

export type ApiEnv = z.infer<typeof apiEnvSchema>;

export function loadApiEnv(source: Record<string, string | undefined> = process.env): ApiEnv {
  const parsed = apiEnvSchema.safeParse(source);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join('.') || '(root)'}: ${i.message}`)
      .join('\n');
    throw new Error(`Invalid API environment configuration:\n${issues}`);
  }
  const env = parsed.data;
  // In production the session cookie must always be Secure.
  if (env.APP_ENV === 'production') {
    env.SESSION_COOKIE_SECURE = true;
    // Refuse to start production with default/weak DB credentials (ARV-1.0 H3).
    // Development placeholders are tolerated only outside production.
    if (hasWeakDbCredential(env.DATABASE_URL)) {
      throw new Error(
        'Refusing to start: DATABASE_URL uses a default/weak placeholder credential ' +
          '(e.g. change_me). Set strong MySQL credentials in .env before production.',
      );
    }
  }
  return env;
}

/** Known unsafe placeholder credentials that must never reach production. */
const WEAK_DB_CREDENTIALS = ['change_me', 'change_me_root', 'password', 'root', 'mysql'];

/** True when a MySQL connection string contains a default/weak placeholder password. */
export function hasWeakDbCredential(databaseUrl: string): boolean {
  const lower = databaseUrl.toLowerCase();
  return WEAK_DB_CREDENTIALS.some((weak) => lower.includes(`:${weak}@`));
}

/** True when a session cookie should carry the Secure attribute. */
export function cookieSecure(env: ApiEnv): boolean {
  return env.APP_ENV === 'production' || env.SESSION_COOKIE_SECURE;
}
