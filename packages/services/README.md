# @aa/services

Shared business logic services for Abandoned Archive.

## Installation

```bash
pnpm add @aa/services
```

## Quick Start

```typescript
import Database from 'better-sqlite3';
import { LocationService } from '@aa/services';

const db = new Database('archive.db');
const locationService = new LocationService(db);

// Create a location
const location = await locationService.create({
  name: 'Old Mill',
  latitude: 42.123,
  longitude: -71.456,
  state: 'MA',
  type: 'industrial'
});

// Find all locations in Massachusetts
const maLocations = await locationService.findAll({
  state: 'MA',
  sortBy: 'name'
});

// Get statistics
const stats = await locationService.getStats();
console.log(`Total: ${stats.totalLocations}, With GPS: ${stats.withGps}`);
```

## API Reference

### LocationService

#### Constructor

```typescript
new LocationService(db: Database)
```

#### Methods

##### findAll(filters?: LocationFilters): Promise<Location[]>

Find locations with optional filtering.

```typescript
const locations = await service.findAll({
  search: 'mill',           // Text search in name, description, address
  state: 'MA',              // Filter by state (2-letter code)
  type: 'industrial',       // Filter by type
  types: ['industrial', 'commercial'], // Multiple types
  status: 'visited',        // Filter by status
  hasImages: true,          // Only with images
  hasHeroImage: false,      // Only without hero image
  north: 43.0, south: 41.0, // Bounding box
  east: -70.0, west: -72.0,
  sortBy: 'name',           // 'name' | 'createdAt' | 'updatedAt' | 'imageCount'
  sortOrder: 'asc',         // 'asc' | 'desc'
  limit: 50,
  offset: 0
});
```

##### findById(id: string): Promise<Location | null>

Find a location by ID, returns null if not found.

##### findByIdOrThrow(id: string): Promise<Location>

Find a location by ID, throws `LocationNotFoundError` if not found.

##### create(input: LocationInput): Promise<Location>

Create a new location.

```typescript
const location = await service.create({
  name: 'Old Factory',      // Required
  type: 'industrial',       // Optional
  status: 'visited',        // Optional, defaults to 'unknown'
  latitude: 42.123,         // Optional
  longitude: -71.456,       // Optional
  gpsSource: 'device',      // Optional
  address: '123 Main St',   // Optional
  city: 'Boston',           // Optional
  state: 'MA',              // Optional, 2-letter code
  description: 'Large...',  // Optional
  notes: 'Private notes',   // Optional
  tags: ['urban', 'decay'], // Optional
  condition: 'collapsed',   // Optional
  access: 'restricted',     // Optional
  favorite: false,          // Optional
  historic: true,           // Optional
  builtYear: 1920,          // Optional
  abandonedYear: 1985       // Optional
});
```

##### update(id: string, input: LocationUpdate): Promise<Location>

Update an existing location. Only provided fields are updated.

```typescript
const updated = await service.update('abc123', {
  status: 'visited',
  notes: 'Updated notes'
});
```

##### delete(id: string): Promise<void>

Delete a location. Throws `LocationNotFoundError` if not found.

##### getStats(): Promise<LocationStats>

Get aggregate statistics.

```typescript
const stats = await service.getStats();
// {
//   totalLocations: 150,
//   byStatus: { visited: 45, unvisited: 100, planned: 5 },
//   byType: { industrial: 80, commercial: 40, residential: 30 },
//   byState: { MA: 50, NY: 30, ... },
//   withGps: 120,
//   withHeroImage: 85,
//   totalImages: 3500,
//   totalVideos: 150,
//   totalDocuments: 200
// }
```

##### findDuplicates(threshold?: number): Promise<LocationDuplicate[]>

Find potential duplicate locations based on name and GPS proximity.

```typescript
const duplicates = await service.findDuplicates(0.8);
for (const dup of duplicates) {
  console.log(`Possible duplicate: ${dup.location1.name} <-> ${dup.location2.name}`);
  console.log(`Confidence: ${dup.confidence}, Reasons: ${dup.reasons.join(', ')}`);
}
```

## Types

### Location

```typescript
interface Location {
  id: string;
  loc12?: string;
  name: string;
  type?: 'industrial' | 'commercial' | 'residential' | 'institutional' | 'infrastructure' | 'military' | 'religious' | 'recreational' | 'natural' | 'other';
  status: 'unknown' | 'planned' | 'unvisited' | 'visited' | 'demolished' | 'renovated' | 'inaccessible';
  category?: string;
  tags: string[];
  latitude?: number;
  longitude?: number;
  gpsAccuracy?: number;
  gpsSource?: 'device' | 'manual' | 'exif' | 'geocoded' | 'reference';
  gpsStatus?: string;
  address?: string;
  city?: string;
  county?: string;
  state?: string;
  postalCode?: string;
  description?: string;
  notes?: string;
  heroImageHash?: string;
  heroImageFocalX?: number;
  heroImageFocalY?: number;
  imageCount: number;
  videoCount: number;
  documentCount: number;
  discoveredAt?: Date;
  visitedAt?: Date;
  builtYear?: number;
  abandonedYear?: number;
  demolishedYear?: number;
  condition?: string;
  access?: string;
  favorite: boolean;
  historic: boolean;
  createdAt: Date;
  updatedAt: Date;
  createdBy?: string;
  updatedBy?: string;
}
```

### LocationStats

```typescript
interface LocationStats {
  totalLocations: number;
  byStatus: Record<string, number>;
  byType: Record<string, number>;
  byState: Record<string, number>;
  withGps: number;
  withHeroImage: number;
  totalImages: number;
  totalVideos: number;
  totalDocuments: number;
}
```

## Error Handling

```typescript
import { LocationNotFoundError, ServiceError } from '@aa/services';

try {
  const location = await service.findByIdOrThrow('invalid');
} catch (error) {
  if (error instanceof LocationNotFoundError) {
    console.error(`Location not found: ${error.id}`);
  } else if (error instanceof ServiceError) {
    console.error(`Service error: ${error.message}`);
  }
}
```

## License

MIT
