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

/** Non-negative integer (allows 0, e.g. retention counts). */
const nonNegIntFromString = (fallback: number) =>
  z
    .union([z.number(), z.string()])
    .transform((v) => (typeof v === 'number' ? v : Number.parseInt(v, 10)))
    .pipe(z.number().int().nonnegative())
    .default(fallback);

/** Positive float (e.g. load-average thresholds). */
const floatFromString = (fallback: number) =>
  z
    .union([z.number(), z.string()])
    .transform((v) => (typeof v === 'number' ? v : Number.parseFloat(v)))
    .pipe(z.number().positive())
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
  // MODEL C — the SYSTEM/source tenant workspace that owns the KMKT scanner
  // account + source Facebook Groups. Empty (default) means no source tenant is
  // configured yet: operator "Facebook Sources" and customer "กลุ่มที่ติดตาม"
  // safely show their empty states, and no group is subscribable. It is set only
  // once the source tenant is established (M6). Never a secret — just a
  // workspace id used to scope source-group listing.
  MODEL_C_SOURCE_WORKSPACE_ID: z.string().default(''),
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

  // ── Production Pilot Readiness (SPRINT 014) ────────────────────────────────
  // Configuration for a SMALL, human-supervised production pilot. NONE of these
  // enable a Facebook write — the write path stays gated by the flags above.
  // Draft provider mode for production candidates: 'mock' and 'manual' both
  // require a human rewrite/review; 'external_ai' is NOT configured this sprint.
  PILOT_DRAFT_MODE: z.enum(['mock', 'manual', 'external_ai']).default('mock'),
  // Level-1 hard limits (advisory defaults enforced by the pilot limit evaluator).
  PILOT_MAX_GROUPS: intFromString(3),
  PILOT_MAX_COMMENTS_PER_DAY: intFromString(3),
  PILOT_MAX_COMMENTS_PER_GROUP_PER_DAY: intFromString(1),
  PILOT_MAX_COMMENTS_PER_BUSINESS_PER_DAY: intFromString(1),
  PILOT_MAX_AMBIGUOUS_PER_DAY: intFromString(1),
  // Maximum bounded Write Window length for Level 1 (seconds). A window auto-
  // closes at expiry; expiry NEVER auto-retries or submits anything.
  PILOT_WRITE_WINDOW_MAX_SECONDS: intFromString(300),
  // One-shot production submit authorization lifetime (seconds).
  PILOT_AUTHORIZATION_TTL_SECONDS: intFromString(300),

  // Per-route rate limits for the write/expensive endpoints (SPRINT 012). Each
  // is a max-per-window guard on top of auth; windows are in seconds.
  ACTION_CREATE_RATE_LIMIT_MAX: intFromString(30),
  ACTION_CREATE_RATE_LIMIT_WINDOW_SECONDS: intFromString(60),
  EXECUTION_PREPARE_RATE_LIMIT_MAX: intFromString(10),
  EXECUTION_PREPARE_RATE_LIMIT_WINDOW_SECONDS: intFromString(60),
  EXECUTION_RECOVER_RATE_LIMIT_MAX: intFromString(10),
  EXECUTION_RECOVER_RATE_LIMIT_WINDOW_SECONDS: intFromString(60),

  // ── Operational Hardening (SPRINT 013) ─────────────────────────────────────
  // Maintenance and lockdown are toggled at runtime via a persistent state file
  // (see OperationalStateStore), NOT via these .env defaults — the .env values
  // are only the initial fallback when no state file exists yet.
  MAINTENANCE_MODE: booleanish(false),
  INCIDENT_LOCKDOWN: booleanish(false),

  // Operator-only operations surface. Disabled → operations routes 404/403.
  OPERATIONS_ENABLED: booleanish(true),
  // Comma-separated operator emails; empty = no operators (operations locked).
  OPERATIONS_OPERATOR_EMAILS: z.string().default(''),
  OPERATIONS_RATE_LIMIT_MAX: intFromString(10),
  OPERATIONS_RATE_LIMIT_WINDOW_MS: intFromString(60_000),

  // Backups. BACKUP_ROOT must be OUTSIDE the repo; never contains secrets.
  BACKUP_ROOT: z.string().default('/opt/kmkt/backups/social-ai'),
  BACKUP_RETENTION_DAILY: nonNegIntFromString(7),
  BACKUP_RETENTION_WEEKLY: nonNegIntFromString(4),
  BACKUP_RETENTION_MONTHLY: nonNegIntFromString(3),
  BACKUP_STALE_HOURS: intFromString(26),

  // Logs.
  LOG_RETENTION_DAYS: nonNegIntFromString(7),
  LOG_MAX_SIZE_MB: intFromString(50),

  // Monitoring thresholds.
  MONITOR_DISK_WARNING_PERCENT: intFromString(80),
  MONITOR_DISK_CRITICAL_PERCENT: intFromString(90),
  MONITOR_RAM_WARNING_MB: intFromString(700),
  MONITOR_RAM_CRITICAL_MB: intFromString(350),
  MONITOR_SWAP_WARNING_PERCENT: intFromString(25),
  MONITOR_SWAP_CRITICAL_PERCENT: intFromString(60),
  MONITOR_LOAD_WARNING: floatFromString(1.5),
  MONITOR_LOAD_CRITICAL: floatFromString(2.5),

  // Where the persistent operational-state file lives (gitignored, no secrets).
  OPERATIONS_STATE_FILE: z.string().default('storage/runtime/ops-state.json'),
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
