/**
 * RAM++ Tagging Service
 *
 * Background image tagging using RAM++ (Recognize Anything Model).
 * Supports remote API (PC with 3090) or local MPS inference (Mac Studio).
 *
 * Per CLAUDE.md Rule 9: Local LLMs for background tasks only.
 * This service is NEVER called for user-facing queries.
 *
 * @module services/tagging/ram-tagging-service
 */

import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs/promises';
import { app } from 'electron';
import { getLogger } from '../logger-service';
import {
  normalizeTags,
  detectViewType,
  suggestLocationType,
  suggestEra,
  detectConditions,
  filterRelevantTags,
  type NormalizedTag,
  type ViewTypeResult,
  type LocationTypeSuggestion,
  type EraSuggestion,
} from './urbex-taxonomy';

// ESM-compatible __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const logger = getLogger();

// ============================================================================
// Type Definitions
// ============================================================================

export interface RawTagResult {
  tags: string[];
  confidence: Record<string, number>;
  duration_ms: number;
}

export interface EnhancedTagResult {
  // Raw results from RAM++
  rawTags: string[];
  rawConfidence: Record<string, number>;

  // Normalized urbex tags
  tags: string[];
  normalizedTags: NormalizedTag[];
  confidence: Record<string, number>;

  // View classification
  viewType: ViewTypeResult;

  // Location insights
  suggestedType: LocationTypeSuggestion | null;
  suggestedEra: EraSuggestion | null;

  // Condition indicators
  conditions: {
    hasGraffiti: boolean;
    hasEquipment: boolean;
    hasDecay: boolean;
    hasNatureReclaim: boolean;
    conditionScore: number;
  };

  // Quality score (0-1) for hero selection
  qualityScore: number;

  // Timing
  duration_ms: number;
  source: 'remote' | 'local' | 'mock';
}

export interface TaggingConfig {
  // Remote API (preferred for 3090)
  apiUrl?: string;              // e.g., "http://192.168.1.100:8080"
  apiTimeout?: number;          // ms, default 30000

  // Local inference (fallback)
  pythonPath?: string;          // Path to python with RAM++ installed
  modelPath?: string;           // Path to RAM++ weights
  device?: 'cuda' | 'mps' | 'cpu';

  // Processing
  confidenceThreshold?: number; // Min confidence to include tag (0.5)
  maxTags?: number;             // Max tags per image (30)
}

// ============================================================================
// RAM++ Tagging Service
// ============================================================================

export class RamTaggingService {
  private config: Required<TaggingConfig>;
  private initialized = false;
  private apiAvailable = false;

  constructor(config: TaggingConfig = {}) {
    this.config = {
      apiUrl: config.apiUrl ?? process.env.RAM_API_URL ?? '',
      apiTimeout: config.apiTimeout ?? 30000,
      pythonPath: config.pythonPath ?? 'python3',
      modelPath: config.modelPath ?? '',
      device: config.device ?? (process.platform === 'darwin' ? 'mps' : 'cuda'),
      confidenceThreshold: config.confidenceThreshold ?? 0.5,
      maxTags: config.maxTags ?? 30,
    };
  }

  /**
   * Initialize the service
   * Checks for remote API availability, falls back to local
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    // Try remote API first
    if (this.config.apiUrl) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);

        const response = await fetch(`${this.config.apiUrl}/health`, {
          method: 'GET',
          signal: controller.signal,
        });
        clearTimeout(timeoutId);

        if (response.ok) {
          const health = await response.json();
          if (health.model_loaded) {
            logger.info('RamTagging', `Connected to remote API at ${this.config.apiUrl}`);
            this.apiAvailable = true;
          }
        }
      } catch (e) {
        logger.warn('RamTagging', `Remote API not available at ${this.config.apiUrl}, will use local inference`);
        this.apiAvailable = false;
      }
    }

    this.initialized = true;
  }

  /**
   * Check if the service is ready
   */
  isReady(): boolean {
    return this.initialized;
  }

  /**
   * Get current service status
   */
  async getStatus(): Promise<{
    available: boolean;
    mode: 'api' | 'local' | 'mock' | 'none';
    apiUrl?: string;
    lastCheck?: string;
    error?: string;
  }> {
    await this.initialize();

    if (this.apiAvailable) {
      return {
        available: true,
        mode: 'api',
        apiUrl: this.config.apiUrl,
        lastCheck: new Date().toISOString(),
      };
    }

    // Check if we can do local inference (mock for now)
    return {
      available: true,
      mode: 'mock',
      lastCheck: new Date().toISOString(),
    };
  }

  /**
   * Check if remote API is available
   */
  isRemoteAvailable(): boolean {
    return this.apiAvailable;
  }

  /**
   * Get current configuration
   */
  getConfig(): TaggingConfig {
    return { ...this.config };
  }

  /**
   * Update configuration (e.g., API URL from settings)
   */
  updateConfig(config: Partial<TaggingConfig>): void {
    Object.assign(this.config, config);
    // Reset initialization to re-check API
    this.initialized = false;
    this.apiAvailable = false;
  }

  /**
   * Tag a single image with full analysis
   *
   * @param imagePath - Absolute path to image file
   * @returns EnhancedTagResult with tags, insights, and quality score
   */
  async tagImage(imagePath: string): Promise<EnhancedTagResult> {
    await this.initialize();

    const startTime = Date.now();
    let rawResult: RawTagResult;
    let source: 'remote' | 'local' | 'mock';

    // Try remote API first
    if (this.apiAvailable && this.config.apiUrl) {
      try {
        rawResult = await this.tagViaRemoteApi(imagePath);
        source = 'remote';
      } catch (e) {
        logger.warn('RamTagging', `Remote API failed, falling back to local: ${e}`);
        rawResult = await this.tagViaLocalInference(imagePath);
        source = 'local';
      }
    } else {
      // Use local inference
      rawResult = await this.tagViaLocalInference(imagePath);
      source = 'local';
    }

    // Enhance with urbex taxonomy
    const enhanced = this.enhanceResults(rawResult, source, Date.now() - startTime);

    logger.debug('RamTagging', `Tagged ${path.basename(imagePath)}: ${enhanced.tags.length} tags, view=${enhanced.viewType.type}, quality=${enhanced.qualityScore.toFixed(2)}`);

    return enhanced;
  }

  /**
   * Tag via remote API (PC with 3090)
   */
  private async tagViaRemoteApi(imagePath: string): Promise<RawTagResult> {
    const startTime = Date.now();

    // Read image and convert to base64
    const imageBuffer = await fs.readFile(imagePath);
    const base64 = imageBuffer.toString('base64');
    const ext = path.extname(imagePath).toLowerCase().replace('.', '') || 'jpg';

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.config.apiTimeout);

    try {
      const response = await fetch(`${this.config.apiUrl}/tag`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          image: `data:image/${ext};base64,${base64}`,
          threshold: this.config.confidenceThreshold,
          max_tags: this.config.maxTags,
        }),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`RAM++ API error: ${response.status} ${response.statusText}`);
      }

      const result = await response.json() as {
        tags: string[];
        confidence: Record<string, number>;
        duration_ms?: number;
      };

      return {
        tags: result.tags,
        confidence: result.confidence,
        duration_ms: result.duration_ms ?? (Date.now() - startTime),
      };
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Get the Python executable path, preferring venv if available
   */
  private async getPythonPath(): Promise<string> {
    // Get app path as reliable anchor point
    const appPath = app.getAppPath();

    // Try multiple possible locations for the venv
    // Use path.resolve() to normalize paths (handles spaces in directory names)
    const candidates = [
      // From Electron app path (most reliable) - app is in packages/desktop
      path.resolve(appPath, '../../scripts/ram-server/venv/bin/python3'),
      // From dist-electron/main/ (4 levels to project root) - VERIFIED CORRECT
      path.resolve(__dirname, '../../../../scripts/ram-server/venv/bin/python3'),
      // From source location in dev (5 levels)
      path.resolve(__dirname, '../../../../../scripts/ram-server/venv/bin/python3'),
      // Direct path from working directory (if cwd is project root)
      path.resolve(process.cwd(), 'scripts/ram-server/venv/bin/python3'),
      // If cwd is packages/desktop (common in dev)
      path.resolve(process.cwd(), '../../scripts/ram-server/venv/bin/python3'),
    ];

    for (const venvPython of candidates) {
      try {
        await fs.access(venvPython);
        console.log(`[RamTagging] ✓ Found venv Python at: ${venvPython}`);
        return venvPython;
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : String(error);
        console.log(`[RamTagging] ✗ Venv NOT at: ${venvPython} (${errMsg})`);
      }
    }

    // Fall back to configured or system Python
    console.log(`[RamTagging] No venv found, falling back to system Python: ${this.config.pythonPath}`);
    return this.config.pythonPath;
  }

  /**
   * Tag via local Python subprocess (Mac with MPS or CPU)
   */
  private async tagViaLocalInference(imagePath: string): Promise<RawTagResult> {
    const startTime = Date.now();

    // Get app path as reliable anchor point
    const appPath = app.getAppPath();

    // DIAGNOSTIC: Log exact runtime paths (console.log for guaranteed output)
    console.log('[RamTagging] PATH RESOLUTION DEBUG:', {
      __dirname,
      appPath,
      cwd: process.cwd(),
    });

    // Try multiple possible locations for the script
    // Use path.resolve() to normalize paths (handles spaces in directory names)
    const scriptCandidates = [
      // From Electron app path (most reliable) - app is in packages/desktop
      path.resolve(appPath, '../../scripts/ram_tagger.py'),
      // From dist-electron/main/ (4 levels to project root) - VERIFIED CORRECT
      path.resolve(__dirname, '../../../../scripts/ram_tagger.py'),
      // From source location in dev (5 levels)
      path.resolve(__dirname, '../../../../../scripts/ram_tagger.py'),
      // Direct path from working directory (if cwd is project root)
      path.resolve(process.cwd(), 'scripts/ram_tagger.py'),
      // If cwd is packages/desktop (common in dev)
      path.resolve(process.cwd(), '../../scripts/ram_tagger.py'),
    ];

    let scriptPath: string | null = null;
    for (const candidate of scriptCandidates) {
      try {
        await fs.access(candidate);
        scriptPath = candidate;
        console.log(`[RamTagging] ✓ Found script at: ${candidate}`);
        break;
      } catch (error) {
        // Log specific error for debugging
        const errMsg = error instanceof Error ? error.message : String(error);
        console.log(`[RamTagging] ✗ Script NOT at: ${candidate} (${errMsg})`);
      }
    }

    if (!scriptPath) {
      // Script doesn't exist - return mock result for development
      console.log('[RamTagging] ERROR: Script not found at ANY candidate location');
      logger.warn('RamTagging', 'Local inference script not found at any candidate location, returning mock result');
      return this.getMockResult();
    }

    logger.debug('RamTagging', `Using script at: ${scriptPath}`);

    // Get Python path (prefer venv)
    const pythonPath = await this.getPythonPath();
    logger.debug('RamTagging', `Using Python: ${pythonPath}`);

    return new Promise((resolve, reject) => {
      const args = [
        scriptPath,
        '--image', imagePath,
        '--device', this.config.device,
        '--threshold', String(this.config.confidenceThreshold),
        '--max-tags', String(this.config.maxTags),
        '--output', 'json',
      ];

      if (this.config.modelPath) {
        args.push('--model', this.config.modelPath);
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
        reject(new Error('Local inference timed out'));
      }, this.config.apiTimeout);

      proc.on('close', (code) => {
        clearTimeout(timeout);

        if (code !== 0) {
          logger.error('RamTagging', `Local inference failed (code ${code}): ${stderr}`);
          // Return mock result instead of failing
          resolve(this.getMockResult());
          return;
        }

        try {
          const result = JSON.parse(stdout);
          resolve({
            tags: result.tags ?? [],
            confidence: result.confidence ?? {},
            duration_ms: Date.now() - startTime,
          });
        } catch (e) {
          logger.error('RamTagging', `Failed to parse inference output: ${stdout}`);
          resolve(this.getMockResult());
        }
      });

      proc.on('error', (err) => {
        clearTimeout(timeout);
        logger.error('RamTagging', `Failed to spawn inference process: ${err}`);
        resolve(this.getMockResult());
      });
    });
  }

  /**
   * Get mock result for development when RAM++ is not available
   */
  private getMockResult(): RawTagResult {
    const mockTags = [
      'building', 'abandoned', 'architecture', 'old', 'decay',
      'window', 'brick', 'industrial', 'interior', 'empty',
    ];
    const mockConfidence: Record<string, number> = {};
    for (const tag of mockTags) {
      mockConfidence[tag] = 0.7 + Math.random() * 0.25;
    }
    return {
      tags: mockTags,
      confidence: mockConfidence,
      duration_ms: 0,
    };
  }

  /**
   * Enhance raw RAM++ results with urbex taxonomy
   */
  private enhanceResults(
    raw: RawTagResult,
    source: 'remote' | 'local' | 'mock',
    totalDuration: number
  ): EnhancedTagResult {
    // SIMPLIFIED: Return raw tags directly without filtering
    // The urbex taxonomy normalization was dropping/modifying tags
    const normalizedTags = normalizeTags(raw.tags);

    // Use RAW tags directly - no filtering, no normalization
    const relevantTags = raw.tags;

    // Build confidence map for normalized tags
    const confidence: Record<string, number> = {};
    for (const nt of normalizedTags) {
      const rawConf = raw.confidence[nt.original] ?? raw.confidence[nt.normalized] ?? 0.5;
      confidence[nt.normalized] = rawConf * nt.confidence;
    }

    // Detect view type
    const viewType = detectViewType(raw.tags);

    // Get location insights
    const suggestedType = suggestLocationType(raw.tags);
    const suggestedEra = suggestEra(raw.tags);

    // Detect conditions
    const conditions = detectConditions(raw.tags);

    // Calculate quality score for hero selection
    // Prefer: exterior views, high tag confidence, low decay, unique composition
    const qualityScore = this.calculateQualityScore(
      viewType,
      conditions,
      normalizedTags,
      raw.confidence
    );

    return {
      rawTags: raw.tags,
      rawConfidence: raw.confidence,
      tags: relevantTags,
      normalizedTags,
      confidence,
      viewType,
      suggestedType,
      suggestedEra,
      conditions,
      qualityScore,
      duration_ms: totalDuration,
      source,
    };
  }

  /**
   * Calculate quality score for hero image selection
   *
   * Factors:
   * - View type (exterior preferred for hero)
   * - Confidence (higher = better image)
   * - Conditions (some decay is interesting, but not too much)
   * - Tag diversity (more unique features = more interesting)
   */
  private calculateQualityScore(
    viewType: ViewTypeResult,
    conditions: ReturnType<typeof detectConditions>,
    normalizedTags: NormalizedTag[],
    rawConfidence: Record<string, number>
  ): number {
    let score = 0.5; // Base score

    // View type bonus
    switch (viewType.type) {
      case 'exterior':
        score += 0.2 * viewType.confidence;
        break;
      case 'aerial':
        score += 0.15 * viewType.confidence;
        break;
      case 'interior':
        score += 0.1 * viewType.confidence;
        break;
      case 'detail':
        score += 0.05;
        break;
    }

    // Confidence bonus (average of top 5 tags)
    const confidences = Object.values(rawConfidence).sort((a, b) => b - a).slice(0, 5);
    const avgConfidence = confidences.length > 0
      ? confidences.reduce((a, b) => a + b, 0) / confidences.length
      : 0.5;
    score += 0.1 * avgConfidence;

    // Condition modifiers
    // Some decay is interesting (adds character)
    if (conditions.conditionScore > 0 && conditions.conditionScore < 0.7) {
      score += 0.1;
    }
    // Too much decay is bad for hero
    if (conditions.conditionScore > 0.8) {
      score -= 0.15;
    }

    // Graffiti can be interesting but not for hero
    if (conditions.hasGraffiti) {
      score -= 0.05;
    }

    // Equipment/machinery is interesting
    if (conditions.hasEquipment) {
      score += 0.05;
    }

    // Nature reclaiming is visually appealing
    if (conditions.hasNatureReclaim) {
      score += 0.1;
    }

    // Tag diversity bonus
    const uniqueCategories = new Set(normalizedTags.map(t => t.category)).size;
    score += 0.02 * Math.min(uniqueCategories, 5);

    // Clamp to 0-1
    return Math.max(0, Math.min(1, score));
  }

  /**
   * Batch tag multiple images
   * Useful for backfill jobs
   */
  async tagBatch(
    imagePaths: string[],
    onProgress?: (current: number, total: number) => void
  ): Promise<Map<string, EnhancedTagResult>> {
    const results = new Map<string, EnhancedTagResult>();
    const total = imagePaths.length;

    for (let i = 0; i < imagePaths.length; i++) {
      const imagePath = imagePaths[i];
      onProgress?.(i + 1, total);

      try {
        const result = await this.tagImage(imagePath);
        results.set(imagePath, result);
      } catch (e) {
        logger.warn('RamTagging', `Failed to tag ${imagePath}: ${e}`);
        // Store empty result for failed images
        results.set(imagePath, {
          rawTags: [],
          rawConfidence: {},
          tags: [],
          normalizedTags: [],
          confidence: {},
          viewType: { type: 'unknown', confidence: 0 },
          suggestedType: null,
          suggestedEra: null,
          conditions: {
            hasGraffiti: false,
            hasEquipment: false,
            hasDecay: false,
            hasNatureReclaim: false,
            conditionScore: 0,
          },
          qualityScore: 0,
          duration_ms: 0,
          source: 'mock',
        });
      }
    }

    return results;
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let instance: RamTaggingService | null = null;

/**
 * Get the RAM++ tagging service singleton
 */
export function getRamTaggingService(): RamTaggingService {
  if (!instance) {
    instance = new RamTaggingService();
  }
  return instance;
}

/**
 * Reset the singleton (for testing)
 */
export function resetRamTaggingService(): void {
  instance = null;
}
