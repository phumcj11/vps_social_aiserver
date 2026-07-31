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
  }
  return env;
}

/** True when a session cookie should carry the Secure attribute. */
export function cookieSecure(env: ApiEnv): boolean {
  return env.APP_ENV === 'production' || env.SESSION_COOKIE_SECURE;
}
