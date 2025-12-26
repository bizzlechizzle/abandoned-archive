/**
 * Visual-Buffet Service - Python CLI Wrapper
 *
 * Spawns visual-buffet Python CLI for ML-based image tagging.
 * Uses the FULL model stack per visual-buffet best practices:
 *
 * TAGGING (always runs):
 * - RAM++: Image tagging (4585 tags, high recall)
 * - Florence-2: Detailed captions converted to tags
 * - SigLIP: Zero-shot scoring of discovered vocabulary
 *
 * OCR PIPELINE:
 * 1. PaddleOCR ALWAYS runs first to detect and extract text
 * 2. If text detected → SigLIP runs on OCR results for verification
 * 3. Verification score = 50% PaddleOCR confidence + 50% SigLIP score
 *
 * Results stored in database + XMP sidecar.
 *
 * @see https://github.com/bizzlechizzle/visual-buffet
 */

import { spawn, execSync } from 'child_process';
import path from 'path';
import os from 'os';
import fs from 'fs';
import type { Kysely } from 'kysely';
import type { Database } from '../main/database.types';
import { getLogger } from './logger-service';

const logger = getLogger();

// Tools directory where pipeline tools are installed
const TOOLS_DIR = path.join(os.homedir(), '.abandoned-archive', 'tools');
const VISUAL_BUFFET_VENV = path.join(TOOLS_DIR, 'visual-buffet', '.venv');

export interface TagResult {
  label: string;
  confidence: number;
  source: 'ram++' | 'florence-2' | 'siglip';
}

export interface OcrResult {
  text: string;
  confidence: number;
  bbox?: [number, number, number, number];
  /** SigLIP verification score (0-1) */
  siglipScore?: number;
  /** Combined verification score: 50% PaddleOCR + 50% SigLIP */
  verificationScore?: number;
  /** True if verificationScore >= 0.3 (VERIFIED tier) */
  verified?: boolean;
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
  /** Path to ML-tier image (2560px JPEG) - used for ML inference */
  imagePath: string;
  /** Path to original archive file - XMP sidecar is written here */
  archivePath?: string;
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

/**
 * Get visual-buffet CLI executable paths to check, prioritizing the tools venv.
 * Visual-buffet is installed as a CLI entry point, not a module.
 */
function getVisualBuffetCLIPaths(): string[] {
  const paths: string[] = [];

  // First, check tools venv (where pipeline-tools-updater installs visual-buffet)
  const venvCLI =
    process.platform === 'win32'
      ? path.join(VISUAL_BUFFET_VENV, 'Scripts', 'visual-buffet.exe')
      : path.join(VISUAL_BUFFET_VENV, 'bin', 'visual-buffet');

  if (fs.existsSync(venvCLI)) {
    paths.push(venvCLI);
  }

  // Check pipx installation (common alternative)
  const pipxCLI = path.join(os.homedir(), '.local', 'bin', 'visual-buffet');
  if (fs.existsSync(pipxCLI)) {
    paths.push(pipxCLI);
  }

  // Check user-local Python 3.11 bin directory
  const userLocalCLI = path.join(os.homedir(), 'Library', 'Python', '3.11', 'bin', 'visual-buffet');
  if (process.platform === 'darwin' && fs.existsSync(userLocalCLI)) {
    paths.push(userLocalCLI);
  }

  // Common system paths
  paths.push(
    '/opt/homebrew/bin/visual-buffet',
    '/usr/local/bin/visual-buffet',
    'visual-buffet' // Check PATH
  );

  return paths;
}

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
  /** Path to the visual-buffet CLI executable */
  private cliPath: string | null = null;
  private initialized = false;
  private available = false;
  private version: string | null = null;

  constructor(private readonly db: Kysely<Database>) {}

  /**
   * Initialize service - detect visual-buffet CLI availability
   *
   * Search order:
   * 1. Tools directory venv (pipeline-tools-updater installs here)
   * 2. pipx installation
   * 3. User-local Python 3.11 bin
   * 4. System paths
   */
  async initialize(): Promise<boolean> {
    if (this.initialized) {
      return this.available;
    }

    const cliPaths = getVisualBuffetCLIPaths();
    logger.info('VisualBuffet', 'Searching for visual-buffet CLI', {
      searchPaths: cliPaths.slice(0, 3), // Log first 3 for debugging
    });

    // Find a working visual-buffet CLI
    for (const cliPath of cliPaths) {
      try {
        const versionOutput = execSync(`"${cliPath}" --version`, {
          encoding: 'utf-8',
          stdio: 'pipe',
          timeout: 10000,
        });
        this.version = versionOutput.trim();
        this.cliPath = cliPath;
        this.available = true;
        logger.info('VisualBuffet', `Found visual-buffet ${this.version}`, {
          cliPath: this.cliPath,
        });
        this.initialized = true;
        return true;
      } catch {
        // CLI not found at this path, try next
      }
    }

    // No visual-buffet CLI found
    logger.warn('VisualBuffet', 'visual-buffet CLI not found - ML tagging disabled', {
      searchedPaths: cliPaths.length,
      installHint: 'Run the app once to auto-install via pipeline-tools-updater, or: pip install visual-buffet',
    });
    this.available = false;
    this.initialized = true;
    return false;
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

    if (!this.available || !this.cliPath) {
      return {
        success: false,
        error: 'visual-buffet not available',
        durationMs: Date.now() - startTime,
      };
    }

    // Run tagging first (RAM++ + Florence-2 + SigLIP at MAX)
    const tagResult = await this.runTagging(input);

    // OCR pipeline per visual-buffet best practices:
    // 1. PaddleOCR ALWAYS runs first to detect text
    // 2. If text detected, run additional SigLIP on OCR results for verification
    let ocrResult: VisualBuffetResult['ocr'] | undefined;
    if (input.enableOcr !== false) {
      // Step 1: Run PaddleOCR to detect and extract text
      ocrResult = await this.runOcr(input.imagePath);

      // Step 2: If text detected, run additional SigLIP verification on OCR results
      if (ocrResult?.hasText && ocrResult.textBlocks.length > 0) {
        logger.info('VisualBuffet', 'Text detected by PaddleOCR, running SigLIP verification', {
          hash: input.hash.slice(0, 12),
          textBlockCount: ocrResult.textBlocks.length,
        });
        const verifiedOcr = await this.verifySiglipOcrResults(input.imagePath, ocrResult);
        if (verifiedOcr) {
          ocrResult = verifiedOcr;
        }
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
      // XMP is written next to the ARCHIVE file (not the ML derivative or original source)
      const xmpTargetPath = input.archivePath || input.imagePath;
      await this.updateXmp(xmpTargetPath, finalResult);
    }

    return finalResult;
  }

  /**
   * Run the full tagging stack: RAM++ + Florence-2 + SigLIP
   */
  private async runTagging(input: VisualBuffetInput): Promise<VisualBuffetResult> {
    const startTime = Date.now();
    // Use temp file for output - visual-buffet -o - creates literal '-' file, not stdout
    const tempOutputFile = path.join(os.tmpdir(), `vb-tag-${input.hash.slice(0, 12)}-${Date.now()}.json`);

    return new Promise((resolve) => {
      // Full model stack: RAM++, Florence-2, SigLIP with discovery mode
      const args = [
        'tag',
        input.imagePath,
        '--plugin', 'ram_plus',
        '--plugin', 'florence_2',
        '--plugin', 'siglip',
        '--discover',           // Enable vocabulary discovery
        '--threshold', '0.5',   // Confidence threshold
        '--no-xmp',             // Disable CLI XMP writing (desktop handles it with correct path)
        '-o', tempOutputFile,   // Output to temp file
      ];

      const proc = spawn(this.cliPath!, args, {
        timeout: 180000,  // 3 minute timeout for full model stack
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      let stderr = '';

      proc.stderr.on('data', (data: Buffer) => {
        stderr += data.toString();
      });

      proc.on('close', async (code) => {
        const durationMs = Date.now() - startTime;

        if (code !== 0) {
          const error = `visual-buffet tagging exited with code ${code}: ${stderr.slice(0, 500)}`;
          logger.error('VisualBuffet', error);
          // Clean up temp file on error
          try { fs.unlinkSync(tempOutputFile); } catch { /* ignore */ }

          await this.updateError(input.hash, input.mediaType, error);

          resolve({
            success: false,
            error,
            durationMs,
          });
          return;
        }

        try {
          // Read JSON from temp file
          const jsonContent = fs.readFileSync(tempOutputFile, 'utf-8');
          // Clean up temp file after reading
          try { fs.unlinkSync(tempOutputFile); } catch { /* ignore */ }

          const result = this.parseTaggingOutput(jsonContent);

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
          const error = `Failed to parse visual-buffet tagging output: ${parseErr}`;
          logger.error('VisualBuffet', error);
          // Clean up temp file on parse error
          try { fs.unlinkSync(tempOutputFile); } catch { /* ignore */ }
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
        // Clean up temp file on spawn error
        try { fs.unlinkSync(tempOutputFile); } catch { /* ignore */ }
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
    // Use temp file for output - visual-buffet -o - creates literal '-' file, not stdout
    const tempOutputFile = path.join(os.tmpdir(), `vb-ocr-${Date.now()}.json`);

    return new Promise((resolve) => {
      const args = [
        'tag',
        imagePath,
        '--plugin', 'paddle_ocr',
        '--no-xmp',             // Disable CLI XMP writing (desktop handles it)
        '-o', tempOutputFile,   // Output to temp file
      ];

      const proc = spawn(this.cliPath!, args, {
        timeout: 60000,  // 1 minute for OCR
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      proc.on('close', (code) => {
        if (code !== 0) {
          logger.warn('VisualBuffet', `OCR exited with code ${code} - skipping OCR results`);
          try { fs.unlinkSync(tempOutputFile); } catch { /* ignore */ }
          resolve(undefined);
          return;
        }

        try {
          // Read JSON from temp file
          const jsonContent = fs.readFileSync(tempOutputFile, 'utf-8');
          // Clean up temp file after reading
          try { fs.unlinkSync(tempOutputFile); } catch { /* ignore */ }

          // visual-buffet outputs an array: [{file: "...", results: {...}}, ...]
          const parsed = JSON.parse(jsonContent);
          const result = Array.isArray(parsed) ? parsed[0] : parsed;
          const ocrData = result?.results?.paddle_ocr || result?.results?.easyocr;

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
          try { fs.unlinkSync(tempOutputFile); } catch { /* ignore */ }
          resolve(undefined);
        }
      });

      proc.on('error', () => {
        try { fs.unlinkSync(tempOutputFile); } catch { /* ignore */ }
        resolve(undefined);
      });
    });
  }

  /**
   * Run SigLIP verification on OCR results
   * Uses the extracted text as vocabulary for zero-shot scoring
   * This verifies that the detected text actually appears in the image
   */
  private async verifySiglipOcrResults(
    imagePath: string,
    ocrResult: NonNullable<VisualBuffetResult['ocr']>
  ): Promise<VisualBuffetResult['ocr'] | undefined> {
    if (!this.available || !this.cliPath) {
      return ocrResult;
    }

    // Use temp file for output - visual-buffet -o - creates literal '-' file, not stdout
    const tempOutputFile = path.join(os.tmpdir(), `vb-siglip-verify-${Date.now()}.json`);

    return new Promise((resolve) => {
      // Build vocabulary from OCR text blocks
      const vocab = ocrResult.textBlocks
        .map((b) => b.text.trim())
        .filter((t) => t.length > 1)
        .slice(0, 20) // Limit to avoid overly long command
        .join(',');

      if (!vocab) {
        resolve(ocrResult);
        return;
      }

      // Use SigLIP to verify detected text is actually in the image
      const args = [
        'tag',
        imagePath,
        '--plugin', 'siglip',
        '--vocab', vocab,
        '--threshold', '0.001', // Very low threshold per OCR verification spec
        '-o', tempOutputFile,   // Output to temp file
      ];

      const proc = spawn(this.cliPath!, args, {
        timeout: 30000,
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      proc.on('close', (code) => {
        if (code !== 0) {
          try { fs.unlinkSync(tempOutputFile); } catch { /* ignore */ }
          resolve(ocrResult); // Return original on failure
          return;
        }

        try {
          // Read JSON from temp file
          const jsonContent = fs.readFileSync(tempOutputFile, 'utf-8');
          // Clean up temp file after reading
          try { fs.unlinkSync(tempOutputFile); } catch { /* ignore */ }

          // visual-buffet outputs an array: [{file: "...", results: {...}}, ...]
          const parsed = JSON.parse(jsonContent);
          const result = Array.isArray(parsed) ? parsed[0] : parsed;
          const siglipTags = result?.results?.siglip?.tags || [];

          // Create a map of verified text with SigLIP scores
          const siglipScores = new Map<string, number>();
          for (const tag of siglipTags) {
            siglipScores.set(tag.label.toLowerCase(), tag.confidence);
          }

          // Update OCR blocks with verification scores
          const verifiedBlocks = ocrResult.textBlocks.map((block) => {
            const siglipScore = siglipScores.get(block.text.toLowerCase()) ?? 0;
            // Combined verification score: 50% PaddleOCR + 50% SigLIP
            const verificationScore = (block.confidence * 0.5) + (siglipScore * 0.5);

            return {
              ...block,
              siglipScore,
              verificationScore,
              verified: verificationScore >= 0.3, // Verified threshold
            };
          });

          logger.info('VisualBuffet', 'SigLIP OCR verification complete', {
            totalBlocks: verifiedBlocks.length,
            verifiedBlocks: verifiedBlocks.filter((b) => b.verified).length,
          });

          resolve({
            hasText: true,
            textBlocks: verifiedBlocks,
            fullText: ocrResult.fullText,
          });
        } catch {
          try { fs.unlinkSync(tempOutputFile); } catch { /* ignore */ }
          resolve(ocrResult);
        }
      });

      proc.on('error', () => {
        try { fs.unlinkSync(tempOutputFile); } catch { /* ignore */ }
        resolve(ocrResult);
      });
    });
  }

  /**
   * Parse the tagging output from visual-buffet
   * Handles both JSON array format (from temp file) and object format
   */
  private parseTaggingOutput(jsonContent: string): Partial<VisualBuffetResult> {
    // Parse the JSON (should be clean JSON from temp file now)
    const parsed = JSON.parse(jsonContent) as unknown;

    // visual-buffet outputs an array: [{file: "...", results: {...}}, ...]
    // We only process single images, so take the first element
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let data: any;
    if (Array.isArray(parsed)) {
      if (parsed.length === 0) {
        throw new Error('Empty results array from visual-buffet');
      }
      data = parsed[0];
    } else {
      data = parsed;
    }

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
    archivePath: string,
    result: VisualBuffetResult
  ): Promise<void> {
    if (!result.success) return;

    try {
      const { exiftool } = await import('exiftool-vendored');
      // XMP sidecar naming convention: filename.ext.xmp (not filename.xmp)
      const xmpPath = `${archivePath}.xmp`;

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
   * Utility: Quick check if an image likely has text
   * Uses SigLIP zero-shot with text-related prompts
   *
   * NOTE: This is NOT used in the main OCR pipeline.
   * Per visual-buffet best practices, PaddleOCR runs first to detect text,
   * then SigLIP verifies the results. This method is kept for utility purposes.
   */
  async detectTextPresence(imagePath: string): Promise<boolean> {
    if (!this.available || !this.cliPath) {
      return false;
    }

    return new Promise((resolve) => {
      // Use SigLIP with text-detection prompts
      const args = [
        'tag',
        imagePath,
        '--plugin', 'siglip',
        '--vocab', 'text,sign,writing,graffiti,letters,numbers,words',
        '--threshold', '0.3',
        '-o', '-',
      ];

      const proc = spawn(this.cliPath!, args, {
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
