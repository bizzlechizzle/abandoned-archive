/**
 * Import Modal Store
 * P1: Global state management for the Import Modal
 * Per v010steps.md - Pop-up import form accessible anywhere
 */

import { writable } from 'svelte/store';

interface ImportModalState {
  isOpen: boolean;
  prefilledData?: {
    gps_lat?: number;
    gps_lng?: number;
    state?: string;
    type?: string;
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
