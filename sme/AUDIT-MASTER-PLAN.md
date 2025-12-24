# Abandoned Archive - Master Audit & Fix Plan

**Date:** 2024-12-24
**Status:** Ready for Implementation
**Target:** A+/100/100 per CLAUDE.md standards

---

## Executive Summary

Comprehensive IRS-level audit completed across CLI, Services, Desktop, and Documentation.
This document provides the complete fix plan with actionable tasks prioritized by severity.

### Overall Health Scores

| Package | Score | Status | Critical Issues |
|---------|-------|--------|-----------------|
| CLI | 70% | Needs Work | 3 critical schema issues |
| Services | 80% | Good | 1 critical (LocationService only) |
| Desktop | 75% | Good | CLI Bridge not initialized |
| Documentation | 65% | Needs Work | 4 critical missing docs |
| Tests | 40% | Poor | Most packages untested |

---

## CRITICAL ISSUES (Must Fix Before Release)

### C1. Schema Mismatch - GPS Fields [CLI]
**Severity:** BLOCKING
**Files:** `export.ts`, `refmap.ts`
**Issue:** Code references `lat`/`lon`, schema defines `gps_lat`/`gps_lng`
**Impact:** All geospatial exports fail silently
**Fix:** Update field references in export.ts lines 44, 218, 277, 300-315 and refmap.ts lines 280-281

### C2. Missing Media Table Abstraction [CLI]
**Severity:** BLOCKING
**Files:** `import.ts`, `export.ts`, `media.ts`, `db.ts`
**Issue:** Commands reference `media` table that doesn't exist. Schema defines `imgs`, `vids`, `docs`
**Impact:** All media operations fail
**Fix:** Either create unified `media` view or update commands to use separate tables

### C3. CLI Bridge Not Initialized [Desktop]
**Severity:** CRITICAL
**Files:** `electron/main/index.ts`, `electron/services/cli-bridge.ts`
**Issue:** Bridge exists but `initCliBridge(db)` never called in startup
**Impact:** @aa/services not actually being used by desktop
**Fix:** Add bridge initialization in startupOrchestrator

### C4. Missing Package Documentation [Services]
**Severity:** CRITICAL
**Files:** MISSING `packages/services/CLAUDE.md`, `packages/services/README.md`
**Issue:** New package has no documentation
**Impact:** Contributor onboarding blocked
**Fix:** Create package documentation with API reference

---

## HIGH PRIORITY ISSUES

### H1. SQL Injection in db exec [CLI]
**Severity:** HIGH
**File:** `db.ts` line 244-262
**Issue:** Raw user SQL accepted without validation
**Fix:** Add query validation or restrict to admin use

### H2. Incomplete media delete [CLI]
**Severity:** HIGH
**File:** `media.ts` line 296
**Issue:** `--delete-files` flag accepted but not implemented
**Fix:** Implement physical file deletion

### H3. Missing Input Validation [CLI]
**Severity:** HIGH
**Files:** All command files
**Issue:** No GPS bounds checking, no text length limits
**Fix:** Add Zod validation for all user inputs

### H4. Missing Services [Services]
**Severity:** HIGH
**Issue:** Only LocationService exists. Need: MediaService, ImportService, ExportService
**Fix:** Implement remaining services

### H5. Missing CLI CLAUDE.md [CLI]
**Severity:** HIGH
**File:** MISSING `packages/cli/CLAUDE.md`
**Fix:** Create package-level documentation

---

## MEDIUM PRIORITY ISSUES

### M1. Async/Await Misuse [Services]
**Issue:** Methods marked async but use synchronous better-sqlite3
**Fix:** Remove async where not needed or add proper async patterns

### M2. Database Integrity Check [Desktop]
**Issue:** No integrity verification on startup
**Fix:** Add database integrity check in startupOrchestrator

### M3. Query Result Caching [Desktop]
**Issue:** Locations loaded fresh every request
**Fix:** Add caching layer for frequently accessed data

### M4. Test Coverage [All]
**Issue:** Only ~40% test coverage
**Fix:** Comprehensive test suite needed

---

## LOW PRIORITY ISSUES

### L1. Duplicate Utility Functions
**Issue:** `formatBytes` duplicated in media.ts and db.ts
**Fix:** Extract to shared utility

### L2. Fuzzy ID Matching
**Issue:** Partial IDs can match incorrectly
**Fix:** Use exact match by default

---

## IMPLEMENTATION PLAN

### Phase 3A: Fix Critical Schema Issues (2-3 hours)

```bash
# Fix GPS field names in export.ts
sed -i 's/\.lat/.gps_lat/g' packages/cli/src/commands/export.ts
sed -i 's/\.lon/.gps_lng/g' packages/cli/src/commands/export.ts

# Fix GPS field names in refmap.ts
sed -i 's/\.lat/.gps_lat/g' packages/cli/src/commands/refmap.ts
sed -i 's/\.lon/.gps_lng/g' packages/cli/src/commands/refmap.ts
```

Tasks:
1. Update export.ts GPS field references (C1)
2. Update refmap.ts GPS field references (C1)
3. Create media view or update media commands (C2)
4. Add CLI Bridge initialization (C3)

### Phase 3B: Fix High Priority Issues (4-6 hours)

Tasks:
1. Add SQL validation to db exec command (H1)
2. Implement media file deletion (H2)
3. Add Zod validation to all CLI inputs (H3)
4. Implement MediaService in @aa/services (H4)

### Phase 3C: Fix Medium Priority Issues (3-4 hours)

Tasks:
1. Fix async/await patterns in services (M1)
2. Add database integrity checks (M2)

### Phase 4: Comprehensive Testing (4-6 hours)

Tasks:
1. Add integration tests for all CLI commands
2. Add unit tests for LocationService edge cases
3. Add tests for MediaService
4. Add tests for export/import operations

### Phase 5: Documentation (3-4 hours)

Create:
1. `packages/services/CLAUDE.md` - Package development guide
2. `packages/services/README.md` - API reference
3. `packages/cli/CLAUDE.md` - CLI development guide
4. `sme/services-api-reference.md` - Formal API documentation
5. Update README.md with complete CLI reference

### Phase 6: Final Verification (1-2 hours)

Tasks:
1. Run full test suite
2. Verify all CLI commands work
3. Verify desktop app starts and uses services
4. Run linting
5. Final documentation review

---

## Detailed Fix Instructions

### Fix C1: GPS Field Names in export.ts

```typescript
// BEFORE (line 44)
if (filters.north && filters.south) {
  query += ' AND lat BETWEEN ? AND ?';
}

// AFTER
if (filters.north && filters.south) {
  query += ' AND gps_lat BETWEEN ? AND ?';
}

// BEFORE (line 218)
coordinates: [row.lon, row.lat]

// AFTER
coordinates: [row.gps_lng, row.gps_lat]
```

### Fix C2: Media Table Abstraction

Option A: Create unified view
```sql
CREATE VIEW media AS
SELECT imghash as hash, 'image' as media_type, imgnam as name, ... FROM imgs
UNION ALL
SELECT vidhash as hash, 'video' as media_type, vidnam as name, ... FROM vids
UNION ALL
SELECT dochash as hash, 'document' as media_type, docnam as name, ... FROM docs;
```

Option B: Update commands to use type-specific queries (preferred)
```typescript
// In media.ts - detect type and query appropriate table
function getMediaTable(type: string): string {
  switch(type) {
    case 'image': return 'imgs';
    case 'video': return 'vids';
    case 'document': return 'docs';
    default: throw new Error(`Unknown media type: ${type}`);
  }
}
```

### Fix C3: CLI Bridge Initialization

```typescript
// In electron/main/index.ts - add to startupOrchestrator
import { CliBridge, initCliBridge } from '../services/cli-bridge';

// In startupOrchestrator after db init:
const bridge = initCliBridge(db);
global.cliBridge = bridge;
```

### Fix H1: SQL Injection Prevention

```typescript
// In db.ts exec command
const DANGEROUS_PATTERNS = /DROP|TRUNCATE|DELETE FROM|ALTER|CREATE/i;

if (DANGEROUS_PATTERNS.test(sql)) {
  console.error(chalk.red('Dangerous SQL operation blocked'));
  console.log(chalk.yellow('Use --force to execute dangerous commands'));
  process.exit(1);
}
```

---

## Testing Checklist

### CLI Commands (50+ tests needed)

- [ ] location list (with filters)
- [ ] location create (validation)
- [ ] location update (partial)
- [ ] location delete (cascade)
- [ ] location duplicates
- [ ] location stats
- [ ] media list (by type)
- [ ] media assign/unassign
- [ ] media delete (with files)
- [ ] import dir (recursive)
- [ ] import file (single)
- [ ] export locations (all formats)
- [ ] export gpx (with GPS)
- [ ] refmap import
- [ ] refmap match
- [ ] collection CRUD
- [ ] tag CRUD
- [ ] db operations
- [ ] config operations

### Edge Cases

- [ ] Empty database
- [ ] Large dataset (10K+ locations)
- [ ] Invalid GPS coordinates
- [ ] Unicode in names
- [ ] Path with spaces
- [ ] Missing files on import
- [ ] Duplicate detection threshold edge cases

---

## Documentation Templates

### packages/services/CLAUDE.md

```markdown
# @aa/services Package

Business logic services for Abandoned Archive.

## Architecture

Services are database-agnostic, accepting a better-sqlite3 Database instance.

## Available Services

- LocationService - Location CRUD, stats, duplicate detection

## Adding a Service

1. Create service file in src/<domain>/
2. Create types file with Zod schemas
3. Export from src/index.ts
4. Add tests in tests/

## Patterns

- Use Zod for input validation
- Return domain objects, not raw SQL rows
- Handle errors with custom error classes
```

### packages/cli/CLAUDE.md

```markdown
# @aa/cli Package

Command-line interface for Abandoned Archive.

## Architecture

Commands use Commander.js with sub-command pattern.

## Adding a Command

1. Create command file in src/commands/
2. Register in src/cli.ts
3. Add tests in tests/

## Database

Uses local SQLite via better-sqlite3. Schema in database.ts.
```

---

## Success Criteria

**A+/100/100 means:**

1. All critical and high priority issues resolved
2. 80%+ test coverage
3. All packages have CLAUDE.md
4. All CLI commands documented with examples
5. Desktop app properly uses CLI services via bridge
6. Zero blocking issues
7. Linting passes
8. Build succeeds
9. All tests pass

---

## Timeline

| Phase | Duration | Status |
|-------|----------|--------|
| 1. Audit | Complete | DONE |
| 2. Plan | Complete | DONE |
| 3. Fix Issues | 6-8 hours | PENDING |
| 4. Testing | 4-6 hours | PENDING |
| 5. Documentation | 3-4 hours | PENDING |
| 6. Verification | 1-2 hours | PENDING |

**Total Estimated:** 14-20 hours of focused work

---

## Appendix: Files Requiring Changes

### Critical Changes

| File | Changes |
|------|---------|
| packages/cli/src/commands/export.ts | Fix gps_lat/gps_lng references |
| packages/cli/src/commands/refmap.ts | Fix gps_lat/gps_lng references |
| packages/cli/src/commands/media.ts | Use imgs/vids/docs tables, implement delete-files |
| packages/cli/src/commands/import.ts | Use imgs/vids/docs tables |
| packages/cli/src/commands/db.ts | Add SQL validation |
| packages/desktop/electron/main/index.ts | Initialize CLI Bridge |

### New Files to Create

| File | Purpose |
|------|---------|
| packages/services/CLAUDE.md | Package guide |
| packages/services/README.md | API reference |
| packages/cli/CLAUDE.md | Package guide |
| packages/services/src/media/media-service.ts | Media operations |
| packages/services/src/media/types.ts | Media types |
| sme/services-api-reference.md | Formal API docs |
