// Database table type definitions for Kysely

export interface Database {
  locs: LocsTable;
  slocs: SlocsTable;
  imgs: ImgsTable;
  vids: VidsTable;
  docs: DocsTable;
  maps: MapsTable;
  settings: SettingsTable;
  imports: ImportsTable;
  notes: NotesTable;
  projects: ProjectsTable;
  project_locations: ProjectLocationsTable;
  bookmarks: BookmarksTable;
  users: UsersTable;
  location_authors: LocationAuthorsTable;
  location_views: LocationViewsTable;
  video_proxies: VideoProxiesTable;
  ref_maps: RefMapsTable;
  ref_map_points: RefMapPointsTable;
  location_exclusions: LocationExclusionsTable;
  sidecar_imports: SidecarImportsTable;
}

// Locations table
export interface LocsTable {
  // Identity
  locid: string;
  loc12: string;

  // Basic Info
  locnam: string;
  slocnam: string | null;
  akanam: string | null;

  // Classification
  type: string | null;
  stype: string | null;

  // GPS (Primary Source of Truth)
  gps_lat: number | null;
  gps_lng: number | null;
  gps_accuracy: number | null;
  gps_source: string | null;
  gps_verified_on_map: number;
  gps_captured_at: string | null;
  gps_leaflet_data: string | null;
  // Kanye9: Track cascade geocoding tier for accurate zoom levels
  gps_geocode_tier: number | null;     // 1-5 (1=full address, 5=state only)
  gps_geocode_query: string | null;    // The query that succeeded

  // Address (Secondary, Optional)
  address_street: string | null;
  address_city: string | null;
  address_county: string | null;
  address_state: string | null;
  address_zipcode: string | null;
  address_confidence: string | null;
  address_geocoded_at: string | null;

  // Address Normalization (Kanye9: Raw + Normalized storage)
  address_raw: string | null;           // Original input exactly as entered
  address_normalized: string | null;    // Formatted normalized string
  address_parsed_json: string | null;   // JSON of parsed components
  address_source: string | null;        // 'libpostal' | 'fallback' | 'nominatim' | 'manual'

  // Address Verification (DECISION-010: Verification tracking)
  address_verified: number;             // 0/1 - User confirmed address is correct
  address_verified_at: string | null;   // ISO timestamp when verified
  address_verified_by: string | null;   // 'user' (future: 'api', 'import')

  // GPS Verification Metadata (DECISION-010: gps_verified_on_map already exists)
  gps_verified_at: string | null;       // ISO timestamp when verified
  gps_verified_by: string | null;       // 'user' (future: 'api', 'import')

  // Location-level Verification (DECISION-010: Computed when BOTH address AND GPS verified)
  location_verified: number;            // 0/1 - Set when both address_verified AND gps_verified_on_map are 1
  location_verified_at: string | null;  // ISO timestamp when both became verified

  // Cultural Region (DECISION-011: User-entered, subjective, does NOT count toward Location ✓)
  cultural_region: string | null;

  // Census Regions (DECISION-012: Auto-populated from state/GPS, offline-first)
  census_region: string | null;     // Northeast, Midwest, South, West
  census_division: string | null;   // New England, Middle Atlantic, etc. (9 divisions)
  state_direction: string | null;   // e.g., "Eastern NY", "Central TX"

  // DECISION-017: Country Cultural Region and geographic hierarchy
  country_cultural_region: string | null;           // 50 national-level regions (NYC Metro, Cascadia, etc.)
  country_cultural_region_verified: number;         // 0/1 - User verified the country cultural region
  local_cultural_region_verified: number;           // 0/1 - User verified the local cultural region
  country: string | null;                           // Default: "United States"
  continent: string | null;                         // Default: "North America"

  // Status
  condition: string | null;
  status: string | null;
  documentation: string | null;
  access: string | null;
  historic: number;
  favorite: number;

  // DECISION-013: Information box fields
  built_year: string | null;       // Text storage for year, range, or date
  built_type: string | null;       // 'year', 'range', 'date' for UI formatting
  abandoned_year: string | null;
  abandoned_type: string | null;
  project: number;                 // 0/1 boolean for project membership
  doc_interior: number;            // 0/1 Documentation checkboxes
  doc_exterior: number;
  doc_drone: number;
  doc_web_history: number;
  doc_map_find: number;            // 0/1 Map Find documentation checkbox

  // Status tracking
  status_changed_at: string | null; // ISO timestamp when status last changed

  // DECISION-019: Information Box overhaul fields
  historical_name: string | null;  // Historical/original name of location
  locnam_verified: number;         // 0/1 - User verified location name is correct
  historical_name_verified: number; // 0/1 - User verified historical name is correct
  akanam_verified: number;         // 0/1 - User verified AKA name is correct

  // Hero Image (Kanye6: User-selected featured image)
  hero_imgsha: string | null;

  // Hero Display Name (Migration 21: Smart title shortening)
  locnam_short: string | null;    // Optional custom short name for hero display
  locnam_use_the: number;         // 0/1 - Prepend "The" to display name

  // Hero Focal Point (Migration 22: Crop center for hero images)
  hero_focal_x: number;           // 0-1 horizontal position (0.5 = center)
  hero_focal_y: number;           // 0-1 vertical position (0.5 = center)

  // Relationships
  sublocs: string | null;
  sub12: string | null;

  // Metadata
  locadd: string | null;
  locup: string | null;
  auth_imp: string | null;

  // Activity Tracking (Migration 25)
  created_by_id: string | null;    // User ID who created the location
  created_by: string | null;       // Username for display
  modified_by_id: string | null;   // User ID who last modified
  modified_by: string | null;      // Username for display
  modified_at: string | null;      // ISO timestamp of last modification

  // View tracking (Migration 33)
  view_count: number;              // Number of times location has been viewed
  last_viewed_at: string | null;   // ISO timestamp of last view

  // BagIt Archive (Migration 40) - Self-documenting archive per RFC 8493
  bag_status: string | null;       // 'none' | 'valid' | 'complete' | 'incomplete' | 'invalid'
  bag_last_verified: string | null; // ISO timestamp of last integrity check
  bag_last_error: string | null;   // Error message if validation failed

  // Regions
  regions: string | null;
  state: string | null;
}

// Sub-Locations table
export interface SlocsTable {
  subid: string;
  sub12: string;
  locid: string;

  subnam: string;
  ssubname: string | null;

  // Migration 28: Enhanced sub-location fields
  type: string | null;
  status: string | null;
  hero_imgsha: string | null;
  is_primary: number;  // 0 or 1

  // Activity tracking
  created_date: string | null;
  created_by: string | null;
  modified_date: string | null;
  modified_by: string | null;

  // Migration 31: Sub-location GPS (separate from host location)
  gps_lat: number | null;
  gps_lng: number | null;
  gps_accuracy: number | null;
  gps_source: string | null;
  gps_verified_on_map: number;  // 0 or 1
  gps_captured_at: string | null;

  // Migration 32: AKA and historical name for sub-locations
  akanam: string | null;
  historicalName: string | null;
}

// Images table
export interface ImgsTable {
  imgsha: string;
  imgnam: string;
  imgnamo: string;
  imgloc: string;
  imgloco: string;

  locid: string | null;
  subid: string | null;

  auth_imp: string | null;
  imgadd: string | null;

  meta_exiftool: string | null;

  // Extracted metadata
  meta_width: number | null;
  meta_height: number | null;
  meta_date_taken: string | null;
  meta_camera_make: string | null;
  meta_camera_model: string | null;
  meta_gps_lat: number | null;
  meta_gps_lng: number | null;

  // Thumbnails and previews (Migration 8)
  thumb_path: string | null;
  preview_path: string | null;
  preview_extracted: number;

  // Multi-tier thumbnails (Migration 9 - Premium Archive)
  thumb_path_sm: string | null;  // 400px - grid view (1x)
  thumb_path_lg: string | null;  // 800px - grid view (2x HiDPI)

  // XMP sync status (Migration 8)
  xmp_synced: number;
  xmp_modified_at: string | null;

  // Hidden/Live Photo fields (Migration 23)
  hidden: number;
  hidden_reason: string | null;
  is_live_photo: number;

  // Activity Tracking (Migration 25)
  imported_by_id: string | null;   // User ID who imported this media
  imported_by: string | null;      // Username for display
  media_source: string | null;     // e.g., "Personal camera", "Facebook archive", "Web archive"

  // Contributor Tracking (Migration 26)
  is_contributed: number;          // 0 = author shot it, 1 = contributor
  contribution_source: string | null; // e.g., "John Smith via text", "FB group"

  // Migration 30: Preview quality tracking for RAW files
  preview_quality: string | null;  // 'full' | 'embedded' | 'low'

  // NOTE: darktable columns exist in DB but are deprecated/unused
  // darktable_path, darktable_processed, darktable_processed_at - REMOVED from app
}

// Videos table
export interface VidsTable {
  vidsha: string;
  vidnam: string;
  vidnamo: string;
  vidloc: string;
  vidloco: string;

  locid: string | null;
  subid: string | null;

  auth_imp: string | null;
  vidadd: string | null;

  meta_ffmpeg: string | null;
  meta_exiftool: string | null;

  // Extracted metadata
  meta_duration: number | null;
  meta_width: number | null;
  meta_height: number | null;
  meta_codec: string | null;
  meta_fps: number | null;
  meta_date_taken: string | null;
  // FIX 3.2: GPS from video metadata (dashcams, phones)
  meta_gps_lat: number | null;
  meta_gps_lng: number | null;

  // Poster frames (Migration 8)
  thumb_path: string | null;
  poster_extracted: number;

  // Multi-tier thumbnails (Migration 9 - Premium Archive)
  thumb_path_sm: string | null;  // 400px - grid view (1x)
  thumb_path_lg: string | null;  // 800px - grid view (2x HiDPI)
  preview_path: string | null;   // 1920px - lightbox

  // XMP sync status (Migration 8)
  xmp_synced: number;
  xmp_modified_at: string | null;

  // Hidden/Live Photo fields (Migration 23)
  hidden: number;
  hidden_reason: string | null;
  is_live_photo: number;

  // Activity Tracking (Migration 25)
  imported_by_id: string | null;   // User ID who imported this media
  imported_by: string | null;      // Username for display
  media_source: string | null;     // e.g., "Personal camera", "Facebook archive", "Web archive"

  // Contributor Tracking (Migration 26)
  is_contributed: number;          // 0 = author shot it, 1 = contributor
  contribution_source: string | null; // e.g., "John Smith via text", "FB group"
}

// Documents table
export interface DocsTable {
  docsha: string;
  docnam: string;
  docnamo: string;
  docloc: string;
  docloco: string;

  locid: string | null;
  subid: string | null;

  auth_imp: string | null;
  docadd: string | null;

  meta_exiftool: string | null;

  // Document-specific metadata
  meta_page_count: number | null;
  meta_author: string | null;
  meta_title: string | null;

  // Hidden fields (Migration 23)
  hidden: number;
  hidden_reason: string | null;

  // Activity Tracking (Migration 25)
  imported_by_id: string | null;   // User ID who imported this media
  imported_by: string | null;      // Username for display
  media_source: string | null;     // e.g., "Personal camera", "Facebook archive", "Web archive"

  // Contributor Tracking (Migration 27)
  is_contributed: number;          // 0 = author shot it, 1 = contributor
  contribution_source: string | null; // e.g., "John Smith via text", "FB group"
}

// Maps table
export interface MapsTable {
  mapsha: string;
  mapnam: string;
  mapnamo: string;
  maploc: string;
  maploco: string;

  locid: string | null;
  subid: string | null;

  auth_imp: string | null;
  mapadd: string | null;

  meta_exiftool: string | null;
  meta_map: string | null;
  // FIX 3.4: GPS from parsed GPX/KML files
  meta_gps_lat: number | null;
  meta_gps_lng: number | null;

  reference: string | null;
  map_states: string | null;
  map_verified: number;

  // Multi-tier thumbnails (Migration 9 - Premium Archive)
  thumb_path_sm: string | null;  // 400px - grid view (1x)
  thumb_path_lg: string | null;  // 800px - grid view (2x HiDPI)
  preview_path: string | null;   // 1920px - lightbox

  // Activity Tracking (Migration 25)
  imported_by_id: string | null;   // User ID who imported this media
  imported_by: string | null;      // Username for display
  media_source: string | null;     // e.g., "Personal camera", "Facebook archive", "Web archive"
}

// Settings table
export interface SettingsTable {
  key: string;
  value: string;
}

// Imports table
export interface ImportsTable {
  import_id: string;
  locid: string | null;
  import_date: string;
  auth_imp: string | null;
  img_count: number;
  vid_count: number;
  doc_count: number;
  map_count: number;
  notes: string | null;
}

// Notes table
export interface NotesTable {
  note_id: string;
  locid: string;
  note_text: string;
  note_date: string;
  auth_imp: string | null;
  note_type: string;
}

// Projects table
export interface ProjectsTable {
  project_id: string;
  project_name: string;
  description: string | null;
  created_date: string;
  auth_imp: string | null;
}

// Project Locations junction table
export interface ProjectLocationsTable {
  project_id: string;
  locid: string;
  added_date: string;
}

// Bookmarks table
export interface BookmarksTable {
  bookmark_id: string;
  url: string;
  title: string | null;
  locid: string | null;
  subid: string | null;  // Migration 35: Sub-location support
  bookmark_date: string;
  auth_imp: string | null;
  thumbnail_path: string | null;
}

// Users table
export interface UsersTable {
  user_id: string;
  username: string;
  display_name: string | null;
  created_date: string;
  // Authentication (Migration 24)
  pin_hash: string | null;
  is_active: number;
  last_login: string | null;
}

// Location Authors junction table (Migration 25)
export interface LocationAuthorsTable {
  locid: string;
  user_id: string;
  role: string;      // 'creator', 'documenter', 'contributor'
  added_at: string;  // ISO timestamp
}

// Location Views table (Migration 34) - Per-user view tracking
export interface LocationViewsTable {
  view_id: string;
  locid: string;
  user_id: string;
  viewed_at: string;  // ISO timestamp
}

// Video Proxies table (Migration 36) - Optimized H.264 preview videos
// Per video-proxy-system-plan.md: Enables instant playback, smooth scrubbing, and correct rotation
export interface VideoProxiesTable {
  vidsha: string;           // Primary key, matches vids table
  proxy_path: string;       // Absolute path to proxy file
  generated_at: string;     // ISO timestamp when proxy was created
  last_accessed: string;    // ISO timestamp for 30-day purge
  file_size_bytes: number | null;
  original_width: number | null;
  original_height: number | null;
  proxy_width: number | null;
  proxy_height: number | null;
}

// Migration 37: Reference Maps - User-imported map files
export interface RefMapsTable {
  map_id: string;
  map_name: string;
  file_path: string;
  file_type: string;        // kml, kmz, gpx, geojson, csv, shp
  point_count: number;
  imported_at: string;
  imported_by: string | null;
}

// Migration 37: Reference Map Points - Extracted from imported maps
export interface RefMapPointsTable {
  point_id: string;
  map_id: string;
  name: string | null;
  description: string | null;
  lat: number;
  lng: number;
  state: string | null;
  category: string | null;
  raw_metadata: string | null;  // JSON blob
  // Migration 39: AKA names from merged duplicate pins
  aka_names: string | null;     // Pipe-separated alternate names
}

// Migration 38: Location Exclusions - "Different place" decisions
// ADR: ADR-pin-conversion-duplicate-prevention.md
// Stores user decisions that two names refer to different places
export interface LocationExclusionsTable {
  exclusion_id: string;
  name_a: string;
  name_b: string;
  decided_at: string;
  decided_by: string | null;
}

// Migration 41: Sidecar Imports - Metadata-only imports from XML sidecars
// When a media file has a matching .xml sidecar, we can import just the metadata
// without bringing the actual media file into the archive
export interface SidecarImportsTable {
  sidecar_id: string;
  original_filename: string;    // e.g., "IMG_1234.jpg"
  original_path: string;        // Full path to original media file
  xml_filename: string;         // e.g., "IMG_1234.xml"
  xml_path: string;             // Full path to XML sidecar file
  xml_content: string | null;   // Raw XML content
  parsed_metadata: string | null; // Parsed JSON metadata
  media_type: string | null;    // 'image', 'video', etc.
  import_date: string;          // ISO timestamp
  imported_by: string | null;   // Username for display
  imported_by_id: string | null; // User ID reference
  locid: string | null;         // Location reference
  subid: string | null;         // Sub-location reference
}
