/**
 * Token Storage Implementations
 *
 * Provides secure token storage for dispatch authentication.
 * Multiple implementations for different platforms.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import type { TokenStorage, TokenPair } from './types.js';

const SERVICE_NAME = 'abandoned-archive-dispatch';
const ACCOUNT_NAME = 'dispatch-tokens';

// ============================================
// Keytar Storage (System Keychain)
// ============================================

/**
 * Uses OS keychain for secure token storage.
 * - macOS: Keychain
 * - Windows: Credential Vault
 * - Linux: libsecret
 */
export class KeytarStorage implements TokenStorage {
  private keytar: typeof import('keytar') | null = null;
  private initialized = false;

  private async init(): Promise<boolean> {
    if (this.initialized) return this.keytar !== null;

    try {
      // Dynamic import to handle case where keytar isn't installed
      this.keytar = await import('keytar');
      this.initialized = true;
      return true;
    } catch (error) {
      console.warn('[KeytarStorage] keytar not available, will use fallback');
      this.initialized = true;
      return false;
    }
  }

  save(tokens: TokenPair): void {
    // Sync wrapper - keytar is async but our interface is sync
    // We use setPassword which is actually sync in most implementations
    this.init().then((available) => {
      if (available && this.keytar) {
        this.keytar
          .setPassword(SERVICE_NAME, ACCOUNT_NAME, JSON.stringify(tokens))
          .catch((err) => console.error('[KeytarStorage] Failed to save:', err));
      }
    });
  }

  load(): TokenPair | null {
    // For sync load, we can't use async keytar
    // This is a limitation - caller should use loadAsync if available
    return null;
  }

  async loadAsync(): Promise<TokenPair | null> {
    const available = await this.init();
    if (!available || !this.keytar) return null;

    try {
      const stored = await this.keytar.getPassword(SERVICE_NAME, ACCOUNT_NAME);
      if (stored) {
        return JSON.parse(stored) as TokenPair;
      }
    } catch (error) {
      console.error('[KeytarStorage] Failed to load:', error);
    }
    return null;
  }

  clear(): void {
    this.init().then((available) => {
      if (available && this.keytar) {
        this.keytar
          .deletePassword(SERVICE_NAME, ACCOUNT_NAME)
          .catch((err) => console.error('[KeytarStorage] Failed to clear:', err));
      }
    });
  }

  async clearAsync(): Promise<void> {
    const available = await this.init();
    if (available && this.keytar) {
      await this.keytar.deletePassword(SERVICE_NAME, ACCOUNT_NAME);
    }
  }
}

// ============================================
// File Storage (Fallback)
// ============================================

/**
 * File-based token storage with restricted permissions.
 * Used as fallback when keytar is not available.
 *
 * Tokens are stored in ~/.abandoned-archive/dispatch-tokens.json
 * with chmod 600 (owner read/write only).
 */
export class FileStorage implements TokenStorage {
  private filePath: string;

  constructor(dataDir?: string) {
    const dir = dataDir || path.join(os.homedir(), '.abandoned-archive');
    this.filePath = path.join(dir, 'dispatch-tokens.json');

    // Ensure directory exists with secure permissions
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    }
  }

  save(tokens: TokenPair): void {
    try {
      const data = JSON.stringify(tokens, null, 2);
      fs.writeFileSync(this.filePath, data, { mode: 0o600 });
    } catch (error) {
      console.error('[FileStorage] Failed to save tokens:', error);
    }
  }

  load(): TokenPair | null {
    try {
      if (fs.existsSync(this.filePath)) {
        const data = fs.readFileSync(this.filePath, 'utf-8');
        return JSON.parse(data) as TokenPair;
      }
    } catch (error) {
      console.error('[FileStorage] Failed to load tokens:', error);
    }
    return null;
  }

  clear(): void {
    try {
      if (fs.existsSync(this.filePath)) {
        fs.unlinkSync(this.filePath);
      }
    } catch (error) {
      console.error('[FileStorage] Failed to clear tokens:', error);
    }
  }
}

// ============================================
// Memory Storage (Testing)
// ============================================

/**
 * In-memory token storage for testing.
 * Tokens are lost when process exits.
 */
export class MemoryStorage implements TokenStorage {
  private tokens: TokenPair | null = null;

  save(tokens: TokenPair): void {
    this.tokens = tokens;
  }

  load(): TokenPair | null {
    return this.tokens;
  }

  clear(): void {
    this.tokens = null;
  }
}

// ============================================
// Factory
// ============================================

/**
 * Create the best available token storage for the platform.
 * Tries keytar first, falls back to file storage.
 */
export async function createTokenStorage(dataDir?: string): Promise<TokenStorage> {
  const keytarStorage = new KeytarStorage();

  // Test if keytar works
  try {
    await import('keytar');
    // If import succeeds, use keytar
    return keytarStorage;
  } catch {
    // Fall back to file storage
    console.log('[TokenStorage] Using file-based storage');
    return new FileStorage(dataDir);
  }
}

/**
 * Create token storage synchronously.
 * Uses file storage (keytar requires async init).
 */
export function createTokenStorageSync(dataDir?: string): TokenStorage {
  return new FileStorage(dataDir);
}
