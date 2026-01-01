# Abandoned Archive

Document every abandoned place with verifiable, research-grade evidence.

## Four-Doc Stack

This project uses four core instruction files. Read them in order before any task:

| File | Purpose | Modify? |
|------|---------|---------|
| **CLAUDE.md** (this file) | Project rules, architecture, constraints, reference index | ❌ Never |
| **@techguide.md** | Implementation details, build setup, environment config, deep troubleshooting | ❌ Never |
| **@lilbits.md** | Script registry — every utility script with purpose, usage, line count | ❌ Never |
| **@DESIGN.md** | Design language, visual patterns, component specs, anti-patterns | ❌ Never |

These four files are the complete instruction set. All other docs are reference material consulted on-demand.

**If any of these files are missing, empty, or unreadable: STOP and report to human. Do not proceed.**

## Quick Context

- **Mission**: Curate abandoned places with metadata, media, and GPS truth that historians can trust
- **Current**: Desktop release v0.1.0 (Electron + Svelte)
- **Target**: Research-ready archive browser with import, map, and ownership guarantees
- **Persona**: Solo explorer cataloging locations; metadata first, glamor second
- **Runtime**: Node >=20, pnpm >=10, Electron 35+
- **Backend**: Dispatch Hub (PostgreSQL) — desktop is a thin client

## Architecture: API-Only Mode

**The desktop app has NO local database.** All data operations go through Dispatch Hub's PostgreSQL.

```
┌─────────────────────┐     HTTP/WebSocket      ┌─────────────────────┐
│   Desktop App       │ ◄─────────────────────► │   Dispatch Hub      │
│   (Electron)        │                         │   (Docker)          │
│                     │                         │                     │
│  - UI (Svelte)      │                         │  - PostgreSQL       │
│  - API Repositories │                         │  - BullMQ + Redis   │
│  - Local file ops   │                         │  - Workers (9)      │
└─────────────────────┘                         └─────────────────────┘
```

| Component | Location | Purpose |
|-----------|----------|---------|
| DispatchClient | `@aa/services` | HTTP client for Hub API |
| API Repositories | `electron/repositories/api-*.ts` | Data access via Hub |
| Unified Factory | `unified-repository-factory.ts` | Creates API repositories |
| Config Service | `config-service.ts` | Runtime settings (archiveFolder, etc.) |

**If Dispatch Hub is unreachable, the app cannot function.** Show connection error UI.

## Environment Variables

| Variable | Default | Purpose |
|----------|---------|---------|
| `DISPATCH_HUB_URL` | `http://192.168.1.199:3000` | Dispatch Hub API endpoint |

## Boot Sequence

1. Read this file (CLAUDE.md) completely
2. Read @techguide.md for implementation details
3. Read @lilbits.md for script registry
4. Read @DESIGN.md for visual language (if task involves UI)
5. Read the task request
6. **Then** touch code — not before

## Commands

```bash
pnpm install          # Install dependencies
pnpm dev              # Run desktop app in dev mode
pnpm build            # Build all packages for production
pnpm -r test          # Run tests in all packages
pnpm -r lint          # Lint all packages
pnpm format           # Format code with Prettier
pnpm --filter core build      # Build only core package
pnpm --filter desktop rebuild # Rebuild native modules (sharp)
pnpm reinstall        # Clean and reinstall (fixes native module issues)
```

> **Note**: Verify these commands match `package.json` scripts before relying on them.

## Development Rules

1. **Scope Discipline** — Only implement what the current request describes; no surprise features
2. **Archive-First** — Every change must serve research, metadata interaction, or indexing workflows
3. **Prefer Open Source + Verify Licenses** — Default to open tools, avoid Google services, log every dependency license
4. **Hub-Connected** — All data operations require Dispatch Hub; handle connection failures gracefully with clear UI feedback
5. **One Script = One Function** — Keep each script focused, under ~300 lines, recorded in lilbits.md
6. **No AI in Docs** — Never mention Claude, ChatGPT, Codex, or similar in user-facing docs or UI
7. **Keep It Simple** — Favor obvious code, minimal abstraction, fewer files
8. **Binary Dependencies Welcome** — App size is not a concern; freely add binaries (dcraw_emu, ffmpeg, exiftool, libpostal) when they solve problems better than pure-JS alternatives

## Do Not

- Invent new features, pages, or data models beyond what the task or referenced docs authorize
- Bypass the hashing contract when importing media or linking files to locations
- Add local SQLite or other embedded databases — all data lives in Dispatch Hub
- Add third-party SDKs or services without logging licenses
- Mention AI assistants in UI, user docs, exports, or metadata
- Leave TODOs or unexplained generated code in production branches
- **Modify or remove core instruction files** — CLAUDE.md, techguide.md, lilbits.md, and DESIGN.md are protected; flag issues for human review instead of auto-fixing
- **Assume when uncertain** — If a task is ambiguous or conflicts with these rules, stop and ask
- **Violate design language** — No gradients on images, no decorative elements, no pure black, no animated loaders. See DESIGN.md anti-patterns.

## Stop and Ask When

- Task requires modifying CLAUDE.md, techguide.md, lilbits.md, or DESIGN.md
- Task conflicts with a rule in this file
- Referenced file or path doesn't exist
- Task scope is unclear or seems to exceed "one feature"
- You're about to delete code without understanding why it exists
- Schema change is needed (requires Dispatch Hub migration)

## Critical Gotchas

| Gotcha | Details |
|--------|---------|
| **No local database** | All data via Dispatch Hub PostgreSQL. No SQLite, no local storage for entities. |
| **Preload MUST be CommonJS** | Static `.cjs` file copied via custom Vite plugin (NOT bundled). Use `require('electron')` only, never `import`. ES module syntax crashes at runtime before UI loads. See `vite.config.ts` `copyPreloadPlugin()`. |
| **Hub connection required** | App is non-functional without Dispatch Hub. Show clear connection error UI when unreachable. |
| **GPS confidence ladder** | Map-confirmed > EXIF (<10m accuracy) > Reverse-geocode > Manual guess |
| **Import spine** | Watcher scans drop zone → hashes every file → copies into archive folder → Hub records via API → workers process metadata |
| **Hashing first** | BLAKE3/SHA256 computed before any metadata extraction or file moves |
| **Archive folder structure** | `[base]/locations/[STATE]-[TYPE]/[SLOCNAM]-[LOC12]/org-{img,vid,doc}-[LOC12]/` |
| **Media files stay local** | Only metadata goes to Hub. Actual media files remain on user's disk/NAS. |
| **pnpm v10+ native modules** | Project pre-configures `onlyBuiltDependencies` for electron, sharp, esbuild. If "Ignored build scripts" warnings appear, run `pnpm reinstall`. |

## Architecture (Quick)

- **Pattern**: Clean architecture (presentation → infrastructure → core domain) in pnpm monorepo
- **Layout**: `packages/core` = domain models, repository contracts; `packages/desktop` = Electron main + renderer + services
- **Data**: All entities via API repositories → Dispatch Hub → PostgreSQL
- **IPC flow**: Renderer → Preload bridge → Main → API Repositories → Dispatch Hub
- **IPC naming**: `domain:action` format (e.g., `location:create`, `media:import`)
- **Real-time**: WebSocket connection to Hub for live updates (job progress, new data)
- **Security**: `contextIsolation: true`, `sandbox: false` (for drag-drop), no nodeIntegration in renderer
- **Testing priority**: Unit focus on GPS parsing, hashing pipeline, preload bridge, API repository mocking

## Dispatch Hub Workers

The desktop app submits jobs to these Dispatch workers:

| Worker | Purpose | Job Types |
|--------|---------|-----------|
| hasher | Import pipeline, hashing, XMP creation | `hasher.import`, `hasher.blake3` |
| thumbnailer | Thumbnail/proxy generation | `thumbnailer.thumbnail`, `thumbnailer.proxy` |
| metadata-extractor | On-demand exiftool/ffprobe | `metadata-extractor.extract` |
| img-tagger | ML image tagging (RAM++, Florence-2) | `img-tagger.auto`, `img-tagger.ram` |
| web-archiver | Web page archiving | `web-archiver.capture` |
| gps-parser | GPS waypoint parsing | `gps-parser.parse`, `gps-parser.match` |
| timeline-parser | Date/timeline extraction | `timeline-parser.extract` |
| vocab-trainer | Vocabulary learning | `vocab-trainer.learn` |
| db-manager | Database maintenance | `db-manager.dedup`, `db-manager.stats` |

## File Naming Conventions

| Type | Convention | Example |
|------|------------|---------|
| Svelte components | PascalCase | `LocationCard.svelte` |
| Services/utilities | kebab-case | `hash-service.ts` |
| Domain models | PascalCase | `Location.ts` |
| IPC handlers | kebab-case with domain prefix | `location-handlers.ts` |
| API repositories | `api-` prefix | `api-location-repository.ts` |

## Dual Edition Awareness

App detects Light (online helpers) vs Offline Beast (bundled tiles + libpostal) at runtime with zero user toggle. Detection is file-based only:
- Check `resources/maps/*.mbtiles` for offline tiles
- Check `resources/libpostal/` for address parsing

Prefer graceful degradation (disabled buttons + tooltips) over throwing when resources are missing.

**Note**: Both editions require Dispatch Hub for data operations. "Offline Beast" refers to bundled map tiles and address parsing, not database access.

## Change Protocols

| Change Type | Required Steps |
|-------------|----------------|
| UI copy/layout | Update `docs/ui-spec.md` + summary in `docs/decisions/` |
| Visual/design change | Verify against `DESIGN.md`; document deviations in `docs/decisions/` |
| New component | Follow patterns in `docs/DESIGN_SYSTEM.md`; use design tokens |
| Schema change | **Requires Dispatch Hub migration** — coordinate with dispatch repo |
| New dependency | Log license in commit message |
| Deviation from spec | Document in `docs/decisions/` with decision ID; reference in commit |

## Troubleshooting

| Problem | Solution |
|---------|----------|
| "Ignored build scripts" warning | Run `pnpm reinstall` |
| Preload crashes silently | Check for ES module syntax in `.cjs` file; must use `require()` |
| "Cannot connect to Hub" | Verify `DISPATCH_HUB_URL` and that Hub is running |
| API requests failing | Check Hub logs, verify PostgreSQL is accessible |
| Native module mismatch | Run `pnpm --filter desktop rebuild` |
| Types out of sync | Run `pnpm --filter core build` first |
| WebSocket not receiving updates | Check Hub real-time service, verify Socket.IO connection |

## Package-Level Guides

Read these when working in specific packages:

- @packages/core/CLAUDE.md
- @packages/desktop/CLAUDE.md

## On-Demand References

Read these when the task touches the relevant area:

**Architecture & Data:**
- @docs/ARCHITECTURE.md
- @docs/DATA_FLOW.md

**Contracts:**
- @docs/contracts/gps.md
- @docs/contracts/hashing.md
- @docs/contracts/addressing.md
- @docs/contracts/dual-edition.md
- @docs/contracts/data-ownership.md

**Workflows:**
- @docs/workflows/gps.md — GPS-first workflows, confidence states, UI copy
- @docs/workflows/import.md — File import queue, hashing, folder organization
- @docs/workflows/mapping.md — Map interactions, clustering, filter logic
- @docs/workflows/addressing.md — Address lookup, normalization, manual overrides
- @docs/workflows/export.md — Export packaging and verification

**Design:**
- @docs/DESIGN_SYSTEM.md — Full design specifications, tokens, component patterns
- @DESIGN.md — Quick reference (colors, typography, anti-patterns)

## Authoritative Sources

| Source | Purpose |
|--------|---------|
| Dispatch Hub schema | Database schema lives in `dispatch` repo, not here |
| `docs/ui-spec.md` | Page layouts, navigation order, typography, component states |
| `docs/schema.md` | Field descriptions, enums, JSON schema contracts |
| `docs/decisions/*.md` | ADR-style reasoning for deviations; reference IDs in commits |

## Related Repositories

| Repo | Purpose |
|------|---------|
| `dispatch` | Hub + workers, PostgreSQL schema, job queue |
| `nightfoxfilms` | Sister app using same Dispatch infrastructure |
| `barbossa` | Sister app using same Dispatch infrastructure |

## Contact Surface

All prompts funnel through this CLAUDE.md. Do not copy instructions elsewhere.
