import type { Location, LocationInput, LocationFilters, TimelineEvent, TimelineEventInput, TimelineEventWithSource, ParsedDate } from '@au-archive/core';

/**
 * OPT-043: Lean location type for map display - only essential fields
 * Used by Atlas for 10x faster map loading (11 columns vs 60+, no JSON.parse)
 */
export interface MapLocation {
  locid: string;
  locnam: string;
  category?: string;
  gps_lat: number;
  gps_lng: number;
  gps_accuracy?: number;
  gps_source?: string;
  gps_verified_on_map: boolean;
  address_state?: string;
  address_city?: string;
  favorite: boolean;
}

/**
 * User record type for authentication and user management
 */
export interface UserRecord {
  user_id: string;
  username: string;
  display_name: string | null;
  created_date: string;
  has_pin: boolean;
  is_active: boolean;
  last_login: string | null;
}

export interface ElectronAPI {
  versions: {
    node: () => string;
    chrome: () => string;
    electron: () => string;
  };
  platform: string;

  locations: {
    findAll: (filters?: LocationFilters & {
      // OPT-036: Extended filters for database-side filtering
      censusRegion?: string;
      censusDivision?: string;
      culturalRegion?: string;
      city?: string;
      limit?: number;
      offset?: number;
    }) => Promise<Location[]>;
    findById: (id: string) => Promise<Location | null>;
    create: (input: LocationInput) => Promise<Location>;
    update: (id: string, input: Partial<LocationInput>) => Promise<Location>;
    delete: (id: string) => Promise<void>;
    count: (filters?: LocationFilters) => Promise<number>;
    random: () => Promise<Location | null>;
    undocumented: () => Promise<Location[]>;
    historical: () => Promise<Location[]>;
    favorites: () => Promise<Location[]>;
    toggleFavorite: (id: string) => Promise<boolean>;
    findNearby: (lat: number, lng: number, radiusKm: number) => Promise<Array<Location & { distance: number }>>;
    // OPT-037: Viewport-based spatial queries for Atlas
    findInBounds: (bounds: { north: number; south: number; east: number; west: number }) => Promise<Location[]>;
    countInBounds: (bounds: { north: number; south: number; east: number; west: number }) => Promise<number>;
    // OPT-043: Ultra-fast map query - lean MapLocation type (10x faster than findInBounds)
    findInBoundsForMap: (bounds: { north: number; south: number; east: number; west: number }) => Promise<MapLocation[]>;
    // OPT-036: Get all filter options in one efficient call
    getFilterOptions: () => Promise<{
      states: string[];
      categories: string[];
      classes: string[];
      cities: string[];
      counties: string[];
      censusRegions: string[];
      censusDivisions: string[];
      culturalRegions: string[];
    }>;
    // Kanye9: Check for duplicate locations by address
    checkDuplicates: (address: {
      street?: string | null;
      city?: string | null;
      county?: string | null;
      state?: string | null;
      zipcode?: string | null;
    }) => Promise<Array<{
      id: string;
      name: string;
      confidence: number;
      matchedFields: string[];
      address: {
        street?: string | null;
        city?: string | null;
        county?: string | null;
        state?: string | null;
        zipcode?: string | null;
      };
    }>>;
  };

  stats: {
    topStates: (limit?: number) => Promise<Array<{ state: string; count: number }>>;
    topCategories: (limit?: number) => Promise<Array<{ category: string; count: number }>>;
  };

  settings: {
    get: (key: string) => Promise<string | null>;
    getAll: () => Promise<Record<string, string>>;
    set: (key: string, value: string) => Promise<void>;
  };

  shell: {
    openExternal: (url: string) => Promise<void>;
  };

  geocode: {
    reverse: (lat: number, lng: number) => Promise<{
      lat: number;
      lng: number;
      displayName: string;
      address: {
        street?: string;
        houseNumber?: string;
        city?: string;
        county?: string;
        state?: string;
        stateCode?: string;
        zipcode?: string;
        country?: string;
        countryCode?: string;
      };
      confidence: 'high' | 'medium' | 'low';
      source: 'nominatim' | 'cache';
    } | null>;
    forward: (address: string) => Promise<{
      lat: number;
      lng: number;
      displayName: string;
      address: {
        street?: string;
        city?: string;
        county?: string;
        state?: string;
        stateCode?: string;
        zipcode?: string;
      };
      confidence: 'high' | 'medium' | 'low';
      source: 'nominatim' | 'cache';
    } | null>;
    // Kanye9: Cascade geocoding - tries multiple strategies until one succeeds
    forwardCascade: (address: {
      street?: string | null;
      city?: string | null;
      county?: string | null;
      state?: string | null;
      zipcode?: string | null;
    }) => Promise<{
      lat: number;
      lng: number;
      displayName: string;
      address: {
        street?: string;
        city?: string;
        county?: string;
        state?: string;
        stateCode?: string;
        zipcode?: string;
      };
      confidence: 'high' | 'medium' | 'low';
      source: 'nominatim' | 'cache';
      cascadeTier: number;
      cascadeDescription: string;
      cascadeQuery: string;
      expectedAccuracy: string;
    } | null>;
    clearCache: (daysOld?: number) => Promise<{ deleted: number }>;
  };

  dialog: {
    selectFolder: () => Promise<string | null>;
  };

  database: {
    backup: () => Promise<{ success: boolean; path?: string; message?: string }>;
    restore: () => Promise<{ success: boolean; message: string; requiresRestart?: boolean; autoBackupPath?: string }>;
    getLocation: () => Promise<{
      currentPath: string;
      defaultPath: string;
      customPath: string | undefined;
      isCustom: boolean;
    }>;
    changeLocation: () => Promise<{
      success: boolean;
      message: string;
      newPath?: string;
      requiresRestart?: boolean;
    }>;
    resetLocation: () => Promise<{
      success: boolean;
      message: string;
      newPath?: string;
      requiresRestart?: boolean;
    }>;
    // Phase 2: Database stats and internal backup management
    getStats: () => Promise<{
      integrityOk: boolean;
      backupCount: number;
      lastBackup: string | null;
    }>;
    exportBackup: () => Promise<{ success: boolean; path?: string; message?: string }>;
    listBackups: () => Promise<{
      success: boolean;
      message?: string;
      backups: Array<{
        id: string;
        date: string;
        size: string;
        path: string;
      }>;
    }>;
    restoreFromInternal: (backupId: string) => Promise<{
      success: boolean;
      message: string;
      requiresRestart?: boolean;
      autoBackupPath?: string;
    }>;
    // Database Archive Export: Export to archive folder for portable backup
    archiveExport: () => Promise<{
      success: boolean;
      message: string;
      path?: string;
      size?: string;
      timestamp?: string;
    }>;
    archiveStatus: () => Promise<{
      configured: boolean;
      exported: boolean;
      verified: boolean;
      lastExport: {
        exportedAt: string;
        appVersion: string;
        locationCount: number;
        imageCount: number;
        videoCount: number;
        documentCount: number;
        mapCount: number;
        checksum: string;
      } | null;
    }>;
  };

  imports: {
    create: (input: {
      locid: string | null;
      auth_imp: string | null;
      img_count?: number;
      vid_count?: number;
      doc_count?: number;
      map_count?: number;
      notes?: string | null;
    }) => Promise<unknown>;
    findRecent: (limit?: number) => Promise<unknown[]>;
    findByLocation: (locid: string) => Promise<unknown[]>;
    findAll: () => Promise<unknown[]>;
    getTotalMediaCount: () => Promise<{ images: number; videos: number; documents: number; maps: number }>;
  };

  media: {
    // File selection and import
    selectFiles: () => Promise<string[] | null>;
    expandPaths: (paths: string[]) => Promise<string[]>;
    import: (input: {
      files: Array<{ filePath: string; originalName: string }>;
      locid: string;
      subid?: string | null;
      auth_imp: string | null;
      // Migration 26: Contributor tracking
      is_contributed?: number;
      contribution_source?: string | null;
      // OPT-058: Unified progress across chunks
      chunkOffset?: number;
      totalOverall?: number;
    }) => Promise<{
      total: number;
      imported: number;
      duplicates: number;
      skipped: number;
      sidecarOnly: number;
      errors: number;
      importId: string;
      results: Array<{
        success: boolean;
        hash: string;
        type: 'image' | 'video' | 'map' | 'document' | 'skipped' | 'sidecar';
        duplicate: boolean;
        skipped?: boolean;
        sidecarOnly?: boolean;
        archivePath?: string;
        error?: string;
        gpsWarning?: {
          message: string;
          distance: number;
          severity: 'minor' | 'major';
          locationGPS: { lat: number; lng: number };
          mediaGPS: { lat: number; lng: number };
        };
        warnings?: string[];
      }>;
    }>;
    phaseImport: (input: {
      files: Array<{ filePath: string; originalName: string }>;
      locid: string;
      subid?: string | null;
      auth_imp: string | null;
      verifyChecksums?: boolean;
    }) => Promise<{
      success: boolean;
      importId: string;
      manifestPath: string;
      summary: {
        total: number;
        imported: number;
        duplicates: number;
        errors: number;
        images: number;
        videos: number;
        documents: number;
        maps: number;
      };
      errors: string[];
    }>;
    onPhaseImportProgress: (callback: (progress: {
      importId: string;
      phase: 'log' | 'serialize' | 'copy' | 'dump' | 'complete';
      phaseProgress: number;
      currentFile?: string;
      filesProcessed: number;
      totalFiles: number;
    }) => void) => () => void;
    onImportProgress: (callback: (progress: { current: number; total: number; filename?: string; importId?: string }) => void) => () => void;
    cancelImport: (importId: string) => Promise<{ success: boolean; message: string }>;
    /**
     * OPT-094: Find media by location with optional sub-location filtering
     * @param params - Either locid string (backward compat) or object with locid and optional subid
     * - subid undefined: return all media (backward compatible)
     * - subid null: return only host location media
     * - subid string: return only that sub-location's media
     */
    findByLocation: (params: string | { locid: string; subid?: string | null }) => Promise<{
      images: unknown[];
      videos: unknown[];
      documents: unknown[];
      maps: unknown[]; // MAP-MEDIA-FIX-001
    }>;
    // OPT-039: Paginated image loading for scale
    // OPT-094: Added subid filtering support
    findImagesPaginated: (params: { locid: string; limit?: number; offset?: number; subid?: string | null }) => Promise<{
      images: unknown[];
      total: number;
      hasMore: boolean;
    }>;
    // Media viewing and processing
    openFile: (filePath: string) => Promise<{ success: boolean }>;
    generateThumbnail: (sourcePath: string, hash: string) => Promise<string | null>;
    extractPreview: (sourcePath: string, hash: string) => Promise<string | null>;
    generatePoster: (sourcePath: string, hash: string) => Promise<string | null>;
    getCached: (key: string) => Promise<string | null>;
    preload: (mediaList: Array<{ hash: string; path: string }>, currentIndex: number) => Promise<{ success: boolean }>;
    readXmp: (mediaPath: string) => Promise<{
      rating?: number;
      label?: string;
      keywords?: string[];
      title?: string;
      description?: string;
    } | null>;
    writeXmp: (mediaPath: string, data: {
      rating?: number;
      label?: string;
      keywords?: string[];
      title?: string;
      description?: string;
    }) => Promise<{ success: boolean }>;
    regenerateAllThumbnails: (options?: { force?: boolean }) => Promise<{ generated: number; failed: number; total: number; rawTotal?: number; previewsExtracted?: number; previewsFailed?: number }>;
    regenerateVideoThumbnails: (options?: { force?: boolean }) => Promise<{ generated: number; failed: number; total: number }>;
    regenerateDngPreviews: () => Promise<{ success: boolean; rendered: number; failed: number; total: number }>;
    // OPT-105: Backfill RAW preview paths from existing .previews/ directory
    backfillRawPreviews: () => Promise<{ fixed: number; notFound: number; total: number }>;

    // Location-specific media fixes
    fixLocationImages: (locid: string) => Promise<{ fixed: number; errors: number; total: number }>;
    fixLocationVideos: (locid: string) => Promise<{ fixed: number; errors: number; total: number }>;

    // Video Proxy System (Migration 36, updated OPT-053 Immich Model)
    // Proxies generated at import time, stored alongside originals, permanent (no purge)
    generateProxy: (vidhash: string, sourcePath: string, metadata: { width: number; height: number }) => Promise<{
      success: boolean;
      proxyPath?: string;
      error?: string;
      proxyWidth?: number;
      proxyHeight?: number;
    }>;
    getProxyPath: (vidhash: string) => Promise<string | null>;
    // OPT-053: Fast filesystem check for proxy existence (no DB lookup)
    proxyExists: (videoPath: string, vidhash: string) => Promise<boolean>;
    getProxyCacheStats: () => Promise<{
      totalCount: number;
      totalSizeBytes: number;
      totalSizeMB: number;
      oldestAccess: string | null;
      newestAccess: string | null;
    }>;
    // OPT-053: DEPRECATED - Proxies are permanent, always returns empty result
    purgeOldProxies: (daysOld?: number) => Promise<{
      deleted: number;
      freedBytes: number;
      freedMB: number;
    }>;
    // OPT-053: DEPRECATED - Proxies are permanent, always returns empty result
    clearAllProxies: () => Promise<{
      deleted: number;
      freedBytes: number;
      freedMB: number;
    }>;
    // OPT-053: DEPRECATED - No last_accessed tracking, always returns 0
    touchLocationProxies: (locid: string) => Promise<number>;
    // For migration/repair of old imports
    generateProxiesForLocation: (locid: string) => Promise<{
      generated: number;
      failed: number;
      total: number;
    }>;
    onProxyProgress: (callback: (progress: {
      locid: string;
      generated: number;
      failed: number;
      total: number;
    }) => void) => () => void;
    // Delete and Move operations (for Lightbox actions)
    delete: (input: { hash: string; type: 'image' | 'video' | 'document' }) => Promise<{
      success: boolean;
      deletedFiles: string[];
      failedFiles: string[];
    }>;
    moveToSubLocation: (input: { hash: string; type: 'image' | 'video' | 'document'; subid: string | null }) => Promise<{
      success: boolean;
    }>;
    // Hide/Unhide media (Migration 23)
    setHidden: (input: {
      hash: string;
      type: 'image' | 'video' | 'document';
      hidden: boolean;
      reason?: string;
    }) => Promise<{ success: boolean }>;
  };

  notes: {
    create: (input: {
      locid: string;
      note_text: string;
      auth_imp?: string | null;
      note_type?: string;
    }) => Promise<unknown>;
    findById: (note_id: string) => Promise<unknown>;
    findByLocation: (locid: string) => Promise<unknown[]>;
    findRecent: (limit?: number) => Promise<unknown[]>;
    update: (note_id: string, updates: {
      note_text?: string;
      note_type?: string;
    }) => Promise<unknown>;
    delete: (note_id: string) => Promise<void>;
    countByLocation: (locid: string) => Promise<number>;
  };

  // Migration 28: Sub-location API
  // ADR-046: Updated to remove sub12 (subid is BLAKE3 16-char hash now)
  // Migration 31: Added GPS fields
  // Migration 32: Added akanam (historicalName removed)
  // Migration 65: Added class and getDistinctCategories/getDistinctClasses
  sublocations: {
    create: (input: {
      locid: string;
      subnam: string;
      ssubname?: string | null;
      category?: string | null;
      class?: string | null;
      status?: string | null;
      is_primary?: boolean;
      created_by?: string | null;
    }) => Promise<{
      subid: string;
      locid: string;
      subnam: string;
      ssubname: string | null;
      category: string | null;
      class: string | null;
      status: string | null;
      hero_imghash: string | null;
      hero_focal_x: number;
      hero_focal_y: number;
      is_primary: boolean;
      created_date: string;
      created_by: string | null;
      modified_date: string | null;
      modified_by: string | null;
      gps_lat: number | null;
      gps_lng: number | null;
      gps_accuracy: number | null;
      gps_source: string | null;
      gps_verified_on_map: boolean;
      gps_captured_at: string | null;
      akanam: string | null;
    }>;
    findById: (subid: string) => Promise<{
      subid: string;
      locid: string;
      subnam: string;
      ssubname: string | null;
      category: string | null;
      class: string | null;
      status: string | null;
      hero_imghash: string | null;
      hero_focal_x: number;
      hero_focal_y: number;
      is_primary: boolean;
      created_date: string;
      created_by: string | null;
      modified_date: string | null;
      modified_by: string | null;
      gps_lat: number | null;
      gps_lng: number | null;
      gps_accuracy: number | null;
      gps_source: string | null;
      gps_verified_on_map: boolean;
      gps_captured_at: string | null;
      akanam: string | null;
    } | null>;
    findByLocation: (locid: string) => Promise<Array<{
      subid: string;
      locid: string;
      subnam: string;
      ssubname: string | null;
      category: string | null;
      class: string | null;
      status: string | null;
      hero_imghash: string | null;
      hero_focal_x: number;
      hero_focal_y: number;
      is_primary: boolean;
      created_date: string;
      created_by: string | null;
      modified_date: string | null;
      modified_by: string | null;
      gps_lat: number | null;
      gps_lng: number | null;
      gps_accuracy: number | null;
      gps_source: string | null;
      gps_verified_on_map: boolean;
      gps_captured_at: string | null;
      akanam: string | null;
    }>>;
    findWithHeroImages: (locid: string) => Promise<Array<{
      subid: string;
      locid: string;
      subnam: string;
      ssubname: string | null;
      category: string | null;
      class: string | null;
      status: string | null;
      hero_imghash: string | null;
      hero_focal_x: number;
      hero_focal_y: number;
      is_primary: boolean;
      created_date: string;
      created_by: string | null;
      modified_date: string | null;
      modified_by: string | null;
      gps_lat: number | null;
      gps_lng: number | null;
      gps_accuracy: number | null;
      gps_source: string | null;
      gps_verified_on_map: boolean;
      gps_captured_at: string | null;
      akanam: string | null;
      hero_thumb_path?: string;
      asset_count?: number;
    }>>;
    update: (subid: string, updates: {
      subnam?: string;
      ssubname?: string | null;
      category?: string | null;
      class?: string | null;
      status?: string | null;
      hero_imghash?: string | null;
      hero_focal_x?: number;
      hero_focal_y?: number;
      is_primary?: boolean;
      modified_by?: string | null;
      akanam?: string | null;
    }) => Promise<{
      subid: string;
      locid: string;
      subnam: string;
      ssubname: string | null;
      category: string | null;
      class: string | null;
      status: string | null;
      hero_imghash: string | null;
      hero_focal_x: number;
      hero_focal_y: number;
      is_primary: boolean;
      created_date: string;
      created_by: string | null;
      modified_date: string | null;
      modified_by: string | null;
      gps_lat: number | null;
      gps_lng: number | null;
      gps_accuracy: number | null;
      gps_source: string | null;
      gps_verified_on_map: boolean;
      gps_captured_at: string | null;
      akanam: string | null;
    } | null>;
    delete: (subid: string) => Promise<void>;
    setPrimary: (locid: string, subid: string) => Promise<void>;
    checkName: (locid: string, subnam: string, excludeSubid?: string) => Promise<boolean>;
    count: (locid: string) => Promise<number>;
    // Migration 31: Sub-location GPS
    updateGps: (subid: string, gps: { lat: number; lng: number; accuracy?: number | null; source: string }) => Promise<{
      subid: string;
      locid: string;
      subnam: string;
      gps_lat: number | null;
      gps_lng: number | null;
      gps_accuracy: number | null;
      gps_source: string | null;
      gps_verified_on_map: boolean;
      gps_captured_at: string | null;
    } | null>;
    clearGps: (subid: string) => Promise<{ subid: string } | null>;
    verifyGps: (subid: string) => Promise<{ subid: string; gps_verified_on_map: boolean } | null>;
    findWithGps: (locid: string) => Promise<Array<{
      subid: string;
      locid: string;
      subnam: string;
      gps_lat: number | null;
      gps_lng: number | null;
      gps_verified_on_map: boolean;
    }>>;
    // Migration 65: Sub-location category/class (separate taxonomy from host locations)
    getDistinctCategories: () => Promise<string[]>;
    getDistinctClasses: () => Promise<string[]>;
  };

  projects: {
    create: (input: {
      project_name: string;
      description?: string | null;
      auth_imp?: string | null;
    }) => Promise<unknown>;
    findById: (project_id: string) => Promise<unknown>;
    findByIdWithLocations: (project_id: string) => Promise<unknown>;
    findAll: () => Promise<unknown[]>;
    findRecent: (limit?: number) => Promise<unknown[]>;
    findTopByLocationCount: (limit?: number) => Promise<unknown[]>;
    findByLocation: (locid: string) => Promise<unknown[]>;
    update: (project_id: string, updates: {
      project_name?: string;
      description?: string | null;
    }) => Promise<unknown>;
    delete: (project_id: string) => Promise<void>;
    addLocation: (project_id: string, locid: string) => Promise<void>;
    removeLocation: (project_id: string, locid: string) => Promise<void>;
    isLocationInProject: (project_id: string, locid: string) => Promise<boolean>;
  };

  users: {
    create: (input: {
      username: string;
      display_name?: string | null;
      pin?: string | null;
    }) => Promise<UserRecord>;
    findAll: () => Promise<UserRecord[]>;
    findById: (userId: string) => Promise<UserRecord>;
    findByUsername: (username: string) => Promise<UserRecord | null>;
    update: (userId: string, updates: { username?: string; display_name?: string | null }) => Promise<UserRecord>;
    delete: (userId: string) => Promise<void>;
    // Authentication (Migration 24)
    verifyPin: (userId: string, pin: string) => Promise<{ success: boolean; error?: string }>;
    setPin: (userId: string, pin: string) => Promise<{ success: boolean }>;
    clearPin: (userId: string) => Promise<{ success: boolean }>;
    hasPin: (userId: string) => Promise<boolean>;
    anyUserHasPin: () => Promise<boolean>;
    updateLastLogin: (userId: string) => Promise<{ success: boolean }>;
  };

  health: {
    getDashboard: () => Promise<unknown>;
    getStatus: () => Promise<unknown>;
    runCheck: () => Promise<unknown>;
    createBackup: () => Promise<unknown>;
    getBackupStats: () => Promise<unknown>;
    getDiskSpace: () => Promise<unknown>;
    checkIntegrity: () => Promise<unknown>;
    runMaintenance: () => Promise<unknown>;
    getMaintenanceSchedule: () => Promise<unknown>;
    getRecoveryState: () => Promise<unknown>;
    attemptRecovery: () => Promise<unknown>;
  };

  backup: {
    onStatus: (callback: (status: { success: boolean; message: string; timestamp: string; verified?: boolean }) => void) => () => void;
  };

  browser: {
    navigate: (url: string) => Promise<{ success: boolean }>;
    show: (bounds: { x: number; y: number; width: number; height: number }) => Promise<{ success: boolean }>;
    hide: () => Promise<{ success: boolean }>;
    getUrl: () => Promise<string>;
    getTitle: () => Promise<string>;
    goBack: () => Promise<boolean>;
    goForward: () => Promise<boolean>;
    reload: () => Promise<void>;
    captureScreenshot: () => Promise<string | null>;
    onNavigated: (callback: (url: string) => void) => () => void;
    onTitleChanged: (callback: (title: string) => void) => () => void;
    onLoadingChanged: (callback: (loading: boolean) => void) => () => void;
  };

  // Reference Maps - imported KML, GPX, GeoJSON, CSV files
  refMaps: {
    // ADR-048: Now returns string[] (multi-select)
    selectFile: () => Promise<string[]>;
    // ADR-048: Batch import for multiple files
    importBatch: (filePaths: string[], importedBy?: string) => Promise<{
      success: boolean;
      results: Array<{
        filePath: string;
        fileName: string;
        success: boolean;
        error?: string;
        mapId?: string;
        pointCount?: number;
      }>;
      totalPoints: number;
      successCount: number;
      skippedCount: number;
      failedCount: number;
    }>;
    import: (importedBy?: string) => Promise<{
      success: boolean;
      canceled?: boolean;
      error?: string;
      map?: RefMap;
      pointCount?: number;
    }>;
    importFromPath: (filePath: string, importedBy?: string) => Promise<{
      success: boolean;
      error?: string;
      map?: RefMap;
      pointCount?: number;
    }>;
    findAll: () => Promise<RefMap[]>;
    findById: (mapId: string) => Promise<RefMapWithPoints | null>;
    getAllPoints: () => Promise<RefMapPoint[]>;
    // OPT-037: Viewport-based spatial query for reference points
    getPointsInBounds: (bounds: { north: number; south: number; east: number; west: number }) => Promise<RefMapPoint[]>;
    update: (mapId: string, updates: { mapName?: string }) => Promise<RefMap | null>;
    delete: (mapId: string) => Promise<{ success: boolean; error?: string }>;
    getStats: () => Promise<{
      mapCount: number;
      pointCount: number;
      categories: string[];
      states: string[];
    }>;
    getSupportedExtensions: () => Promise<string[]>;
    // Phase 2: Auto-matching for location creation
    findMatches: (query: string, options?: {
      threshold?: number;
      limit?: number;
      state?: string | null;
    }) => Promise<RefMapMatch[]>;
    // Phase 3: Deduplication on import
    previewImport: (filePath: string) => Promise<ImportPreviewResult>;
    importWithOptions: (filePath: string, options: {
      skipDuplicates: boolean;
      importedBy?: string;
    }) => Promise<{
      success: boolean;
      error?: string;
      skippedAll?: boolean;
      message?: string;
      map?: RefMap;
      pointCount?: number;
      skippedCount?: number;
    }>;
    // Phase 4: Purge catalogued points
    findCataloguedPoints: () => Promise<{
      success: boolean;
      error?: string;
      matches: CataloguedPointMatch[];
      count: number;
    }>;
    purgeCataloguedPoints: () => Promise<{
      success: boolean;
      deleted: number;
      error?: string;
      message?: string;
    }>;
    // Phase 5: Delete single point from map popup
    deletePoint: (pointId: string) => Promise<{
      success: boolean;
      deleted?: number;
      error?: string;
    }>;
    // Migration 39: GPS-based deduplication within ref_map_points
    previewDedup: () => Promise<{
      success: boolean;
      error?: string;
      stats?: {
        totalPoints: number;
        uniqueLocations: number;
        duplicateGroups: number;
        pointsRemoved: number;
        pointsWithAka: number;
      };
      groups?: Array<{
        lat: number;
        lng: number;
        bestName: string | null;
        akaNames: string | null;
        pointCount: number;
        allNames: string[];
      }>;
    }>;
    deduplicate: () => Promise<{
      success: boolean;
      error?: string;
      stats?: {
        totalPoints: number;
        uniqueLocations: number;
        duplicateGroups: number;
        pointsRemoved: number;
        pointsWithAka: number;
      };
    }>;
    // Migration 42: GPS enrichment - apply ref point GPS to existing location
    applyEnrichment: (input: { locationId: string; refPointId: string }) => Promise<{
      success: boolean;
      error?: string;
      appliedGps?: { lat: number; lng: number };
      state?: string | null;
    }>;
    applyAllEnrichments: (enrichments: Array<{
      locationId: string;
      refPointId: string;
      nameSimilarity: number;
    }>) => Promise<{
      success: boolean;
      applied: number;
      skipped?: number;
      error?: string;
      message?: string;
    }>;
  };

  // Import Intelligence - Smart location matching during import
  importIntelligence: {
    scan: (
      lat: number,
      lng: number,
      hints?: { filename?: string; inferredType?: string; inferredState?: string },
      excludeRefPointId?: string | null
    ) => Promise<IntelligenceScanResult>;
    hasNearby: (lat: number, lng: number) => Promise<{
      hasNearby: boolean;
      count: number;
      topMatch: IntelligenceMatch | null;
    }>;
    addAkaName: (locid: string, newName: string) => Promise<{ success: boolean }>;
  };

  // Storage monitoring
  storage: {
    getStats: () => Promise<StorageStats>;
  };

  // BagIt Self-Documenting Archive (RFC 8493)
  bagit: {
    regenerate: (locid: string) => Promise<{ success: boolean }>;
    validate: (locid: string) => Promise<BagValidationResult>;
    validateAll: () => Promise<IntegrityCheckResult>;
    status: (locid: string) => Promise<BagStatus>;
    summary: () => Promise<BagStatusSummary>;
    lastValidation: () => Promise<string | null>;
    isValidationDue: () => Promise<boolean>;
    scheduleValidation: () => Promise<{ success: boolean; error?: string }>;
    onProgress: (callback: (progress: BagIntegrityProgress) => void) => () => void;
  };

  // Import System v2.0 - 5-step pipeline with background jobs
  importV2: {
    start: (input: ImportV2Input) => Promise<ImportV2Result>;
    cancel: (sessionId: string) => Promise<{ cancelled: boolean; reason?: string }>;
    status: () => Promise<{ sessionId: string | null; status: ImportV2Status }>;
    resumable: () => Promise<ResumableSession[]>;
    resume: (sessionId: string) => Promise<ImportV2Result | null>;
    onProgress: (callback: (progress: ImportV2Progress) => void) => () => void;
    onComplete: (callback: (result: ImportV2CompleteEvent) => void) => () => void;
  };

  // Background Job Queue - manages post-import processing
  jobs: {
    status: () => Promise<Record<string, JobQueueStats>>;
    deadLetter: (queue?: string) => Promise<DeadLetterEntry[]>;
    retry: (input: { deadLetterId: number }) => Promise<{ success: boolean; newJobId: string | null }>;
    acknowledge: (ids: number[]) => Promise<{ acknowledged: number }>;
    clearCompleted: (olderThanMs?: number) => Promise<{ cleared: number }>;
    onProgress: (callback: (progress: JobProgress) => void) => () => void;
    onAssetReady: (callback: (event: AssetReadyEvent) => void) => () => void;
  };

  // Timeline (Migration 69) - Location history and visit tracking
  timeline: {
    findByLocation: (locid: string) => Promise<TimelineEvent[]>;
    findBySubLocation: (locid: string, subid: string) => Promise<TimelineEvent[]>;
    findCombined: (locid: string) => Promise<TimelineEventWithSource[]>;
    parseDate: (input: string) => Promise<ParsedDate>;
    create: (input: TimelineEventInput, userId?: string) => Promise<TimelineEvent>;
    update: (eventId: string, updates: Partial<TimelineEventInput>, userId?: string) => Promise<TimelineEvent | undefined>;
    delete: (eventId: string) => Promise<boolean>;
    approve: (eventId: string, userId: string) => Promise<TimelineEvent | undefined>;
    initializeLocation: (locid: string, locadd: string | null, userId?: string) => Promise<void>;
    initializeSubLocation: (locid: string, subid: string, userId?: string) => Promise<void>;
    getVisitCount: (locid: string) => Promise<number>;
    getEstablished: (locid: string, subid?: string | null) => Promise<TimelineEvent | undefined>;
    updateEstablished: (locid: string, subid: string | null, dateInput: string, eventSubtype?: string, userId?: string) => Promise<TimelineEvent | undefined>;
  };

}

// Reference Map types
export interface RefMap {
  mapId: string;
  mapName: string;
  filePath: string;
  fileType: string;
  pointCount: number;
  importedAt: string;
  importedBy: string | null;
}

export interface RefMapPoint {
  pointId: string;
  mapId: string;
  name: string | null;
  description: string | null;
  lat: number;
  lng: number;
  state: string | null;
  category: string | null;
  rawMetadata: Record<string, unknown> | null;
}

export interface RefMapWithPoints extends RefMap {
  points: RefMapPoint[];
}

// Phase 2: Auto-matching result
export interface RefMapMatch {
  pointId: string;
  mapId: string;
  name: string;
  description: string | null;
  lat: number;
  lng: number;
  state: string | null;
  category: string | null;
  mapName: string;
  score: number;
}

// Phase 3: Import preview with deduplication
export interface ImportPreviewResult {
  success: boolean;
  error?: string;
  fileName?: string;
  filePath?: string;
  fileType?: string;
  totalPoints?: number;
  newPoints?: number;
  // Migration 42: Enrichment opportunities (existing location has no GPS, ref point has GPS)
  enrichmentCount?: number;
  enrichmentOpportunities?: EnrichmentMatchPreview[];
  // Already catalogued (existing location has GPS)
  cataloguedCount?: number;
  cataloguedMatches?: DuplicateMatchPreview[];
  referenceCount?: number;
  referenceMatches?: DuplicateMatchPreview[];
}

// Migration 42: Enrichment opportunity - can apply GPS to existing location
export interface EnrichmentMatchPreview {
  type: 'catalogued';
  matchType: 'name_state' | 'exact_name';
  newPointName: string;
  newPointLat: number;
  newPointLng: number;
  newPointState?: string | null;
  existingName: string;
  existingId: string;
  existingState?: string;
  existingHasGps: false;
  nameSimilarity?: number;
  needsConfirmation: boolean;
  pointIndex?: number; // Index in parsed points array, used for import
}

export interface DuplicateMatchPreview {
  type: 'catalogued' | 'reference';
  matchType?: 'gps' | 'name_gps' | 'name_state' | 'exact_name';
  newPointName: string;
  newPointLat?: number;
  newPointLng?: number;
  newPointState?: string | null;
  existingName: string;
  existingId: string;
  existingState?: string;
  existingHasGps?: boolean;
  nameSimilarity?: number;
  distanceMeters?: number;
  mapName?: string;
  needsConfirmation?: boolean;
}

// Phase 4: Catalogued point match for purging
export interface CataloguedPointMatch {
  pointId: string;
  pointName: string;
  mapName: string;
  matchedLocid: string;
  matchedLocName: string;
  nameSimilarity: number;
  distanceMeters: number;
}

// Import Intelligence types
export interface IntelligenceMatch {
  source: 'location' | 'sublocation' | 'refmap';
  id: string;
  name: string;
  type: string | null;
  state: string | null;
  distanceMeters: number;
  distanceFeet: number;
  confidence: number;
  confidenceLabel: string;
  reasons: string[];
  mediaCount?: number;
  heroThumbPath?: string | null;
  parentName?: string;  // For sub-locations
  mapName?: string;     // For reference map points
}

export interface IntelligenceScanResult {
  scanned: {
    locations: number;
    sublocations: number;
    refmaps: number;
  };
  matches: IntelligenceMatch[];
  scanTimeMs: number;
}

// Storage types
export interface StorageStats {
  archivePath: string;
  archiveBytes: number;
  freeBytes: number;
  totalBytes: number;
  usedPercent: number;
  driveLetter?: string;
}

// BagIt Self-Documenting Archive types (RFC 8493)
export type BagStatusType = 'none' | 'valid' | 'complete' | 'incomplete' | 'invalid';

export interface BagStatus {
  bag_status: BagStatusType | null;
  bag_last_verified: string | null;
  bag_last_error: string | null;
}

export interface BagValidationResult {
  status: BagStatusType;
  error?: string;
  missingFiles?: string[];
  checksumErrors?: string[];
  payloadOxum?: { bytes: number; count: number };
}

export interface IntegrityCheckResult {
  totalLocations: number;
  validCount: number;
  incompleteCount: number;
  invalidCount: number;
  noneCount: number;
  errors: Array<{ locid: string; locnam: string; error: string }>;
  durationMs: number;
}

export interface BagStatusSummary {
  valid: number;
  incomplete: number;
  invalid: number;
  none: number;
}

export interface BagIntegrityProgress {
  current: number;
  total: number;
  currentLocation: string;
  status: 'running' | 'complete' | 'error';
}

// Import System v2.0 types
export type ImportV2Status =
  | 'pending'
  | 'scanning'
  | 'hashing'
  | 'copying'
  | 'validating'
  | 'finalizing'
  | 'completed'
  | 'cancelled'
  | 'failed';

export interface ImportV2Input {
  paths: string[];
  locid: string;
  loc12: string;
  address_state: string | null;
  type: string | null;
  slocnam: string | null;
  // Extended fields for full UI integration
  subid?: string | null;
  auth_imp?: string | null;
  is_contributed?: number;
  contribution_source?: string | null;
}

export interface ImportV2Progress {
  sessionId: string;
  status: ImportV2Status;
  step: number;
  totalSteps: number;
  percent: number;
  currentFile: string;
  filesProcessed: number;
  filesTotal: number;
  bytesProcessed: number;
  bytesTotal: number;
  duplicatesFound: number;
  errorsFound: number;
  estimatedRemainingMs: number;
}

export interface ImportV2Result {
  sessionId: string;
  status: ImportV2Status;
  scanResult?: {
    totalFiles: number;
    totalBytes: number;
  };
  hashResult?: {
    totalDuplicates: number;
    totalErrors: number;
  };
  copyResult?: {
    totalBytes: number;
    totalErrors: number;
  };
  validationResult?: {
    totalInvalid: number;
  };
  finalizationResult?: {
    totalFinalized: number;
    totalErrors: number;
    jobsQueued: number;
  };
  error?: string;
  startedAt: string;
  completedAt?: string;
  totalDurationMs: number;
}

export interface ImportV2CompleteEvent {
  sessionId: string;
  status: ImportV2Status;
  totalImported: number;
  totalDuplicates: number;
  totalErrors: number;
  totalDurationMs: number;
  jobsQueued: number;
}

export interface ResumableSession {
  sessionId: string;
  locid: string;
  status: ImportV2Status;
  lastStep: number;
  startedAt: string;  // ISO string for IPC serialization
  totalFiles: number;
  processedFiles: number;
}

// Background Job Queue types
export interface JobQueueStats {
  pending: number;
  processing: number;
  completed: number;
  failed: number;
}

export interface DeadLetterEntry {
  id: number;
  originalJobId: string;
  queue: string;
  payload: unknown;
  error: string;
  failedAt: string;
  acknowledged: boolean;
}

export interface JobProgress {
  queue: string;
  jobId: string;
  progress: number;
  message?: string;
}

export interface AssetReadyEvent {
  type: 'thumbnail' | 'metadata' | 'proxy';
  hash: string;
  paths?: { sm: string; lg: string; preview?: string };
  mediaType?: string;
  metadata?: unknown;
  proxyPath?: string;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
    // Get file paths from the last drop event (captured in preload)
    getDroppedFilePaths: () => string[];
    // Legacy: Extract file paths from FileList (may not work due to contextBridge serialization)
    extractFilePaths: (files: FileList) => string[];
  }
}
