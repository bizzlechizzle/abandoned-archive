/**
 * VLM Enhancement Service (Stage 2)
 *
 * Optional deep analysis using Qwen3-VL or similar large vision-language model.
 * Only run for high-value images (hero candidates, manual trigger).
 *
 * Provides:
 * - Rich captions and descriptions
 * - Detailed architectural analysis
 * - Historical period estimation
 * - Condition assessment narrative
 *
 * Per CLAUDE.md Rule 9: Local LLMs for background tasks only.
 *
 * @module services/tagging/vlm-enhancement-service
 */

import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs/promises';
import { app } from 'electron';
import { getLogger } from '../logger-service';
import type { ViewType } from './scene-classifier';

const logger = getLogger();

// ============================================================================
// Type Definitions
// ============================================================================

export interface VLMEnhancementResult {
  /** Rich natural language description */
  description: string;

  /** Short caption suitable for alt text */
  caption: string;

  /** Architectural style detected (Art Deco, Mid-Century, Industrial, etc.) */
  architecturalStyle?: string;

  /** Estimated construction period */
  estimatedPeriod?: {
    start: number;
    end: number;
    confidence: number;
    reasoning: string;
  };

  /** Detailed condition assessment */
  conditionAssessment?: {
    overall: 'excellent' | 'good' | 'fair' | 'poor' | 'critical';
    score: number;  // 0-1
    details: string;
    observations: string[];
  };

  /** Notable features detected */
  notableFeatures: string[];

  /** Suggested search keywords */
  searchKeywords: string[];

  /** Processing metadata */
  duration_ms: number;
  model: string;
  device: string;
}

export interface VLMEnhancementContext {
  /** View type from Stage 0 */
  viewType?: ViewType;

  /** Tags from Stage 1 */
  tags?: string[];

  /** Location type from database */
  locationType?: string;

  /** Location name for context */
  locationName?: string;

  /** State/region */
  state?: string;
}

export interface VLMEnhancementConfig {
  /** Model to use (qwen3-vl, llava, etc.) */
  model?: string;

  /** Path to Python with model installed */
  pythonPath?: string;

  /** Device for inference */
  device?: 'cuda' | 'mps' | 'cpu';

  /** Max tokens for response */
  maxTokens?: number;

  /** Timeout in milliseconds */
  timeout?: number;
}

// ============================================================================
// VLM Enhancement Service
// ============================================================================

export class VLMEnhancementService {
  private config: Required<VLMEnhancementConfig>;
  private initialized = false;
  private modelAvailable = false;

  constructor(config: VLMEnhancementConfig = {}) {
    this.config = {
      model: config.model ?? 'qwen3-vl',
      pythonPath: config.pythonPath ?? 'python3',
      device: config.device ?? (process.platform === 'darwin' ? 'mps' : 'cuda'),
      maxTokens: config.maxTokens ?? 512,
      timeout: config.timeout ?? 120000, // VLMs are slower, 2 min timeout
    };
  }

  /**
   * Initialize the service - check for model availability
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    const projectRoot = this.getProjectRoot();
    const scriptPath = path.join(projectRoot, 'scripts/vlm_enhancer.py');

    try {
      await fs.access(scriptPath);
      this.modelAvailable = true;
      logger.info('VLMEnhancement', 'VLM enhancer script available');
    } catch {
      logger.warn('VLMEnhancement', 'VLM enhancer script not found - Stage 2 disabled');
    }

    this.initialized = true;
  }

  /**
   * Check if VLM enhancement is available
   */
  async isAvailable(): Promise<boolean> {
    await this.initialize();
    return this.modelAvailable;
  }

  /**
   * Get service status
   */
  async getStatus(): Promise<{
    available: boolean;
    model: string;
    lastCheck: string;
    error?: string;
  }> {
    await this.initialize();

    return {
      available: this.modelAvailable,
      model: this.modelAvailable ? this.config.model : 'none',
      lastCheck: new Date().toISOString(),
      error: this.modelAvailable ? undefined : 'VLM enhancer script not found',
    };
  }

  /**
   * Get project root path
   */
  private getProjectRoot(): string {
    return path.resolve(app.getAppPath(), '../..');
  }

  /**
   * Get Python path, preferring venv if available
   */
  private async getPythonPath(): Promise<string> {
    const projectRoot = this.getProjectRoot();
    const venvPython = path.join(projectRoot, 'scripts/vlm-server/venv/bin/python3');

    try {
      await fs.access(venvPython);
      return venvPython;
    } catch {
      return this.config.pythonPath;
    }
  }

  /**
   * Enhance an image with deep VLM analysis
   *
   * @param imagePath - Absolute path to image
   * @param context - Optional context from previous stages
   * @returns Enhanced analysis result
   */
  async enhanceImage(
    imagePath: string,
    context?: VLMEnhancementContext
  ): Promise<VLMEnhancementResult> {
    await this.initialize();

    if (!this.modelAvailable) {
      throw new Error('VLM enhancement not available - run scripts/setup-vlm.sh');
    }

    const startTime = Date.now();
    const projectRoot = this.getProjectRoot();
    const scriptPath = path.join(projectRoot, 'scripts/vlm_enhancer.py');
    const pythonPath = await this.getPythonPath();

    return new Promise((resolve, reject) => {
      const args = [
        scriptPath,
        '--image', imagePath,
        '--model', this.config.model,
        '--device', this.config.device,
        '--max-tokens', String(this.config.maxTokens),
        '--output', 'json',
      ];

      // Add context if provided
      if (context?.viewType && context.viewType !== 'unknown') {
        args.push('--view-type', context.viewType);
      }
      if (context?.tags && context.tags.length > 0) {
        args.push('--tags', context.tags.slice(0, 20).join(','));
      }
      if (context?.locationType) {
        args.push('--location-type', context.locationType);
      }
      if (context?.locationName) {
        args.push('--location-name', context.locationName);
      }
      if (context?.state) {
        args.push('--state', context.state);
      }

      const proc = spawn(pythonPath, args, {
        env: {
          ...process.env,
          PYTORCH_ENABLE_MPS_FALLBACK: '1',
        },
      });

      let stdout = '';
      let stderr = '';

      proc.stdout.on('data', (data) => { stdout += data.toString(); });
      proc.stderr.on('data', (data) => { stderr += data.toString(); });

      const timeout = setTimeout(() => {
        proc.kill();
        reject(new Error('VLM enhancement timed out'));
      }, this.config.timeout);

      proc.on('close', (code) => {
        clearTimeout(timeout);

        if (code !== 0) {
          const error = new Error(`VLM enhancement failed (exit code ${code}): ${stderr}`);
          logger.error('VLMEnhancement', error.message);
          reject(error);
          return;
        }

        try {
          const result = JSON.parse(stdout);
          const duration = Date.now() - startTime;

          resolve({
            description: result.description ?? '',
            caption: result.caption ?? '',
            architecturalStyle: result.architectural_style,
            estimatedPeriod: result.estimated_period ? {
              start: result.estimated_period.start,
              end: result.estimated_period.end,
              confidence: result.estimated_period.confidence ?? 0.5,
              reasoning: result.estimated_period.reasoning ?? '',
            } : undefined,
            conditionAssessment: result.condition_assessment ? {
              overall: result.condition_assessment.overall ?? 'fair',
              score: result.condition_assessment.score ?? 0.5,
              details: result.condition_assessment.details ?? '',
              observations: result.condition_assessment.observations ?? [],
            } : undefined,
            notableFeatures: result.notable_features ?? [],
            searchKeywords: result.search_keywords ?? [],
            duration_ms: result.duration_ms ?? duration,
            model: result.model ?? this.config.model,
            device: result.device ?? this.config.device,
          });

          logger.info('VLMEnhancement',
            `Enhanced ${path.basename(imagePath)} in ${duration}ms - ${result.notable_features?.length ?? 0} features found`
          );
        } catch (e) {
          const error = new Error(`Failed to parse VLM output: ${stdout.slice(0, 500)}`);
          logger.error('VLMEnhancement', error.message);
          reject(error);
        }
      });

      proc.on('error', (err) => {
        clearTimeout(timeout);
        reject(new Error(`Failed to spawn VLM process: ${err.message}`));
      });
    });
  }

  /**
   * Batch enhance multiple images
   */
  async enhanceBatch(
    images: Array<{ path: string; context?: VLMEnhancementContext }>,
    onProgress?: (current: number, total: number) => void
  ): Promise<Map<string, VLMEnhancementResult | Error>> {
    const results = new Map<string, VLMEnhancementResult | Error>();
    const total = images.length;

    for (let i = 0; i < images.length; i++) {
      const { path: imagePath, context } = images[i];

      try {
        const result = await this.enhanceImage(imagePath, context);
        results.set(imagePath, result);
      } catch (e) {
        const error = e instanceof Error ? e : new Error(String(e));
        results.set(imagePath, error);
        logger.warn('VLMEnhancement', `Failed to enhance ${imagePath}: ${error.message}`);
      }

      onProgress?.(i + 1, total);
    }

    return results;
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let instance: VLMEnhancementService | null = null;

/**
 * Get the VLM enhancement service singleton
 */
export function getVLMEnhancementService(): VLMEnhancementService {
  if (!instance) {
    instance = new VLMEnhancementService();
  }
  return instance;
}

/**
 * Reset the singleton (for testing)
 */
export function resetVLMEnhancementService(): void {
  instance = null;
}
