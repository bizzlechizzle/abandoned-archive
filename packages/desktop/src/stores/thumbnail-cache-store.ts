/**
 * Thumbnail cache-busting store
 *
 * Provides a version timestamp that changes when thumbnails are regenerated.
 * Components append this to image URLs to force browser cache refresh.
 */
import { writable, get } from 'svelte/store';

function createThumbnailCacheStore() {
  const { subscribe, set } = writable<number>(Date.now());

  return {
    subscribe,

    /**
     * Bump the cache version to force all images to reload
     * Call this after regenerating thumbnails
     */
    bust(): void {
      set(Date.now());
    },

    /**
     * Get current cache version (for use in non-reactive contexts)
     */
    getVersion(): number {
      return get({ subscribe });
    },
  };
}

export const thumbnailCache = createThumbnailCacheStore();
