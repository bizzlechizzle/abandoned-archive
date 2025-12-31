/**
 * Import System v2.0 IPC Handlers
 *
 * Per Import Spec v2.0:
 * - import:v2:start - Start new import with 5-step pipeline
 * - import:v2:cancel - Cancel running import
 * - import:v2:status - Get current import status
 * - import:v2:resume - Resume incomplete import
 * - jobs:status - Get background job queue status
 * - jobs:retry - Retry failed job from dead letter queue
 *
 * @module main/ipc-handlers/import-v2
 */

import { ipcMain, BrowserWindow } from 'electron';
import { z } from 'zod';
import type { Kysely } from 'kysely';
import type { Database } from '../database.types';
import {
  createImportOrchestrator,
  type ImportOrchestrator,
  type ImportProgress,
  type ImportResult,
} from '../../services/import';
import { getCurrentUser } from '../../services/user-service';

// Singleton orchestrator instance
let orchestrator: ImportOrchestrator | null = null;

// Track active import abort controllers
const activeImports = new Map<string, AbortController>();

/**
 * OPT-106: Throttled progress emitter for smooth UI updates
 *
 * Production apps use throttling to:
 * 1. Limit IPC traffic (15 updates/sec max)
 * 2. Ensure CSS transitions can complete
 * 3. Prevent renderer from being overwhelmed
 *
 * Always sends: first update, significant changes (>2%), and 100% completion
 */
function createThrottledProgressEmitter() {
  let lastEmitTime = 0;
  let lastPercent = -1;
  let pendingProgress: ImportProgress | null = null;
  let flushTimer: NodeJS.Timeout | null = null;

  const THROTTLE_MS = 66; // ~15 updates/sec - matches 60fps / 4
  const MIN_PERCENT_CHANGE = 2; // Only emit if change >= 2%

  function emit(progress: ImportProgress) {
    sendToRenderer('import:v2:progress', progress);
    lastEmitTime = Date.now();
    lastPercent = progress.percent;
    pendingProgress = null;
  }

  function flush() {
    if (pendingProgress) {
      emit(pendingProgress);
    }
    if (flushTimer) {
      clearTimeout(flushTimer);
      flushTimer = null;
    }
  }

  return {
    send(progress: ImportProgress) {
      const now = Date.now();
      const timeSinceLastEmit = now - lastEmitTime;
      const percentChange = Math.abs(progress.percent - lastPercent);

      // Always emit immediately for:
      // 1. First update (lastPercent === -1)
      // 2. Completion (100%)
      // 3. Status changes (scanning → hashing → copying, etc.)
      // 4. Significant jumps (>10%)
      if (
        lastPercent === -1 ||
        progress.percent >= 100 ||
        progress.status !== pendingProgress?.status ||
        percentChange >= 10
      ) {
        flush();
        emit(progress);
        return;
      }

      // Throttle regular updates
      if (timeSinceLastEmit >= THROTTLE_MS && percentChange >= MIN_PERCENT_CHANGE) {
        emit(progress);
        return;
      }

      // Buffer the update for later
      pendingProgress = progress;

      // Schedule flush if not already scheduled
      if (!flushTimer) {
        flushTimer = setTimeout(() => {
          flushTimer = null;
          if (pendingProgress) {
            emit(pendingProgress);
          }
        }, THROTTLE_MS);
      }
    },

    // Call when import completes to ensure final state is sent
    flush,
  };
}

/**
 * Get the main browser window for sending events
 */
function getMainWindow(): BrowserWindow | null {
  const windows = BrowserWindow.getAllWindows();
  return windows.length > 0 ? windows[0] : null;
}

/**
 * Send event to renderer
 */
function sendToRenderer(channel: string, data: unknown): void {
  const window = getMainWindow();
  if (window && !window.isDestroyed()) {
    const serialized = safeSerialize(data);
    window.webContents.send(channel, serialized);
  }
}

/**
 * OPT-080: NUCLEAR OPTION - Force JSON serialization to prevent structured clone errors
 * This ensures only plain objects/arrays/primitives cross the IPC boundary.
 * If this fails, it will show EXACTLY which field can't be serialized.
 */
function safeSerialize<T>(data: T): T {
  try {
    return JSON.parse(JSON.stringify(data));
  } catch (error) {
    console.error('[IPC] Serialization failed:', error);
    console.error('[IPC] Problematic data type:', typeof data);
    console.error('[IPC] Data constructor:', data?.constructor?.name);

    // Try to find the problematic field
    if (data && typeof data === 'object') {
      for (const [key, value] of Object.entries(data)) {
        try {
          JSON.stringify(value);
        } catch {
          console.error(`[IPC] Non-serializable field: "${key}" (type: ${typeof value}, constructor: ${value?.constructor?.name})`);
        }
      }
    }

    throw error;
  }
}

/**
 * OPT-110: Strip large file arrays from import result before IPC transfer
 *
 * For massive imports (10K+ files), the result object contains 5 arrays of file objects:
 * - scanResult.files[], hashResult.files[], copyResult.files[],
 * - validationResult.files[], finalizationResult.files[]
 *
 * This causes the 600000ms timeout because:
 * 1. JSON.stringify of 50K+ objects is slow
 * 2. Structured clone for IPC is slow
 * 3. Memory allocation for 10s of MB of data
 *
 * Solution: Strip file arrays, return only summary stats (which is all the UI needs)
 */
function stripFileArraysFromResult<T extends Record<string, unknown>>(result: T): T {
  const stripped: Record<string, unknown> = { ...result };

  // Strip file arrays from each result stage
  const stagesToStrip = ['scanResult', 'hashResult', 'copyResult', 'validationResult', 'finalizationResult'];

  for (const stage of stagesToStrip) {
    if (stripped[stage] && typeof stripped[stage] === 'object') {
      const stageData = stripped[stage] as Record<string, unknown>;
      if (Array.isArray(stageData.files)) {
        // Keep everything except the files array
        const { files, ...rest } = stageData;
        stripped[stage] = { ...rest, fileCount: files.length };
      }
    }
  }

  return stripped as T;
}

/**
 * Register Import v2.0 IPC handlers
 */
export function registerImportV2Handlers(db: Kysely<Database>): void {
  // ADR-046: Validation schemas - removed loc12/slocnam (not needed for folder paths)
  // BLAKE3 16-char hex ID validator
  const Blake3IdSchema = z.string().length(16).regex(/^[a-f0-9]+$/, 'Must be 16-char lowercase hex');

  const ImportStartSchema = z.object({
    paths: z.array(z.string()),
    locid: Blake3IdSchema,
    address_state: z.string().nullable(),
    // Extended fields for full UI integration
    subid: Blake3IdSchema.nullable().optional(),
    auth_imp: z.string().nullable().optional(),
    is_contributed: z.number().optional().default(0),
    contribution_source: z.string().nullable().optional(),
  });

  const JobRetrySchema = z.object({
    deadLetterId: z.number(),
  });

  /**
   * Start a new import using v2 pipeline
   */
  ipcMain.handle('import:v2:start', async (_event, input: unknown) => {
    try {
      const validated = ImportStartSchema.parse(input);

      // Get archive path from settings
      const archiveSetting = await db
        .selectFrom('settings')
        .select('value')
        .where('key', '=', 'archive_folder')
        .executeTakeFirst();

      if (!archiveSetting?.value) {
        throw new Error('Archive folder not configured. Please set it in Settings.');
      }

      const archivePath = archiveSetting.value;

      // Get import_skip_acr setting (default: true - skip ACR files)
      const skipAcrSetting = await db
        .selectFrom('settings')
        .select('value')
        .where('key', '=', 'import_skip_acr')
        .executeTakeFirst();
      // Default is true (skip ACR files), only false if explicitly set to 'false'
      const skipAcrFiles = skipAcrSetting?.value !== 'false';

      // Get current user for activity tracking
      const currentUser = await getCurrentUser(db);

      // Create orchestrator if not exists
      if (!orchestrator) {
        orchestrator = createImportOrchestrator(db, archivePath);
      }

      // Create abort controller
      const abortController = new AbortController();

      // OPT-106: Use throttled progress emitter for smooth UI updates
      const progressEmitter = createThrottledProgressEmitter();

      // Progress callback sends events to renderer (throttled)
      const onProgress = (progress: ImportProgress) => {
        progressEmitter.send(progress);
        activeImports.set(progress.sessionId, abortController);
      };

      // Start import
      // ADR-046: Pass simplified location info (loc12/slocnam removed)
      // OPT-093: Pass subid for sub-location media assignment
      const result = await orchestrator.import(validated.paths, {
        location: {
          locid: validated.locid,
          address_state: validated.address_state,
          subid: validated.subid ?? null,
        },
        archivePath,
        skipAcrFiles,
        user: currentUser ? {
          userId: currentUser.userId,
          username: currentUser.username,
        } : undefined,
        onProgress,
        signal: abortController.signal,
      });

      // OPT-106: Flush any pending progress before completion
      progressEmitter.flush();

      // Clean up
      activeImports.delete(result.sessionId);

      // Send completion event
      sendToRenderer('import:v2:complete', {
        sessionId: result.sessionId,
        status: result.status,
        totalImported: result.finalizationResult?.totalFinalized ?? 0,
        totalDuplicates: result.hashResult?.totalDuplicates ?? 0,
        totalErrors: result.finalizationResult?.totalErrors ?? 0,
        totalDurationMs: result.totalDurationMs,
        jobsQueued: result.finalizationResult?.jobsQueued ?? 0,
      });

      // OPT-110: Strip large file arrays to prevent timeout on massive imports
      // OPT-080: Force serialization to prevent structured clone errors
      return safeSerialize(stripFileArraysFromResult(result as unknown as Record<string, unknown>));

    } catch (error) {
      console.error('[import:v2:start] Error:', error);
      // OPT-080: Serialize error to prevent structured clone failure in IPC
      // Complex error objects (Kysely, etc.) may have non-serializable properties
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(message);
    }
  });

  /**
   * Cancel running import
   */
  ipcMain.handle('import:v2:cancel', async (_event, sessionId: string) => {
    const abortController = activeImports.get(sessionId);
    if (abortController) {
      abortController.abort();
      activeImports.delete(sessionId);
      return { cancelled: true };
    }

    // Also try to cancel via orchestrator
    if (orchestrator) {
      orchestrator.cancel();
      return { cancelled: true };
    }

    return { cancelled: false, reason: 'No active import found' };
  });

  /**
   * Get current import status
   */
  ipcMain.handle('import:v2:status', async () => {
    if (!orchestrator) {
      return { sessionId: null, status: 'idle' };
    }
    return safeSerialize(orchestrator.getStatus());
  });

  /**
   * Get resumable import sessions
   */
  ipcMain.handle('import:v2:resumable', async () => {
    try {
      if (!orchestrator) {
        // Create temporary orchestrator to query DB
        const archiveSetting = await db
          .selectFrom('settings')
          .select('value')
          .where('key', '=', 'archive_folder')
          .executeTakeFirst();

        if (!archiveSetting?.value) {
          return [];
        }

        const tempOrchestrator = createImportOrchestrator(db, archiveSetting.value);
        return safeSerialize(await tempOrchestrator.getResumableSessions());
      }

      return safeSerialize(await orchestrator.getResumableSessions());
    } catch (error) {
      console.error('[import:v2:resumable] Error:', error);
      // OPT-080: Serialize error to prevent structured clone failure in IPC
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(message);
    }
  });

  /**
   * Resume an incomplete import
   */
  ipcMain.handle('import:v2:resume', async (_event, sessionId: string) => {
    try {
      if (!orchestrator) {
        throw new Error('Import system not initialized');
      }

      // Get session info to rebuild location
      const session = await db
        .selectFrom('import_sessions')
        .selectAll()
        .where('session_id', '=', sessionId)
        .executeTakeFirst();

      if (!session) {
        throw new Error('Session not found');
      }

      // ADR-046: Get location info (removed loc12/slocnam)
      const location = await db
        .selectFrom('locs')
        .select(['locid', 'address_state'])
        .where('locid', '=', session.locid)
        .executeTakeFirst();

      if (!location) {
        throw new Error('Location not found');
      }

      const archiveSetting = await db
        .selectFrom('settings')
        .select('value')
        .where('key', '=', 'archive_folder')
        .executeTakeFirst();

      if (!archiveSetting?.value) {
        throw new Error('Archive folder not configured');
      }

      const currentUser = await getCurrentUser(db);

      const abortController = new AbortController();

      // OPT-106: Use throttled progress emitter for smooth UI updates
      const progressEmitter = createThrottledProgressEmitter();
      const onProgress = (progress: ImportProgress) => {
        progressEmitter.send(progress);
        activeImports.set(progress.sessionId, abortController);
      };

      // ADR-046: Simplified location (removed loc12/slocnam)
      // OPT-093: Resume limitation - subid not stored in import_sessions
      // Resumed imports go to host location; original sub-location context is lost
      const result = await orchestrator.resume(sessionId, {
        location: {
          locid: location.locid,
          address_state: location.address_state,
          subid: null, // Resume limitation: subid not persisted in import_sessions
        },
        archivePath: archiveSetting.value,
        user: currentUser ? {
          userId: currentUser.userId,
          username: currentUser.username,
        } : undefined,
        onProgress,
        signal: abortController.signal,
      });

      // OPT-106: Flush any pending progress before returning
      progressEmitter.flush();

      // OPT-110: Strip large file arrays to prevent timeout on massive imports
      // OPT-080: Force serialization to prevent structured clone errors
      return safeSerialize(stripFileArraysFromResult(result as unknown as Record<string, unknown>));
    } catch (error) {
      console.error('[import:v2:resume] Error:', error);
      // OPT-080: Serialize error to prevent structured clone failure in IPC
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(message);
    }
  });

  /**
   * Get job queue statistics
   *
   * NOTE: Local job worker disabled - use dispatch:getStatus for job status
   */
  ipcMain.handle('jobs:status', async () => {
    console.log('[jobs:status] Local job worker disabled - use dispatch:getStatus');
    return {
      queues: {},
      running: 0,
      pending: 0,
      completed: 0,
      failed: 0,
      message: 'Local job worker disabled - jobs processed by dispatch hub',
    };
  });

  /**
   * Get dead letter queue entries
   *
   * NOTE: Local job queue disabled - dead letter handled by dispatch
   */
  ipcMain.handle('jobs:deadLetter', async () => {
    console.log('[jobs:deadLetter] Local job queue disabled - use dispatch for job management');
    return [];
  });

  /**
   * Retry a job from dead letter queue
   *
   * NOTE: Local job queue disabled - job retry handled by dispatch
   */
  ipcMain.handle('jobs:retry', async () => {
    console.log('[jobs:retry] Local job queue disabled - use dispatch for job management');
    return { success: false, message: 'Local job queue disabled - use dispatch' };
  });

  /**
   * Acknowledge (dismiss) dead letter entries
   *
   * NOTE: Local job queue disabled
   */
  ipcMain.handle('jobs:acknowledge', async () => {
    console.log('[jobs:acknowledge] Local job queue disabled');
    return { acknowledged: 0, message: 'Local job queue disabled' };
  });

  /**
   * Clear old completed jobs
   *
   * NOTE: Local job queue disabled
   */
  ipcMain.handle('jobs:clearCompleted', async () => {
    console.log('[jobs:clearCompleted] Local job queue disabled');
    return { cleared: 0, message: 'Local job queue disabled' };
  });

}

/**
 * Start the job worker service
 *
 * NOTE: Local job worker DISABLED - all processing goes through dispatch hub.
 * Workers on silo-1 process jobs submitted to dispatch.
 * Event forwarding is handled by dispatch IPC handlers in dispatch.ts.
 */
export function initializeJobWorker(_db: Kysely<Database>): void {
  // All job processing goes through dispatch hub - local worker disabled
  // Event forwarding handled by dispatch.ts IPC handlers
  console.log('[JobWorker] Processing via dispatch hub');
}

/**
 * Shutdown job worker service
 *
 * NOTE: No-op since local worker is disabled.
 */
export async function shutdownJobWorker(): Promise<void> {
  console.log('[JobWorker] Shutdown complete');
}
