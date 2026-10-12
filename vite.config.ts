import { defineConfig } from 'vitest/config';

/**
 * The deploy workflow passes the path reported by `actions/configure-pages`: "" for a user site
 * (arslanagayev.github.io) and "/<repo>" for a project site, so either repo name works.
 */
const PAGES_BASE = process.env.BASE_PATH ?? '/sound-of-sorting/';

export default defineConfig(({ mode }) => ({
  base: mode === 'production' ? PAGES_BASE : '/',
  build: { target: 'es2022', sourcemap: true },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    restoreMocks: true,
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/main.ts'],
      reporter: ['text', 'html', 'lcov'],
      thresholds: { lines: 90, statements: 90, functions: 90, branches: 85 },
    },
  },
}));
