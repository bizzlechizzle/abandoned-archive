# GUI Migration Guide: Desktop to CLI Services

This guide documents the progressive migration strategy for refactoring the Electron desktop app to consume `@aa/services`.

## Overview

The goal is CLI-first architecture where:
- All business logic lives in `@aa/services`
- The CLI (`@aa/cli`) is the primary interface
- The desktop GUI is a thin wrapper over services
- IPC handlers become pass-through to services

## Current State (Before Migration)

```
Desktop Architecture:
┌─────────────────────────────────────────────────────┐
│ Renderer (Svelte)                                   │
└──────────────────────┬──────────────────────────────┘
                       │ IPC
┌──────────────────────┴──────────────────────────────┐
│ IPC Handlers (30+ files)                            │
│ - locations.ts, media.ts, imports.ts, etc.          │
│ - Contains business logic + validation              │
└──────────────────────┬──────────────────────────────┘
                       │
┌──────────────────────┴──────────────────────────────┐
│ SQLite Repositories (15+ files)                     │
│ - sqlite-location-repository.ts                     │
│ - sqlite-media-repository.ts, etc.                  │
└──────────────────────┬──────────────────────────────┘
                       │
┌──────────────────────┴──────────────────────────────┐
│ SQLite Database (better-sqlite3)                    │
└─────────────────────────────────────────────────────┘
```

## Target State (After Migration)

```
CLI-First Architecture:
┌───────────────────┐  ┌─────────────────────────────┐
│ CLI (@aa/cli)     │  │ Renderer (Svelte)           │
└────────┬──────────┘  └──────────────┬──────────────┘
         │                            │ IPC
         │  ┌─────────────────────────┴──────────────┐
         │  │ IPC Handlers (thin wrappers)           │
         │  │ - Pass-through to services             │
         │  └──────────────┬─────────────────────────┘
         │                 │
         └────────┬────────┘
                  │
┌─────────────────┴───────────────────────────────────┐
│ @aa/services                                        │
│ - LocationService, MediaService, etc.               │
│ - All business logic                                │
└──────────────────────┬──────────────────────────────┘
                       │
┌──────────────────────┴──────────────────────────────┐
│ SQLite Database                                     │
└─────────────────────────────────────────────────────┘
```

## Migration Strategy

### Phase 1: Bridge Layer (Current)

Created `cli-bridge.ts` to provide access to `@aa/services` from Electron:

```typescript
// packages/desktop/electron/services/cli-bridge.ts
import { LocationService } from '@aa/services/location';

export class CliBridge {
  public readonly locationService: LocationService;
  // Add more services as they're implemented
}
```

### Phase 2: Parallel Operation

Run both old and new code paths temporarily:

```typescript
ipcMain.handle('location:findAll', async (_event, filters) => {
  // Legacy: Use existing repository
  const legacy = await locationRepo.findAll(filters);

  // New: Use CLI service (for testing)
  if (process.env.USE_CLI_SERVICES) {
    const bridge = getCliBridge();
    return bridge.locationService.findAll(filters);
  }

  return legacy;
});
```

### Phase 3: Gradual Handler Migration

Migrate one handler at a time:

1. **Start with read-only handlers** (findAll, findById, getStats)
2. **Move to write handlers** (create, update, delete)
3. **Finally migrate complex handlers** (duplicate detection, bulk operations)

### Phase 4: Remove Legacy Code

Once all handlers use services:
1. Remove repository files from desktop
2. Remove duplicate business logic
3. Keep only IPC wiring in handlers

## Handler Migration Checklist

### Location Handlers
- [ ] `location:findAll` → `LocationService.findAll()`
- [ ] `location:findById` → `LocationService.findById()`
- [ ] `location:create` → `LocationService.create()`
- [ ] `location:update` → `LocationService.update()`
- [ ] `location:delete` → `LocationService.delete()`
- [ ] `location:getStats` → `LocationService.getStats()`
- [ ] `location:findDuplicates` → `LocationService.findDuplicates()`

### Media Handlers
- [ ] `media:findAll` → `MediaService.findAll()`
- [ ] `media:findByHash` → `MediaService.findByHash()`
- [ ] `media:create` → `MediaService.create()`
- [ ] `media:update` → `MediaService.update()`
- [ ] `media:delete` → `MediaService.delete()`
- [ ] `media:assignToLocation` → `MediaService.assignToLocation()`

### Import Handlers
- [ ] `import:startJob` → `ImportService.startJob()`
- [ ] `import:getJobStatus` → `ImportService.getJobStatus()`
- [ ] `import:cancelJob` → `ImportService.cancelJob()`

### Refmap Handlers
- [ ] `refmap:import` → `RefmapService.import()`
- [ ] `refmap:match` → `RefmapService.matchToLocations()`

## Database Considerations

### Schema Alignment

Ensure @aa/services schema matches desktop schema:

| CLI Table | Desktop Table | Notes |
|-----------|---------------|-------|
| `locs` | `locations` | Need column mapping |
| `media` | `media` | Compatible |
| `refmaps` | `ref_maps` | Need column mapping |

### Migration Script

If schemas differ, create a migration:

```typescript
// packages/services/src/database/migrations/001-align-with-desktop.ts
export const migration = {
  up: (db) => {
    // Add compatibility views or remap columns
  }
};
```

## Testing Strategy

### Unit Tests
- Test each service method in isolation
- Mock database for unit tests

### Integration Tests
- Test CLI commands end-to-end
- Test IPC handlers with real database

### E2E Tests
- Test desktop app with services
- Verify UI still works after migration

## Rollback Plan

If migration causes issues:

1. Revert IPC handler changes
2. Keep bridge available but unused
3. Fix issues in services package
4. Re-attempt migration

## Timeline Estimate

| Phase | Scope | Files |
|-------|-------|-------|
| Phase 1 | Bridge setup | 1-2 |
| Phase 2 | Location handlers | 3-5 |
| Phase 3 | Media handlers | 3-5 |
| Phase 4 | Import handlers | 5-8 |
| Phase 5 | Remaining handlers | 10-15 |
| Phase 6 | Legacy cleanup | 20+ |

## Dependencies

Ensure these are in desktop package.json:

```json
{
  "dependencies": {
    "@aa/services": "workspace:*",
    "@aa/core": "workspace:*"
  }
}
```

## Notes

- Keep backward compatibility during migration
- Test thoroughly at each phase
- Document any schema differences
- Consider feature flags for gradual rollout
