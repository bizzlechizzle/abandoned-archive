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
  };

  stats: {
    topStates: (limit?: number) => Promise<Array<{ state: string; count: number }>>;
    topTypes: (limit?: number) => Promise<Array<{ type: string; count: number }>>;
  };
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}
