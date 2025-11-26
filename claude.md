# Abandoned Archive

Document every abandoned place with verifiable, local-first evidence.

## Quick Context

- **Mission**: Curate abandoned places with metadata, media, and GPS truth that historians can trust offline
- **Current**: Desktop release v0.1.0 (Electron + Svelte)
- **Target**: Research-ready archive browser with import, map, and ownership guarantees
- **Persona**: Solo explorer cataloging locations; metadata first, glamor second

## Boot Sequence

1. Read this file (claude.md)
2. Read `techguide.md` for implementation details
3. Read `lilbits.md` for script registry
4. Read the task request before touching code

## Commands

- `pnpm install` — Install dependencies
- `pnpm dev` — Run desktop app in dev mode (alias for `--filter desktop dev`)
- `pnpm build` — Build all packages for production
- `pnpm --filter core build` — Build only core package
- `pnpm --filter desktop rebuild` — Rebuild native modules (better-sqlite3, sharp)
- `pnpm -r test` — Run tests in all packages
- `pnpm -r lint` — Lint all packages
- `pnpm format` — Format code with Prettier
- `pnpm reinstall` — Clean and reinstall (fixes native module issues)

Keep scripts under 300 LOC and documented in `lilbits.md`.

## Development Rules

1. **Scope Discipline** — Only implement what the current request describes; no surprise features
2. **Archive-First** — Every change must serve research, metadata interaction, or indexing workflows
3. **Prefer Open Source + Verify Licenses** — Default to open tools, avoid Google services, log every dependency license
4. **Offline-First** — Assume zero connectivity; add graceful fallbacks when online helpers exist
5. **One Script = One Function** — Keep each script focused, under ~300 lines, recorded in `lilbits.md`
6. **No AI in Docs** — Never mention Claude, ChatGPT, Codex, or similar in user-facing docs or UI
7. **Keep It Simple** — Favor obvious code, minimal abstraction, fewer files

## Do Not

- Invent new features, pages, or data models beyond what the task or referenced docs authorize
- Bypass the hashing contract when importing media or linking files to locations
- Remove or rename migration files; schema edits go through new migrations only
- Leak or transmit local archive data outside the user's machine
- Add third-party SDKs or services without logging licenses and confirming they function offline
- Mention AI assistants in UI, user docs, exports, or metadata
- Leave TODOs or unexplained generated code in production branches

## Critical Gotchas

- **Preload MUST be CommonJS** — Static `.cjs` file copied via custom Vite plugin (NOT bundled), use `require('electron')` only, never `import` in preload. Any ES module syntax crashes at runtime before UI loads. See `vite.config.ts` `copyPreloadPlugin()`.
- **Database source of truth** — `migrations/` only, never edit schema inline in docs or ad-hoc SQL files
- **Database location** — `./data/au-archive.db` (project-relative for development convenience). Foreign keys always enabled via PRAGMA on connection.
- **GPS confidence ladder** — Map-confirmed > EXIF (<10 m accuracy) > Reverse-geocode > Manual guess
- **Import spine** — Watcher scans drop zone, hashes every file, copies into archive folder, and links via SHA primary keys before metadata extraction
- **Archive folder structure** — User-selected base → `locations/[STATE]-[TYPE]/[SLOCNAM]-[LOC12]/org-{img,vid,doc}-[LOC12]/`. Organized by state and location type.
- **Hashing first** — SHA256 computed before any metadata extraction or moves
- **Ownership pledge** — All assets stay on disk (default path from settings). No telemetry, no cloud sync, no auto-updates
- **pnpm v10+ native modules** — Project pre-configures `onlyBuiltDependencies` in package.json for better-sqlite3, electron, sharp, esbuild. If you see "Ignored build scripts" warnings, run `pnpm reinstall`

## Architecture (Quick)

- **Pattern**: Clean architecture (presentation → infrastructure → core domain) in pnpm monorepo
- **Layout**: `packages/core` = domain models, repository contracts (interfaces); `packages/desktop` = Electron main + renderer + services
- **IPC**: Renderer → Preload bridge → Main → Desktop services
- **IPC channel naming**: `domain:action` format (e.g., `location:create`, `media:import`)
- **Security**: `contextIsolation: true`, `sandbox: false` (for drag-drop), no nodeIntegration in renderer
- **Testing priority**: Unit focus on GPS parsing, hashing pipeline, and preload bridge

## Dual Edition Awareness

App must detect Light (online helpers) vs Offline Beast (bundled tiles + libpostal) at runtime with zero user toggle. Detection is file-based only (check `resources/maps/*.mbtiles` and `resources/libpostal/`). Prefer graceful degradation (disabled buttons + tooltips) instead of throwing when resources are missing.

## Design Deltas

UI copy or layout changes require `docs/ui-spec.md` update plus summary in `docs/decisions/`.

## Issue Logging

Document every deviation or limitation in `docs/decisions/`. Reference decision IDs in commits/PRs.

## Contact Surface

All prompts funnel through this CLAUDE.md; do not copy instructions elsewhere.

## Detailed References

**Architecture & Data:**
@docs/ARCHITECTURE.md
@docs/DATA_FLOW.md

**Contracts:**
@docs/contracts/gps.md
@docs/contracts/hashing.md
@docs/contracts/addressing.md
@docs/contracts/dual-edition.md
@docs/contracts/data-ownership.md

**Package Guides:**
@packages/core/CLAUDE.md
@packages/desktop/CLAUDE.md

## Authoritative Sources

| Source | Purpose |
| --- | --- |
| `migrations/` | Database schema, constraints, and seed data. Do not mirror schema elsewhere. |
| `docs/workflows/gps.md` | GPS-first workflows, confidence states, and UI copy for map actions |
| `docs/workflows/import.md` | File import queue, hashing, and folder organization rules |
| `docs/workflows/mapping.md` | Map interactions, clustering thresholds, and filter logic |
| `docs/workflows/addressing.md` | Address lookup providers, normalization rules, and manual override flows |
| `docs/workflows/export.md` | Export/backups packaging instructions and verification steps |
| `docs/ui-spec.md` | Page layouts, navigation order, typography, and component states |
| `docs/schema.md` | Field descriptions, enums, and JSON schema contracts |
| `docs/decisions/*.md` | ADR-style reasoning for deviations; reference IDs in commits |
| `techguide.md` | Implementation detail, build commands, troubleshooting |
| `lilbits.md` | Canonical registry of scripts and utilities (<300 LOC each) |
| `README.md` | High-level project introduction for contributors and stakeholders |
