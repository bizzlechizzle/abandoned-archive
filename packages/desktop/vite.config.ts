import { defineConfig, type Plugin } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import electron from 'vite-plugin-electron';
import path from 'path';
import fs from 'fs';

/**
 * Custom plugin to copy preload script WITHOUT any bundling/transformation.
 *
 * WHY THIS EXISTS:
 * vite-plugin-electron always transforms entry files, adding ESM syntax
 * like "import require$$0 from 'electron'" even to .cjs files.
 * This breaks Electron preload scripts which MUST be pure CommonJS.
 *
 * SOLUTION:
 * Don't use vite-plugin-electron for preload at all.
 * Just copy the static .cjs file directly to dist-electron/preload/
 */
function copyPreloadPlugin(): Plugin {
  const srcPath = path.resolve(__dirname, 'electron/preload/preload.cjs');
  const destDir = path.resolve(__dirname, 'dist-electron/preload');
  const destPath = path.join(destDir, 'index.cjs');

  function copyPreload() {
    if (!fs.existsSync(destDir)) {
      fs.mkdirSync(destDir, { recursive: true });
    }
    fs.copyFileSync(srcPath, destPath);
    console.log('[preload] Copied static preload.cjs to dist-electron/preload/index.cjs');
  }

  return {
    name: 'copy-preload',
    // Copy on build start
    buildStart() {
      copyPreload();
    },
    // Watch for changes in dev mode
    configureServer(server) {
      // Initial copy
      copyPreload();
      // Watch for changes
      server.watcher.add(srcPath);
      server.watcher.on('change', (changedPath) => {
        if (changedPath === srcPath) {
          copyPreload();
          // Trigger electron reload by touching main
          server.ws.send({ type: 'full-reload' });
        }
      });
    },
  };
}

export default defineConfig({
  plugins: [
    svelte(),
    // Copy preload FIRST, before electron plugin runs
    copyPreloadPlugin(),
    // Only configure main process - NO preload entry
    electron([
      {
        entry: 'electron/main/index.ts',
        vite: {
          build: {
            outDir: 'dist-electron/main',
            rollupOptions: {
              external: [
                'zod',
                'better-sqlite3',
                'kysely',
                'electron',
                // Sharp is a native module with platform-specific binaries
                // that use dynamic requires - must be external to the bundle
                'sharp',
              ],
            },
          },
        },
      },
      // REMOVED: preload entry - handled by copyPreloadPlugin instead
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
