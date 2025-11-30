# Script Registry — Abandoned Archive v0.1.0

> Every script under 300 LOC, documented here. If it's not here, it shouldn't exist.

---

## Scripts

### scripts/setup.sh

- **Path**: `scripts/setup.sh`
- **Lines**: 514 ⚠️ (exceeds 300 LOC guideline)
- **Runtime**: bash
- **Purpose**: Full setup script for AU Archive - installs all dependencies, builds packages, downloads Research Browser
- **Usage**:
  ```bash
  ./scripts/setup.sh              # Full setup
  ./scripts/setup.sh --skip-optional  # Skip libpostal, exiftool, ffmpeg
  ./scripts/setup.sh --skip-browser   # Skip Ungoogled Chromium (~150MB)
  ./scripts/setup.sh --verbose        # Show detailed output
  ./scripts/setup.sh --help           # Show all options

  # Also available via pnpm:
  pnpm init              # Full setup
  pnpm init:quick        # Skip optional dependencies
  ```
- **Inputs**: CLI flags (--skip-optional, --skip-browser, --verbose, --help)
- **Outputs**: stdout (colored progress), installed dependencies
- **Side Effects**: Installs npm packages, native modules, optional tools, downloads browser
- **Dependencies**: bash, curl, Node.js, pnpm, git
- **Last Verified**: 2025-11-30

---

### scripts/check-deps.sh

- **Path**: `scripts/check-deps.sh`
- **Lines**: 131
- **Runtime**: bash
- **Purpose**: Quick dependency health check - verifies all required and optional tools are installed
- **Usage**:
  ```bash
  ./scripts/check-deps.sh
  pnpm deps              # via package.json script
  ```
- **Inputs**: None
- **Outputs**: stdout (colored status for each dependency)
- **Side Effects**: None (read-only)
- **Dependencies**: bash
- **Last Verified**: 2025-11-30

---

### scripts/test-region-gaps.ts

- **Path**: `scripts/test-region-gaps.ts`
- **Lines**: 258
- **Runtime**: ts-node
- **Purpose**: Test region gap coverage across all 50 states + DC + territories
- **Usage**:
  ```bash
  npx ts-node scripts/test-region-gaps.ts
  ```
- **Inputs**: None
- **Outputs**: stdout (test results, failures with gap details)
- **Side Effects**: None (read-only test)
- **Dependencies**: ts-node, typescript, @au-archive/core
- **Last Verified**: 2025-11-30

Generates test locations for all 54 states/territories across 5 scenarios:
- Full Data (GPS + Address)
- GPS Only
- Address Only (State + County)
- State Only
- Minimal (Name Only)

Validates that all 8 region fields are populated without gaps.

---

### scripts/run-dedup.py

- **Path**: `scripts/run-dedup.py`
- **Lines**: 235
- **Runtime**: python3
- **Purpose**: GPS-based deduplication for ref_map_points table (Python version)
- **Usage**:
  ```bash
  python3 scripts/run-dedup.py
  ```
- **Inputs**: None (reads from database)
- **Outputs**: stdout (progress, statistics)
- **Side Effects**:
  - Creates database backup before modifications
  - Runs Migration 39 if needed (aka_names column)
  - Merges duplicate pins at same GPS coordinates
  - Updates aka_names with alternate names
  - Deletes duplicate records
- **Dependencies**: python3, sqlite3 (built-in)
- **Last Verified**: 2025-11-30

Uses Python's built-in sqlite3 module to avoid native module issues with Electron's Node version.

---

### scripts/run-dedup.mjs

- **Path**: `scripts/run-dedup.mjs`
- **Lines**: 245
- **Runtime**: node (ES modules)
- **Purpose**: GPS-based deduplication for ref_map_points table (Node.js version)
- **Usage**:
  ```bash
  node scripts/run-dedup.mjs
  ```
- **Inputs**: None (reads from database)
- **Outputs**: stdout (progress, statistics)
- **Side Effects**: Same as run-dedup.py
- **Dependencies**: node, better-sqlite3
- **Last Verified**: 2025-11-30

**Note**: Requires better-sqlite3 native module built for your Node.js version (not Electron). Use the Python version if you encounter native module issues.

**Note**: This is a duplicate implementation of run-dedup.py. Consider consolidating.

---

### scripts/run-dedup.sql

- **Path**: `scripts/run-dedup.sql`
- **Lines**: 45
- **Runtime**: sqlite3
- **Purpose**: Analysis-only SQL for ref_map_points duplicates (no modifications)
- **Usage**:
  ```bash
  sqlite3 packages/desktop/data/au-archive.db < scripts/run-dedup.sql
  ```
- **Inputs**: Database file path
- **Outputs**: stdout (duplicate groups, statistics)
- **Side Effects**: None (read-only queries)
- **Dependencies**: sqlite3 CLI
- **Last Verified**: 2025-11-30

Useful for previewing what the dedup scripts will merge before running them.

---

### resetdb.py

- **Path**: `resetdb.py` (root directory)
- **Lines**: 233
- **Runtime**: python3
- **Purpose**: Reset database and archive files for development/testing
- **Usage**:
  ```bash
  python3 resetdb.py              # Interactive (prompts for confirmation)
  python3 resetdb.py -f           # Force reset without confirmation
  python3 resetdb.py --db-only    # Only remove database, keep config
  python3 resetdb.py -a /path/to/archive  # Also clean archive support dirs
  ```
- **Inputs**: CLI flags (-f, --db-only, -a)
- **Outputs**: stdout (files removed)
- **Side Effects**:
  - Removes SQLite database file (both production and dev locations)
  - Removes bootstrap config file
  - Removes backup directory
  - Optionally removes archive support directories (.thumbnails, .previews, .posters)
- **Dependencies**: python3
- **Last Verified**: 2025-11-30

Detects platform (macOS/Linux/Windows) and locates config directory accordingly.

---

## Scripts Exceeding 300 LOC

| Script | Lines | Status | Action |
|--------|-------|--------|--------|
| `scripts/setup.sh` | 514 | ⚠️ Exceeds | Exempt - complex multi-phase installer with extensive error handling |

---

## Duplicate Scripts

| Script A | Script B | Status | Recommendation |
|----------|----------|--------|----------------|
| `run-dedup.py` | `run-dedup.mjs` | Duplicate | Keep Python version (no native module issues), deprecate .mjs |

---

## Package.json Script Mappings

| pnpm Command | Underlying Script |
|--------------|-------------------|
| `pnpm init` | `scripts/setup.sh` |
| `pnpm init:quick` | `scripts/setup.sh --skip-optional` |
| `pnpm deps` | `scripts/check-deps.sh` |

---

## Adding New Scripts

1. Keep under 300 LOC (one focused function)
2. Add shebang and runtime comment at top
3. Document in this file with all fields
4. Add to package.json if frequently used
5. Test on all supported platforms

---

End of Script Registry
