/**
 * Dispatch Types
 *
 * Shared type definitions for dispatch hub integration.
 * Used by both CLI and Electron implementations.
 */

// Import shared types to avoid conflicts
import type { JobType, JobStatus } from '../shared/types.js';

// Re-export for convenience
export type { JobType, JobStatus };

// ============================================
// Configuration
// ============================================

export interface DispatchConfig {
  hubUrl: string;
  autoReconnect: boolean;
  reconnectInterval: number;
  dataDir: string;
}

// ============================================
// Token Storage
// ============================================

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

export interface TokenStorage {
  save(tokens: TokenPair): void;
  load(): TokenPair | null;
  clear(): void;
}

// ============================================
// Jobs
// ============================================

export type JobPriority = 'CRITICAL' | 'HIGH' | 'NORMAL' | 'LOW' | 'BULK';

export interface JobSubmission {
  type: JobType;
  plugin: string;
  priority?: JobPriority;
  data: {
    source: string;
    destination?: string;
    options?: Record<string, unknown>;
  };
}

export interface JobProgress {
  jobId: string;
  progress: number;
  stage?: string;
}

export interface JobUpdate {
  jobId: string;
  status: JobStatus;
  result?: unknown;
  error?: string;
  workerId?: string;
  retryCount?: number;
  movedToDLQ?: boolean;
}

// ============================================
// Workers
// ============================================

export interface Worker {
  id: string;
  name: string;
  status: 'online' | 'busy' | 'offline';
  capabilities: string[];
  plugins: string[];
}

// ============================================
// Status
// ============================================

export interface DispatchStatus {
  connected: boolean;
  authenticated: boolean;
  hubUrl: string;
}

// ============================================
// Events
// ============================================

export interface DispatchClientEvents {
  connected: () => void;
  disconnected: (reason?: string) => void;
  'auth:required': () => void;
  'auth:logout': () => void;
  'job:progress': (data: JobProgress) => void;
  'job:updated': (data: JobUpdate) => void;
  error: (data: { type: string; error: unknown }) => void;
}

// ============================================
// Data API Types (Locations, Media, Maps)
// Prefixed with "Api" to avoid conflicts with core types
// ============================================

export interface ApiLocationFilters {
  search?: string;
  status?: 'active' | 'demolished' | 'restricted' | 'unknown';
  state?: string;
  city?: string;
  category?: string;
  favorite?: boolean;
  project?: boolean;
  historic?: boolean;
  limit?: number;
  offset?: number;
}

export interface ApiLocation {
  id: string;
  name: string;
  shortName?: string;
  akaName?: string;
  category?: string;
  class?: string;
  gpsLat?: number;
  gpsLon?: number;
  gpsAccuracy?: number;
  gpsSource?: string;
  gpsVerifiedOnMap?: boolean;
  addressStreet?: string;
  addressCity?: string;
  addressCounty?: string;
  addressState?: string;
  addressZipcode?: string;
  addressCountry?: string;
  status: string;
  access?: string;
  documentation?: string;
  accessNotes?: string;
  historic?: boolean;
  favorite?: boolean;
  project?: boolean;
  builtYear?: number;
  builtType?: string;
  abandonedYear?: number;
  abandonedType?: string;
  imgCount?: number;
  vidCount?: number;
  docCount?: number;
  mapCount?: number;
  totalSizeBytes?: number;
  heroMediaId?: string;
  viewCount?: number;
  lastViewedAt?: string;
  timeline?: Array<{ date: string; event: string; notes?: string }>;
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  legacyLocid?: string;
}

export interface ApiCreateLocationInput {
  name: string;
  shortName?: string;
  akaName?: string;
  category?: string;
  class?: string;
  gps?: {
    lat: number;
    lng: number;
    accuracy?: number;
    source?: string;
    verifiedOnMap?: boolean;
  };
  address?: {
    street?: string;
    city?: string;
    county?: string;
    state?: string;
    zipcode?: string;
    country?: string;
  };
  status?: 'active' | 'demolished' | 'restricted' | 'unknown';
  access?: string;
  documentation?: string;
  accessNotes?: string;
  historic?: boolean;
  favorite?: boolean;
  project?: boolean;
  builtYear?: number;
  builtType?: string;
  abandonedYear?: number;
  abandonedType?: string;
  timeline?: Array<{ date: string; event: string; notes?: string }>;
  metadata?: Record<string, unknown>;
  legacyLocid?: string;
}

export interface ApiMediaFilters {
  locationId?: string;
  sublocationId?: string;
  mimeType?: string;
  limit?: number;
  offset?: number;
}

export interface ApiMedia {
  id: string;
  blake3Hash: string;
  filename: string;
  filepath: string;
  mimeType: string;
  sizeBytes: number;
  width?: number;
  height?: number;
  duration?: number;
  gpsLat?: number;
  gpsLon?: number;
  gpsAlt?: number;
  capturedAt?: string;
  thumbPath?: string;
  thumbPathSm?: string;
  thumbPathLg?: string;
  previewPath?: string;
  posterPath?: string;
  hidden?: boolean;
  hiddenReason?: string;
  isLivePhoto?: boolean;
  locationId?: string;
  sublocationId?: string;
  xmpData?: Record<string, unknown>;
  exifData?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  legacyHash?: string;
}

export interface ApiCreateMediaInput {
  blake3Hash: string;
  filename: string;
  filepath: string;
  mimeType: string;
  sizeBytes: number;
  width?: number;
  height?: number;
  duration?: number;
  gpsLat?: number;
  gpsLon?: number;
  gpsAlt?: number;
  capturedAt?: string;
  locationId?: string;
  sublocationId?: string;
  xmpData?: Record<string, unknown>;
  exifData?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

export interface MediaTag {
  id: string;
  mediaId: string;
  tag: string;
  confidence: number;
  source: 'manual' | 'ml' | 'exif' | 'import';
  category?: string;
  createdAt: string;
}

export interface AddTagInput {
  tag: string;
  confidence?: number;
  source?: 'manual' | 'ml' | 'exif' | 'import';
  category?: string;
}

export interface Sublocation {
  id: string;
  locationId: string;
  name: string;
  shortName?: string;
  isPrimary?: boolean;
  gpsLat?: number;
  gpsLon?: number;
  gpsAccuracy?: number;
  gpsSource?: string;
  mediaCount?: number;
  createdAt: string;
  updatedAt?: string;
  legacySubid?: string;
}

export interface LocationNote {
  id: string;
  locationId: string;
  noteText: string;
  noteType: string;
  createdAt: string;
}

export interface MapPoint {
  name?: string;
  lat: number;
  lon: number;
  address?: string;
  city?: string;
  state?: string;
  country?: string;
  notes?: string;
  metadata?: Record<string, unknown>;
}

export interface ParsedMapResult {
  points: MapPoint[];
  count: number;
  format: string;
}

export interface DedupResult {
  unique: MapPoint[];
  duplicates: Array<{ original: MapPoint; duplicate: MapPoint; distance: number }>;
  stats: {
    input: number;
    output: number;
    removed: number;
    threshold: number;
  };
}

export interface MatchResult {
  matches: Array<{ source: MapPoint; target: MapPoint; distance: number; nameSimilarity?: number }>;
  unmatchedSource: MapPoint[];
  unmatchedTarget: MapPoint[];
  stats: {
    sourceCount: number;
    targetCount: number;
    matchCount: number;
  };
}

export interface ExportResult {
  content: string;
  contentType: string;
  filename: string;
  pointCount: number;
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    total: number;
    limit: number;
    offset: number;
  };
}

// ============================================
// Web Sources
// ============================================

export interface WebSourceVersion {
  id: string;
  sourceId: string;
  versionNumber: number;
  archivedAt: string;
  archivePath?: string;
  screenshotPath?: string;
  pdfPath?: string;
  htmlPath?: string;
  warcPath?: string;
  wordCount?: number;
  imageCount?: number;
  videoCount?: number;
  contentHash?: string;
  contentChanged?: boolean;
  diffSummary?: string;
}

export interface WebSource {
  id: string;
  url: string;
  title?: string;
  locationId?: string;
  sublocationId?: string;
  sourceType: string;
  notes?: string;
  status: 'pending' | 'archiving' | 'complete' | 'partial' | 'failed';
  // Extracted metadata
  extractedTitle?: string;
  extractedAuthor?: string;
  extractedDate?: string;
  extractedPublisher?: string;
  extractedText?: string;
  wordCount?: number;
  imageCount?: number;
  videoCount?: number;
  // Archive paths
  archivePath?: string;
  screenshotPath?: string;
  pdfPath?: string;
  htmlPath?: string;
  warcPath?: string;
  // Integrity hashes
  screenshotHash?: string;
  pdfHash?: string;
  htmlHash?: string;
  warcHash?: string;
  contentHash?: string;
  // Enhanced metadata
  domain?: string;
  canonicalUrl?: string;
  language?: string;
  archiveError?: string;
  retryCount?: number;
  // Timestamps
  createdAt: string;
  archivedAt?: string;
  createdBy?: string;
}

// ============================================
// Timeline Events
// ============================================

export interface TimelineEvent {
  id: string;
  locationId: string;
  sublocationId?: string;
  eventType: 'visit' | 'established' | 'database_entry' | 'custom';
  eventSubtype?: string;
  dateStart?: string;
  dateEnd?: string;
  datePrecision: 'exact' | 'month' | 'year' | 'decade' | 'century' | 'circa' | 'range' | 'before' | 'after' | 'early' | 'mid' | 'late' | 'unknown';
  dateDisplay?: string;
  dateSort?: number;
  sourceType?: 'exif' | 'manual' | 'web' | 'document' | 'system';
  sourceRefs?: string;
  mediaCount?: number;
  mediaHashes?: string;
  notes?: string;
  autoApproved?: boolean;
  userApproved?: boolean;
  approvedAt?: string;
  approvedBy?: string;
  createdAt: string;
  createdBy?: string;
  updatedAt?: string;
  updatedBy?: string;
}
