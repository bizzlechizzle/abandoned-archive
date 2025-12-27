/**
 * CLI build script using esbuild
 *
 * Bundles the CLI with workspace packages (@aa/*) inlined,
 * but external dependencies from node_modules.
 */

import * as esbuild from 'esbuild';

import { builtinModules } from 'module';

await esbuild.build({
  entryPoints: ['dist/cli.js'],
  bundle: true,
  platform: 'node',
  format: 'esm',
  outfile: 'dist/cli.bundle.js',
  // Externalize node_modules and builtins but bundle workspace packages
  external: [
    ...builtinModules,
    ...builtinModules.map((m) => `node:${m}`),
    'better-sqlite3',
    'sharp',
    'fluent-ffmpeg',
    'exiftool-vendored',
    'commander',
    'chalk',
    'cli-table3',
    'ora',
    'cosmiconfig',
    'kysely',
    'zod',
    'blake3',
    'keytar',
    'socket.io-client',
  ],
});

console.log('Build complete: dist/cli.bundle.js');
