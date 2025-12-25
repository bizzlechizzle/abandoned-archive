# Developer Guide

**Version:** 1.0.0
**Last Updated:** 2024-12-24

Comprehensive development guide for Abandoned Archive. This document covers architecture, setup, coding standards, and contribution guidelines.

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Project Structure](#2-project-structure)
3. [Setup](#3-setup)
4. [Coding Standards](#4-coding-standards)
5. [Package Guide](#5-package-guide)
6. [Database](#6-database)
7. [IPC Layer](#7-ipc-layer)
8. [CLI Development](#8-cli-development)
9. [Testing](#9-testing)
10. [Build & Deploy](#10-build--deploy)
11. [Troubleshooting](#11-troubleshooting)
12. [ML Tagging (Visual-Buffet Integration)](#12-ml-tagging-visual-buffet-integration)

---

## 1. Architecture Overview

### 1.1 Design Principles

**CLI-First Architecture**
- All business logic accessible via CLI before GUI
- GUI is a thin presentation layer over services
- Enables automation, scripting, and testing

**Domain-Driven Design**
- Clear domain boundaries (location, media, import, etc.)
- Domain models defined in `core` package
- Services encapsulate domain operations

**Monorepo Structure**
- pnpm workspaces for package management
- Shared types via `@aa/core`
- Shared services via `@aa/services`

### 1.2 Layer Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Presentation Layer                       │
│  ┌──────────────────────┐  ┌──────────────────────────────┐ │
│  │      CLI (aa)        │  │     Desktop GUI (Electron)   │ │
│  │  Commander.js + ora  │  │    Svelte 5 + Tailwind       │ │
│  └──────────┬───────────┘  └──────────────┬───────────────┘ │
└─────────────┼──────────────────────────────┼────────────────┘
              │                              │
              │         IPC Bridge           │
              │                              │
┌─────────────▼──────────────────────────────▼────────────────┐
│                      Service Layer                          │
│  ┌───────────────────────────────────────────────────────┐  │
│  │                   @aa/services                         │  │
│  │  location │ media │ import │ refmap │ web │ ai │ queue │  │
│  └────────────────────────────┬──────────────────────────┘  │
└───────────────────────────────┼─────────────────────────────┘
                                │
┌───────────────────────────────▼─────────────────────────────┐
│                     Infrastructure Layer                     │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  │
│  │   SQLite    │  │  File System │  │  External Tools    │  │
│  │ better-     │  │   Media      │  │  ExifTool, FFmpeg  │  │
│  │  sqlite3    │  │   Archive    │  │  Puppeteer, etc.   │  │
│  └─────────────┘  └─────────────┘  └─────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

### 1.3 Data Flow

```
User Input → CLI/GUI → Service → Repository → Database
                 ↓
              Validation (Zod)
                 ↓
              Business Logic
                 ↓
              External Tools (ExifTool, FFmpeg, etc.)
                 ↓
              File System Operations
```

---

## 2. Project Structure

### 2.1 Root Layout

```
abandoned-archive/
├── packages/               # Monorepo packages
│   ├── cli/               # CLI application (aa)
│   ├── services/          # Shared services
│   ├── core/              # Domain models
│   ├── desktop/           # Electron GUI
│   ├── mapcombine/        # GPS dedup CLI
│   ├── wake-n-blake/      # Hashing (submodule)
│   └── shoemaker/         # Thumbnails (submodule)
├── scripts/               # Utility scripts
├── docs/                  # Documentation
├── resources/             # Bundled assets
├── sme/                   # SME documents
├── CLAUDE.md             # AI assistant rules
├── techguide.md          # Technical guide
├── DEVELOPER.md          # This file
└── README.md             # User-facing docs
```

### 2.2 Package Structure

#### Core Package (`@aa/core`)
```
packages/core/
├── src/
│   ├── domain/
│   │   ├── location.ts    # Location entity + types
│   │   └── media.ts       # Media entity + types
│   ├── repositories/
│   │   ├── location-repository.ts
│   │   └── media-repository.ts
│   └── index.ts           # Package exports
├── tests/
└── package.json
```

#### Services Package (`@aa/services`)
```
packages/services/
├── src/
│   ├── location/          # Location domain
│   │   ├── location-service.ts
│   │   ├── geocoding-service.ts
│   │   ├── address-service.ts
│   │   ├── types.ts
│   │   └── index.ts
│   ├── media/             # Media domain
│   ├── import/            # Import domain
│   ├── refmap/            # Reference maps
│   ├── web/               # Web scraping
│   ├── ai/                # ML/AI features
│   ├── queue/             # Job queue
│   ├── archive/           # Backup/export
│   ├── database/          # DB operations
│   └── shared/            # Shared utilities
├── tests/
└── package.json
```

#### CLI Package (`@aa/cli`)
```
packages/cli/
├── src/
│   ├── commands/          # Command implementations
│   │   ├── location.ts
│   │   ├── media.ts
│   │   ├── import.ts
│   │   ├── export.ts
│   │   ├── refmap.ts
│   │   ├── web.ts
│   │   ├── ai.ts
│   │   ├── queue.ts
│   │   └── db.ts
│   ├── output/            # Output formatters
│   │   ├── table.ts
│   │   ├── json.ts
│   │   ├── progress.ts
│   │   └── spinner.ts
│   ├── cli.ts             # Entry point
│   └── config.ts          # Configuration
├── bin/
│   └── aa                 # Executable
├── tests/
└── package.json
```

#### Desktop Package (`@aa/desktop`)
```
packages/desktop/
├── electron/
│   ├── main/              # Main process
│   │   ├── index.ts       # Entry point
│   │   ├── database.ts    # DB connection
│   │   ├── ipc-handlers/  # IPC handlers
│   │   └── windows.ts     # Window management
│   ├── preload/           # Preload scripts
│   │   └── preload.cjs    # Context bridge
│   ├── services/          # (DEPRECATED - use @aa/services)
│   └── repositories/      # SQLite repositories
├── src/                   # Renderer (Svelte)
│   ├── components/        # UI components
│   ├── pages/             # Page components
│   ├── stores/            # Svelte stores
│   ├── lib/               # Utilities
│   └── types/             # TypeScript types
├── tests/
└── package.json
```

---

## 3. Setup

### 3.1 Prerequisites

| Requirement | Version | Notes |
|-------------|---------|-------|
| Node.js | 20+ LTS (22+ recommended) | Use nvm |
| pnpm | 10+ | `npm install -g pnpm` |
| Git | 2.x+ | For version control |
| Python | 3.8+ | For utility scripts |
| ExifTool | Latest | `brew install exiftool` |
| FFmpeg | Latest | `brew install ffmpeg` |

### 3.2 Installation

```bash
# Clone repository
git clone https://github.com/bizzlechizzle/abandoned-archive.git
cd abandoned-archive

# Initialize submodules
git submodule update --init --recursive

# Install dependencies
pnpm install

# Build packages
pnpm build

# Start development
pnpm dev
```

### 3.3 Development Commands

| Command | Description |
|---------|-------------|
| `pnpm dev` | Start development server |
| `pnpm build` | Build all packages |
| `pnpm test` | Run all tests |
| `pnpm lint` | Lint all packages |
| `pnpm format` | Format code with Prettier |
| `pnpm clean` | Remove build artifacts |
| `pnpm reinstall` | Clean and reinstall |

### 3.4 Environment Variables

```bash
# Database location (default: packages/desktop/data/au-archive.db)
AA_DATABASE_PATH=/path/to/database.db

# Archive directory (default: ~/Pictures/abandoned-archive)
AA_ARCHIVE_DIR=/path/to/archive

# Log level (default: info)
AA_LOG_LEVEL=debug

# AI provider (default: ollama)
AA_AI_PROVIDER=ollama

# Geocoding API key (optional)
GEOCODING_API_KEY=your-api-key
```

---

## 4. Coding Standards

### 4.1 TypeScript Guidelines

**Strict Mode**
```json
{
  "compilerOptions": {
    "strict": true,
    "noImplicitAny": true,
    "strictNullChecks": true
  }
}
```

**Naming Conventions**
```typescript
// Files: kebab-case
location-service.ts
geocoding-service.ts

// Classes: PascalCase
class LocationService { }

// Functions/methods: camelCase
function findLocationById(id: string) { }

// Constants: UPPER_SNAKE_CASE
const MAX_RETRY_ATTEMPTS = 3;

// Types/Interfaces: PascalCase
interface LocationInput { }
type MediaType = 'image' | 'video' | 'document';
```

**Prefer Functions Over Classes**
```typescript
// Preferred: Pure functions
export function createLocation(input: LocationInput): Location {
  return { ...input, id: generateId() };
}

// When needed: Classes for stateful services
export class LocationService {
  constructor(private db: Database) {}

  async findById(id: string): Promise<Location | null> {
    return this.db.query('SELECT * FROM locs WHERE locid = ?', [id]);
  }
}
```

**Error Handling**
```typescript
// Define custom errors
export class LocationNotFoundError extends Error {
  constructor(id: string) {
    super(`Location not found: ${id}`);
    this.name = 'LocationNotFoundError';
  }
}

// Use Result types for recoverable errors
type Result<T, E = Error> =
  | { success: true; data: T }
  | { success: false; error: E };

// Throw for unrecoverable errors
function assertDefined<T>(value: T | undefined): asserts value is T {
  if (value === undefined) {
    throw new Error('Value is undefined');
  }
}
```

### 4.2 Zod Validation

```typescript
import { z } from 'zod';

// Define schemas
export const LocationInputSchema = z.object({
  name: z.string().min(1).max(255),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  type: z.enum(['industrial', 'residential', 'commercial']).optional(),
  status: z.enum(['active', 'demolished', 'unknown']).default('unknown'),
});

// Infer types from schemas
export type LocationInput = z.infer<typeof LocationInputSchema>;

// Validate at boundaries
export function createLocation(rawInput: unknown): Location {
  const input = LocationInputSchema.parse(rawInput);
  return { ...input, id: generateId() };
}
```

### 4.3 Testing Guidelines

**File Naming**
```
location-service.ts       # Implementation
location-service.test.ts  # Unit tests
location-service.integration.test.ts  # Integration tests
```

**Test Structure**
```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { LocationService } from './location-service';

describe('LocationService', () => {
  let service: LocationService;

  beforeEach(() => {
    service = new LocationService(mockDb);
  });

  describe('findById', () => {
    it('returns location when found', async () => {
      const location = await service.findById('abc123');
      expect(location).toBeDefined();
      expect(location?.id).toBe('abc123');
    });

    it('returns null when not found', async () => {
      const location = await service.findById('nonexistent');
      expect(location).toBeNull();
    });

    it('throws on invalid id format', async () => {
      await expect(service.findById('')).rejects.toThrow();
    });
  });
});
```

### 4.4 Documentation

**JSDoc Comments**
```typescript
/**
 * Creates a new location in the database.
 *
 * @param input - Location creation input
 * @returns The created location with generated ID
 * @throws {ValidationError} If input is invalid
 * @throws {DatabaseError} If database operation fails
 *
 * @example
 * ```ts
 * const location = await createLocation({
 *   name: 'Old Factory',
 *   latitude: 42.123,
 *   longitude: -73.456,
 * });
 * ```
 */
export async function createLocation(input: LocationInput): Promise<Location> {
  // ...
}
```

---

## 5. Package Guide

### 5.1 Core Package

**Purpose:** Domain models, types, and repository interfaces.

**Key Exports:**
```typescript
// Domain entities
export { Location, LocationInput, LocationFilters } from './domain/location';
export { Media, MediaInput, MediaType } from './domain/media';

// Repository interfaces
export { LocationRepository } from './repositories/location-repository';
export { MediaRepository } from './repositories/media-repository';
```

**Usage:**
```typescript
import { Location, LocationInput } from '@aa/core';

const input: LocationInput = {
  name: 'Old Factory',
  latitude: 42.123,
  longitude: -73.456,
};
```

### 5.2 Services Package

**Purpose:** Business logic, domain operations, external integrations.

**Key Modules:**

| Module | Purpose | Key Functions |
|--------|---------|---------------|
| `location` | Location CRUD, geocoding | `createLocation`, `geocodeAddress` |
| `media` | Media processing | `extractMetadata`, `generateThumbnail` |
| `import` | File import pipeline | `scanDirectory`, `runImport` |
| `refmap` | Reference map operations | `importKML`, `deduplicatePoints` |
| `web` | Web scraping | `captureUrl`, `scrapeSelectors` |
| `ai` | ML/AI features | `tagImage`, `extractDates` |
| `queue` | Job queue | `enqueue`, `processJobs` |
| `archive` | Backup/export | `createBagIt`, `backupDatabase` |

**Usage:**
```typescript
import { LocationService, GeocodingService } from '@aa/services/location';

const locationService = new LocationService(db);
const geocodingService = new GeocodingService();

// Create location with geocoding
const address = '123 Main St, Albany, NY';
const coords = await geocodingService.geocodeAddress(address);
const location = await locationService.create({
  name: 'Old Factory',
  ...coords,
});
```

### 5.3 CLI Package

**Purpose:** Command-line interface for all operations.

**Commands:**
```bash
aa location list|show|create|update|delete|merge
aa media list|show|thumbnail|metadata|tag
aa import scan|run|status|history
aa export bagit|json|csv|backup
aa refmap import|list|dedup|match|enrich
aa web capture|scrape|download|batch
aa ai tag|extract-dates|ocr|batch|stats
aa queue add|status|run|dead-letter
aa db init|info|backup|restore|integrity
aa config show|set|get|reset
```

**Development:**
```bash
# Install CLI locally
cd packages/cli
pnpm link

# Test CLI
aa --version
aa location list
```

### 5.4 Desktop Package

**Purpose:** Electron GUI application.

**Key Components:**

| Directory | Purpose |
|-----------|---------|
| `electron/main` | Main process, IPC handlers |
| `electron/preload` | Context bridge |
| `electron/repositories` | SQLite data access |
| `src/pages` | Page components |
| `src/components` | Reusable UI components |
| `src/stores` | Svelte state management |

**IPC Pattern:**
```typescript
// Main process (handler)
ipcMain.handle('location:findById', async (_, id: string) => {
  const location = await locationService.findById(id);
  return location;
});

// Preload (bridge)
contextBridge.exposeInMainWorld('electron', {
  location: {
    findById: (id: string) => ipcRenderer.invoke('location:findById', id),
  },
});

// Renderer (usage)
const location = await window.electron.location.findById('abc123');
```

---

## 6. Database

### 6.1 Schema Overview

**Core Tables:**
| Table | Purpose | Primary Key |
|-------|---------|-------------|
| `locs` | Locations | `locid` (BLAKE3 16-char) |
| `slocs` | Sub-locations | `subid` (BLAKE3 16-char) |
| `imgs` | Images | `imghash` (BLAKE3 16-char) |
| `vids` | Videos | `vidhash` (BLAKE3 16-char) |
| `docs` | Documents | `dochash` (BLAKE3 16-char) |
| `maps` | Historical maps | `maphash` (BLAKE3 16-char) |

**Support Tables:**
| Table | Purpose |
|-------|---------|
| `settings` | Key-value config |
| `users` | User accounts |
| `projects` | Project organization |
| `notes` | Location annotations |
| `imports` | Import session tracking |
| `jobs` | Async job queue |

### 6.2 Migrations

Migrations are inline in `database.ts`:

```typescript
// Check if column exists
const columns = sqlite.pragma('table_info(locs)');
if (!columns.some(col => col.name === 'new_column')) {
  sqlite.exec('ALTER TABLE locs ADD COLUMN new_column TEXT');
}
```

**Migration Guidelines:**
1. Check existence before modifying
2. Use transactions for complex migrations
3. Log migration progress
4. Test migration on copy of production data

### 6.3 Queries

**Repository Pattern:**
```typescript
export class SqliteLocationRepository implements LocationRepository {
  constructor(private db: Database) {}

  async findById(id: string): Promise<Location | null> {
    return this.db
      .selectFrom('locs')
      .selectAll()
      .where('locid', '=', id)
      .executeTakeFirst();
  }

  async findAll(filters: LocationFilters): Promise<Location[]> {
    let query = this.db.selectFrom('locs').selectAll();

    if (filters.type) {
      query = query.where('type', '=', filters.type);
    }
    if (filters.status) {
      query = query.where('status', '=', filters.status);
    }

    return query.execute();
  }
}
```

---

## 7. IPC Layer

### 7.1 Handler Structure

```typescript
// packages/desktop/electron/main/ipc-handlers/locations.ts
import { ipcMain } from 'electron';
import { LocationService } from '@aa/services/location';
import { LocationInputSchema } from '@aa/core';

export function registerLocationHandlers(service: LocationService) {
  ipcMain.handle('location:findAll', async (_, filters) => {
    return service.findAll(filters);
  });

  ipcMain.handle('location:findById', async (_, id: string) => {
    return service.findById(id);
  });

  ipcMain.handle('location:create', async (_, rawInput) => {
    const input = LocationInputSchema.parse(rawInput);
    return service.create(input);
  });

  ipcMain.handle('location:update', async (_, id: string, rawInput) => {
    const input = LocationInputSchema.partial().parse(rawInput);
    return service.update(id, input);
  });

  ipcMain.handle('location:delete', async (_, id: string) => {
    return service.delete(id);
  });
}
```

### 7.2 Preload Bridge

```javascript
// packages/desktop/electron/preload/preload.cjs
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electron', {
  location: {
    findAll: (filters) => ipcRenderer.invoke('location:findAll', filters),
    findById: (id) => ipcRenderer.invoke('location:findById', id),
    create: (input) => ipcRenderer.invoke('location:create', input),
    update: (id, input) => ipcRenderer.invoke('location:update', id, input),
    delete: (id) => ipcRenderer.invoke('location:delete', id),
  },
  // ... other domains
});
```

### 7.3 Type Definitions

```typescript
// packages/desktop/src/types/electron.d.ts
import { Location, LocationInput, LocationFilters } from '@aa/core';

declare global {
  interface Window {
    electron: {
      location: {
        findAll(filters?: LocationFilters): Promise<Location[]>;
        findById(id: string): Promise<Location | null>;
        create(input: LocationInput): Promise<Location>;
        update(id: string, input: Partial<LocationInput>): Promise<Location>;
        delete(id: string): Promise<void>;
      };
      // ... other domains
    };
  }
}
```

---

## 8. CLI Development

### 8.1 Command Structure

```typescript
// packages/cli/src/commands/location.ts
import { Command } from 'commander';
import { LocationService } from '@aa/services/location';
import { printTable, printJson, spinner } from '../output';

export function registerLocationCommands(program: Command) {
  const location = program
    .command('location')
    .description('Manage locations');

  location
    .command('list')
    .description('List all locations')
    .option('--type <type>', 'Filter by type')
    .option('--status <status>', 'Filter by status')
    .option('--json', 'Output as JSON')
    .action(async (options) => {
      const service = new LocationService(getDatabase());
      const locations = await service.findAll({
        type: options.type,
        status: options.status,
      });

      if (options.json) {
        printJson(locations);
      } else {
        printTable(locations, ['id', 'name', 'type', 'status']);
      }
    });

  location
    .command('show <id>')
    .description('Show location details')
    .option('--json', 'Output as JSON')
    .action(async (id, options) => {
      const service = new LocationService(getDatabase());
      const location = await service.findById(id);

      if (!location) {
        console.error(`Location not found: ${id}`);
        process.exit(1);
      }

      if (options.json) {
        printJson(location);
      } else {
        printLocationDetails(location);
      }
    });

  // ... more commands
}
```

### 8.2 Output Helpers

```typescript
// packages/cli/src/output/table.ts
import Table from 'cli-table3';

export function printTable<T extends Record<string, unknown>>(
  data: T[],
  columns: (keyof T)[],
) {
  const table = new Table({
    head: columns.map(String),
    style: { head: ['cyan'] },
  });

  for (const row of data) {
    table.push(columns.map((col) => String(row[col] ?? '')));
  }

  console.log(table.toString());
}

// packages/cli/src/output/spinner.ts
import ora from 'ora';

export function spinner(text: string) {
  return ora(text);
}

export async function withSpinner<T>(
  text: string,
  fn: () => Promise<T>,
): Promise<T> {
  const spin = ora(text).start();
  try {
    const result = await fn();
    spin.succeed();
    return result;
  } catch (error) {
    spin.fail();
    throw error;
  }
}
```

---

## 9. Testing

### 9.1 Test Setup

```typescript
// vitest.config.ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      exclude: ['**/node_modules/**', '**/dist/**'],
    },
  },
});
```

### 9.2 Running Tests

```bash
# Run all tests
pnpm test

# Run tests for specific package
pnpm --filter @aa/services test

# Run with coverage
pnpm test -- --coverage

# Run specific file
pnpm test -- location-service.test.ts

# Watch mode
pnpm test -- --watch
```

### 9.3 Test Examples

**Unit Test:**
```typescript
import { describe, it, expect, vi } from 'vitest';
import { LocationService } from './location-service';

describe('LocationService', () => {
  const mockDb = {
    selectFrom: vi.fn().mockReturnThis(),
    selectAll: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    executeTakeFirst: vi.fn(),
  };

  it('returns location when found', async () => {
    const expected = { locid: 'abc123', locnam: 'Test' };
    mockDb.executeTakeFirst.mockResolvedValue(expected);

    const service = new LocationService(mockDb as any);
    const result = await service.findById('abc123');

    expect(result).toEqual(expected);
  });
});
```

**Integration Test:**
```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestDatabase, destroyTestDatabase } from './test-utils';
import { LocationService } from './location-service';

describe('LocationService Integration', () => {
  let db: Database;
  let service: LocationService;

  beforeAll(async () => {
    db = await createTestDatabase();
    service = new LocationService(db);
  });

  afterAll(async () => {
    await destroyTestDatabase(db);
  });

  it('creates and retrieves location', async () => {
    const input = { locnam: 'Test Location' };
    const created = await service.create(input);

    expect(created.locid).toBeDefined();

    const retrieved = await service.findById(created.locid);
    expect(retrieved?.locnam).toBe('Test Location');
  });
});
```

---

## 10. Build & Deploy

### 10.1 Development Build

```bash
# Start dev server (hot reload)
pnpm dev

# Build all packages
pnpm build

# Build specific package
pnpm --filter @aa/desktop build
```

### 10.2 Production Build

```bash
# Build for distribution
cd packages/desktop
pnpm build:dist

# Output locations:
# - macOS: release/Abandoned Archive-{version}.dmg
# - Linux: release/Abandoned Archive-{version}.AppImage
# - Windows: release/Abandoned Archive Setup {version}.exe
```

### 10.3 Electron Builder Config

```json
{
  "appId": "com.abandonedupstate.archive",
  "productName": "Abandoned Archive",
  "directories": {
    "output": "release"
  },
  "mac": {
    "target": ["dmg"],
    "hardenedRuntime": true,
    "entitlements": "resources/entitlements.mac.plist"
  },
  "linux": {
    "target": ["AppImage"]
  },
  "win": {
    "target": ["nsis"]
  }
}
```

---

## 11. Troubleshooting

### 11.1 Common Issues

**"Electron failed to install correctly"**
```bash
pnpm reinstall
```

**"Failed to resolve entry for package @aa/core"**
```bash
pnpm build:core
```

**"better-sqlite3 requires native rebuild"**
```bash
pnpm --filter @aa/desktop rebuild
```

**"Database locked"**
- Close other Electron instances
- Check for background processes

**"Preload script error"**
- Ensure `preload.cjs` uses CommonJS syntax
- No `import` statements in preload

### 11.2 Debug Mode

```bash
# Enable debug logging
DEBUG=aa:* pnpm dev

# Electron DevTools
# Press Cmd+Option+I (macOS) or Ctrl+Shift+I (Windows/Linux)
```

### 11.3 Getting Help

1. Check existing issues on GitHub
2. Search documentation
3. Ask in Discord/Slack
4. Create new issue with reproduction steps

---

## 12. ML Tagging (Visual-Buffet Integration)

### 12.1 Architecture Overview

The ML tagging system uses Visual-Buffet, a Python-based multi-model inference pipeline:

```
┌─────────────────────────────────────────────────────────────────┐
│                      Import Pipeline                             │
│  ┌──────────┐   ┌───────────────────────────────────────────┐  │
│  │  Image   │   │            Visual-Buffet                   │  │
│  │  Import  │──▶│  ┌─────────┐ ┌─────────┐ ┌─────────┐     │  │
│  └──────────┘   │  │ RAM++   │ │Florence │ │ SigLIP  │     │  │
│                 │  │ (4585   │ │   -2    │ │ (zero-  │     │  │
│                 │  │  tags)  │ │(caption)│ │  shot)  │     │  │
│                 │  └────┬────┘ └────┬────┘ └────┬────┘     │  │
│                 │       │           │           │           │  │
│                 │       └───────────┴───────────┘           │  │
│                 │                   │                        │  │
│                 │            OCR Detection                   │  │
│                 │          (SigLIP zero-shot)               │  │
│                 │                   │                        │  │
│                 │              if detected                   │  │
│                 │                   ▼                        │  │
│                 │            ┌───────────┐                   │  │
│                 │            │PaddleOCR  │                   │  │
│                 │            │(full text)│                   │  │
│                 │            └─────┬─────┘                   │  │
│                 └──────────────────┼────────────────────────┘  │
│                                    ▼                            │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                    Output Storage                        │   │
│  │  ┌─────────────┐                    ┌─────────────────┐ │   │
│  │  │   SQLite    │◀──────────────────▶│  XMP Sidecar    │ │   │
│  │  │  (database) │                    │  (.xmp files)   │ │   │
│  │  └─────────────┘                    └─────────────────┘ │   │
│  └─────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

### 12.2 ML Pipeline Execution

**Always run on import (MAX quality):**
1. **RAM++** - 4,585 tag vocabulary, object-level tagging
2. **Florence-2** - Dense captioning + derived tags
3. **SigLIP** - Zero-shot scoring for quality/view type

**Conditional OCR pipeline:**
1. **SigLIP zero-shot** - Text detection ("text", "sign", "writing")
2. If confidence > 0.3 → **PaddleOCR** - Full text extraction

### 12.3 Data Model

```typescript
// Database fields (imgs table)
interface ImageMLFields {
  auto_tags: string | null;           // Comma-separated tags
  auto_tags_source: string | null;    // "visual-buffet"
  auto_tags_confidence: string | null; // JSON: {"tag": 0.95, ...}
  auto_tags_by_source: string | null; // JSON: {rampp: [], florence2: [], siglip: []}
  auto_tags_at: string | null;        // ISO timestamp
  auto_caption: string | null;        // Florence-2 caption
  quality_score: number | null;       // 0-1 score
  view_type: string | null;           // "exterior", "interior", "aerial", etc.
  ocr_text: string | null;            // Extracted text
  ocr_has_text: number | null;        // 0 or 1
  vb_processed_at: string | null;     // Processing timestamp
  vb_error: string | null;            // Error message if failed
}
```

### 12.4 IPC Handlers

**File:** `packages/desktop/electron/main/ipc-handlers/tagging.ts`

| Handler | Description | Parameters |
|---------|-------------|------------|
| `tagging:getImageTags` | Get ML insights for image | `imghash: string` |
| `tagging:editImageTags` | Manually edit tags | `imghash: string, tags: string[]` |
| `tagging:retagImage` | Queue for re-processing | `imghash: string` |
| `tagging:clearImageTags` | Clear all ML data | `imghash: string` |
| `tagging:getLocationSummary` | Aggregated tags for location | `locid: string` |
| `tagging:reaggregateLocation` | Recalculate location summary | `locid: string` |
| `tagging:getQueueStats` | Job queue statistics | none |
| `tagging:queueUntaggedImages` | Queue unprocessed images | `locid?: string` |
| `tagging:getServiceStatus` | Check visual-buffet availability | none |
| `tagging:testConnection` | Test Python service | none |

### 12.5 UI Integration (MediaViewer)

**File:** `packages/desktop/src/components/MediaViewer.svelte`

The MediaViewer lightbox includes a two-tier navigation:

1. **Info Tab** - Standard EXIF metadata
2. **ML Insights Tab** - Visual-buffet results with:
   - Collapsible sections per model (RAM++, Florence-2, SigLIP)
   - Confidence bars for each tag
   - Quality score badge
   - View type badge
   - OCR text blocks with confidence

### 12.6 XMP Sidecar Format

Tags are written to XMP sidecars using exiftool:

```xml
<x:xmpmeta>
  <rdf:RDF>
    <rdf:Description>
      <!-- Standard XMP fields -->
      <dc:subject>
        <rdf:Bag>
          <rdf:li>abandoned</rdf:li>
          <rdf:li>industrial</rdf:li>
        </rdf:Bag>
      </dc:subject>
      <dc:description>A decaying factory corridor...</dc:description>

      <!-- Custom namespace for ML data -->
      <aa:MLSource>visual-buffet</aa:MLSource>
      <aa:MLConfidence>{"abandoned":0.95,...}</aa:MLConfidence>
      <aa:QualityScore>0.82</aa:QualityScore>
      <aa:ViewType>interior</aa:ViewType>
      <aa:OCRText>DANGER: KEEP OUT</aa:OCRText>
    </rdf:Description>
  </rdf:RDF>
</x:xmpmeta>
```

### 12.7 Service Configuration

**File:** `packages/desktop/electron/services/visual-buffet-service.ts`

```typescript
interface VisualBuffetConfig {
  pythonPath: string;        // Path to Python executable
  modelPath: string;         // Path to model weights
  plugins: string[];         // ["ram_plus", "florence_2", "siglip"]
  ocrEnabled: boolean;       // Enable OCR detection
  ocrThreshold: number;      // SigLIP confidence threshold (0.3)
  maxConcurrent: number;     // Parallel processing limit
}
```

### 12.8 Testing ML Pipeline

```bash
# Test visual-buffet directly
python -m visual_buffet tag /path/to/image.jpg \
  --plugin ram_plus --plugin florence_2 --plugin siglip

# Test IPC handler
# In Electron DevTools console:
await window.electron.tagging.testConnection()
await window.electron.tagging.getServiceStatus()

# Queue test image
await window.electron.tagging.retagImage('abc123hash')
```

---

## Appendix: Quick Reference

### Commands

| Action | Command |
|--------|---------|
| Install deps | `pnpm install` |
| Start dev | `pnpm dev` |
| Build all | `pnpm build` |
| Run tests | `pnpm test` |
| Lint | `pnpm lint` |
| Format | `pnpm format` |
| Clean | `pnpm clean` |
| Reinstall | `pnpm reinstall` |

### File Locations

| File | Purpose |
|------|---------|
| `CLAUDE.md` | AI assistant rules |
| `techguide.md` | Technical guide |
| `DEVELOPER.md` | This file |
| `packages/*/package.json` | Package configs |
| `packages/desktop/electron/main/database.ts` | Database schema |

### Links

- [GitHub Repository](https://github.com/bizzlechizzle/abandoned-archive)
- [Issue Tracker](https://github.com/bizzlechizzle/abandoned-archive/issues)

---

**End of Developer Guide**
