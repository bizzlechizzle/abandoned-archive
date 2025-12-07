import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['electron/**/*.test.ts', 'electron/**/*.spec.ts'],
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/dist-electron/**',
      // Integration tests require Electron context with native modules (better-sqlite3)
      // Run separately with: pnpm test:integration (requires electron-rebuild first)
      'electron/__tests__/integration/**',
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['electron/**/*.ts'],
      exclude: [
        'electron/**/*.test.ts',
        'electron/**/*.spec.ts',
        'electron/main/index.ts', // Entry point
        'electron/preload/index.ts', // Preload script
      ],
    },
    testTimeout: 10000,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './electron'),
      '@au-archive/core': path.resolve(__dirname, '../core/src'),
    },
  },
});
