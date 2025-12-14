/**
 * Credentials IPC Handlers
 *
 * Handles secure API key storage for cloud LLM providers.
 * Keys are encrypted using Electron's safeStorage and stored in SQLite.
 *
 * SECURITY:
 * - Keys are NEVER sent to the renderer process
 * - Only main process can retrieve decrypted keys
 * - All inputs are validated with Zod before processing
 *
 * @version 1.0
 * @see docs/plans/litellm-integration-plan.md - Phase 1
 */

import { ipcMain } from 'electron';
import {
  storeCredential,
  hasCredential,
  deleteCredential,
  listCredentialProviders,
  getCredentialInfo,
  isEncryptionAvailable,
} from '../../services/credential-service';
import {
  StoreCredentialSchema,
  ProviderIdSchema,
  type ProviderId,
} from './litellm-validation';
import { z } from 'zod';

// =============================================================================
// HANDLER REGISTRATION
// =============================================================================

/**
 * Register all credential-related IPC handlers.
 */
export function registerCredentialHandlers(): void {
  // -------------------------------------------------------------------------
  // credentials:store - Store encrypted API key
  // -------------------------------------------------------------------------
  ipcMain.handle(
    'credentials:store',
    async (_, provider: string, apiKey: string) => {
      try {
        // Validate input
        const validated = StoreCredentialSchema.parse({ provider, apiKey });

        // Check encryption availability
        if (!isEncryptionAvailable()) {
          return {
            success: false,
            error: 'Encryption not available on this system. Cannot store API keys securely.',
          };
        }

        // Store encrypted key
        await storeCredential(validated.provider as ProviderId, validated.apiKey);

        console.log(`[Credentials IPC] Stored key for ${validated.provider}`);
        return { success: true };
      } catch (error) {
        if (error instanceof z.ZodError) {
          const message = error.errors[0]?.message || 'Validation failed';
          console.warn('[Credentials IPC] Validation error:', message);
          return { success: false, error: message };
        }
        console.error('[Credentials IPC] Store error:', error);
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        };
      }
    }
  );

  // -------------------------------------------------------------------------
  // credentials:has - Check if provider has stored key
  // -------------------------------------------------------------------------
  ipcMain.handle('credentials:has', async (_, provider: string) => {
    try {
      // Validate provider
      const validatedProvider = ProviderIdSchema.parse(provider);

      const hasKey = await hasCredential(validatedProvider as ProviderId);
      return { success: true, hasKey };
    } catch (error) {
      if (error instanceof z.ZodError) {
        return { success: false, hasKey: false, error: 'Invalid provider' };
      }
      console.error('[Credentials IPC] Has error:', error);
      return {
        success: false,
        hasKey: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  });

  // -------------------------------------------------------------------------
  // credentials:delete - Remove stored key
  // -------------------------------------------------------------------------
  ipcMain.handle('credentials:delete', async (_, provider: string) => {
    try {
      // Validate provider
      const validatedProvider = ProviderIdSchema.parse(provider);

      await deleteCredential(validatedProvider as ProviderId);

      console.log(`[Credentials IPC] Deleted key for ${validatedProvider}`);
      return { success: true };
    } catch (error) {
      if (error instanceof z.ZodError) {
        return { success: false, error: 'Invalid provider' };
      }
      console.error('[Credentials IPC] Delete error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  });

  // -------------------------------------------------------------------------
  // credentials:list - List providers with stored keys
  // -------------------------------------------------------------------------
  ipcMain.handle('credentials:list', async () => {
    try {
      const providers = await listCredentialProviders();
      return { success: true, providers };
    } catch (error) {
      console.error('[Credentials IPC] List error:', error);
      return {
        success: false,
        providers: [],
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  });

  // -------------------------------------------------------------------------
  // credentials:info - Get credential metadata (without key)
  // -------------------------------------------------------------------------
  ipcMain.handle('credentials:info', async (_, provider: string) => {
    try {
      // Validate provider
      const validatedProvider = ProviderIdSchema.parse(provider);

      const info = await getCredentialInfo(validatedProvider as ProviderId);
      return { success: true, info };
    } catch (error) {
      if (error instanceof z.ZodError) {
        return { success: false, info: null, error: 'Invalid provider' };
      }
      console.error('[Credentials IPC] Info error:', error);
      return {
        success: false,
        info: null,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  });

  // -------------------------------------------------------------------------
  // credentials:encryptionAvailable - Check if encryption is available
  // -------------------------------------------------------------------------
  ipcMain.handle('credentials:encryptionAvailable', async () => {
    return { success: true, available: isEncryptionAvailable() };
  });

  console.log('[IPC] Credentials handlers registered');
}

// =============================================================================
// EXPORTS
// =============================================================================

export default registerCredentialHandlers;
