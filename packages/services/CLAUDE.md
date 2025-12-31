# @aa/services Package

Business logic services for Abandoned Archive - CLI-first architecture.

## Architecture

Services are database-agnostic, accepting a `better-sqlite3` Database instance.
This enables use from both CLI and Electron desktop without code duplication.

```
┌─────────────────┐   ┌─────────────────┐
│   CLI (aa)      │   │ Desktop (Electron)│
└────────┬────────┘   └────────┬────────┘
         │                     │
         └───────┬─────────────┘
                 ▼
         ┌───────────────┐
         │ @aa/services  │
         │ LocationService│
         │ (future: Media)│
         └───────┬───────┘
                 │
                 ▼
         ┌───────────────┐
         │ better-sqlite3│
         └───────────────┘
```

## Available Services

### LocationService
Full CRUD for location management with:
- `findAll(filters?)` - List locations with filtering, sorting, pagination
- `findById(id)` / `findByIdOrThrow(id)` - Get single location
- `create(input)` - Create new location
- `update(id, input)` - Update existing location
- `delete(id)` - Delete location
- `getStats()` - Aggregate statistics
- `findDuplicates(threshold?)` - Potential duplicate detection

## Patterns

### Input Validation
All input validated with Zod schemas before processing:

```typescript
import { LocationInputSchema, LocationUpdateSchema } from '@aa/services';

// Input is validated and typed
const location = await service.create({
  name: 'Old Mill',
  latitude: 42.123,
  longitude: -71.456,
  state: 'MA'
});
```

### Error Handling
Domain-specific errors for clear handling:

```typescript
import { LocationNotFoundError, ServiceError } from '@aa/services';

try {
  const location = await service.findByIdOrThrow('abc123');
} catch (e) {
  if (e instanceof LocationNotFoundError) {
    console.log(`Location ${e.id} not found`);
  }
}
```

### Logging
All services use structured logging via `createLogger`:

```typescript
const logger = createLogger('my-service');
logger.info('Operation', { details: 'here' });
logger.error('Failed', new Error('reason'));
```

## Adding a New Service

1. Create service directory: `src/<domain>/`
2. Add types with Zod schemas: `src/<domain>/types.ts`
3. Implement service class: `src/<domain>/<domain>-service.ts`
4. Export from domain index: `src/<domain>/index.ts`
5. Export from package: `src/index.ts`
6. Add tests: `tests/<domain>/`

Example structure:
```
src/media/
├── index.ts           # Re-exports
├── types.ts           # MediaInput, MediaFilters, etc.
└── media-service.ts   # MediaService class
```

## Desktop Integration

Use via CLI Bridge in Electron:

```typescript
// In electron/main/index.ts
import { initCliBridge } from '../services/cli-bridge';
const db = getDatabase();
initCliBridge(db);

// In IPC handlers
import { getCliBridge } from '../services/cli-bridge';
const bridge = getCliBridge();
const locations = await bridge.locationService.findAll({ state: 'MA' });
```

## CLI Integration

Services can be called directly from CLI commands:

```typescript
import { LocationService } from '@aa/services';
const db = await getDatabase();
const service = new LocationService(db);
const stats = await service.getStats();
```

## Testing

Run tests:
```bash
pnpm test
```

Tests use in-memory SQLite for speed. Each test gets fresh database.

## Column Naming Convention

Services map between domain entities and database columns:

| Domain Property | DB Column |
|-----------------|-----------|
| `id` | `locid` |
| `name` | `locnam` |
| `latitude` | `gps_lat` |
| `longitude` | `gps_lng` |
| `address` | `address_street` |
| `city` | `address_city` |
| `state` | `address_state` |
| `imageCount` | `imgct` |
