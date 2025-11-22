# AU Archive Desktop App - Technical Specification

Version: 0.1.0
Last Updated: 2025-11-21
Status: Pre-Development / Architecture Phase

---

## Project Overview

AU Archive Desktop App is an all-in-one tool that manages abandoned locations. It organizes, imports, and catalogs abandoned locations with media (images, videos, documents, maps) and associated metadata.

### Current Objective (v0.1.0)

Desktop application for documenting abandoned locations:
- Import and organize media files
- GPS-based location management
- Metadata extraction and storage
- Interactive mapping interface
- Local-first data ownership

### Future Objective (v1.0+)

Enable anyone to become a historian for abandoned locations:
- Full research capabilities with citation management
- Wikipedia-style or blog post generation for location histories
- Web scraping for images, videos, and documents
- Collaborative research tools
- Export to multiple formats (PDF, HTML, Markdown)

---

## Development Rules

### Golden Rule: LILBITS
One Script = One Function
Maximum 300 lines of code per script
Break up larger scripts into smaller, focused modules
Document each script in lilbits.md

### Core Rules

- KISS: Keep It Simple, Stupid
- FAANG PE: Facebook/Amazon/Apple/Netflix/Google-level engineering for small teams
- BPL: Bulletproof Long-Term (reliable for 3-10+ years for non-API components)
- BPA: Best Practices Always (check up-to-date docs for all tools)
- NME: No Emojis Ever
- WWYDD: What Would You Do Differently (suggest improvements early)
- DRETW: Don't Re-Invent The Wheel (check GitHub, Reddit for existing solutions)
- PRISONMIKE: Don't mention Claude/AI tools in documentation
- WLO: We Love Open Source
- URBFH: Understand Roadmap But Focus Here
- DAFIDFAF: Don't Add Features I Didn't Ask For
- NGS: No Google Services (no Google Maps, Google APIs, Google Analytics, etc. Use open-source alternatives: Leaflet/OSM for maps, Nominatim for geocoding). Exception: Google Fonts CDN is allowed for brand fonts (Lora, Roboto Mono)

### Core Process

1. Read user prompt, claude.md, techguide.md, lilbits.md
2. Search for and read referenced files/folders or related files in techguide.md
3. Make a plan (fix, troubleshoot, code, brainstorm, optimize, audit, or WWYDD)
4. Audit the plan based on steps 1-2, update plan
5. Write implementation guide for inexperienced developer
6. Write/update/create code/plan based on implementation guide
7. Update techguide.md and lilbits.md with what changed and why

---

## Architecture

### Architecture Pattern

Clean Architecture (3 Layers):

```
PRESENTATION LAYER
- Svelte 5 Components
- Electron Renderer Process
- UI/UX Logic
    |
    v (IPC)
INFRASTRUCTURE LAYER
- Electron Main Process
- SQLite Database
- File System Operations
- External Tools (ExifTool, FFmpeg)
    |
    v
CORE BUSINESS LOGIC
- Domain Models
- Services
- Repository Interfaces
- Framework-Agnostic
```

### Project Structure (Monorepo)

```
au-archive/
├── packages/
│   ├── core/                    # Shared business logic
│   │   ├── src/
│   │   │   ├── domain/          # Entities: Location, Image, Video
│   │   │   ├── services/        # Business logic services
│   │   │   ├── repositories/    # Data access interfaces
│   │   │   └── utils/           # Shared utilities
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   └── desktop/                 # Electron application
│       ├── electron/
│       │   ├── main/            # Main process
│       │   ├── preload/         # Context bridge
│       │   └── repositories/    # SQLite implementations
│       ├── src/
│       │   ├── pages/           # Svelte pages
│       │   ├── components/      # Svelte components
│       │   ├── stores/          # Svelte stores
│       │   └── lib/             # Utilities
│       ├── public/              # Static assets
│       ├── package.json
│       ├── tsconfig.json
│       └── vite.config.ts
│
├── resources/                   # Electron builder resources
│   ├── icons/
│   └── bin/                     # Bundled binaries
│
├── scripts/                     # Build and utility scripts
├── pnpm-workspace.yaml
├── package.json
├── claude.md                    # This file
├── techguide.md                 # Technical implementation guide
├── lilbits.md                   # Script documentation
└── README.md
```

---

## Technology Stack

### Core Technologies

| Component | Technology | Version | Rationale |
|-----------|-----------|---------|-----------|
| Desktop Framework | Electron | 28+ | Cross-platform, web tech, mature ecosystem |
| Frontend Framework | Svelte | 5 | Lightweight, performant, minimal boilerplate |
| Language | TypeScript | 5.3+ | Type safety, prevents bugs, better DX |
| Build Tool | Vite | 5+ | Fast HMR, modern bundling |
| Package Manager | pnpm | 8+ | Fast, efficient, monorepo support |

### Data Layer

| Component | Technology | Rationale |
|-----------|-----------|-----------|
| Database | SQLite (better-sqlite3) | Local-first, fast, zero-config, portable |
| Query Builder | Kysely | Type-safe SQL, migration support |
| Schema Validation | Zod | Runtime validation, type inference |

### UI/Styling

| Component | Technology | Rationale |
|-----------|-----------|-----------|
| CSS Framework | Tailwind CSS | Utility-first, customizable, fast |
| Component Library | Skeleton UI | Svelte-native, Tailwind-based |
| Forms | Superforms + Zod | Type-safe forms, validation |

### Mapping

| Component | Technology | Rationale |
|-----------|-----------|-----------|
| Map Library | Leaflet.js | Lightweight, flexible, extensive plugins |
| Marker Clustering | Supercluster | Fast clustering for 10k+ markers |
| Tile Layers | OSM, ESRI, Carto, OpenTopoMap | Multiple base layers + overlays |
| Geocoding | Nominatim API | Free, OpenStreetMap-based, no API key |

### Media Processing

| Component | Technology | Rationale |
|-----------|-----------|-----------|
| EXIF Extraction | exiftool-vendored | Node wrapper for ExifTool |
| Video Metadata | fluent-ffmpeg | Node wrapper for FFmpeg |
| Image Processing | sharp | Fast image resizing/thumbnails |
| File Hashing | Node crypto (SHA256) | Built-in, secure, fast |

### Development Tools

| Component | Technology |
|-----------|-----------|
| Testing | Vitest + Testing Library |
| E2E Testing | Playwright (future) |
| Linting | ESLint + TypeScript ESLint |
| Formatting | Prettier |
| Git Hooks | Husky (optional) |

---

## Database Schema

### Core Tables

#### locs (Locations)

Primary table for abandoned locations.

```sql
CREATE TABLE locs (
  -- Identity
  locid TEXT PRIMARY KEY,              -- UUID
  loc12 TEXT UNIQUE NOT NULL,          -- 12-char short ID (slugified)

  -- Basic Info
  locnam TEXT NOT NULL,                -- Location name (required)
  slocnam TEXT,                        -- Short name (auto-generated if empty)
  akanam TEXT,                         -- Also Known As name

  -- Classification
  type TEXT,                           -- Primary type (e.g., "Factory", "Hospital")
  stype TEXT,                          -- Sub-type (e.g., "Textile Mill")

  -- GPS (Primary Source of Truth)
  gps_lat REAL,                        -- Latitude
  gps_lng REAL,                        -- Longitude
  gps_accuracy REAL,                   -- Accuracy in meters
  gps_source TEXT,                     -- 'user_map_click', 'photo_exif', 'geocoded_address', 'manual_entry'
  gps_verified_on_map INTEGER DEFAULT 0, -- Boolean: User confirmed on satellite view
  gps_captured_at TEXT,                -- ISO8601 timestamp
  gps_leaflet_data TEXT,               -- JSON: Raw Leaflet event data

  -- Address (Secondary, Optional)
  address_street TEXT,
  address_city TEXT,
  address_county TEXT,
  address_state TEXT CHECK(length(address_state) = 2),
  address_zipcode TEXT,
  address_confidence TEXT,             -- 'high', 'medium', 'low'
  address_geocoded_at TEXT,            -- When reverse-geocoding happened

  -- Status
  condition TEXT,                      -- Condition of building
  status TEXT,                         -- Current status
  documentation TEXT,                  -- Level of documentation
  access TEXT,                         -- Access status
  historic INTEGER DEFAULT 0,          -- Boolean: Historic landmark

  -- Relationships
  sublocs TEXT,                        -- JSON array of sub-location IDs
  sub12 TEXT,                          -- Comma-separated sub-location short IDs

  -- Metadata
  locadd TEXT,                         -- Date location added (ISO8601)
  locup TEXT,                          -- Date location updated (ISO8601)
  auth_imp TEXT,                       -- Author/Importer username

  -- Regions
  regions TEXT,                        -- JSON array of region tags
  state TEXT,                          -- State postal code (legacy field)

  UNIQUE(slocnam)
);

CREATE INDEX idx_locs_state ON locs(address_state);
CREATE INDEX idx_locs_type ON locs(type);
CREATE INDEX idx_locs_gps ON locs(gps_lat, gps_lng) WHERE gps_lat IS NOT NULL;
CREATE INDEX idx_locs_loc12 ON locs(loc12);
```

#### slocs (Sub-Locations)

Sub-locations within a parent location (e.g., "Building 3" inside "Factory Complex").

```sql
CREATE TABLE slocs (
  subid TEXT PRIMARY KEY,              -- UUID
  sub12 TEXT UNIQUE NOT NULL,          -- 12-char short ID
  locid TEXT NOT NULL REFERENCES locs(locid) ON DELETE CASCADE,

  subnam TEXT NOT NULL,                -- Sub-location name
  ssubname TEXT,                       -- Short sub-location name

  UNIQUE(subnam, locid)
);

CREATE INDEX idx_slocs_locid ON slocs(locid);
```

#### imgs (Images)

```sql
CREATE TABLE imgs (
  imgsha TEXT PRIMARY KEY,             -- SHA256 hash (unique identifier)
  imgnam TEXT NOT NULL,                -- Original filename
  imgnamo TEXT NOT NULL,               -- New organized filename (sha256.ext)
  imgloc TEXT NOT NULL,                -- Original file path
  imgloco TEXT NOT NULL,               -- New organized file path

  locid TEXT REFERENCES locs(locid),
  subid TEXT REFERENCES slocs(subid),

  auth_imp TEXT,                       -- Author/Importer
  imgadd TEXT,                         -- Date added (ISO8601)

  meta_exiftool TEXT,                  -- JSON: Full ExifTool output

  -- Extracted metadata (for quick access)
  meta_width INTEGER,
  meta_height INTEGER,
  meta_date_taken TEXT,
  meta_camera_make TEXT,
  meta_camera_model TEXT,
  meta_gps_lat REAL,
  meta_gps_lng REAL
);

CREATE INDEX idx_imgs_locid ON imgs(locid);
CREATE INDEX idx_imgs_subid ON imgs(subid);
CREATE INDEX idx_imgs_sha ON imgs(imgsha);
```

#### vids (Videos)

```sql
CREATE TABLE vids (
  vidsha TEXT PRIMARY KEY,
  vidnam TEXT NOT NULL,
  vidnamo TEXT NOT NULL,
  vidloc TEXT NOT NULL,
  vidloco TEXT NOT NULL,

  locid TEXT REFERENCES locs(locid),
  subid TEXT REFERENCES slocs(subid),

  auth_imp TEXT,
  vidadd TEXT,

  meta_ffmpeg TEXT,                    -- JSON: FFmpeg metadata
  meta_exiftool TEXT,                  -- JSON: ExifTool metadata

  -- Extracted metadata
  meta_duration REAL,                  -- Seconds
  meta_width INTEGER,
  meta_height INTEGER,
  meta_codec TEXT,
  meta_fps REAL,
  meta_date_taken TEXT
);

CREATE INDEX idx_vids_locid ON vids(locid);
CREATE INDEX idx_vids_subid ON vids(subid);
```

#### docs (Documents)

```sql
CREATE TABLE docs (
  docsha TEXT PRIMARY KEY,
  docnam TEXT NOT NULL,
  docnamo TEXT NOT NULL,
  docloc TEXT NOT NULL,
  docloco TEXT NOT NULL,

  locid TEXT REFERENCES locs(locid),
  subid TEXT REFERENCES slocs(subid),

  auth_imp TEXT,
  docadd TEXT,

  meta_exiftool TEXT,

  -- Document-specific metadata
  meta_page_count INTEGER,
  meta_author TEXT,
  meta_title TEXT
);

CREATE INDEX idx_docs_locid ON docs(locid);
```

#### maps (Maps/Historical Maps)

```sql
CREATE TABLE maps (
  mapsha TEXT PRIMARY KEY,
  mapnam TEXT NOT NULL,
  mapnamo TEXT NOT NULL,
  maploc TEXT NOT NULL,
  maploco TEXT NOT NULL,

  locid TEXT REFERENCES locs(locid),
  subid TEXT REFERENCES slocs(subid),

  auth_imp TEXT,
  mapadd TEXT,

  meta_exiftool TEXT,
  meta_map TEXT,                       -- JSON: Map-specific metadata

  reference TEXT,                      -- Reference/source of map
  map_states TEXT,                     -- States covered by map
  map_verified INTEGER DEFAULT 0       -- Boolean: Verified accuracy
);

CREATE INDEX idx_maps_locid ON maps(locid);
```

---

## User Interface

### Pages (Left Menu Navigation)

1. Dashboard (/dashboard)
   - Recent locations (last 5)
   - Top 5 states by location count
   - Top 5 types by count
   - Recent imports
   - Quick actions: Random location, Favorites, Undocumented locations

2. Locations (/locations)
   - List view with filters (state, type, condition, status)
   - Search by name
   - Sortable columns
   - Click location to open detail page

3. Atlas (/atlas) - PRIMARY INTERFACE
   - Full-screen map view
   - Default: Satellite layer (ESRI World Imagery)
   - Show all locations with GPS data
   - Marker clustering (Supercluster)
   - Click pin to open location detail page
   - Right-click map to add location
   - Layer switcher (Street, Satellite, Topo, Labels)
   - Filter overlay (by state, type, status)

4. Imports (/imports)
   - Drag & drop area for files/folders
   - Select location dropdown (with autofill)
   - Import queue status
   - Recent imports history

5. Settings (/settings)
   - User preferences
   - Archive folder location
   - Delete original files on import (on/off)
   - Database backup
   - Map tile cache settings

6. Location Detail (/location/:id)
   - Hero image (first image or logo placeholder)
   - Location name, type, status
   - Address, GPS coordinates
   - Map preview with pin
   - Image gallery (grid view)
   - Video list
   - Documents list
   - Edit/Update buttons
   - Notes section

### Design System

Brand Colors:
- Accent: #b9975c (Gold)
- Background: #fffbf7 (Cream)
- Text/Foreground: #454545 (Dark Gray)

Assets:
- Logo: abandoned-upstate-logo.png
- Icon: abandoned-upstate-icon.png

Typography: System fonts (TBD - match website later)

---

## GPS-First Workflow

### Primary Workflow: Map-First Location Creation

1. User opens Atlas page
2. User switches to Satellite layer (default)
3. User navigates to building location
4. User right-clicks on building
5. Context menu: "Add Location Here"
6. Location form opens with:
   - GPS coordinates pre-filled (lat, lng)
   - gps_source = 'user_map_click'
   - gps_verified_on_map = true
   - Reverse-geocoding runs in background
7. Form auto-fills (after reverse-geocode):
   - address_city
   - address_county
   - address_state
   - address_zipcode
8. User manually enters:
   - locnam (required)
   - type (optional, autofill from existing)
   - stype (optional)
   - condition (dropdown)
   - status (dropdown)
   - documentation (dropdown)
   - access (dropdown)
9. User clicks "Create Location"
10. Location saved to database
11. Pin appears on map
12. Success notification

### Secondary Workflow: Form-First with Map Confirmation

1. User clicks "Add Location" from Locations page
2. Form opens
3. User enters location name, state
4. User clicks "Find on Map" button
5. Map sidebar opens
6. User searches or manually navigates
7. User clicks/drags pin to exact building
8. GPS updates in real-time
9. User clicks "Confirm GPS"
10. gps_verified_on_map = true
11. User completes form
12. Location created

### GPS Data Flow

GPS Source Priority:
1. User map click (verified on satellite) - HIGHEST CONFIDENCE
2. Photo EXIF GPS - HIGH CONFIDENCE (if accuracy < 10m)
3. Geocoded address - MEDIUM CONFIDENCE
4. Manual lat/lng entry - LOW CONFIDENCE

GPS Confidence Levels:
- verified: Map-clicked + user confirmed on satellite
- high: Photo EXIF with good accuracy
- medium: Geocoded from address
- low: Manual entry or poor accuracy
- none: No GPS data

---

## File Organization System

### Folder Structure

```
[USER_SELECTED_ARCHIVE_FOLDER]/
├── locations/
│   └── [STATE]-[TYPE]/              # e.g., "NY-Factory"
│       └── [SLOCNAM]-[LOC12]/       # e.g., "old-facto-abc123def456"
│           ├── org-img-[LOC12]/     # Original images
│           ├── org-vid-[LOC12]/     # Original videos
│           └── org-doc-[LOC12]/     # Original documents
│
└── documents/
    └── maps/
        ├── user-maps/               # User-uploaded maps
        └── archive-maps/            # Historical archive maps
```

### File Naming Convention

All imported files renamed to:
```
[SHA256].[extension]
```

Example:
```
Original: IMG_1234.jpg
New: a3d5e8f9c1b2d4e6f8a0c2d4e6f8a0c2d4e6f8a0c2d4e6f8a0c2d4e6f8a0c2d4.jpg
```

Benefits:
- Deduplication (same file = same hash)
- Integrity verification
- Avoid filename collisions
- Preserve original filename in database

---

## Import Pipeline

### Import Workflow

1. User selects files/folder + target location
2. For each file:
   a. Calculate SHA256 hash
   b. Check database for duplicate (by SHA256)
   c. If duplicate: Skip or prompt user
   d. If new:
      i. Extract metadata (ExifTool/FFmpeg)
      ii. Determine file type (image/video/document)
      iii. Create organized folder structure
      iv. Copy/hardlink file to new location
      v. Verify integrity (re-calculate SHA256)
      vi. Insert record into database
      vii. If deleteOnImport=true: delete original
3. Show import summary
4. Generate thumbnails (background job)

### Metadata Extraction

Images:
```typescript
// Using exiftool-vendored
const exif = await exiftool.read(filePath);

// Store full metadata as JSON
const metadata = {
  width: exif.ImageWidth,
  height: exif.ImageHeight,
  dateTaken: exif.DateTimeOriginal,
  cameraMake: exif.Make,
  cameraModel: exif.Model,
  gps: exif.GPSLatitude && exif.GPSLongitude ? {
    lat: exif.GPSLatitude,
    lng: exif.GPSLongitude,
    altitude: exif.GPSAltitude,
    accuracy: exif.GPSHPositioningError,
  } : null,
};
```

Videos:
```typescript
// Using fluent-ffmpeg
const metadata = await new Promise((resolve, reject) => {
  ffmpeg.ffprobe(filePath, (err, metadata) => {
    if (err) reject(err);
    else resolve(metadata);
  });
});

// Extract key fields
const videoInfo = {
  duration: metadata.format.duration,
  width: metadata.streams[0].width,
  height: metadata.streams[0].height,
  codec: metadata.streams[0].codec_name,
  fps: eval(metadata.streams[0].r_frame_rate),
};
```

### GPS Validation (Photo Import)

```typescript
// When importing photo with GPS to a location
if (photoGPS && locationGPS) {
  const distance = calculateDistance(photoGPS, locationGPS);

  if (distance > 100) { // meters
    // Warn: GPS mismatch
    showDialog({
      title: 'GPS Mismatch',
      message: `Photo GPS is ${distance}m from location GPS`,
      options: [
        'Use Photo GPS (update location)',
        'Use Location GPS (ignore photo GPS)',
        'Create New Location',
        'Cancel'
      ]
    });
  }
}

// If location has no GPS, suggest adding from photo
if (!locationGPS && photoGPS) {
  showDialog({
    title: 'Add GPS from Photo?',
    message: 'Photo contains GPS. Add to location?',
    options: ['Yes', 'No']
  });
}
```

---

## Mapping Configuration

### Tile Layers

Base Layers:
```typescript
const baseLayers = {
  'Satellite': {
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution: 'ESRI World Imagery',
    maxZoom: 19,
    default: true // DEFAULT LAYER
  },
  'Street': {
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: 'OpenStreetMap contributors',
    maxZoom: 19
  },
  'Topographic': {
    url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
    attribution: 'OpenTopoMap',
    maxZoom: 17
  }
};

const overlays = {
  'Labels': {
    url: 'https://{s}.basemaps.cartocdn.com/light_only_labels/{z}/{x}/{y}.png',
    attribution: 'CARTO',
    maxZoom: 19
  }
};
```

### Marker Clustering

```typescript
// Use Supercluster for performance
import Supercluster from 'supercluster';

const cluster = new Supercluster({
  radius: 60,        // Cluster radius in pixels
  maxZoom: 16,       // Max zoom to cluster points
  minZoom: 0,
  minPoints: 2,      // Min points to form cluster
});

// Load location points
cluster.load(locations.map(loc => ({
  type: 'Feature',
  properties: {
    id: loc.locid,
    name: loc.locnam,
    type: loc.type,
    confidence: loc.gpsConfidence,
  },
  geometry: {
    type: 'Point',
    coordinates: [loc.gps_lng, loc.gps_lat]
  }
})));
```

### Marker Styling (by GPS Confidence)

```typescript
function getMarkerIcon(location: Location): L.Icon {
  const confidence = location.getGPSConfidence();

  const colors = {
    verified: '#10b981',  // Green
    high: '#3b82f6',      // Blue
    medium: '#f59e0b',    // Yellow/Orange
    low: '#ef4444',       // Red
    none: '#6b7280',      // Gray
  };

  return L.divIcon({
    className: 'custom-marker',
    html: `<div style="background: ${colors[confidence]}">PIN</div>`
  });
}
```

---

## IPC Architecture (Electron)

### IPC Channels

Database Operations:
```typescript
// Main Process (electron/main/ipc/database.ts)
ipcMain.handle('db:location:create', async (event, data) => {
  return await locationRepository.create(data);
});

ipcMain.handle('db:location:findAll', async (event, filters) => {
  return await locationRepository.findAll(filters);
});

// Renderer Process (src/lib/api/database.ts)
export const dbApi = {
  location: {
    create: (data) => ipcRenderer.invoke('db:location:create', data),
    findAll: (filters) => ipcRenderer.invoke('db:location:findAll', filters),
  }
};
```

File Operations:
```typescript
ipcMain.handle('file:import', async (event, { filePath, locId }) => {
  return await fileImportService.import(filePath, locId);
});

ipcMain.handle('file:calculateSHA256', async (event, filePath) => {
  return await calculateSHA256(filePath);
});
```

Metadata Extraction:
```typescript
ipcMain.handle('metadata:extractExif', async (event, filePath) => {
  return await exiftoolService.extract(filePath);
});

ipcMain.handle('metadata:extractVideo', async (event, filePath) => {
  return await ffmpegService.extractMetadata(filePath);
});
```

Geocoding:
```typescript
ipcMain.handle('geocode:reverse', async (event, { lat, lng }) => {
  return await geocodingService.reverseGeocode(lat, lng);
});
```

### Context Bridge (Preload)

```typescript
// electron/preload/index.ts
import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  db: {
    location: {
      create: (data) => ipcRenderer.invoke('db:location:create', data),
      findAll: (filters) => ipcRenderer.invoke('db:location:findAll', filters),
    },
  },
  file: {
    import: (filePath, locId) => ipcRenderer.invoke('file:import', { filePath, locId }),
    calculateSHA256: (filePath) => ipcRenderer.invoke('file:calculateSHA256', filePath),
  },
  metadata: {
    extractExif: (filePath) => ipcRenderer.invoke('metadata:extractExif', filePath),
    extractVideo: (filePath) => ipcRenderer.invoke('metadata:extractVideo', filePath),
  },
  geocode: {
    reverse: (lat, lng) => ipcRenderer.invoke('geocode:reverse', { lat, lng }),
  }
});
```

---

## Testing Strategy

### Coverage Goals

- Core Business Logic: 70%+ (domain models, services)
- Repository Layer: 60%+ (database operations)
- UI Components: 40%+ (critical paths only)
- E2E: Key workflows (import, location creation)

### Test Structure

```
tests/
├── unit/
│   ├── core/
│   │   ├── domain/
│   │   │   └── location.test.ts
│   │   ├── services/
│   │   │   ├── import-service.test.ts
│   │   │   └── location-service.test.ts
│   │   └── utils/
│   │       ├── crypto.test.ts
│   │       └── validation.test.ts
│   └── desktop/
│       └── repositories/
│           └── sqlite-location-repository.test.ts
├── integration/
│   └── import-workflow.test.ts
└── e2e/ (future)
    └── location-creation.spec.ts
```

### Testing Tools

```json
{
  "devDependencies": {
    "vitest": "^1.2.0",
    "@testing-library/svelte": "^4.0.5",
    "@vitest/coverage-v8": "^1.2.0"
  }
}
```

---

## Deployment & Distribution

### Build Configuration

Electron Builder:
```json
{
  "build": {
    "appId": "com.abandonedupstate.archive",
    "productName": "Abandoned Upstate Archive",
    "directories": {
      "output": "dist"
    },
    "files": [
      "dist-electron/**/*",
      "dist/**/*",
      "package.json"
    ],
    "extraResources": [
      {
        "from": "resources/bin",
        "to": "bin"
      }
    ],
    "mac": {
      "target": ["dmg", "zip"],
      "category": "public.app-category.productivity"
    },
    "linux": {
      "target": ["AppImage", "deb"],
      "category": "Office"
    },
    "win": {
      "target": ["nsis"]
    }
  }
}
```

### Bundled External Tools

```
resources/
└── bin/
    ├── exiftool           # Perl binary
    ├── ffmpeg             # FFmpeg binary
    └── ffprobe            # FFprobe binary
```

Platform-specific binaries:
- macOS: Universal binary (x64 + arm64)
- Linux: x64
- Windows: (future) x64

---

## Feature Roadmap

### v0.1 (MVP - Weeks 1-4)
- SQLite database setup
- Location CRUD operations
- Basic location form
- File import with SHA256
- Folder organization
- Location list page
- Settings page

### v0.2 (Media & Metadata - Weeks 5-7)
- ExifTool integration
- FFmpeg integration
- Thumbnail generation
- Image gallery
- Metadata viewer

### v0.3 (Mapping - Weeks 8-10)
- Leaflet integration
- Show locations on map
- Satellite layer (default)
- Click pin to location detail
- Tile layer switching
- Marker clustering

### v0.4 (GPS-First - Weeks 11-12)
- Right-click to add location
- Reverse-geocoding
- GPS confidence indicators
- Photo GPS extraction
- GPS mismatch detection

### v0.5 (Polish - Weeks 13-14)
- Dashboard implementation
- Search & filters
- Sub-location support
- Export functionality

### v1.0 (Future)
- Web scraping for images/videos/documents
- Research tools with citations
- Wikipedia/blog post generation
- Collaborative features
- Advanced analytics

---

## Security & Privacy

### Data Security

- Local-First: All data stored locally, no cloud by default
- No Telemetry: No tracking, analytics, or data collection
- User Data Ownership: User owns all data, can export/backup anytime

### Input Validation

- All user input validated with Zod schemas
- SQL injection prevention (prepared statements via Kysely)
- File type validation on import
- GPS coordinate bounds checking

### File System Security

- Sandboxed file access via Electron
- User selects archive folder (no arbitrary file access)
- SHA256 integrity verification on import

---

## Development Guidelines

### Code Style

- TypeScript: Strict mode enabled
- Naming: camelCase for variables/functions, PascalCase for classes/components
- Formatting: Prettier with 2-space indentation
- Linting: ESLint with TypeScript rules

### Git Workflow

- Main Branch: main (protected)
- Feature Branches: feature/description
- Commit Messages: Conventional Commits format
  - feat: New feature
  - fix: Bug fix
  - refactor: Code refactoring
  - docs: Documentation
  - test: Tests
  - chore: Build/tooling

### Performance Targets

- App Launch: < 3 seconds
- Database Query: < 100ms for 10k locations
- File Import: Real-time progress feedback
- Map Rendering: 60fps with 1000+ markers (clustered)

---

## Documentation Files

### claude.md (this file)
Technical specification and architecture overview

### techguide.md
Detailed technical implementation guide
- Component implementation details
- API documentation
- Configuration examples
- Troubleshooting guide

### lilbits.md
Script-by-script documentation
- Purpose of each script
- Function signatures
- Usage examples
- Dependencies

---

End of Specification
