import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Minimal, dependency-free .env loader for CLI scripts (migrate/status/reset).
 * Loads the repo-root `.env` (and an app-local `.env` if present) into
 * process.env WITHOUT overriding values already set in the environment.
 *
 * Not used by the containerised API, which receives configuration via the
 * Docker `env_file`.
 */
export function loadDotenv(
  paths: string[] = [resolve(process.cwd(), '.env'), resolve(process.cwd(), '../../.env')],
): void {
  for (const path of paths) {
    if (!existsSync(path)) continue;
    const content = readFileSync(path, 'utf8');
    for (const raw of content.split('\n')) {
      const line = raw.trim();
      if (!line || line.startsWith('#')) continue;
      const eq = line.indexOf('=');
      if (eq === -1) continue;
      const key = line.slice(0, eq).trim();
      let value = line.slice(eq + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (process.env[key] === undefined) process.env[key] = value;
    }
  }
}
