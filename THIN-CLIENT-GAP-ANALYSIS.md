# Thin Client Gap Analysis

**Goal:** Desktop app becomes a thin client to dispatch hub. All data operations go through hub API.

**Current State:** Desktop has 40+ direct SQLite access points bypassing the API layer.

---

## Executive Summary

| Category | Current | Target | Gap |
|----------|---------|--------|-----|
| IPC Handlers Using API | 0% | 100% | **CRITICAL** |
| Hub Endpoints for Full Coverage | ~60% | 100% | **HIGH** |
| Data Migrated to Hub | ~65% | 100% | **HIGH** |
| Offline/Cache Layer | 0% | 100% | **MEDIUM** |
| Test Coverage | 0% | 80%+ | **HIGH** |

---

## Part 1: Desktop Direct Database Access (Must Be Eliminated)

### 40+ Violations Identified

#### CRITICAL - Media Metadata Updates (Desktop writes directly to SQLite)

| Handler | File | Line | Operation | Hub Endpoint Needed |
|---------|------|------|-----------|---------------------|
| `media:regenerateAllThumbnails` | media-processing.ts | 380-388 | `db.updateTable('imgs')` | `PUT /media/:id/thumbnails` |
| `media:regenerateVideoThumbnails` | media-processing.ts | 479-487 | `db.updateTable('vids')` | `PUT /media/:id/thumbnails` |
| `media:fixLocationVideos` | media-processing.ts | 896 | `db.updateTable('vids')` | `POST /media/:id/repair` |
| `tagging:editImageTags` | tagging.ts | 187-195 | `db.updateTable('imgs')` | `PUT /media/:id/tags` |

#### CRITICAL - Settings Table (100% Local, 0% Hub)

| Handler | File | Line | Operation | Hub Endpoint Needed |
|---------|------|------|-----------|---------------------|
| `settings:get` | stats-settings.ts | 356-370 | `db.selectFrom('settings')` | `GET /settings/:key` |
| `settings:set` | stats-settings.ts | 385-406 | `db.insertInto('settings')` | `PUT /settings/:key` |
| `settings:getAll` | stats-settings.ts | 373-382 | `db.selectFrom('settings')` | `GET /settings` |
| `media:openFile` | media-processing.ts | 125 | `db.selectFrom('settings')` | `GET /settings/archive_folder` |
| `storage:getStats` | storage.ts | 130-167 | `db.selectFrom('settings')` | `GET /settings` |

#### CRITICAL - Observability (100% Local, Hub Has Zero Visibility)

| Handler | File | Lines | Operations | Hub Endpoint Needed |
|---------|------|-------|------------|---------------------|
| `monitoring:*` | monitoring.ts | 72-572 | 15+ queries | `POST /telemetry/metrics`, `POST /telemetry/traces`, `POST /telemetry/alerts` |
| `monitoring:getMetricsHistory` | monitoring.ts | 72-92 | `db.selectFrom('metrics')` | `GET /telemetry/metrics` |
| `monitoring:getTracesHistory` | monitoring.ts | 142-168 | `db.selectFrom('traces')` | `GET /telemetry/traces` |
| `monitoring:acknowledgeAlert` | monitoring.ts | 226-234 | `db.updateTable('alert_history')` | `PUT /telemetry/alerts/:id/ack` |
| `monitoring:cleanup` | monitoring.ts | 538-572 | `db.deleteFrom()` | `DELETE /telemetry/cleanup` |

#### HIGH - Statistics (Computed Locally, Not on Hub)

| Handler | File | Lines | Operation | Hub Endpoint Needed |
|---------|------|-------|-----------|---------------------|
| `stats:topStates` | stats-settings.ts | 21-28 | `db.selectFrom('locs').groupBy()` | `GET /locations/stats/by-state` |
| `stats:topCategories` | stats-settings.ts | 40-47 | `db.selectFrom('locs').groupBy()` | `GET /locations/stats/by-category` |
| `stats:userContributions` | stats-settings.ts | 179-191 | `db.selectFrom('imgs/vids/docs')` | `GET /users/:id/contributions` |
| `stats:topContributors` | stats-settings.ts | 219-267 | Complex JOINs | `GET /users/stats/contributors` |

#### HIGH - Storage Verification (Local Only)

| Handler | File | Lines | Operation | Hub Endpoint Needed |
|---------|------|-------|-----------|---------------------|
| `storage:getStats` | storage.ts | 130-167 | Multiple `db.selectFrom()` | `GET /storage/stats` |
| `storage:verifyIntegrity` | storage.ts | 280-369 | `db.updateTable()` bulk repairs | `POST /storage/verify` |

#### MEDIUM - Timeline Events

| Handler | File | Lines | Operation | Hub Endpoint Needed |
|---------|------|-------|-----------|---------------------|
| `timeline:findByLocationWithSources` | timeline.ts | 289-398 | Multiple `db.selectFrom()` | Existing but not wired |
| `timeline:addSource` | timeline.ts | 478-503 | `db.updateTable('location_timeline')` | `PUT /timeline/:id/sources` |
| `timeline:reject` | timeline.ts | 523-530 | `db.updateTable('location_timeline')` | `PUT /timeline/:id/reject` |

#### MEDIUM - Web Sources

| Handler | File | Lines | Operation | Hub Endpoint Needed |
|---------|------|-------|-----------|---------------------|
| `websources:getDetail` | websources.ts | 907-932 | `db.selectFrom('document_summaries')` | `GET /websources/:id/extractions` |
| `websources:countPending` | websources.ts | 961-967 | `db.selectFrom('web_sources')` | `GET /websources/stats` |

#### MEDIUM - Credentials/Providers

| Handler | File | Lines | Operation | Hub Endpoint Needed |
|---------|------|-------|-----------|---------------------|
| `enableProvider` | credentials.ts | 150-158 | `db.prepare()` raw SQL | `PUT /providers/:id/enable` |
| `disableProvider` | credentials.ts | 183-184 | `db.prepare()` raw SQL | `PUT /providers/:id/disable` |

#### LOW - Location Metadata

| Handler | File | Lines | Operation | Hub Endpoint Needed |
|---------|------|-------|-----------|---------------------|
| `location:random` | locations.ts | 351 | `db.selectFrom('locs')` | `GET /locations/random` |
| `location:updateRegionData` | locations.ts | 529-542 | `db.updateTable('locs')` | `PUT /locations/:id/region` |

---

## Part 2: Missing Hub API Endpoints

### CRITICAL - File Operations (Desktop Cannot Serve Files from Hub)

| Endpoint | Purpose | Priority |
|----------|---------|----------|
| `GET /media/:id/file` | Download actual media file with range support | **P0** |
| `GET /media/:id/file/metadata` | Get file metadata (size, MIME, path, checksum) | **P0** |
| `POST /media/:id/file/verify` | Verify file integrity on hub | **P1** |
| `GET /thumbnails/:hash/:size` | Serve thumbnail by hash and size | **P0** |

### CRITICAL - Thumbnail Management

| Endpoint | Purpose | Priority |
|----------|---------|----------|
| `POST /media/:id/thumbnails/generate` | Request thumbnail generation | **P0** |
| `GET /media/:id/thumbnails/status` | Check thumbnail generation status | **P0** |
| `POST /media/thumbnails/batch-generate` | Batch thumbnail generation | **P1** |

### CRITICAL - Settings Sync

| Endpoint | Purpose | Priority |
|----------|---------|----------|
| `GET /settings` | Get all settings | **P0** |
| `GET /settings/:key` | Get single setting | **P0** |
| `PUT /settings/:key` | Set setting value | **P0** |
| `DELETE /settings/:key` | Remove setting | **P1** |

### HIGH - Telemetry/Observability

| Endpoint | Purpose | Priority |
|----------|---------|----------|
| `POST /telemetry/metrics` | Submit metrics batch | **P1** |
| `POST /telemetry/traces` | Submit trace batch | **P1** |
| `POST /telemetry/alerts` | Submit alert | **P1** |
| `GET /telemetry/metrics` | Query metrics history | **P1** |
| `GET /telemetry/traces` | Query traces history | **P1** |
| `GET /telemetry/alerts` | Query alerts | **P1** |
| `PUT /telemetry/alerts/:id/ack` | Acknowledge alert | **P1** |

### HIGH - Statistics/Aggregations

| Endpoint | Purpose | Priority |
|----------|---------|----------|
| `GET /locations/stats` | Location statistics summary | **P1** |
| `GET /locations/stats/by-state` | Locations per state | **P1** |
| `GET /locations/stats/by-category` | Locations per category | **P1** |
| `GET /media/stats` | Media statistics summary | **P1** |
| `GET /media/stats/by-location` | Media count per location | **P1** |
| `GET /users/stats/contributors` | Top contributors | **P1** |
| `GET /users/:id/contributions` | User contribution counts | **P1** |

### HIGH - Storage Management

| Endpoint | Purpose | Priority |
|----------|---------|----------|
| `GET /storage/stats` | Storage usage breakdown | **P1** |
| `POST /storage/verify` | Verify storage integrity | **P2** |
| `POST /storage/cleanup` | Cleanup orphaned files | **P2** |
| `GET /storage/duplicates` | Find duplicate files | **P2** |

### HIGH - Batch Operations

| Endpoint | Purpose | Priority |
|----------|---------|----------|
| `POST /media/batch/update` | Bulk update media metadata | **P1** |
| `POST /media/batch/delete` | Bulk delete media | **P1** |
| `POST /media/batch/tags` | Bulk add/remove tags | **P1** |
| `POST /media/batch/move` | Bulk move to location | **P2** |

### MEDIUM - Search Enhancements

| Endpoint | Purpose | Priority |
|----------|---------|----------|
| `POST /search` | Full-text search across all entities | **P2** |
| `GET /search/facets` | Get available filters for UI | **P2** |
| `GET /locations/random` | Get random location | **P2** |

### MEDIUM - Provider Registry

| Endpoint | Purpose | Priority |
|----------|---------|----------|
| `GET /providers` | List AI providers | **P2** |
| `PUT /providers/:id/enable` | Enable provider | **P2** |
| `PUT /providers/:id/disable` | Disable provider | **P2** |

---

## Part 3: Data Not Yet Migrated to Hub

### Tables That Exist Only in SQLite

| Table | Records | Migration Strategy |
|-------|---------|-------------------|
| `settings` | ~20 | Create hub settings table, migrate all |
| `metrics` | ~1000s | Create hub telemetry tables, batch migrate |
| `traces` | ~1000s | Create hub telemetry tables, batch migrate |
| `alert_history` | ~100s | Create hub alerts table, batch migrate |
| `job_audit_log` | ~1000s | Already exists on hub, sync historical |
| `import_audit_log` | ~100s | Already exists on hub, sync historical |
| `health_snapshots` | ~100s | Create hub health table, batch migrate |
| `extraction_providers` | ~10 | Create hub providers table, migrate |

### Missing Hub Database Tables

```sql
-- Settings (new)
CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Telemetry (new)
CREATE TABLE telemetry_metrics (
  id UUID PRIMARY KEY,
  name TEXT NOT NULL,
  value REAL NOT NULL,
  labels JSONB,
  recorded_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE telemetry_traces (
  id UUID PRIMARY KEY,
  operation TEXT NOT NULL,
  duration_ms INTEGER,
  status TEXT,
  metadata JSONB,
  recorded_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE telemetry_alerts (
  id UUID PRIMARY KEY,
  type TEXT NOT NULL,
  severity TEXT NOT NULL,
  message TEXT,
  acknowledged BOOLEAN DEFAULT FALSE,
  acknowledged_at TIMESTAMP,
  recorded_at TIMESTAMP DEFAULT NOW()
);

-- Providers (new)
CREATE TABLE ai_providers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  enabled BOOLEAN DEFAULT TRUE,
  config JSONB,
  updated_at TIMESTAMP DEFAULT NOW()
);
```

---

## Part 4: Implementation Phases

### Phase 1: Critical Infrastructure (Week 1)

**Goal:** Hub can serve files and settings

1. **Hub: Add file serving endpoints**
   - `GET /media/:id/file` with range support
   - `GET /thumbnails/:hash/:size`

2. **Hub: Add settings API**
   - `GET/PUT /settings` endpoints
   - Migrate settings table schema

3. **Desktop: Wire settings handlers to API**
   - Update `stats-settings.ts` to use API
   - Update `media-processing.ts` to use API for archive_folder

### Phase 2: Media Operations (Week 2)

**Goal:** Desktop never writes media metadata directly

1. **Hub: Add thumbnail management endpoints**
   - `POST /media/:id/thumbnails/generate`
   - `GET /media/:id/thumbnails/status`

2. **Hub: Add media metadata update endpoints**
   - `PUT /media/:id/metadata` for bulk updates
   - `POST /media/:id/repair` for path fixes

3. **Desktop: Wire media handlers to API**
   - Update `media-processing.ts` to use API
   - Update `tagging.ts` to use API

### Phase 3: Observability (Week 3)

**Goal:** Hub has visibility into all operations

1. **Hub: Add telemetry tables and endpoints**
   - Create `telemetry_*` tables
   - Add `POST /telemetry/*` endpoints
   - Add `GET /telemetry/*` query endpoints

2. **Desktop: Wire monitoring handlers to API**
   - Update `monitoring.ts` to POST metrics to hub
   - Historical data stays local (cache)

### Phase 4: Statistics & Batch (Week 4)

**Goal:** Desktop never computes aggregations

1. **Hub: Add statistics endpoints**
   - `GET /locations/stats/*`
   - `GET /media/stats/*`
   - `GET /users/stats/*`

2. **Hub: Add batch operation endpoints**
   - `POST /media/batch/*`

3. **Desktop: Wire stats handlers to API**
   - Update `stats-settings.ts` to use API
   - Update `storage.ts` to use API

### Phase 5: Remaining Handlers (Week 5)

**Goal:** Zero direct database access

1. **Wire remaining handlers:**
   - `timeline.ts` → Use API repositories
   - `websources.ts` → Use API repositories
   - `credentials.ts` → Use hub providers API
   - `locations.ts` → Use API for random/region

2. **Remove SQLite fallbacks from wired handlers**

### Phase 6: Testing & Validation (Week 6)

1. **Add API mode tests**
2. **Performance benchmarking**
3. **Offline mode implementation** (cache layer)
4. **Feature flag for SQLite fallback**

---

## Part 5: Success Criteria

### Thin Client Achieved When:

- [ ] Desktop makes 0 direct SQLite queries for data operations
- [ ] All CRUD goes through `api-*-repository.ts` classes
- [ ] Hub has endpoints for every desktop operation
- [ ] Settings synchronized to hub
- [ ] Telemetry flows to hub
- [ ] Statistics computed on hub
- [ ] Files served from hub storage
- [ ] Thumbnails served from hub
- [ ] Batch operations go through hub

### Metrics:

| Metric | Current | Target |
|--------|---------|--------|
| Direct DB queries | 40+ | 0 |
| API repository usage | 0% | 100% |
| Hub endpoint coverage | ~60% | 100% |
| Data on hub | ~65% | 100% |

---

## Appendix: Current vs. Target Architecture

### Current (Local-First)
```
Desktop App
    ├── IPC Handlers (40+ direct DB queries)
    ├── SQLite Repositories (14)
    ├── API Repositories (14, NOT USED)
    └── Local SQLite Database
            └── ALL DATA HERE

Dispatch Hub (Optional)
    ├── Job Queue (thumbnails, tags)
    └── Worker Pool
```

### Target (Thin Client)
```
Desktop App (Thin Client)
    ├── IPC Handlers (0 direct DB queries)
    ├── API Repositories (14, EXCLUSIVE)
    └── Local Cache (offline only)

Dispatch Hub (Source of Truth)
    ├── REST API (150+ endpoints)
    ├── PostgreSQL Database
    │       └── ALL DATA HERE
    ├── File Storage
    ├── Job Queue
    └── Worker Pool
```
