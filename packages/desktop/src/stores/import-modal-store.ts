/**
 * Import Modal Store
 * P1: Global state management for the Import Modal
 * Per v010steps.md - Pop-up import form accessible anywhere
 */

import { writable } from 'svelte/store';

// GPS source types for proper attribution
type GpsSource = 'user_map_click' | 'ref_map_point' | 'ref_map_import' | 'photo_exif' | 'manual_entry';

interface ImportModalState {
  isOpen: boolean;
  prefilledData?: {
    name?: string;
    gps_lat?: number;
    gps_lng?: number;
    // Track GPS source for proper attribution (user_map_click vs ref_map_point etc)
    gps_source?: GpsSource;
    state?: string;
    type?: string;
    // Migration 38: Track ref point ID for deletion after location creation
    refPointId?: string;
    // Folder paths to auto-import after location creation (from drag-drop on New Location button)
    pendingImportPaths?: string[];
  };
}

const initialState: ImportModalState = {
  isOpen: false,
  prefilledData: undefined
};

export const importModal = writable<ImportModalState>(initialState);

/**
 * Open the import modal, optionally with pre-filled data
 * @param prefill - Optional data to pre-fill (e.g., GPS from map right-click)
 */
export function openImportModal(prefill?: ImportModalState['prefilledData']) {
  importModal.set({
    isOpen: true,
    prefilledData: prefill
  });
}

/**
 * Close the import modal and reset state
 */
export function closeImportModal() {
  importModal.set({
    isOpen: false,
    prefilledData: undefined
  });
}

/**
 * Pending location import store
 * Holds paths that should auto-import when navigating to a newly created location
 * LocationDetail checks this on mount and triggers import if locid matches
 */
interface PendingLocationImport {
  locid: string;
  paths: string[];
}

export const pendingLocationImport = writable<PendingLocationImport | null>(null);

/**
 * Set pending import to trigger after navigation
 */
export function setPendingLocationImport(locid: string, paths: string[]) {
  pendingLocationImport.set({ locid, paths });
}

/**
 * Clear pending import (called by LocationDetail after triggering)
 */
export function clearPendingLocationImport() {
  pendingLocationImport.set(null);
}
