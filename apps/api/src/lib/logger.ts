/**
 * Minimal structured logger for the API.
 *
 * Emits single-line JSON. Callers pass only SAFE fields. This logger must never
 * receive passwords, password hashes, session tokens, cookies, or secret env
 * values — by convention, handlers only log identifiers and event names.
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const WEIGHT: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

// Defensive denylist: if a forbidden key is ever passed, its value is redacted.
const FORBIDDEN_KEYS = new Set([
  'password',
  'passwordHash',
  'password_hash',
  'token',
  'sessionToken',
  'session_token',
  'sessionTokenHash',
  'cookie',
  'cookies',
  'authorization',
]);

function redact(fields?: Record<string, unknown>): Record<string, unknown> | undefined {
  if (!fields) return undefined;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(fields)) {
    out[k] = FORBIDDEN_KEYS.has(k) ? '[redacted]' : v;
  }
  return out;
}

export interface Logger {
  info(event: string, fields?: Record<string, unknown>): void;
  warn(event: string, fields?: Record<string, unknown>): void;
  error(event: string, fields?: Record<string, unknown>): void;
  debug(event: string, fields?: Record<string, unknown>): void;
}

export function createLogger(minLevel: LogLevel = 'info'): Logger {
  const emit = (level: LogLevel, event: string, fields?: Record<string, unknown>) => {
    if (WEIGHT[level] < WEIGHT[minLevel]) return;
    const line = JSON.stringify({
      time: new Date().toISOString(),
      level,
      event,
      ...redact(fields),
    });
    if (level === 'error') process.stderr.write(`${line}\n`);
    else process.stdout.write(`${line}\n`);
  };
  return {
    debug: (event, fields) => emit('debug', event, fields),
    info: (event, fields) => emit('info', event, fields),
    warn: (event, fields) => emit('warn', event, fields),
    error: (event, fields) => emit('error', event, fields),
  };
}
