/**
 * Minimal structured logger foundation for KMKT Social AI.
 *
 * Dependency-free, emits single-line JSON to stdout/stderr so that logs are
 * machine-parseable from day one. This is a foundation, not a full logging
 * stack — richer transports/redaction can be layered on in later sprints.
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LEVEL_WEIGHT: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

export interface LoggerOptions {
  /** Minimum level to emit. Anything lower is dropped. */
  level?: LogLevel;
  /** Static fields attached to every log line (e.g. service name). */
  base?: Record<string, unknown>;
}

export interface Logger {
  debug(message: string, fields?: Record<string, unknown>): void;
  info(message: string, fields?: Record<string, unknown>): void;
  warn(message: string, fields?: Record<string, unknown>): void;
  error(message: string, fields?: Record<string, unknown>): void;
  child(fields: Record<string, unknown>): Logger;
}

export function createLogger(options: LoggerOptions = {}): Logger {
  const minLevel = options.level ?? 'info';
  const base = options.base ?? {};

  function emit(level: LogLevel, message: string, fields?: Record<string, unknown>): void {
    if (LEVEL_WEIGHT[level] < LEVEL_WEIGHT[minLevel]) return;
    const line = JSON.stringify({
      time: new Date().toISOString(),
      level,
      msg: message,
      ...base,
      ...fields,
    });
    if (level === 'error') {
      process.stderr.write(`${line}\n`);
    } else {
      process.stdout.write(`${line}\n`);
    }
  }

  return {
    debug: (message, fields) => emit('debug', message, fields),
    info: (message, fields) => emit('info', message, fields),
    warn: (message, fields) => emit('warn', message, fields),
    error: (message, fields) => emit('error', message, fields),
    child: (fields) => createLogger({ level: minLevel, base: { ...base, ...fields } }),
  };
}
