import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./tests/setup.ts'],
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    exclude: [
      'node_modules',
      '.next',
      'tests/*.spec.ts', // Exclude Playwright E2E tests
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
      reportsDirectory: './coverage',
      exclude: [
        'node_modules/',
        'tests/',
        '.next/',
        '**/*.d.ts',
        '**/*.config.ts',
        '**/*.config.mjs',
        'src/app/**/*.tsx', // Exclude page components (covered by E2E)
        'src/app/**/layout.tsx',
        'src/app/**/page.tsx',
        'src/app/**/error.tsx',
        'src/app/**/loading.tsx',
        'src/app/**/not-found.tsx',
        'src/emails/**', // Email templates tested via E2E
        'src/middleware.ts',
      ],
      // Count all source files in the denominator (not just the ones imported by a test).
      all: true,
      // Flat keys are the REAL gate: Vitest ignores a `global:` wrapper, which silently disabled
      // the threshold before (coverage was ~19% while the gate "passed" green). Global floors sit
      // just under current coverage to catch regressions; the API-route glob is held high to lock
      // in the new route-handler tests. Ratchet these up as component/lib coverage grows.
      thresholds: {
        statements: 33,
        branches: 70,
        functions: 80,
        lines: 33,
        "src/app/api/**/*.ts": {
          statements: 78,
          branches: 60,
          functions: 90,
          lines: 78,
        },
      },
    },
    testTimeout: 10000,
    hookTimeout: 10000,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      // `server-only` is a Next.js build-time marker with no resolvable module under vite; alias it to
      // an empty stub so server-only units (e.g. src/lib/ssrf.ts) can be imported in tests.
      'server-only': path.resolve(__dirname, './tests/stubs/server-only.ts'),
    },
  },
});
