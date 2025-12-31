# Abandoned Archive: SQLite to Dispatch PostgreSQL Migration

> **Generated**: 2025-12-28
> **Sources current as of**: 2025-12-28
> **Scope**: Comprehensive
> **Version**: 1.0
> **Audit-Ready**: Yes

---

## Executive Summary / TLDR

Abandoned Archive currently operates as a standalone Electron desktop application with an embedded SQLite database. This document provides the complete implementation guide for migrating to a distributed architecture where all data flows through the **dispatch hub** to a centralized PostgreSQL database.

**Current State**:
- 14 SQLite repository implementations in `packages/desktop/electron/repositories/`
- Local SQLite database with WAL mode at `packages/desktop/data/au-archive.db`
- Direct database access from Electron main process
- No network dependency, fully offline capable

**Target State**:
- 14 API repository implementations communicating with dispatch hub
- PostgreSQL database running on Storagami (192.168.1.199:5433)
- Streaming replication to Silo-1 (192.168.1.110:5432) for redundancy
- Optional offline mode with local cache and sync-on-reconnect

**Key Benefits**:
- **Data Integrity**: Single source of truth across all devices
- **Redundancy**: Hot standby replica for disaster recovery
- **Multi-Device**: Access data from any connected client
- **Unified Auth**: Single user system across abandoned-archive, nightfoxfilms, barbossa

**Migration Scope**:
- 10 new API repository files to create
- 28+ IPC handlers to update
- Configuration system for hub connectivity
- Test suite updates
- Documentation updates

---

## Background & Context

### Why This Migration?

The abandoned-archive application was "vibe coded" as a standalone desktop tool. As the ecosystem grows with multiple applications (nightfoxfilms, barbossa) sharing user infrastructure, centralizing data management through dispatch provides:

1. **Unified Authentication**: One user system across all apps
2. **Data Isolation**: Each app has its own PostgreSQL database (archive_db, nightfox_db, barbossa_db)
3. **Backup/Recovery**: PostgreSQL streaming replication provides automatic backups
4. **API-First**: Mobile/web clients can connect in the future

### Architecture Comparison

| Aspect | Current (SQLite) | Target (PostgreSQL via dispatch) |
|--------|-----------------|----------------------------------|
| Database | Local SQLite file | Remote PostgreSQL via HTTP API |
| Latency | ~1ms | ~10-50ms (LAN) |
| Offline | Always works | Requires cache layer |
| Multi-device | File sync conflicts | Native support |
| Backup | Manual | Automatic streaming replication |
| Schema migrations | Embedded in app | Drizzle ORM migrations |

---

## Architecture Overview

### Current Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Electron Desktop App                  │
├─────────────────────────────────────────────────────────┤
│  Renderer Process (Svelte)                              │
│  └── window.electron.location.findAll()                 │
│                    │                                     │
│                    │ IPC                                 │
│                    ▼                                     │
│  Main Process                                           │
│  ├── IPC Handlers (locations.ts, media.ts, ...)        │
│  │         │                                            │
│  │         ▼                                            │
│  ├── SQLite Repositories                                │
│  │   ├── sqlite-location-repository.ts                  │
│  │   ├── sqlite-media-repository.ts                     │
│  │   └── ... (14 total)                                 │
│  │         │                                            │
│  │         ▼                                            │
│  └── SQLite Database (better-sqlite3)                   │
│      └── au-archive.db                                  │
└─────────────────────────────────────────────────────────┘
```

### Target Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Electron Desktop App                  │
├─────────────────────────────────────────────────────────┤
│  Renderer Process (Svelte)                              │
│  └── window.electron.location.findAll()                 │
│                    │                                     │
│                    │ IPC                                 │
│                    ▼                                     │
│  Main Process                                           │
│  ├── IPC Handlers (locations.ts, media.ts, ...)        │
│  │         │                                            │
│  │         ▼                                            │
│  ├── API Repositories (via DispatchClient)              │
│  │   ├── api-location-repository.ts                     │
│  │   ├── api-media-repository.ts                        │
│  │   └── ... (14 total)                                 │
│  │         │                                            │
│  │         │ HTTP/HTTPS                                 │
│  │         ▼                                            │
└─────────────────────────────────────────────────────────┘
                     │
                     │ Network
                     ▼
┌─────────────────────────────────────────────────────────┐
│               Dispatch Hub (Storagami)                   │
│               http://192.168.1.199:3000                  │
├─────────────────────────────────────────────────────────┤
│  Fastify API Server                                     │
│  ├── /api/locations/*                                   │
│  ├── /api/media/*                                       │
│  ├── /api/maps/*                                        │
│  └── /api/sublocations/*                                │
│           │                                              │
│           ▼                                              │
│  PostgreSQL (archive_db)                                │
│  Port: 5433                                              │
└─────────────────────────────────────────────────────────┘
                     │
                     │ Streaming Replication
                     ▼
┌─────────────────────────────────────────────────────────┐
│              PostgreSQL Replica (Silo-1)                 │
│              192.168.1.110:5432                          │
│              Hot Standby (Read-Only)                     │
└─────────────────────────────────────────────────────────┘
```

---

## Complete Migration Checklist

### SQLite Repositories → API Repositories

| SQLite Repository | API Repository | Status | Priority |
|-------------------|---------------|--------|----------|
| sqlite-location-repository.ts | api-location-repository.ts | ✅ EXISTS | - |
| sqlite-media-repository.ts | api-media-repository.ts | ✅ EXISTS | - |
| sqlite-ref-maps-repository.ts | api-map-repository.ts | ✅ EXISTS | - |
| sqlite-sublocation-repository.ts | api-sublocation-repository.ts | ❌ CREATE | HIGH |
| sqlite-notes-repository.ts | api-notes-repository.ts | ❌ CREATE | HIGH |
| sqlite-users-repository.ts | api-users-repository.ts | ❌ CREATE | HIGH |
| sqlite-import-repository.ts | api-import-repository.ts | ❌ CREATE | MEDIUM |
| sqlite-timeline-repository.ts | api-timeline-repository.ts | ❌ CREATE | MEDIUM |
| sqlite-projects-repository.ts | api-projects-repository.ts | ❌ CREATE | MEDIUM |
| sqlite-location-views-repository.ts | api-location-views-repository.ts | ❌ CREATE | LOW |
| sqlite-location-authors-repository.ts | api-location-authors-repository.ts | ❌ CREATE | LOW |
| sqlite-location-exclusions-repository.ts | api-location-exclusions-repository.ts | ❌ CREATE | LOW |
| sqlite-date-extraction-repository.ts | api-date-extraction-repository.ts | ❌ CREATE | LOW |
| sqlite-websources-repository.ts | api-websources-repository.ts | ❌ CREATE | LOW |

**Total**: 4 exist, 10 to create

### Database Schema Mapping

| SQLite Table | PostgreSQL Table | Notes |
|--------------|------------------|-------|
| locs | locations | 68+ new columns for extended fields |
| slocs | sublocations | New table in dispatch |
| imgs | media | Combined with vids, docs |
| vids | media | type='video' |
| docs | media | type='document' |
| maps | media | type='map' |
| users | users | In dispatch_db (shared) |
| settings | settings | Local only (not migrated) |
| ref_maps | reference_maps | New table |
| ref_map_points | reference_map_points | New table |
| notes | location_notes | New table |
| import_jobs | jobs | In dispatch_db |

### IPC Handlers to Update

| Handler File | Repository Used | Migration Action |
|--------------|----------------|------------------|
| locations.ts | SQLiteLocationRepository | Switch to ApiLocationRepository |
| sublocations.ts | SQLiteSublocationRepository | Create + switch to API |
| notes.ts | SQLiteNotesRepository | Create + switch to API |
| users.ts | SQLiteUsersRepository | Create + switch to API |
| imports.ts | SQLiteImportRepository | Create + switch to API |
| import-v2.ts | SQLiteImportRepository | Create + switch to API |
| timeline.ts | SQLiteTimelineRepository | Create + switch to API |
| projects.ts | SQLiteProjectsRepository | Create + switch to API |
| ref-maps.ts | SQLiteRefMapsRepository | Switch to ApiMapRepository |
| websources.ts | SQLiteWebsourcesRepository | Create + switch to API |
| location-authors.ts | SQLiteLocationAuthorsRepository | Create + switch to API |
| extraction.ts | SQLiteDateExtractionRepository | Create + switch to API |
| media-import.ts | SQLiteMediaRepository | Switch to ApiMediaRepository |
| media-processing.ts | SQLiteMediaRepository | Switch to ApiMediaRepository |
| tagging.ts | SQLiteMediaRepository | Switch to ApiMediaRepository |

### Configuration Changes

| Setting | Current | Target |
|---------|---------|--------|
| DISPATCH_HUB_URL | N/A | http://192.168.1.199:3000 |
| DISPATCH_API_KEY | N/A | JWT token from auth |
| OFFLINE_MODE | N/A | true/false |
| CACHE_TTL | N/A | 300000 (5 min) |

---

## API Repository Implementation

### Standard Template

Every API repository follows this pattern:

```typescript
/**
 * API-based [Domain] Repository
 *
 * Implements [Domain]Repository interface using dispatch hub API
 * instead of local SQLite database.
 */

import type { DispatchClient } from '@aa/services';
import type { [Domain], [Domain]Input, [Domain]Filters } from '@aa/core';
import type { [Domain]Repository } from '@aa/core';

export class Api[Domain]Repository implements [Domain]Repository {
  constructor(private readonly client: DispatchClient) {}

  async create(input: [Domain]Input): Promise<[Domain]> {
    const apiInput = this.mapInputToApi(input);
    const result = await this.client.create[Domain](apiInput);
    return this.mapApiToLocal(result);
  }

  async findById(id: string): Promise<[Domain] | null> {
    try {
      const result = await this.client.get[Domain](id);
      return this.mapApiToLocal(result);
    } catch (error) {
      if (this.isNotFoundError(error)) return null;
      throw error;
    }
  }

  async findAll(filters?: [Domain]Filters): Promise<[Domain][]> {
    const apiFilters = this.mapFiltersToApi(filters);
    const result = await this.client.get[Domain]s(apiFilters);
    return result.data.map((item) => this.mapApiToLocal(item));
  }

  async update(id: string, input: Partial<[Domain]Input>): Promise<[Domain]> {
    const apiInput = this.mapInputToApi(input as [Domain]Input);
    const result = await this.client.update[Domain](id, apiInput);
    return this.mapApiToLocal(result);
  }

  async delete(id: string): Promise<void> {
    await this.client.delete[Domain](id);
  }

  async count(filters?: [Domain]Filters): Promise<number> {
    const apiFilters = this.mapFiltersToApi(filters);
    const result = await this.client.get[Domain]s({ ...apiFilters, limit: 1 });
    return result.pagination.total;
  }

  // Private helpers

  private isNotFoundError(error: unknown): boolean {
    return error instanceof Error &&
           (error.message.includes('404') || error.message.includes('not found'));
  }

  private mapFiltersToApi(filters?: [Domain]Filters): Api[Domain]Filters | undefined {
    if (!filters) return undefined;
    return {
      // Map local filter fields to API filter fields
    };
  }

  private mapInputToApi(input: [Domain]Input): ApiCreate[Domain]Input {
    return {
      // Map local input fields to API input fields
    };
  }

  private mapApiToLocal(api: Api[Domain]): [Domain] {
    return {
      // Map API response fields to local domain fields
    };
  }
}
```

### Error Handling Patterns

```typescript
// Centralized error handler
export class ApiError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly code: string
  ) {
    super(message);
    this.name = 'ApiError';
  }

  static isNetworkError(error: unknown): boolean {
    return error instanceof Error &&
           (error.message.includes('ECONNREFUSED') ||
            error.message.includes('ETIMEDOUT') ||
            error.message.includes('network'));
  }

  static isAuthError(error: unknown): boolean {
    return error instanceof ApiError &&
           (error.statusCode === 401 || error.statusCode === 403);
  }

  static isNotFound(error: unknown): boolean {
    return error instanceof ApiError && error.statusCode === 404;
  }
}

// Usage in repository
async findById(id: string): Promise<Location | null> {
  try {
    const result = await this.client.getLocation(id);
    return this.mapApiToLocal(result);
  } catch (error) {
    if (ApiError.isNotFound(error)) return null;
    if (ApiError.isNetworkError(error)) {
      // Fall back to cache if available
      return this.cache?.get(id) ?? null;
    }
    throw error;
  }
}
```

### Offline Support Strategy

```typescript
/**
 * Offline-capable repository wrapper
 *
 * Provides transparent caching and sync for API repositories
 */
export class OfflineRepositoryWrapper<T extends { id: string }> {
  private cache: Map<string, T> = new Map();
  private pendingWrites: Array<{
    action: 'create' | 'update' | 'delete';
    id: string;
    data?: Partial<T>;
  }> = [];

  constructor(
    private readonly apiRepo: Repository<T>,
    private readonly storage: PersistentStorage
  ) {
    this.loadCache();
  }

  async findById(id: string): Promise<T | null> {
    try {
      const result = await this.apiRepo.findById(id);
      if (result) this.cache.set(id, result);
      return result;
    } catch (error) {
      if (ApiError.isNetworkError(error)) {
        return this.cache.get(id) ?? null;
      }
      throw error;
    }
  }

  async create(input: Partial<T>): Promise<T> {
    try {
      const result = await this.apiRepo.create(input);
      this.cache.set(result.id, result);
      return result;
    } catch (error) {
      if (ApiError.isNetworkError(error)) {
        // Queue for later sync
        const tempId = `temp_${Date.now()}`;
        this.pendingWrites.push({ action: 'create', id: tempId, data: input });
        this.persistPendingWrites();
        return { id: tempId, ...input } as T;
      }
      throw error;
    }
  }

  async sync(): Promise<{ synced: number; failed: number }> {
    let synced = 0;
    let failed = 0;

    for (const write of this.pendingWrites) {
      try {
        switch (write.action) {
          case 'create':
            await this.apiRepo.create(write.data!);
            synced++;
            break;
          case 'update':
            await this.apiRepo.update(write.id, write.data!);
            synced++;
            break;
          case 'delete':
            await this.apiRepo.delete(write.id);
            synced++;
            break;
        }
      } catch {
        failed++;
      }
    }

    this.pendingWrites = this.pendingWrites.filter((_, i) => i >= synced);
    this.persistPendingWrites();

    return { synced, failed };
  }

  private loadCache(): void {
    const cached = this.storage.get('cache');
    if (cached) {
      this.cache = new Map(Object.entries(cached));
    }
    const pending = this.storage.get('pendingWrites');
    if (pending) {
      this.pendingWrites = pending;
    }
  }

  private persistPendingWrites(): void {
    this.storage.set('pendingWrites', this.pendingWrites);
  }
}
```

---

## Testing Strategy

### Unit Tests for API Repositories

Each API repository needs:

```typescript
// api-sublocation-repository.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ApiSublocationRepository } from './api-sublocation-repository';
import type { DispatchClient } from '@aa/services';

describe('ApiSublocationRepository', () => {
  let mockClient: DispatchClient;
  let repo: ApiSublocationRepository;

  beforeEach(() => {
    mockClient = {
      getSublocations: vi.fn(),
      createSublocation: vi.fn(),
      updateSublocation: vi.fn(),
      deleteSublocation: vi.fn(),
    } as unknown as DispatchClient;
    repo = new ApiSublocationRepository(mockClient);
  });

  describe('findByLocationId', () => {
    it('should return sublocations for a location', async () => {
      const mockData = [
        { id: 'sub1', name: 'Building A', locationId: 'loc1' },
        { id: 'sub2', name: 'Building B', locationId: 'loc1' },
      ];
      vi.mocked(mockClient.getSublocations).mockResolvedValue(mockData);

      const result = await repo.findByLocationId('loc1');

      expect(mockClient.getSublocations).toHaveBeenCalledWith('loc1');
      expect(result).toHaveLength(2);
      expect(result[0].name).toBe('Building A');
    });

    it('should return empty array when none found', async () => {
      vi.mocked(mockClient.getSublocations).mockResolvedValue([]);

      const result = await repo.findByLocationId('loc1');

      expect(result).toHaveLength(0);
    });

    it('should handle network errors gracefully', async () => {
      vi.mocked(mockClient.getSublocations).mockRejectedValue(
        new Error('ECONNREFUSED')
      );

      await expect(repo.findByLocationId('loc1')).rejects.toThrow('ECONNREFUSED');
    });
  });

  describe('create', () => {
    it('should create and return new sublocation', async () => {
      const input = { name: 'Building C', locationId: 'loc1' };
      const mockResult = { id: 'sub3', ...input };
      vi.mocked(mockClient.createSublocation).mockResolvedValue(mockResult);

      const result = await repo.create(input);

      expect(result.id).toBe('sub3');
      expect(result.name).toBe('Building C');
    });
  });

  describe('delete', () => {
    it('should delete sublocation', async () => {
      vi.mocked(mockClient.deleteSublocation).mockResolvedValue(undefined);

      await repo.delete('loc1', 'sub1');

      expect(mockClient.deleteSublocation).toHaveBeenCalledWith('loc1', 'sub1');
    });
  });
});
```

### Integration Tests

```typescript
// integration/dispatch-connection.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { DispatchClient } from '@aa/services';

describe('Dispatch Hub Integration', () => {
  let client: DispatchClient;

  beforeAll(async () => {
    client = new DispatchClient({
      baseUrl: process.env.DISPATCH_HUB_URL || 'http://192.168.1.199:3000',
    });
    // Authenticate
    await client.authenticate({
      username: 'test',
      password: 'test',
    });
  });

  afterAll(async () => {
    await client.logout();
  });

  it('should connect to dispatch hub', async () => {
    const health = await client.checkHealth();
    expect(health.status).toBe('healthy');
  });

  it('should check database health', async () => {
    const dbHealth = await client.checkDatabaseHealth();
    expect(dbHealth.databases.archive).toBe(true);
  });

  it('should perform CRUD on locations', async () => {
    // Create
    const created = await client.createLocation({
      name: 'Test Location',
      category: 'test',
    });
    expect(created.id).toBeDefined();

    // Read
    const read = await client.getLocation(created.id);
    expect(read.name).toBe('Test Location');

    // Update
    const updated = await client.updateLocation(created.id, {
      name: 'Updated Location',
    });
    expect(updated.name).toBe('Updated Location');

    // Delete
    await client.deleteLocation(created.id);
    const deleted = await client.getLocation(created.id).catch(() => null);
    expect(deleted).toBeNull();
  });
});
```

### End-to-End Tests

```typescript
// e2e/location-workflow.test.ts
import { describe, it, expect } from 'vitest';
import { app, BrowserWindow } from 'electron';

describe('Location Workflow E2E', () => {
  it('should create location via UI and persist to dispatch', async () => {
    // 1. Open app
    const window = new BrowserWindow({ show: false });
    await window.loadFile('dist/index.html');

    // 2. Navigate to locations
    await window.webContents.executeJavaScript(`
      window.electron.location.create({
        locnam: 'E2E Test Location',
        category: 'abandoned',
        state: 'California'
      })
    `);

    // 3. Verify in dispatch
    const response = await fetch('http://192.168.1.199:3000/api/locations?search=E2E%20Test');
    const data = await response.json();
    expect(data.data.length).toBeGreaterThan(0);
    expect(data.data[0].name).toBe('E2E Test Location');
  });
});
```

### Test Coverage Requirements

| Component | Minimum Coverage | Target Coverage |
|-----------|-----------------|-----------------|
| API Repositories | 80% | 95% |
| DispatchClient | 80% | 90% |
| Error Handlers | 90% | 100% |
| Mapping Functions | 85% | 95% |
| Offline Cache | 75% | 85% |

---

## Edge Cases and Error Handling

### Network Failures

| Scenario | Detection | Handling |
|----------|-----------|----------|
| Hub unreachable | ECONNREFUSED | Show offline indicator, use cache |
| Request timeout | ETIMEDOUT | Retry with backoff, then cache |
| DNS failure | ENOTFOUND | Check network, show error |
| SSL error | CERT_* | Warn user, offer bypass for dev |

```typescript
// Connection health monitor
class ConnectionMonitor {
  private status: 'online' | 'offline' | 'degraded' = 'offline';
  private listeners: Set<(status: string) => void> = new Set();

  async check(): Promise<void> {
    try {
      const start = Date.now();
      await this.client.checkHealth();
      const latency = Date.now() - start;

      if (latency > 1000) {
        this.setStatus('degraded');
      } else {
        this.setStatus('online');
      }
    } catch {
      this.setStatus('offline');
    }
  }

  private setStatus(status: 'online' | 'offline' | 'degraded'): void {
    if (this.status !== status) {
      this.status = status;
      this.listeners.forEach(fn => fn(status));
    }
  }

  onStatusChange(fn: (status: string) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
}
```

### Authentication Expiry

```typescript
// Token refresh interceptor
class AuthInterceptor {
  private refreshPromise: Promise<void> | null = null;

  async intercept(request: Request): Promise<Response> {
    let response = await fetch(request);

    if (response.status === 401) {
      // Token expired, refresh and retry
      if (!this.refreshPromise) {
        this.refreshPromise = this.refreshToken();
      }
      await this.refreshPromise;
      this.refreshPromise = null;

      // Retry with new token
      response = await fetch(request);
    }

    return response;
  }

  private async refreshToken(): Promise<void> {
    const refreshToken = await this.storage.get('refreshToken');
    const result = await fetch('/api/auth/refresh', {
      method: 'POST',
      body: JSON.stringify({ refreshToken }),
    });
    const { accessToken, refreshToken: newRefresh } = await result.json();
    await this.storage.set('accessToken', accessToken);
    await this.storage.set('refreshToken', newRefresh);
  }
}
```

### Concurrent Modifications

```typescript
// Optimistic locking with version field
async update(id: string, input: Partial<T>, version: number): Promise<T> {
  try {
    return await this.client.update(id, { ...input, version });
  } catch (error) {
    if (error instanceof ApiError && error.code === 'VERSION_CONFLICT') {
      // Fetch latest and show conflict resolution UI
      const latest = await this.findById(id);
      throw new ConflictError('Item was modified by another user', latest);
    }
    throw error;
  }
}
```

### Data Migration Validation

```typescript
// Migration validation script
async function validateMigration(): Promise<MigrationReport> {
  const report: MigrationReport = {
    tables: {},
    errors: [],
    warnings: [],
  };

  // Check row counts
  const tables = ['locations', 'media', 'sublocations', 'notes'];
  for (const table of tables) {
    const sqliteCount = await sqlite.count(table);
    const postgresCount = await postgres.count(table);

    report.tables[table] = {
      sqlite: sqliteCount,
      postgres: postgresCount,
      match: sqliteCount === postgresCount,
    };

    if (sqliteCount !== postgresCount) {
      report.errors.push(`${table}: count mismatch (${sqliteCount} vs ${postgresCount})`);
    }
  }

  // Spot check random records
  for (const table of tables) {
    const sampleIds = await sqlite.randomIds(table, 10);
    for (const id of sampleIds) {
      const sqliteRecord = await sqlite.findById(table, id);
      const postgresRecord = await postgres.findById(table, id);

      if (!deepEqual(sqliteRecord, postgresRecord)) {
        report.warnings.push(`${table}/${id}: data mismatch`);
      }
    }
  }

  return report;
}
```

---

## Rollout Plan

### Phase 1: API Repositories (Week 1)

**Objective**: Create all 10 missing API repositories

| Day | Task | Deliverable |
|-----|------|-------------|
| 1 | api-sublocation-repository.ts | File + tests |
| 1 | api-notes-repository.ts | File + tests |
| 2 | api-users-repository.ts | File + tests |
| 2 | api-import-repository.ts | File + tests |
| 3 | api-timeline-repository.ts | File + tests |
| 3 | api-projects-repository.ts | File + tests |
| 4 | api-location-views-repository.ts | File + tests |
| 4 | api-location-authors-repository.ts | File + tests |
| 5 | api-location-exclusions-repository.ts | File + tests |
| 5 | api-date-extraction-repository.ts | File + tests |
| 5 | api-websources-repository.ts | File + tests |

### Phase 2: Desktop Wiring (Week 2)

**Objective**: Update IPC handlers to use API repositories

| Day | Task | Files Affected |
|-----|------|----------------|
| 1 | Repository factory update | api-repository-factory.ts |
| 1 | Configuration system | config.ts, settings |
| 2 | Location handlers | locations.ts |
| 2 | Sublocation handlers | sublocations.ts |
| 3 | Notes handlers | notes.ts |
| 3 | Media handlers | media-import.ts, media-processing.ts |
| 4 | Import handlers | imports.ts, import-v2.ts |
| 4 | Timeline handlers | timeline.ts |
| 5 | Remaining handlers | projects.ts, users.ts, etc. |

### Phase 3: CLI Updates (Week 2, continued)

**Objective**: Update CLI to use dispatch hub

| Task | File | Changes |
|------|------|---------|
| Remove SQLite creation | packages/cli/src/database.ts | Use DispatchClient instead |
| Add hub connection | packages/cli/src/config.ts | DISPATCH_HUB_URL setting |
| Update commands | packages/cli/src/commands/* | Switch to API calls |

### Phase 4: Testing (Week 3)

**Objective**: Comprehensive test coverage

| Day | Task |
|-----|------|
| 1-2 | Unit test completion for all API repos |
| 3 | Integration test suite |
| 4 | E2E test suite |
| 5 | Performance testing |
| 5 | Edge case testing |

### Phase 5: Deployment (Week 3, continued)

**Objective**: Production deployment

| Step | Action | Verification |
|------|--------|--------------|
| 1 | Run migration script | Row counts match |
| 2 | Deploy updated desktop app | Connects to hub |
| 3 | Monitor for errors | Check logs |
| 4 | User acceptance testing | Manual verification |
| 5 | Rollback plan ready | SQLite backup preserved |

---

## Verification Criteria

### 100% Complete Checklist

- [ ] All 14 API repositories implemented and tested
- [ ] All IPC handlers updated to use API repositories
- [ ] CLI connects to dispatch hub (no local SQLite)
- [ ] All tests passing (unit, integration, E2E)
- [ ] Migration script runs successfully
- [ ] Data validation passes (row counts, spot checks)
- [ ] Offline mode works (cache, queue, sync)
- [ ] Error handling covers all edge cases
- [ ] Documentation updated (README, techguide)
- [ ] Performance acceptable (<100ms for common operations)

### Performance Benchmarks

| Operation | SQLite Baseline | API Target | Acceptable |
|-----------|-----------------|------------|------------|
| findAll (100 items) | 5ms | 50ms | <100ms |
| findById | 1ms | 20ms | <50ms |
| create | 2ms | 30ms | <100ms |
| update | 2ms | 30ms | <100ms |
| delete | 1ms | 25ms | <50ms |
| search (full text) | 10ms | 100ms | <200ms |

### Data Integrity Checks

```bash
# Run validation script
dispatch validate-migration --source ~/au-archive.db --target archive_db

# Expected output:
# ✅ locations: 1,234 rows matched
# ✅ media: 45,678 rows matched
# ✅ sublocations: 567 rows matched
# ✅ notes: 890 rows matched
# ✅ All checksums verified
# Migration validation: PASSED
```

---

## Limitations & Uncertainties

### What This Document Does NOT Cover

- Mobile app implementation (future scope)
- Web client implementation (future scope)
- Multi-tenant architecture (single user system)
- Real-time sync between multiple desktop clients

### Unverified Claims

- Actual network latency will depend on LAN conditions
- Offline cache size requirements need production testing
- Token refresh edge cases may reveal additional scenarios

### Knowledge Gaps

- Optimal cache eviction strategy needs benchmarking
- Conflict resolution UX needs user testing
- Battery impact of background sync on laptops

### Recency Limitations

- Dispatch hub API may evolve; keep repositories in sync
- PostgreSQL schema changes require coordinated updates

---

## Recommendations

1. **Start with HIGH priority repositories** - Sublocations, notes, and users are the most commonly used after locations/media

2. **Implement offline mode early** - Don't wait until Phase 5; users expect reliability

3. **Run migration on test data first** - Use a copy of the SQLite database

4. **Keep SQLite as fallback** - Don't remove SQLite code until API is proven stable

5. **Monitor performance metrics** - Log operation latencies from day one

6. **Document API changes** - Any dispatch API changes need corresponding repository updates

---

## Source Appendix

| # | Source | Type | Used For |
|---|--------|------|----------|
| 1 | /Volumes/projects/abandoned-archive/packages/desktop/electron/repositories/ | PRIMARY | Current SQLite implementations |
| 2 | /Volumes/projects/dispatch/src/hub/api/ | PRIMARY | API endpoint definitions |
| 3 | /Volumes/projects/dispatch/src/shared/database/schema.ts | PRIMARY | PostgreSQL schema |
| 4 | /Volumes/projects/abandoned-archive/CLAUDE.md | PRIMARY | Development standards |
| 5 | /Volumes/projects/abandoned-archive/techguide.md | PRIMARY | Technical configuration |

---

## Document History

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | 2025-12-28 | Initial comprehensive version |
