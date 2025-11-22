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
            // Use lib mode to ensure proper CJS output
            lib: {
              entry: 'electron/preload/index.ts',
              formats: ['cjs'],
              fileName: () => 'index.cjs',
            },
            rollupOptions: {
              external: ['electron', '@au-archive/core'],
              output: {
                // Electron preload scripts MUST be CommonJS format
                // Use .cjs extension so Node.js treats it as CommonJS
                // regardless of "type": "module" in package.json
                format: 'cjs',
                entryFileNames: 'index.cjs',
                // 'auto' or 'named' allows proper CJS exports conversion
                exports: 'auto',
              },
            },
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
