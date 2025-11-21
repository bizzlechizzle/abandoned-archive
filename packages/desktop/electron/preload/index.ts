import { contextBridge, ipcRenderer } from 'electron';
import type { Location, LocationInput, LocationFilters } from '@au-archive/core';

const api = {
  versions: {
    node: () => process.versions.node,
    chrome: () => process.versions.chrome,
    electron: () => process.versions.electron,
  },
  platform: process.platform,

  locations: {
    findAll: (filters?: LocationFilters): Promise<Location[]> =>
      ipcRenderer.invoke('location:findAll', filters),
    findById: (id: string): Promise<Location | null> =>
      ipcRenderer.invoke('location:findById', id),
    create: (input: LocationInput): Promise<Location> =>
      ipcRenderer.invoke('location:create', input),
    update: (id: string, input: Partial<LocationInput>): Promise<Location> =>
      ipcRenderer.invoke('location:update', id, input),
    delete: (id: string): Promise<void> =>
      ipcRenderer.invoke('location:delete', id),
    count: (filters?: LocationFilters): Promise<number> =>
      ipcRenderer.invoke('location:count', filters),
    random: (): Promise<Location | null> =>
      ipcRenderer.invoke('location:random'),
    undocumented: (): Promise<Location[]> =>
      ipcRenderer.invoke('location:undocumented'),
    historical: (): Promise<Location[]> =>
      ipcRenderer.invoke('location:historical'),
    favorites: (): Promise<Location[]> =>
      ipcRenderer.invoke('location:favorites'),
    toggleFavorite: (id: string): Promise<boolean> =>
      ipcRenderer.invoke('location:toggleFavorite', id),
  },

  stats: {
    topStates: (limit?: number): Promise<Array<{ state: string; count: number }>> =>
      ipcRenderer.invoke('stats:topStates', limit),
    topTypes: (limit?: number): Promise<Array<{ type: string; count: number }>> =>
      ipcRenderer.invoke('stats:topTypes', limit),
  },

  settings: {
    get: (key: string): Promise<string | null> =>
      ipcRenderer.invoke('settings:get', key),
    getAll: (): Promise<Record<string, string>> =>
      ipcRenderer.invoke('settings:getAll'),
    set: (key: string, value: string): Promise<void> =>
      ipcRenderer.invoke('settings:set', key, value),
  },

  shell: {
    openExternal: (url: string): Promise<void> =>
      ipcRenderer.invoke('shell:openExternal', url),
  },

  dialog: {
    selectFolder: (): Promise<string | null> =>
      ipcRenderer.invoke('dialog:selectFolder'),
  },

  database: {
    backup: (): Promise<{ success: boolean; path?: string; message?: string }> =>
      ipcRenderer.invoke('database:backup'),
    restore: (): Promise<{ success: boolean; message: string; requiresRestart?: boolean; autoBackupPath?: string }> =>
      ipcRenderer.invoke('database:restore'),
  },

  imports: {
    create: (input: {
      locid: string | null;
      auth_imp: string | null;
      img_count?: number;
      vid_count?: number;
      doc_count?: number;
      map_count?: number;
      notes?: string | null;
    }): Promise<unknown> =>
      ipcRenderer.invoke('imports:create', input),
    findRecent: (limit?: number): Promise<unknown[]> =>
      ipcRenderer.invoke('imports:findRecent', limit),
    findByLocation: (locid: string): Promise<unknown[]> =>
      ipcRenderer.invoke('imports:findByLocation', locid),
    findAll: (): Promise<unknown[]> =>
      ipcRenderer.invoke('imports:findAll'),
    getTotalMediaCount: (): Promise<{ images: number; videos: number; documents: number; maps: number }> =>
      ipcRenderer.invoke('imports:getTotalMediaCount'),
  },

  media: {
    selectFiles: (): Promise<string[] | null> =>
      ipcRenderer.invoke('media:selectFiles'),
    import: (input: {
      files: Array<{ filePath: string; originalName: string }>;
      locid: string;
      subid?: string | null;
      auth_imp: string | null;
      deleteOriginals: boolean;
    }): Promise<unknown> =>
      ipcRenderer.invoke('media:import', input),
    onImportProgress: (callback: (progress: { current: number; total: number }) => void) => {
      const listener = (_event: any, progress: { current: number; total: number }) => callback(progress);
      ipcRenderer.on('media:import:progress', listener);
      return () => ipcRenderer.removeListener('media:import:progress', listener);
    },
    findByLocation: (locid: string): Promise<{
      images: unknown[];
      videos: unknown[];
      documents: unknown[];
    }> =>
      ipcRenderer.invoke('media:findByLocation', locid),
    openFile: (filePath: string): Promise<void> =>
      ipcRenderer.invoke('media:openFile', filePath),
  },

  notes: {
    create: (input: {
      locid: string;
      note_text: string;
      auth_imp?: string | null;
      note_type?: string;
    }): Promise<unknown> =>
      ipcRenderer.invoke('notes:create', input),
    findById: (note_id: string): Promise<unknown> =>
      ipcRenderer.invoke('notes:findById', note_id),
    findByLocation: (locid: string): Promise<unknown[]> =>
      ipcRenderer.invoke('notes:findByLocation', locid),
    findRecent: (limit?: number): Promise<unknown[]> =>
      ipcRenderer.invoke('notes:findRecent', limit),
    update: (note_id: string, updates: {
      note_text?: string;
      note_type?: string;
    }): Promise<unknown> =>
      ipcRenderer.invoke('notes:update', note_id, updates),
    delete: (note_id: string): Promise<void> =>
      ipcRenderer.invoke('notes:delete', note_id),
    countByLocation: (locid: string): Promise<number> =>
      ipcRenderer.invoke('notes:countByLocation', locid),
  },

  projects: {
    create: (input: {
      project_name: string;
      description?: string | null;
      auth_imp?: string | null;
    }): Promise<unknown> =>
      ipcRenderer.invoke('projects:create', input),
    findById: (project_id: string): Promise<unknown> =>
      ipcRenderer.invoke('projects:findById', project_id),
    findByIdWithLocations: (project_id: string): Promise<unknown> =>
      ipcRenderer.invoke('projects:findByIdWithLocations', project_id),
    findAll: (): Promise<unknown[]> =>
      ipcRenderer.invoke('projects:findAll'),
    findRecent: (limit?: number): Promise<unknown[]> =>
      ipcRenderer.invoke('projects:findRecent', limit),
    findTopByLocationCount: (limit?: number): Promise<unknown[]> =>
      ipcRenderer.invoke('projects:findTopByLocationCount', limit),
    findByLocation: (locid: string): Promise<unknown[]> =>
      ipcRenderer.invoke('projects:findByLocation', locid),
    update: (project_id: string, updates: {
      project_name?: string;
      description?: string | null;
    }): Promise<unknown> =>
      ipcRenderer.invoke('projects:update', project_id, updates),
    delete: (project_id: string): Promise<void> =>
      ipcRenderer.invoke('projects:delete', project_id),
    addLocation: (project_id: string, locid: string): Promise<void> =>
      ipcRenderer.invoke('projects:addLocation', project_id, locid),
    removeLocation: (project_id: string, locid: string): Promise<void> =>
      ipcRenderer.invoke('projects:removeLocation', project_id, locid),
    isLocationInProject: (project_id: string, locid: string): Promise<boolean> =>
      ipcRenderer.invoke('projects:isLocationInProject', project_id, locid),
  },

  bookmarks: {
    create: (input: {
      url: string;
      title?: string | null;
      locid?: string | null;
      auth_imp?: string | null;
      thumbnail_path?: string | null;
    }): Promise<unknown> =>
      ipcRenderer.invoke('bookmarks:create', input),
    findById: (bookmark_id: string): Promise<unknown> =>
      ipcRenderer.invoke('bookmarks:findById', bookmark_id),
    findByLocation: (locid: string): Promise<unknown[]> =>
      ipcRenderer.invoke('bookmarks:findByLocation', locid),
    findRecent: (limit?: number): Promise<unknown[]> =>
      ipcRenderer.invoke('bookmarks:findRecent', limit),
    findAll: (): Promise<unknown[]> =>
      ipcRenderer.invoke('bookmarks:findAll'),
    update: (bookmark_id: string, updates: {
      url?: string;
      title?: string | null;
      locid?: string | null;
      thumbnail_path?: string | null;
    }): Promise<unknown> =>
      ipcRenderer.invoke('bookmarks:update', bookmark_id, updates),
    delete: (bookmark_id: string): Promise<void> =>
      ipcRenderer.invoke('bookmarks:delete', bookmark_id),
    count: (): Promise<number> =>
      ipcRenderer.invoke('bookmarks:count'),
    countByLocation: (locid: string): Promise<number> =>
      ipcRenderer.invoke('bookmarks:countByLocation', locid),
  },
  users: {
    create: (input: {
      username: string;
      display_name?: string | null;
    }): Promise<unknown> =>
      ipcRenderer.invoke('users:create', input),
    findAll: (): Promise<unknown[]> =>
      ipcRenderer.invoke('users:findAll'),
    findByUsername: (username: string): Promise<unknown | null> =>
      ipcRenderer.invoke('users:findByUsername', username),
    delete: (user_id: string): Promise<void> =>
      ipcRenderer.invoke('users:delete', user_id),
  },

  health: {
    getDashboard: (): Promise<unknown> =>
      ipcRenderer.invoke('health:getDashboard'),
    getStatus: (): Promise<unknown> =>
      ipcRenderer.invoke('health:getStatus'),
    runCheck: (): Promise<unknown> =>
      ipcRenderer.invoke('health:runCheck'),
    createBackup: (): Promise<unknown> =>
      ipcRenderer.invoke('health:createBackup'),
    getBackupStats: (): Promise<unknown> =>
      ipcRenderer.invoke('health:getBackupStats'),
    getDiskSpace: (): Promise<unknown> =>
      ipcRenderer.invoke('health:getDiskSpace'),
    checkIntegrity: (): Promise<unknown> =>
      ipcRenderer.invoke('health:checkIntegrity'),
    runMaintenance: (): Promise<unknown> =>
      ipcRenderer.invoke('health:runMaintenance'),
    getMaintenanceSchedule: (): Promise<unknown> =>
      ipcRenderer.invoke('health:getMaintenanceSchedule'),
    getRecoveryState: (): Promise<unknown> =>
      ipcRenderer.invoke('health:getRecoveryState'),
    attemptRecovery: (): Promise<unknown> =>
      ipcRenderer.invoke('health:attemptRecovery'),
  },

  browser: {
    navigate: (url: string): Promise<{ success: boolean }> =>
      ipcRenderer.invoke('browser:navigate', url),
    show: (bounds: { x: number; y: number; width: number; height: number }): Promise<{ success: boolean }> =>
      ipcRenderer.invoke('browser:show', bounds),
    hide: (): Promise<{ success: boolean }> =>
      ipcRenderer.invoke('browser:hide'),
    getUrl: (): Promise<string> =>
      ipcRenderer.invoke('browser:getUrl'),
    getTitle: (): Promise<string> =>
      ipcRenderer.invoke('browser:getTitle'),
    goBack: (): Promise<boolean> =>
      ipcRenderer.invoke('browser:goBack'),
    goForward: (): Promise<boolean> =>
      ipcRenderer.invoke('browser:goForward'),
    reload: (): Promise<void> =>
      ipcRenderer.invoke('browser:reload'),
    captureScreenshot: (): Promise<string | null> =>
      ipcRenderer.invoke('browser:captureScreenshot'),
    onNavigated: (callback: (url: string) => void) => {
      const listener = (_event: unknown, url: string) => callback(url);
      ipcRenderer.on('browser:navigated', listener);
      return () => ipcRenderer.removeListener('browser:navigated', listener);
    },
    onTitleChanged: (callback: (title: string) => void) => {
      const listener = (_event: unknown, title: string) => callback(title);
      ipcRenderer.on('browser:titleChanged', listener);
      return () => ipcRenderer.removeListener('browser:titleChanged', listener);
    },
    onLoadingChanged: (callback: (loading: boolean) => void) => {
      const listener = (_event: unknown, loading: boolean) => callback(loading);
      ipcRenderer.on('browser:loadingChanged', listener);
      return () => ipcRenderer.removeListener('browser:loadingChanged', listener);
    },
  },
};

contextBridge.exposeInMainWorld('electronAPI', api);

// Type is exported from a separate .d.ts file to avoid CJS compilation issues
// See: electron/preload/types.d.ts
