# @abandoned-archive/desktop

Electron desktop application for the Abandoned Archive media management system.

## Quick Start

```bash
# From monorepo root
pnpm install
pnpm --filter @abandoned-archive/desktop dev

# Or from this directory
pnpm dev
```

## Architecture

- **Electron 35+** - Desktop shell with native capabilities
- **Svelte 5** - Reactive UI with Runes syntax
- **Tailwind + Skeleton** - Styling with Braun design tokens
- **better-sqlite3** - Local database via Kysely
- **ExifTool + FFmpeg** - Media metadata and processing

## Directory Structure

```
packages/desktop/
├── electron/              # Main process code
│   ├── main/             # App lifecycle, window, IPC handlers
│   │   ├── ipc-handlers/ # IPC handler modules
│   │   ├── database.ts   # SQLite + Kysely setup
│   │   └── index.ts      # Main entry point
│   ├── preload/          # Context bridge (CommonJS!)
│   ├── repositories/     # Database access layer
│   └── services/         # Business logic services
├── src/                   # Renderer process (Svelte)
│   ├── components/       # UI components
│   ├── pages/            # Route pages
│   ├── stores/           # Svelte stores
│   └── App.svelte        # Root component
└── dist-electron/         # Built main process
```

## Key Commands

```bash
# Development
pnpm dev                   # Start with hot reload
pnpm build                 # Build for production
pnpm preview               # Preview production build

# Type checking
pnpm typecheck             # Check all TypeScript
pnpm typecheck:node        # Check main process only
pnpm typecheck:web         # Check renderer only

# Testing
pnpm test                  # Run Vitest tests
pnpm test:ui               # Vitest UI mode
```

## IPC Channels

All IPC communication follows the pattern `domain:action`:

| Domain | Description | Example Channels |
|--------|-------------|------------------|
| `location` | Location management | `location:list`, `location:create` |
| `media` | Media operations | `media:import`, `media:delete` |
| `tagging` | ML tagging (visual-buffet) | `tagging:getImageTags`, `tagging:retagImage` |
| `import:v2` | Import pipeline | `import:v2:start`, `import:v2:resume` |
| `settings` | App configuration | `settings:get`, `settings:set` |

## ML Tagging System

The app integrates **visual-buffet** for automatic image tagging:

- **RAM++**: 4,585 object-level tags
- **Florence-2**: Natural language captions
- **SigLIP**: Quality and view type scoring
- **PaddleOCR**: Text detection and extraction

Results are stored in:
1. **SQLite database** - For queries and filtering
2. **XMP sidecars** - For portability with images

See `/sme/ml-tagging-system.md` for full documentation.

## Preload Security

**Critical**: The preload script MUST be CommonJS (`.cjs`):

```javascript
// ✅ Correct - CommonJS in preload
const { contextBridge, ipcRenderer } = require('electron');

// ❌ Wrong - ESM import will fail at runtime
import { contextBridge, ipcRenderer } from 'electron';
```

The build config in `electron.vite.config.ts` handles this transformation.

## Database

SQLite database location:
- **macOS**: `~/Library/Application Support/@abandoned-archive/desktop/au-archive.db`
- **Windows**: `%APPDATA%/@abandoned-archive/desktop/au-archive.db`
- **Linux**: `~/.config/@abandoned-archive/desktop/au-archive.db`

Migrations are auto-applied on app start. See `/electron/main/database.ts`.

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `ARCHIVE_PATH` | Media archive location | Required |
| `VB_PYTHON_PATH` | Python for visual-buffet | `python3` |

## Related Documentation

- `/sme/ml-tagging-system.md` - ML tagging SME document
- `/sme/audits/` - Audit reports
- `/DEVELOPER.md` - Full developer guide
- `/CLAUDE.md` - AI coding standards
