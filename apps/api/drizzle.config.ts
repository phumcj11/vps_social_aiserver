import { defineConfig } from 'drizzle-kit';

/**
 * Drizzle Kit configuration for the KMKT Social AI API.
 * `generate` reads the schema and emits SQL migrations (no DB needed);
 * `migrate` applies them to MySQL.
 */
export default defineConfig({
  dialect: 'mysql',
  schema: './src/db/schema.ts',
  out: './drizzle',
  dbCredentials: {
    url:
      process.env.DATABASE_URL ?? 'mysql://kmkt_social_ai:change_me@127.0.0.1:3306/kmkt_social_ai',
  },
  strict: true,
  verbose: true,
});
