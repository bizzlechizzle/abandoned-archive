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
};

contextBridge.exposeInMainWorld('electronAPI', api);

export type ElectronAPI = typeof api;
