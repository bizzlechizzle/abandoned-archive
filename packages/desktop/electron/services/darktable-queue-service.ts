/**
 * DarktableQueueService - Background processing queue for RAW files
 * Per LILBITS: ~150 lines, single responsibility
 *
 * Manages a queue of RAW files to be processed by Darktable CLI.
 * Processing happens in background after import, one file at a time
 * (CPU intensive operation).
 *
 * Integration: Called AFTER ExifTool preview extraction completes.
 * Does NOT block import - files are queued and processed asynchronously.
 */

import { EventEmitter } from 'events';
import { DarktableService, ProcessResult } from './darktable-service';
import { MediaPathService } from './media-path-service';

export interface QueueItem {
  hash: string;
  sourcePath: string;
  locid: string;
  addedAt: number;
}

export interface QueueProgress {
  total: number;
  completed: number;
  failed: number;
  currentHash: string | null;
  isProcessing: boolean;
}

export interface QueueResult {
  hash: string;
  success: boolean;
  outputPath: string | null;
  error?: string;
  processingTime?: number;
}

export class DarktableQueueService extends EventEmitter {
  private queue: QueueItem[] = [];
  private processing = false;
  private completed = 0;
  private failed = 0;
  private currentItem: QueueItem | null = null;
  private enabled = true;

  constructor(
    private readonly darktableService: DarktableService,
    private readonly mediaPathService: MediaPathService,
    private readonly onProcessed?: (hash: string, outputPath: string) => Promise<void>
  ) {
    super();
  }

  /**
   * Enable or disable Darktable processing
   */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    console.log(`[DarktableQueue] Processing ${enabled ? 'enabled' : 'disabled'}`);
  }

  /**
   * Check if Darktable is available and enabled
   */
  async isAvailable(): Promise<boolean> {
    if (!this.enabled) return false;
    return await this.darktableService.isAvailable();
  }

  /**
   * Add a RAW file to the processing queue
   * Call this AFTER ExifTool preview extraction during import
   */
  async enqueue(hash: string, sourcePath: string, locid: string): Promise<boolean> {
    // Check if darktable is available
    if (!await this.isAvailable()) {
      console.log(`[DarktableQueue] Darktable not available, skipping ${hash}`);
      return false;
    }

    // Check if file is a RAW format
    if (!this.darktableService.isRawFile(sourcePath)) {
      return false;
    }

    // Check if already in queue
    if (this.queue.some(item => item.hash === hash)) {
      console.log(`[DarktableQueue] ${hash} already in queue`);
      return false;
    }

    // Check if already processed
    const outputPath = this.darktableService.getOutputPath(hash);
    try {
      const fs = await import('fs/promises');
      await fs.access(outputPath);
      console.log(`[DarktableQueue] ${hash} already processed`);
      return false;
    } catch {
      // Not processed yet, add to queue
    }

    this.queue.push({
      hash,
      sourcePath,
      locid,
      addedAt: Date.now(),
    });

    console.log(`[DarktableQueue] Queued ${hash} (${this.queue.length} in queue)`);
    this.emit('queued', { hash, queueLength: this.queue.length });

    // Start processing if not already running
    if (!this.processing) {
      this.processNext();
    }

    return true;
  }

  /**
   * Add multiple files to the queue at once
   */
  async enqueueBatch(
    files: Array<{ hash: string; sourcePath: string; locid: string }>
  ): Promise<number> {
    let queued = 0;
    for (const file of files) {
      const added = await this.enqueue(file.hash, file.sourcePath, file.locid);
      if (added) queued++;
    }
    return queued;
  }

  /**
   * Get current queue status
   */
  getProgress(): QueueProgress {
    return {
      total: this.queue.length + this.completed + this.failed,
      completed: this.completed,
      failed: this.failed,
      currentHash: this.currentItem?.hash || null,
      isProcessing: this.processing,
    };
  }

  /**
   * Process next item in queue
   */
  private async processNext(): Promise<void> {
    if (this.processing || this.queue.length === 0) {
      return;
    }

    this.processing = true;
    this.currentItem = this.queue.shift()!;

    console.log(`[DarktableQueue] Processing ${this.currentItem.hash}`);
    this.emit('processing', { hash: this.currentItem.hash, progress: this.getProgress() });

    try {
      const result = await this.darktableService.processRawFile(
        this.currentItem.sourcePath,
        this.currentItem.hash
      );

      if (result.success && result.outputPath) {
        this.completed++;
        console.log(`[DarktableQueue] Completed ${this.currentItem.hash}`);

        // Callback to update database with new darktable path
        if (this.onProcessed) {
          await this.onProcessed(this.currentItem.hash, result.outputPath);
        }

        this.emit('completed', {
          hash: this.currentItem.hash,
          outputPath: result.outputPath,
          processingTime: result.processingTime,
          progress: this.getProgress(),
        });
      } else {
        this.failed++;
        console.error(`[DarktableQueue] Failed ${this.currentItem.hash}: ${result.error}`);
        this.emit('failed', {
          hash: this.currentItem.hash,
          error: result.error,
          progress: this.getProgress(),
        });
      }
    } catch (error) {
      this.failed++;
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error(`[DarktableQueue] Error processing ${this.currentItem.hash}:`, errorMsg);
      this.emit('failed', {
        hash: this.currentItem.hash,
        error: errorMsg,
        progress: this.getProgress(),
      });
    }

    this.currentItem = null;
    this.processing = false;

    // Process next item if queue not empty
    if (this.queue.length > 0) {
      // Small delay between processing to prevent CPU saturation
      setTimeout(() => this.processNext(), 500);
    } else {
      console.log(`[DarktableQueue] Queue empty. Completed: ${this.completed}, Failed: ${this.failed}`);
      this.emit('queueEmpty', { completed: this.completed, failed: this.failed });
    }
  }

  /**
   * Clear the queue (does not stop current processing)
   */
  clearQueue(): void {
    const cleared = this.queue.length;
    this.queue = [];
    console.log(`[DarktableQueue] Cleared ${cleared} items from queue`);
    this.emit('cleared', { cleared });
  }

  /**
   * Reset statistics
   */
  resetStats(): void {
    this.completed = 0;
    this.failed = 0;
  }
}
