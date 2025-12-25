/**
 * Visual-Buffet Service - Python CLI Wrapper
 *
 * Spawns visual-buffet Python CLI for ML-based image tagging.
 * Uses the FULL model stack:
 * - RAM++: Image tagging (4585 tags, high recall)
 * - Florence-2: Detailed captions converted to tags
 * - SigLIP: Zero-shot scoring of discovered vocabulary
 * - PaddleOCR: Text extraction when text is detected
 *
 * Results stored in database + XMP sidecar.
 *
 * @see https://github.com/bizzlechizzle/visual-buffet
 */

import { spawn, execSync } from 'child_process';
import type { Kysely } from 'kysely';
import type { Database } from '../main/database.types';
import { getLogger } from './logger-service';

const logger = getLogger();

export interface TagResult {
  label: string;
  confidence: number;
  source: 'ram++' | 'florence-2' | 'siglip';
}

export interface OcrResult {
  text: string;
  confidence: number;
  bbox?: [number, number, number, number];
}

export interface VisualBuffetResult {
  success: boolean;
  /** All tags from all models combined */
  tags?: string[];
  /** Per-tag confidence scores */
  confidence?: Record<string, number>;
  /** Detailed tag results by source model */
  tagsBySource?: {
    rampp?: TagResult[];
    florence2?: TagResult[];
    siglip?: TagResult[];
  };
  /** Florence-2 caption */
  caption?: string;
  /** View type classification */
  viewType?: 'interior' | 'exterior' | 'aerial' | 'detail';
  /** Quality score */
  qualityScore?: number;
  /** OCR results */
  ocr?: {
    hasText: boolean;
    textBlocks: OcrResult[];
    fullText: string;
  };
  /** Embeddings for similarity search */
  embeddings?: number[];
  error?: string;
  durationMs: number;
}

export interface VisualBuffetInput {
  /** Path to ML-tier image (2560px JPEG) */
  imagePath: string;
  /** File hash (for database lookup) */
  hash: string;
  /** Media type (image or video) */
  mediaType: 'image' | 'video';
  /** Location ID */
  locid: string;
  /** Sub-location ID (optional) */
  subid?: string | null;
  /** Run OCR if text detected */
  enableOcr?: boolean;
}

// Common Python paths to check
const PYTHON_PATHS = [
  '/opt/homebrew/bin/python3',
  '/usr/local/bin/python3',
  '/usr/bin/python3',
  'python3',
];

/**
 * Visual-Buffet Service for ML-based image tagging
 *
 * Uses the FULL model stack per README:
 * - RAM++ (157 tags/image avg, 0.50-1.00 confidence)
 * - Florence-2 (64 tags/image avg, caption-derived)
 * - SigLIP (scores all discovered vocabulary)
 * - PaddleOCR (text extraction when enabled)
 */
export class VisualBuffetService {
  private pythonPath: string | null = null;
  private initialized = false;
  private available = false;
  private version: string | null = null;

  constructor(private readonly db: Kysely<Database>) {}

  /**
   * Initialize service - detect Python and visual-buffet availability
   */
  async initialize(): Promise<boolean> {
    if (this.initialized) {
      return this.available;
    }

    // Find Python
    for (const pythonPath of PYTHON_PATHS) {
      try {
        execSync(`${pythonPath} --version`, { encoding: 'utf-8', stdio: 'pipe' });
        this.pythonPath = pythonPath;
        break;
      } catch {
        // Try next path
      }
    }

    if (!this.pythonPath) {
      logger.warn('VisualBuffet', 'Python not found - ML tagging disabled');
      this.initialized = true;
      this.available = false;
      return false;
    }

    // Check if visual-buffet is installed
    try {
      const versionOutput = execSync(`${this.pythonPath} -m visual_buffet --version`, {
        encoding: 'utf-8',
        stdio: 'pipe',
      });
      this.version = versionOutput.trim();
      this.available = true;
      logger.info('VisualBuffet', `Found visual-buffet ${this.version} with Python at: ${this.pythonPath}`);
    } catch {
      logger.warn('VisualBuffet', 'visual-buffet not installed - ML tagging disabled. Install with: pip install visual-buffet');
      this.available = false;
    }

    this.initialized = true;
    return this.available;
  }

  /**
   * Check if visual-buffet is available
   */
  isAvailable(): boolean {
    return this.available;
  }

  /**
   * Get version string
   */
  getVersion(): string | null {
    return this.version;
  }

  /**
   * Process a single image with visual-buffet CLI
   * Uses FULL model stack: RAM++ + Florence-2 + SigLIP + optional OCR
   */
  async process(input: VisualBuffetInput): Promise<VisualBuffetResult> {
    const startTime = Date.now();

    if (!this.initialized) {
      await this.initialize();
    }

    if (!this.available || !this.pythonPath) {
      return {
        success: false,
        error: 'visual-buffet not available',
        durationMs: Date.now() - startTime,
      };
    }

    // Run tagging first (RAM++ + Florence-2 + SigLIP at MAX)
    const tagResult = await this.runTagging(input);

    // OCR pipeline: First detect text presence using SigLIP zero-shot, then run full PaddleOCR if detected
    // This optimization avoids expensive PaddleOCR on images without text
    let ocrResult: VisualBuffetResult['ocr'] | undefined;
    if (input.enableOcr !== false) {
      // Step 1: Quick text detection using SigLIP zero-shot (confidence > 0.3 = text present)
      const hasText = await this.detectTextPresence(input.imagePath);

      if (hasText) {
        // Step 2: If text detected, run full PaddleOCR extraction
        logger.info('VisualBuffet', 'Text detected, running full OCR', { hash: input.hash.slice(0, 12) });
        ocrResult = await this.runOcr(input.imagePath);
      } else {
        // No text detected, skip expensive OCR
        ocrResult = { hasText: false, textBlocks: [], fullText: '' };
      }
    }

    // Merge results
    const finalResult: VisualBuffetResult = {
      ...tagResult,
      ocr: ocrResult,
      durationMs: Date.now() - startTime,
    };

    // Update database with all results
    if (finalResult.success) {
      await this.updateDatabase(input.hash, input.mediaType, finalResult);

      // Update XMP sidecar with tags, caption, and OCR
      // Get the original source path from database
      const table = input.mediaType === 'image' ? 'imgs' : 'vids';
      const hashCol = input.mediaType === 'image' ? 'imghash' : 'vidhash';
      const locCol = input.mediaType === 'image' ? 'imgloco' : 'vidloco';

      const record = await this.db
        .selectFrom(table)
        .select([locCol])
        .where(hashCol, '=', input.hash)
        .executeTakeFirst();

      if (record) {
        const sourcePath = (record as Record<string, string>)[locCol];
        if (sourcePath) {
          await this.updateXmp(sourcePath, finalResult);
        }
      }
    }

    return finalResult;
  }

  /**
   * Run the full tagging stack: RAM++ + Florence-2 + SigLIP
   */
  private async runTagging(input: VisualBuffetInput): Promise<VisualBuffetResult> {
    const startTime = Date.now();

    return new Promise((resolve) => {
      // Full model stack: RAM++, Florence-2, SigLIP with discovery mode
      const args = [
        '-m', 'visual_buffet',
        'tag',
        input.imagePath,
        '--plugin', 'ram_plus',
        '--plugin', 'florence_2',
        '--plugin', 'siglip',
        '--discover',           // Enable vocabulary discovery
        '--threshold', '0.5',   // Confidence threshold
        '-o', '-',              // Output to stdout as JSON
      ];

      const proc = spawn(this.pythonPath!, args, {
        timeout: 180000,  // 3 minute timeout for full model stack
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      let stdout = '';
      let stderr = '';

      proc.stdout.on('data', (data: Buffer) => {
        stdout += data.toString();
      });

      proc.stderr.on('data', (data: Buffer) => {
        stderr += data.toString();
      });

      proc.on('close', async (code) => {
        const durationMs = Date.now() - startTime;

        if (code !== 0) {
          const error = `visual-buffet tagging exited with code ${code}: ${stderr.slice(0, 500)}`;
          logger.error('VisualBuffet', error);

          await this.updateError(input.hash, input.mediaType, error);

          resolve({
            success: false,
            error,
            durationMs,
          });
          return;
        }

        try {
          const result = this.parseTaggingOutput(stdout);

          logger.info('VisualBuffet', 'Tagging complete', {
            hash: input.hash.slice(0, 12),
            tagCount: result.tags?.length ?? 0,
            hasCaption: !!result.caption,
            durationMs,
          });

          resolve({
            success: true,
            ...result,
            durationMs,
          });
        } catch (parseErr) {
          const error = `Failed to parse visual-buffet tagging output: ${parseErr}. Raw: ${stdout.slice(0, 200)}`;
          logger.error('VisualBuffet', error);
          await this.updateError(input.hash, input.mediaType, error);

          resolve({
            success: false,
            error,
            durationMs,
          });
        }
      });

      proc.on('error', async (err) => {
        const error = `Failed to spawn visual-buffet: ${err.message}`;
        logger.error('VisualBuffet', error);
        await this.updateError(input.hash, input.mediaType, error);

        resolve({
          success: false,
          error,
          durationMs: Date.now() - startTime,
        });
      });
    });
  }

  /**
   * Run OCR (PaddleOCR) on the image
   */
  private async runOcr(imagePath: string): Promise<VisualBuffetResult['ocr'] | undefined> {
    return new Promise((resolve) => {
      const args = [
        '-m', 'visual_buffet',
        'tag',
        imagePath,
        '--plugin', 'paddle_ocr',
        '-o', '-',
      ];

      const proc = spawn(this.pythonPath!, args, {
        timeout: 60000,  // 1 minute for OCR
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      let stdout = '';

      proc.stdout.on('data', (data: Buffer) => {
        stdout += data.toString();
      });

      proc.on('close', (code) => {
        if (code !== 0) {
          logger.warn('VisualBuffet', `OCR exited with code ${code} - skipping OCR results`);
          resolve(undefined);
          return;
        }

        try {
          const result = JSON.parse(stdout);
          const ocrData = result.results?.paddle_ocr || result.results?.easyocr;

          if (!ocrData?.texts?.length) {
            resolve({ hasText: false, textBlocks: [], fullText: '' });
            return;
          }

          const textBlocks: OcrResult[] = ocrData.texts.map((t: { text: string; confidence: number; bbox?: number[] }) => ({
            text: t.text,
            confidence: t.confidence,
            bbox: t.bbox,
          }));

          const fullText = textBlocks.map((b) => b.text).join(' ');

          logger.info('VisualBuffet', `OCR found ${textBlocks.length} text blocks`);

          resolve({
            hasText: true,
            textBlocks,
            fullText,
          });
        } catch (err) {
          logger.warn('VisualBuffet', `Failed to parse OCR output: ${err}`);
          resolve(undefined);
        }
      });

      proc.on('error', () => {
        resolve(undefined);
      });
    });
  }

  /**
   * Parse the tagging output from visual-buffet
   */
  private parseTaggingOutput(stdout: string): Partial<VisualBuffetResult> {
    const data = JSON.parse(stdout);
    const results = data.results || data;

    // Collect tags from all sources
    const allTags: TagResult[] = [];
    const confidence: Record<string, number> = {};
    let caption: string | undefined;
    const tagsBySource: VisualBuffetResult['tagsBySource'] = {};

    // RAM++ tags
    if (results.ram_plus?.tags) {
      const ramppTags = results.ram_plus.tags.map((t: { label: string; confidence: number }) => ({
        label: t.label,
        confidence: t.confidence,
        source: 'ram++' as const,
      }));
      tagsBySource.rampp = ramppTags;
      allTags.push(...ramppTags);
    }

    // Florence-2 tags/caption
    if (results.florence_2) {
      caption = results.florence_2.caption;
      if (results.florence_2.tags) {
        const florence2Tags = results.florence_2.tags.map((t: { label: string; confidence: number }) => ({
          label: t.label,
          confidence: t.confidence,
          source: 'florence-2' as const,
        }));
        tagsBySource.florence2 = florence2Tags;
        allTags.push(...florence2Tags);
      }
    }

    // SigLIP scores
    if (results.siglip?.tags) {
      const siglipTags = results.siglip.tags.map((t: { label: string; confidence: number }) => ({
        label: t.label,
        confidence: t.confidence,
        source: 'siglip' as const,
      }));
      tagsBySource.siglip = siglipTags;
      allTags.push(...siglipTags);
    }

    // Deduplicate tags, keeping highest confidence
    const tagMap = new Map<string, number>();
    for (const t of allTags) {
      const existing = tagMap.get(t.label) ?? 0;
      if (t.confidence > existing) {
        tagMap.set(t.label, t.confidence);
      }
    }

    // Build final tag list and confidence map
    const tags = Array.from(tagMap.keys()).sort((a, b) => (tagMap.get(b) ?? 0) - (tagMap.get(a) ?? 0));
    for (const [label, conf] of tagMap) {
      confidence[label] = conf;
    }

    // Detect view type from tags
    let viewType: VisualBuffetResult['viewType'];
    const tagSet = new Set(tags.map((t) => t.toLowerCase()));
    if (tagSet.has('aerial') || tagSet.has('drone') || tagSet.has('birds eye')) {
      viewType = 'aerial';
    } else if (tagSet.has('interior') || tagSet.has('indoor') || tagSet.has('inside')) {
      viewType = 'interior';
    } else if (tagSet.has('exterior') || tagSet.has('outdoor') || tagSet.has('outside')) {
      viewType = 'exterior';
    } else if (tagSet.has('detail') || tagSet.has('close-up') || tagSet.has('macro')) {
      viewType = 'detail';
    }

    return {
      tags,
      confidence,
      tagsBySource,
      caption,
      viewType,
    };
  }

  /**
   * Update database with visual-buffet results
   */
  private async updateDatabase(
    hash: string,
    mediaType: 'image' | 'video',
    result: VisualBuffetResult
  ): Promise<void> {
    try {
      const updateData = {
        auto_tags: result.tags ? JSON.stringify(result.tags) : null,
        auto_tags_source: 'visual-buffet-full' as const,
        auto_tags_confidence: result.confidence ? JSON.stringify(result.confidence) : null,
        auto_tags_by_source: result.tagsBySource ? JSON.stringify(result.tagsBySource) : null,
        auto_tags_at: new Date().toISOString(),
        auto_caption: result.caption ?? null,
        quality_score: result.qualityScore ?? null,
        view_type: result.viewType ?? null,
        ocr_text: result.ocr?.fullText ?? null,
        ocr_has_text: result.ocr?.hasText ? 1 : 0,
        vb_processed_at: new Date().toISOString(),
        vb_error: null,
      };

      if (mediaType === 'image') {
        await this.db
          .updateTable('imgs')
          .set(updateData)
          .where('imghash', '=', hash)
          .execute();
      } else {
        await this.db
          .updateTable('vids')
          .set(updateData)
          .where('vidhash', '=', hash)
          .execute();
      }

      logger.info('VisualBuffet', 'Database updated', {
        hash: hash.slice(0, 12),
        tagCount: result.tags?.length ?? 0,
        hasOcr: result.ocr?.hasText ?? false,
      });
    } catch (err) {
      logger.error('VisualBuffet', 'Failed to update database', err as Error);
    }
  }

  /**
   * Update database with error message
   */
  private async updateError(
    hash: string,
    mediaType: 'image' | 'video',
    error: string
  ): Promise<void> {
    try {
      const errorData = {
        vb_error: error.slice(0, 1000),
      };

      if (mediaType === 'image') {
        await this.db
          .updateTable('imgs')
          .set(errorData)
          .where('imghash', '=', hash)
          .execute();
      } else {
        await this.db
          .updateTable('vids')
          .set(errorData)
          .where('vidhash', '=', hash)
          .execute();
      }
    } catch (err) {
      logger.error('VisualBuffet', 'Failed to update error in database', err as Error);
    }
  }

  /**
   * Update XMP sidecar with visual-buffet results
   * Uses exiftool to write standard XMP tags:
   * - dc:subject for tags
   * - dc:description for caption
   * - Custom vb: namespace for OCR text
   */
  async updateXmp(
    sourcePath: string,
    result: VisualBuffetResult
  ): Promise<void> {
    if (!result.success) return;

    try {
      const { exiftool } = await import('exiftool-vendored');
      const xmpPath = sourcePath.replace(/\.[^.]+$/, '.xmp');

      const xmpData: Record<string, unknown> = {};

      // Tags go to dc:subject (standard Dublin Core)
      if (result.tags && result.tags.length > 0) {
        xmpData['Subject'] = result.tags;
        xmpData['Keywords'] = result.tags.join(', ');
      }

      // Caption goes to dc:description
      if (result.caption) {
        xmpData['Description'] = result.caption;
        xmpData['Caption-Abstract'] = result.caption;
      }

      // OCR text - store in ImageDescription or UserComment
      if (result.ocr?.fullText) {
        xmpData['UserComment'] = `OCR: ${result.ocr.fullText}`;
      }

      // View type as hierarchical subject
      if (result.viewType) {
        const subjects = xmpData['Subject'] as string[] || [];
        subjects.push(`ViewType|${result.viewType}`);
        xmpData['Subject'] = subjects;
      }

      // Add processing info
      xmpData['Software'] = 'visual-buffet/Abandoned Archive';
      xmpData['ProcessingTimestamp'] = new Date().toISOString();

      await exiftool.write(xmpPath, xmpData, {
        writeArgs: ['-overwrite_original', '-ignoreMinorErrors'],
      });

      logger.info('VisualBuffet', 'XMP updated', {
        path: xmpPath,
        tagCount: result.tags?.length ?? 0,
        hasCaption: !!result.caption,
        hasOcr: result.ocr?.hasText ?? false,
      });
    } catch (err) {
      logger.warn('VisualBuffet', `Failed to update XMP: ${err}`);
      // Non-fatal - don't fail the processing
    }
  }

  /**
   * Quick check if an image has text (fast pre-scan before full OCR)
   * Uses SigLIP zero-shot with text-related prompts
   */
  async detectTextPresence(imagePath: string): Promise<boolean> {
    if (!this.available || !this.pythonPath) {
      return false;
    }

    return new Promise((resolve) => {
      // Use SigLIP with text-detection prompts
      const args = [
        '-m', 'visual_buffet',
        'tag',
        imagePath,
        '--plugin', 'siglip',
        '--vocab', 'text,sign,writing,graffiti,letters,numbers,words',
        '--threshold', '0.3',
        '-o', '-',
      ];

      const proc = spawn(this.pythonPath!, args, {
        timeout: 30000,
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      let stdout = '';

      proc.stdout.on('data', (data: Buffer) => {
        stdout += data.toString();
      });

      proc.on('close', (code) => {
        if (code !== 0) {
          resolve(false);
          return;
        }

        try {
          const result = JSON.parse(stdout);
          const tags = result.results?.siglip?.tags || [];
          const hasText = tags.some((t: { confidence: number }) => t.confidence > 0.3);
          resolve(hasText);
        } catch {
          resolve(false);
        }
      });

      proc.on('error', () => {
        resolve(false);
      });
    });
  }
}

// Singleton instance
let instance: VisualBuffetService | null = null;

/**
 * Get or create the VisualBuffetService singleton
 */
export function getVisualBuffetService(db: Kysely<Database>): VisualBuffetService {
  if (!instance) {
    instance = new VisualBuffetService(db);
  }
  return instance;
}

/**
 * Reset the singleton (for testing)
 */
export function resetVisualBuffetService(): void {
  instance = null;
}
