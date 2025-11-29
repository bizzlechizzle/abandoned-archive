import type { Location, LocationInput, LocationFilters } from '@au-archive/core';

export interface ElectronAPI {
  versions: {
    node: () => string;
    chrome: () => string;
    electron: () => string;
  };
  platform: string;

  locations: {
    findAll: (filters?: LocationFilters) => Promise<Location[]>;
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
    topTypes: (limit?: number) => Promise<Array<{ type: string; count: number }>>;
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
      deleteOriginals: boolean;
    }) => Promise<unknown>;
    phaseImport: (input: {
      files: Array<{ filePath: string; originalName: string }>;
      locid: string;
      subid?: string | null;
      auth_imp: string | null;
      deleteOriginals?: boolean;
      useHardlinks?: boolean;
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
    findByLocation: (locid: string) => Promise<{
      images: unknown[];
      videos: unknown[];
      documents: unknown[];
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
  sublocations: {
    create: (input: {
      locid: string;
      subnam: string;
      ssubname?: string | null;
      type?: string | null;
      status?: string | null;
      is_primary?: boolean;
      created_by?: string | null;
    }) => Promise<{
      subid: string;
      sub12: string;
      locid: string;
      subnam: string;
      ssubname: string | null;
      type: string | null;
      status: string | null;
      hero_imgsha: string | null;
      is_primary: boolean;
      created_date: string;
      created_by: string | null;
      modified_date: string | null;
      modified_by: string | null;
    }>;
    findById: (subid: string) => Promise<{
      subid: string;
      sub12: string;
      locid: string;
      subnam: string;
      ssubname: string | null;
      type: string | null;
      status: string | null;
      hero_imgsha: string | null;
      is_primary: boolean;
      created_date: string;
      created_by: string | null;
      modified_date: string | null;
      modified_by: string | null;
    } | null>;
    findByLocation: (locid: string) => Promise<Array<{
      subid: string;
      sub12: string;
      locid: string;
      subnam: string;
      ssubname: string | null;
      type: string | null;
      status: string | null;
      hero_imgsha: string | null;
      is_primary: boolean;
      created_date: string;
      created_by: string | null;
      modified_date: string | null;
      modified_by: string | null;
    }>>;
    findWithHeroImages: (locid: string) => Promise<Array<{
      subid: string;
      sub12: string;
      locid: string;
      subnam: string;
      ssubname: string | null;
      type: string | null;
      status: string | null;
      hero_imgsha: string | null;
      is_primary: boolean;
      created_date: string;
      created_by: string | null;
      modified_date: string | null;
      modified_by: string | null;
      hero_thumb_path?: string;
    }>>;
    update: (subid: string, updates: {
      subnam?: string;
      ssubname?: string | null;
      type?: string | null;
      status?: string | null;
      hero_imgsha?: string | null;
      is_primary?: boolean;
      modified_by?: string | null;
    }) => Promise<{
      subid: string;
      sub12: string;
      locid: string;
      subnam: string;
      ssubname: string | null;
      type: string | null;
      status: string | null;
      hero_imgsha: string | null;
      is_primary: boolean;
      created_date: string;
      created_by: string | null;
      modified_date: string | null;
      modified_by: string | null;
    } | null>;
    delete: (subid: string) => Promise<void>;
    setPrimary: (locid: string, subid: string) => Promise<void>;
    checkName: (locid: string, subnam: string, excludeSubid?: string) => Promise<boolean>;
    count: (locid: string) => Promise<number>;
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

  bookmarks: {
    create: (input: {
      url: string;
      title?: string | null;
      locid?: string | null;
      auth_imp?: string | null;
      thumbnail_path?: string | null;
    }) => Promise<unknown>;
    findById: (bookmark_id: string) => Promise<unknown>;
    findByLocation: (locid: string) => Promise<unknown[]>;
    findRecent: (limit?: number) => Promise<unknown[]>;
    findAll: () => Promise<unknown[]>;
    update: (bookmark_id: string, updates: {
      url?: string;
      title?: string | null;
      locid?: string | null;
      thumbnail_path?: string | null;
    }) => Promise<unknown>;
    delete: (bookmark_id: string) => Promise<void>;
    count: () => Promise<number>;
    countByLocation: (locid: string) => Promise<number>;
  };

  users: {
    create: (input: {
      username: string;
      display_name?: string | null;
    }) => Promise<unknown>;
    findAll: () => Promise<unknown[]>;
    findByUsername: (username: string) => Promise<unknown | null>;
    delete: (user_id: string) => Promise<void>;
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
