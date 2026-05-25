import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    setupFiles: [
      './src/tests/helpers/mockAsaas.js',
      './src/tests/helpers/setup.js',
    ],
    testTimeout: 15000,
    hookTimeout: 15000,
    fileParallelism: false,
    maxWorkers: 1,
    sequence: { sequential: true },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/controllers/**', 'src/middleware/**'],
      thresholds: { lines: 80, functions: 80, branches: 70 },
    },
  },
});
