import { defineConfig } from 'vitest/config';

/**
 * Root Vitest configuration.
 * Runs unit tests under tests/unit and any *.test.ts inside packages/apps/workers.
 * Kept single-threaded-friendly for the 2-core VPS.
 */
export default defineConfig({
  test: {
    include: [
      'tests/unit/**/*.test.ts',
      'packages/**/src/**/*.test.ts',
      'apps/**/src/**/*.test.ts',
      'workers/**/src/**/*.test.ts',
    ],
    exclude: ['**/node_modules/**', '**/dist/**', '**/.next/**'],
    environment: 'node',
    coverage: {
      reportsDirectory: 'coverage',
      provider: 'v8',
    },
  },
});
