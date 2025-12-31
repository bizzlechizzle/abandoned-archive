# Dispatch Integration - Implementation Plan

**Status:** PHASE 1 COMPLETE
**Date:** 2025-12-29
**Projects:** abandoned-archive (Client) + dispatch (Hub)

---

## Completed Work

### Dispatch Hub (Server-Side) - NEW ENDPOINTS

1. **Sublocation CRUD** (`/api/locations/:id/sublocations/:subid`)
   - PUT - Update sublocation name/shortName
   - DELETE - Delete sublocation

2. **Notes CRUD** (`/api/locations/:id/notes/:noteId`)
   - PUT - Update note text/type
   - DELETE - Delete note

3. **Recent Notes** (`/api/notes/recent`)
   - GET - Get recent notes across all locations

4. **Location Views**
   - GET `/api/locations/recent-views` - Recently viewed locations
   - GET `/api/locations/most-viewed` - Most viewed locations

5. **Projects API** (NEW - `/api/projects`)
   - GET `/api/projects` - List all projects
   - POST `/api/projects` - Create project
   - GET `/api/projects/:id` - Get project with locations
   - PUT `/api/projects/:id` - Update project
   - DELETE `/api/projects/:id` - Delete project
   - POST `/api/projects/:id/locations` - Add location to project
   - DELETE `/api/projects/:id/locations/:locid` - Remove location from project
   - GET `/api/projects/for-location/:locid` - Get projects for a location

### Dispatch Hub (Database)

1. Added `projects` table
2. Added `project_locations` junction table
3. Added relations for both tables

### Abandoned Archive (Client-Side)

1. **dispatch-client.ts** - Added methods:
   - `updateSublocation()`
   - `updateLocationNote()`
   - `getRecentNotes()`
   - `getRecentlyViewedLocations()`
   - `getMostViewedLocations()`
   - `getProjects()`, `getProject()`, `createProject()`, `updateProject()`, `deleteProject()`
   - `addLocationToProject()`, `removeLocationFromProject()`, `getProjectsForLocation()`

2. **api-projects-repository.ts** - Fully implemented (removed all TODOs)
3. **api-sublocation-repository.ts** - Added update() method
4. **api-location-views-repository.ts** - Added recent/most viewed support

---

## Executive Summary

The abandoned-archive + dispatch integration is **approximately 60% complete**. The core connection infrastructure exists and works, but many API endpoints expected by the client are not implemented in the dispatch hub.

---

## Identified Issues (Sourced from Code Analysis)

### Category 1: Critical - Health Check Path Mismatch

**File:** `packages/services/src/dispatch/dispatch-client.ts:813`

```typescript
async checkConnection(): Promise<boolean> {
  try {
    const response = await fetch(`${this.config.hubUrl}/health`);  // WRONG
    return response.ok;
  } catch {
    return false;
  }
}
```

**Problem:** Client calls `/health` but dispatch hub registers routes at `/api/health` (see `dispatch/src/hub/api/health.ts:7`).

**Impact:** Connection check always fails, causing "Cannot reach hub" errors.

---

### Category 2: Missing Dispatch Hub API Endpoints

The following API endpoints are called by abandoned-archive client but **DO NOT EXIST** in dispatch hub:

#### 2.1 WebSources API (0% implemented)

**Source Files:**
- `packages/desktop/electron/repositories/api-websources-repository.ts:208-684`

| Endpoint | Method | Client Code Location | Status |
|----------|--------|---------------------|--------|
| `/api/websources` | POST | Line 211 | NOT IMPLEMENTED |
| `/api/websources/:id` | GET | Line 278 | NOT IMPLEMENTED |
| `/api/websources/by-location/:locid` | GET | Line 295 | NOT IMPLEMENTED |
| `/api/websources/:id` | PUT | Line 344 | NOT IMPLEMENTED |
| `/api/websources/:id` | DELETE | Line 353 | NOT IMPLEMENTED |
| `/api/websources/:id/versions` | POST | Line 451 | NOT IMPLEMENTED |
| `/api/websources/search` | GET | Line 505 | NOT IMPLEMENTED |
| `/api/websources/stats` | GET | Line 518 | NOT IMPLEMENTED |

#### 2.2 Sublocation API (50% implemented)

**Source File:** `packages/desktop/electron/repositories/api-sublocation-repository.ts`

| Endpoint | Method | Status |
|----------|--------|--------|
| `/api/locations/:id/sublocations` | GET | EXISTS |
| `/api/locations/:id/sublocations` | POST | EXISTS |
| `/api/locations/:id/sublocations/:subid` | PUT | NOT IMPLEMENTED (line 124) |
| `/api/locations/:id/sublocations/:subid/gps` | PUT | NOT IMPLEMENTED (line 141) |
| `/api/locations/:id/sublocations/:subid/primary` | PUT | NOT IMPLEMENTED (line 150) |
| `/api/locations/:id/sublocations/stats` | GET | NOT IMPLEMENTED (line 168) |

#### 2.3 Location Authors API (0% implemented)

**Source File:** `packages/desktop/electron/repositories/api-location-authors-repository.ts:39-78`

| Endpoint | Method | Status |
|----------|--------|--------|
| `/api/locations/:id/authors` | POST | NOT IMPLEMENTED |
| `/api/locations/:id/authors` | GET | NOT IMPLEMENTED |
| `/api/users/:id/locations` | GET | NOT IMPLEMENTED |
| `/api/authors` | GET | NOT IMPLEMENTED |
| `/api/authors/:id/stats` | GET | NOT IMPLEMENTED |
| `/api/locations/:id/authors/primary` | GET | NOT IMPLEMENTED |

#### 2.4 Location Exclusions API (0% implemented)

**Source File:** `packages/desktop/electron/repositories/api-location-exclusions-repository.ts:33-71`

| Endpoint | Method | Status |
|----------|--------|--------|
| `/api/locations/:id/exclude` | POST | NOT IMPLEMENTED |
| `/api/locations/:id/include` | POST | NOT IMPLEMENTED |
| `/api/exclusions` | GET | NOT IMPLEMENTED |
| `/api/exclusions/:id` | GET | NOT IMPLEMENTED |

#### 2.5 Location Views API (40% implemented)

**Source File:** `packages/desktop/electron/repositories/api-location-views-repository.ts:44-81`

| Endpoint | Method | Status |
|----------|--------|--------|
| `/api/locations/:id/view` | POST | EXISTS |
| `/api/locations/recent-views` | GET | NOT IMPLEMENTED |
| `/api/locations/most-viewed` | GET | NOT IMPLEMENTED |
| `/api/locations/:id/views/history` | GET | NOT IMPLEMENTED |
| `/api/locations/:id/views` | DELETE | NOT IMPLEMENTED |

#### 2.6 Notes API (60% implemented)

**Source File:** `packages/desktop/electron/repositories/api-notes-repository.ts:73-83`

| Endpoint | Method | Status |
|----------|--------|--------|
| `/api/locations/:id/notes` | GET | EXISTS |
| `/api/locations/:id/notes` | POST | EXISTS |
| `/api/notes/recent` | GET | NOT IMPLEMENTED |
| `/api/locations/:id/notes/:noteId` | PUT | NOT IMPLEMENTED |

#### 2.7 Projects API (0% implemented)

**Source File:** `packages/desktop/electron/repositories/api-projects-repository.ts:75`

| Endpoint | Method | Status |
|----------|--------|--------|
| `/api/projects` | GET/POST | NOT IMPLEMENTED |
| `/api/projects/:id` | GET/PUT/DELETE | NOT IMPLEMENTED |
| `/api/projects/:id/locations` | GET/POST/DELETE | NOT IMPLEMENTED |

#### 2.8 Timeline API (0% implemented)

**Source File:** `packages/desktop/electron/repositories/api-timeline-repository.ts:54-108`

| Endpoint | Method | Status |
|----------|--------|--------|
| `/api/timeline/:locid` | GET | NOT IMPLEMENTED |
| `/api/timeline/:locid/month/:month` | GET | NOT IMPLEMENTED |
| `/api/timeline/:locid/years` | GET | NOT IMPLEMENTED |
| `/api/timeline/:locid/months` | GET | NOT IMPLEMENTED |
| `/api/timeline/:locid/count/:date` | GET | NOT IMPLEMENTED |
| `/api/timeline/:locid/range` | GET | NOT IMPLEMENTED |

#### 2.9 Date Extraction API (0% implemented)

**Source File:** `packages/desktop/electron/repositories/api-date-extraction-repository.ts:79-110`

| Endpoint | Method | Status |
|----------|--------|--------|
| `/api/media/without-dates` | GET | NOT IMPLEMENTED |
| `/api/locations/:id/date-range` | GET | NOT IMPLEMENTED |
| `/api/media/extract-dates` | POST | NOT IMPLEMENTED |

#### 2.10 Import History API (stub implementation)

**Source File:** `packages/desktop/electron/repositories/api-import-repository.ts:7-8, 121-146`

| Endpoint | Method | Status |
|----------|--------|--------|
| `/api/imports/recent` | GET | STUB ONLY |
| `/api/imports/by-location/:locid` | GET | NOT IMPLEMENTED |

---

### Category 3: Missing Worker Plugins

**Source Files:**
- `packages/desktop/electron/services/websource-orchestrator-service.ts:499`
- `packages/desktop/electron/services/bookmark-api-server.ts:466, 723`

| Plugin | Purpose | Status |
|--------|---------|--------|
| `date-extraction` | Extract dates from media EXIF/filenames | NOT IMPLEMENTED |
| `websource-archiver` | Archive web pages for research | NOT IMPLEMENTED |

---

### Category 4: Configuration Issues

#### 4.1 Hardcoded Hub URL

Multiple files have hardcoded `http://192.168.1.199:3000`:

- `packages/services/src/dispatch/dispatch-client.ts:897` (fallback)
- `packages/desktop/src/stores/dispatch-store.ts:61` (initial state)
- `packages/desktop/src/pages/Settings.svelte:67` (default value)

**Issue:** Should use environment variable or settings.

#### 4.2 Delete Sublocation Endpoint Path

**File:** `packages/services/src/dispatch/dispatch-client.ts:481`

```typescript
async deleteSublocation(locationId: string, sublocationId: string): Promise<void> {
  await this.apiRequest(`/api/locations/${locationId}/sublocations/${sublocationId}`, {
    method: 'DELETE',
  });
}
```

**Status:** Endpoint exists in dispatch hub BUT path doesn't match. Hub has `/api/locations/:id/sublocations` (POST only), no DELETE endpoint.

---

## Implementation Priority

### Phase 1: Critical Connection Fixes (Must Fix First)

1. **Fix health check path** - Change `/health` to `/api/health` in dispatch-client.ts
2. **Add `/health` alias** - Or add route alias in dispatch hub for backwards compatibility

### Phase 2: Core API Endpoints (High Priority)

1. **Sublocation CRUD completion** - Update, GPS update, set-primary, stats
2. **Notes API completion** - Recent, update endpoints
3. **Location Views completion** - Recent, most-viewed, history, clear

### Phase 3: Extended Features (Medium Priority)

1. **Projects API** - Full CRUD for project management
2. **Timeline API** - Date-based media browsing
3. **Import History API** - Full import tracking

### Phase 4: Advanced Features (Lower Priority)

1. **WebSources API** - Web archiving support
2. **Location Authors API** - Multi-user attribution
3. **Location Exclusions API** - Exclusion management
4. **Date Extraction Plugin** - EXIF date extraction worker
5. **WebSource Archiver Plugin** - Web archiving worker

---

## File-by-File Implementation Checklist

### Dispatch Hub (Server-Side)

| File | Changes Needed |
|------|----------------|
| `src/hub/api/health.ts` | Add `/health` route alias (line 7) |
| `src/hub/api/locations.ts` | Add sublocation PUT, DELETE, GPS, primary endpoints |
| `src/hub/api/index.ts` | Register new route files |
| `src/hub/api/notes.ts` | NEW FILE - Notes CRUD |
| `src/hub/api/projects.ts` | NEW FILE - Projects CRUD |
| `src/hub/api/timeline.ts` | NEW FILE - Timeline queries |
| `src/hub/api/websources.ts` | NEW FILE - Web sources CRUD |
| `src/hub/api/authors.ts` | NEW FILE - Location authors |
| `src/hub/api/exclusions.ts` | NEW FILE - Location exclusions |
| `src/shared/database/schema.ts` | Add tables for new features |

### Abandoned Archive (Client-Side)

| File | Changes Needed |
|------|----------------|
| `packages/services/src/dispatch/dispatch-client.ts` | Fix health check path (line 813) |
| `packages/desktop/src/stores/dispatch-store.ts` | Load hub URL from settings |
| `packages/desktop/src/pages/Settings.svelte` | Load saved hub URL on mount |

---

## Testing Requirements

Each implemented feature must include:

1. **Unit tests** for the API endpoint
2. **Integration test** verifying client → hub → response flow
3. **Manual verification** in the GUI

### Test Commands

```bash
# Dispatch hub tests
cd /Volumes/projects/dispatch
pnpm test

# Abandoned archive tests
cd /Volumes/projects/abandoned-archive
pnpm test

# Integration test (requires both running)
# Start hub: dispatch serve --mode hub
# Start worker: dispatch serve --mode worker
# Run GUI: pnpm dev
```

---

## Success Criteria

The integration is 100% complete when:

1. GUI can connect to dispatch hub without errors
2. All IPC handlers that call dispatch APIs work end-to-end
3. No `console.warn('Not yet implemented')` messages appear
4. All worker plugins execute jobs successfully
5. CLI `aa dispatch` commands work correctly

---

## Notes

- All code changes must follow CLAUDE.md standards
- No TODOs or placeholder code in final implementation
- Each feature must be tested before moving to next
- Commit after each working feature

---

*Generated from code analysis - not guesswork*
