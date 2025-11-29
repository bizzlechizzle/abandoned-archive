import { MediaCacheService } from './media-cache-service';

/**
 * PreloadService - Preload adjacent images when viewing in lightbox
 *
 * Core Rules (DO NOT BREAK):
 * 1. Preload ahead more than behind - Users typically move forward
 * 2. Cancellable - Stop preloading when user navigates away
 * 3. Non-blocking - Never block the UI thread
 * 4. Separate from cache - This service predicts, cache stores
 */

interface MediaItem {
  hash: string;
  path: string;
  type?: 'image' | 'video' | 'document';
}

export class PreloadService {
  private currentIndex: number = -1;
  private mediaList: MediaItem[] = [];
  private abortController: AbortController | null = null;

  // Preload 3 images ahead, 1 behind
  private readonly PRELOAD_AHEAD = 3;
  private readonly PRELOAD_BEHIND = 1;

  constructor(private readonly cache: MediaCacheService) {}

  /**
   * Set the current media list for preloading
   */
  setMediaList(list: MediaItem[]): void {
    this.mediaList = list;
  }

  /**
   * Set current index and trigger preloading
   */
  setCurrentIndex(index: number): void {
    // Cancel any ongoing preload
    if (this.abortController) {
      this.abortController.abort();
    }

    this.currentIndex = index;
    this.abortController = new AbortController();
    this.preloadAdjacent(this.abortController.signal);
  }

  /**
   * Preload images adjacent to current index
   */
  private async preloadAdjacent(signal: AbortSignal): Promise<void> {
    if (this.mediaList.length === 0 || this.currentIndex < 0) {
      return;
    }

    const indicesToPreload: number[] = [];

    // Add items ahead (higher priority)
    for (let i = 1; i <= this.PRELOAD_AHEAD; i++) {
      const idx = this.currentIndex + i;
      if (idx < this.mediaList.length) {
        indicesToPreload.push(idx);
      }
    }

    // Add items behind
    for (let i = 1; i <= this.PRELOAD_BEHIND; i++) {
      const idx = this.currentIndex - i;
      if (idx >= 0) {
        indicesToPreload.push(idx);
      }
    }

    // Preload each item (skip videos - they're streamed, not cached)
    for (const idx of indicesToPreload) {
      if (signal.aborted) {
        return;
      }

      const item = this.mediaList[idx];
      // Skip videos - they're too large for memory cache and should be streamed
      if (item.type === 'video') {
        continue;
      }
      if (!this.cache.has(item.hash)) {
        await this.cache.loadFile(item.hash, item.path);
      }
    }
  }

  /**
   * Cancel any ongoing preload operations
   */
  cancel(): void {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
  }

  /**
   * Get preload status
   */
  getStatus(): { currentIndex: number; listSize: number } {
    return {
      currentIndex: this.currentIndex,
      listSize: this.mediaList.length,
    };
  }
}
