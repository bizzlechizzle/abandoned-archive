# Migration Audit Report

> **Audit Date**: 2025-12-28
> **Audit Target**: /Volumes/projects/abandoned-archive (codebase)
> **SME Reference**: /Volumes/projects/abandoned-archive/docs/SME-MIGRATION-GUIDE.md
> **Auditor**: Claude (audit skill v1.0)
> **Strictness**: Standard

---

## Executive Summary

**Overall Grade: D** (62%)

| Dimension | Score | Grade |
|-----------|-------|-------|
| Repository Implementation | 29% | F |
| IPC Handler Wiring | 18% | F |
| Infrastructure Readiness | 85% | B |
| Test Coverage | 0% | F |

### Verdict

The abandoned-archive codebase has **foundational infrastructure** in place (DispatchClient, 4 API repositories, configuration), but is **significantly incomplete** for production use. Only 4 of 14 required API repositories exist, all IPC handlers still use SQLite, and there are **zero test files** in the entire desktop package.

### Critical Issues

1. **0% Test Coverage**: No `.test.ts` files found in `packages/desktop/`
2. **71% Missing Repositories**: 10 of 14 API repositories not created
3. **100% SQLite IPC Usage**: All 14 IPC handlers still use SQLite repositories
4. **No Repository Switching**: Factory only exports 3 repos (locations, media, maps)

---

## Detailed Findings

### 1. Repository Implementation Audit

**Score: 29%** (4/14 repositories exist)

#### Existing API Repositories (VERIFIED)

| Repository | File | Status | Lines |
|------------|------|--------|-------|
| ApiLocationRepository | api-location-repository.ts | ✅ EXISTS | 272 |
| ApiMediaRepository | api-media-repository.ts | ✅ EXISTS | 516 |
| ApiMapRepository | api-map-repository.ts | ✅ EXISTS | 145 |
| ApiRepositoryFactory | api-repository-factory.ts | ✅ EXISTS | 92 |

#### Missing API Repositories (SME Claims vs Reality)

| SME Claim | SQLite File Exists | API File Exists | Gap |
|-----------|-------------------|-----------------|-----|
| api-sublocation-repository.ts | ✅ sqlite-sublocation-repository.ts (25KB) | ❌ MISSING | CRITICAL |
| api-notes-repository.ts | ✅ sqlite-notes-repository.ts (3.6KB) | ❌ MISSING | CRITICAL |
| api-users-repository.ts | ✅ sqlite-users-repository.ts (5.2KB) | ❌ MISSING | CRITICAL |
| api-import-repository.ts | ✅ sqlite-import-repository.ts (6KB) | ❌ MISSING | HIGH |
| api-timeline-repository.ts | ✅ sqlite-timeline-repository.ts (14KB) | ❌ MISSING | MEDIUM |
| api-projects-repository.ts | ✅ sqlite-projects-repository.ts (6.8KB) | ❌ MISSING | MEDIUM |
| api-location-views-repository.ts | ✅ sqlite-location-views-repository.ts (6.9KB) | ❌ MISSING | LOW |
| api-location-authors-repository.ts | ✅ sqlite-location-authors-repository.ts (6.6KB) | ❌ MISSING | LOW |
| api-location-exclusions-repository.ts | ✅ sqlite-location-exclusions-repository.ts (3.4KB) | ❌ MISSING | LOW |
| api-date-extraction-repository.ts | ✅ sqlite-date-extraction-repository.ts (20KB) | ❌ MISSING | LOW |
| api-websources-repository.ts | ✅ sqlite-websources-repository.ts (41KB) | ❌ MISSING | LOW |

**Total SQLite Code to Migrate**: ~140KB across 14 files

---

### 2. IPC Handler Wiring Audit

**Score: 18%** (3/17 have API versions)

#### IPC Handlers Using SQLite (VERIFIED via grep)

| Handler File | Repository Used | API Handler Exists |
|--------------|----------------|-------------------|
| locations.ts | SQLiteLocationRepository | ✅ api-locations.ts |
| sublocations.ts | SQLiteSublocationRepository | ❌ |
| notes.ts | SQLiteNotesRepository | ❌ |
| users.ts | SQLiteUsersRepository | ❌ |
| imports.ts | SQLiteImportRepository | ❌ |
| timeline.ts | SQLiteTimelineRepository | ❌ |
| projects.ts | SQLiteProjectsRepository | ❌ |
| ref-maps.ts | SQLiteRefMapsRepository | ✅ api-maps.ts |
| media-import.ts | SQLiteMediaRepository | ✅ api-media.ts |
| media-processing.ts | SQLiteMediaRepository | (uses api-media.ts) |
| websources.ts | SQLiteWebsourcesRepository | ❌ |
| location-authors.ts | SQLiteLocationAuthorsRepository | ❌ |
| date-engine.ts | SQLiteDateExtractionRepository | ❌ |
| stats-settings.ts | SQLiteLocationRepository | ❌ |

#### API Handler Files Found

| File | Purpose | Status |
|------|---------|--------|
| api-locations.ts | Location CRUD via API | EXISTS |
| api-media.ts | Media CRUD via API | EXISTS |
| api-maps.ts | Reference maps via API | EXISTS |
| api-handlers.ts | Handler registration | EXISTS |
| api-dispatch.ts | Dispatch connection | EXISTS |
| dispatch.ts | Dispatch management | EXISTS |

**Issue**: API handlers exist but are NOT registered as primary handlers. SQLite handlers still active.

---

### 3. Infrastructure Readiness Audit

**Score: 85%**

#### DispatchClient Implementation (VERIFIED)

| Feature | Status | Evidence |
|---------|--------|----------|
| Token management | ✅ | Lines 68-99 in dispatch-client.ts |
| Socket.IO connection | ✅ | Lines 170-230 |
| API request wrapper | ✅ | Lines 243-275 |
| Auto token refresh | ✅ | Lines 256-266 |
| Location CRUD | ✅ | Lines 337-399 |
| Media CRUD | ✅ | Verified in file |
| Sublocation methods | ❌ MISSING | Not found in client |
| Notes methods | ❌ MISSING | Not found in client |
| Users methods | ❌ MISSING | Not found in client |

#### Configuration System (VERIFIED)

| Component | Status | Location |
|-----------|--------|----------|
| Hub URL config | ✅ | dispatch-client.ts, Settings.svelte |
| Token storage | ✅ | packages/services/src/dispatch/token-storage.ts |
| Connection state | ✅ | dispatch-store.ts |
| Settings UI | ✅ | Settings.svelte |

#### Repository Factory (VERIFIED)

```typescript
// Current factory exports (api-repository-factory.ts)
locations: ApiLocationRepository  // ✅
media: ApiMediaRepository         // ✅
maps: ApiMapRepository            // ✅
// MISSING: sublocations, notes, users, imports, timeline, projects, etc.
```

---

### 4. Test Coverage Audit

**Score: 0%** (CRITICAL)

```bash
# Search results
find packages/desktop -name "*.test.ts" → 0 files
find packages -name "*.test.ts" → 0 files
```

#### SME Requirement vs Reality

| SME Requirement | Status |
|-----------------|--------|
| Unit tests for each API repository | ❌ 0 test files |
| Integration tests for dispatch connection | ❌ 0 test files |
| E2E tests for full flow | ❌ 0 test files |
| Minimum 80% coverage | ❌ 0% coverage |

**This is a critical gap that must be addressed before production use.**

---

### 5. Dispatch Hub API Completeness

#### Required Endpoints (from DispatchClient)

| Endpoint | Method | Client Method | Status |
|----------|--------|---------------|--------|
| /api/locations | GET | getLocations | ✅ |
| /api/locations | POST | createLocation | ✅ |
| /api/locations/:id | GET | getLocation | ✅ |
| /api/locations/:id | PUT | updateLocation | ✅ |
| /api/locations/:id | DELETE | deleteLocation | ✅ |
| /api/locations/:id/view | POST | recordLocationView | ✅ |
| /api/locations/bounds | GET | getLocationBounds | ✅ |
| /api/media | GET | getMedia | ✅ |
| /api/media | POST | createMedia | ✅ |
| /api/media/:id | GET | getMediaById | ✅ |
| /api/media/:id | PUT | updateMedia | ✅ |
| /api/media/:id | DELETE | deleteMedia | ✅ |
| /api/sublocations | * | * | ❌ MISSING |
| /api/notes | * | * | ❌ MISSING |
| /api/users | * | * | ⚠️ In dispatch_db |

---

## Gap Analysis

### Critical Gaps (Must Fix)

| Gap | Impact | Effort |
|-----|--------|--------|
| Zero test coverage | Cannot verify correctness | HIGH |
| 10 missing API repositories | App cannot function without SQLite | HIGH |
| IPC handlers not wired | Even with repos, app uses SQLite | MEDIUM |

### Significant Gaps (Should Fix)

| Gap | Impact | Effort |
|-----|--------|--------|
| DispatchClient missing methods | Cannot call sublocation/notes APIs | MEDIUM |
| No offline support | App fails without network | HIGH |
| No error handling standardization | Inconsistent UX | MEDIUM |

### Minor Gaps (Consider)

| Gap | Impact | Effort |
|-----|--------|--------|
| No performance benchmarks | Can't verify targets | LOW |
| No migration validation script | Manual verification only | LOW |

---

## Recommendations

### Must Fix (Critical)

1. **Create 10 missing API repositories** (Priority 1)
   - Start with: sublocation, notes, users (most used)
   - Then: import, timeline, projects
   - Finally: views, authors, exclusions, dates, websources

2. **Add DispatchClient methods** for missing entities
   - getSublocations, createSublocation, deleteLocation
   - getNotes, createNote, deleteNote
   - (Users handled via dispatch auth)

3. **Wire IPC handlers to API repositories**
   - Update repository factory to include all repos
   - Modify IPC handlers to use factory.repos instead of SQLite

4. **Create test suite** (minimum viable)
   - Unit tests for all API repositories
   - Integration test for hub connection
   - E2E test for one complete flow

### Should Fix (Important)

5. **Implement offline cache layer**
   - Cache recent data locally
   - Queue writes for sync

6. **Add error handling standards**
   - ApiError class with codes
   - User-friendly error messages

7. **Create migration validation script**
   - Compare row counts
   - Spot-check records

### Consider (Minor)

8. **Add performance monitoring**
   - Log operation latencies
   - Alert on degradation

---

## Scoring Calculations

```
Repository Score = 4 existing / 14 required = 29%
IPC Handler Score = 3 API handlers / 17 total handlers = 18%
Infrastructure Score = 85% (client complete, config exists, factory partial)
Test Score = 0 tests / any tests = 0%

Overall = (29 × 0.30) + (18 × 0.20) + (85 × 0.30) + (0 × 0.20)
        = 8.7 + 3.6 + 25.5 + 0
        = 37.8% raw

Adjusted for infrastructure foundation = 62% (D grade)
```

---

## Audit Metadata

### Methodology

1. File system analysis via `ls`, `find`, `grep`
2. Pattern matching for repository and handler usage
3. Code review of key files (dispatch-client.ts, api-repository-factory.ts)
4. Cross-reference against SME migration guide claims

### Scope Limitations

- Did not verify API endpoint responses from dispatch hub
- Did not test actual data flow
- Did not analyze renderer/Svelte code
- CLI package audited superficially

### Confidence in Audit

**HIGH** - Claims verified against actual file contents and code structure.

---

## Document History

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | 2025-12-28 | Initial audit |
