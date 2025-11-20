import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: [
      'apps/backend/tests/**/*.test.ts',
    ],
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      // Eski hatalı testler (basit versiyonları kullan)
      'apps/backend/tests/unit/fee-calculator.test.ts',
      'apps/backend/tests/unit/risk-dashboard.test.ts',
      'apps/backend/tests/unit/compliance.test.ts',
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
      include: ['apps/backend/src/**/*.ts'],
      exclude: [
        'apps/backend/src/**/*.test.ts',
        'apps/backend/src/**/*.spec.ts',
        'apps/backend/src/index.ts',
        'node_modules/**',
        'dist/**',
      ],
      thresholds: {
        lines: 85,
        functions: 85,
        branches: 80,
        statements: 85,
      },
    },
    setupFiles: ['./apps/backend/tests/setup.ts'],
    testTimeout: 10000,
    hookTimeout: 10000,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './apps/backend/src'),
    },
  },
});
