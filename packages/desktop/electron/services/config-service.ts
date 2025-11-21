import { app } from 'electron';
import { join } from 'path';
import { promises as fs } from 'fs';
import { existsSync } from 'fs';
import { getLogger } from './logger-service';

export interface AppConfig {
  backup: {
    enabled: boolean;
    maxBackups: number;
  };
  monitoring: {
    diskSpace: {
      warningThresholdMB: number;
      criticalThresholdMB: number;
      emergencyThresholdMB: number;
    };
    integrity: {
      checkOnStartup: boolean;
    };
  };
  logging: {
    maxFileSizeMB: number;
    maxFiles: number;
  };
}

const DEFAULT_CONFIG: AppConfig = {
  backup: {
    enabled: true,
    maxBackups: 10,
  },
  monitoring: {
    diskSpace: {
      warningThresholdMB: 1024, // 1GB
      criticalThresholdMB: 512, // 512MB
      emergencyThresholdMB: 100, // 100MB
    },
    integrity: {
      checkOnStartup: true,
    },
  },
  logging: {
    maxFileSizeMB: 10,
    maxFiles: 7,
  },
};

/**
 * Configuration Service
 * Manages application configuration with defaults
 */
export class ConfigService {
  private configPath: string;
  private config: AppConfig | null = null;

  constructor() {
    this.configPath = join(app.getPath('userData'), 'config.json');
  }

  /**
   * Load configuration from disk or create with defaults
   */
  async load(): Promise<AppConfig> {
    try {
      if (existsSync(this.configPath)) {
        const content = await fs.readFile(this.configPath, 'utf-8');
        const loaded = JSON.parse(content);

        // Merge with defaults (in case new config keys were added)
        this.config = this.mergeWithDefaults(loaded);

        getLogger().info('ConfigService', 'Configuration loaded', {
          path: this.configPath,
        });
      } else {
        // Create default config
        this.config = { ...DEFAULT_CONFIG };
        await this.save();

        getLogger().info('ConfigService', 'Created default configuration', {
          path: this.configPath,
        });
      }

      return this.config;
    } catch (error) {
      getLogger().error('ConfigService', 'Failed to load configuration, using defaults', error as Error);
      this.config = { ...DEFAULT_CONFIG };
      return this.config;
    }
  }

  /**
   * Save configuration to disk
   */
  async save(): Promise<void> {
    if (!this.config) {
      throw new Error('Configuration not loaded');
    }

    try {
      await fs.writeFile(this.configPath, JSON.stringify(this.config, null, 2), 'utf-8');

      getLogger().info('ConfigService', 'Configuration saved', {
        path: this.configPath,
      });
    } catch (error) {
      getLogger().error('ConfigService', 'Failed to save configuration', error as Error);
      throw error;
    }
  }

  /**
   * Get current configuration
   */
  get(): AppConfig {
    if (!this.config) {
      throw new Error('Configuration not loaded. Call load() first.');
    }
    return this.config;
  }

  /**
   * Update configuration
   */
  async update(updates: Partial<AppConfig>): Promise<void> {
    if (!this.config) {
      throw new Error('Configuration not loaded');
    }

    this.config = this.mergeDeep(this.config, updates);
    await this.save();
  }

  /**
   * Reset to defaults
   */
  async reset(): Promise<void> {
    this.config = { ...DEFAULT_CONFIG };
    await this.save();
    getLogger().info('ConfigService', 'Configuration reset to defaults');
  }

  /**
   * Merge loaded config with defaults (add missing keys)
   */
  private mergeWithDefaults(loaded: Partial<AppConfig>): AppConfig {
    return this.mergeDeep(DEFAULT_CONFIG, loaded) as AppConfig;
  }

  /**
   * Deep merge two objects
   */
  private mergeDeep(target: any, source: any): any {
    const output = { ...target };

    if (this.isObject(target) && this.isObject(source)) {
      Object.keys(source).forEach((key) => {
        if (this.isObject(source[key])) {
          if (!(key in target)) {
            Object.assign(output, { [key]: source[key] });
          } else {
            output[key] = this.mergeDeep(target[key], source[key]);
          }
        } else {
          Object.assign(output, { [key]: source[key] });
        }
      });
    }

    return output;
  }

  private isObject(item: any): boolean {
    return item && typeof item === 'object' && !Array.isArray(item);
  }
}

// Singleton instance
let configInstance: ConfigService | null = null;

export function getConfigService(): ConfigService {
  if (!configInstance) {
    configInstance = new ConfigService();
  }
  return configInstance;
}
