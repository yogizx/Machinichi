import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    setupFiles: ['tests/helpers/env.ts', 'tests/helpers/mocks.ts'],
    testTimeout: 30000,
    hookTimeout: 120000,
    fileParallelism: false,
    pool: 'forks',
  },
});
