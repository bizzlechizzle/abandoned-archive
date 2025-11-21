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

  dialog: {
    selectFolder: () => Promise<string | null>;
  };

  database: {
    backup: () => Promise<{ success: boolean; path?: string; message?: string }>;
    restore: () => Promise<{ success: boolean; message: string; requiresRestart?: boolean; autoBackupPath?: string }>;
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
    selectFiles: () => Promise<string[] | null>;
    import: (input: {
      files: Array<{ filePath: string; originalName: string }>;
      locid: string;
      subid?: string | null;
      auth_imp: string | null;
      deleteOriginals: boolean;
    }) => Promise<unknown>;
    onImportProgress: (callback: (progress: { current: number; total: number }) => void) => () => void;
    findByLocation: (locid: string) => Promise<{
      images: unknown[];
      videos: unknown[];
      documents: unknown[];
    }>;
    openFile: (filePath: string) => Promise<void>;
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
  }
}
