import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import electron from 'vite-plugin-electron';
import path from 'path';

export default defineConfig({
  plugins: [
    svelte(),
    electron([
      {
        entry: 'electron/main/index.ts',
        vite: {
          build: {
            outDir: 'dist-electron/main',
            rollupOptions: {
              external: ['zod', 'better-sqlite3', 'kysely', 'electron'],
            },
          },
        },
      },
      {
        entry: 'electron/preload/index.ts',
        onstart(args) {
          args.reload();
        },
        vite: {
          build: {
            outDir: 'dist-electron/preload',
            rollupOptions: {
              external: ['electron', '@au-archive/core'],
              output: {
                format: 'cjs',
                interop: 'auto',
                // CRITICAL: Use .cjs extension so Node.js treats it as CommonJS
                // regardless of "type": "module" in package.json
                // Electron preload scripts MUST be CommonJS format
                entryFileNames: '[name].cjs',
                exports: 'none',
              },
            },
          },
          esbuild: {
            format: 'cjs',
            platform: 'node',
          },
        },
      },
    ]),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@core': path.resolve(__dirname, '../core/src'),
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
  server: {
    port: 5173,
  },
});
