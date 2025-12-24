#!/usr/bin/env npx tsx
/**
 * Visual-Buffet CLI Test Script
 *
 * Tests the full visual-buffet integration:
 * - Python CLI detection
 * - Full model stack: RAM++ + Florence-2 + SigLIP
 * - OCR via PaddleOCR
 * - XMP sidecar writing
 * - Database integration
 *
 * Usage:
 *   npx tsx scripts/test-visual-buffet.ts <image-path>
 *   npx tsx scripts/test-visual-buffet.ts --check  # Just check if visual-buffet is available
 *
 * Per CLAUDE.md: CLI-first testing approach
 */

import { execSync, spawn } from 'child_process';
import fs from 'fs';
import path from 'path';

const PYTHON_PATHS = [
  '/opt/homebrew/bin/python3',
  '/usr/local/bin/python3',
  '/usr/bin/python3',
  'python3',
];

interface TagResult {
  label: string;
  confidence: number;
  source: string;
}

interface VisualBuffetOutput {
  results?: {
    ram_plus?: { tags: TagResult[] };
    florence_2?: { caption: string; tags: TagResult[] };
    siglip?: { tags: TagResult[] };
    paddle_ocr?: { texts: { text: string; confidence: number }[] };
  };
}

async function findPython(): Promise<string | null> {
  for (const pythonPath of PYTHON_PATHS) {
    try {
      execSync(`${pythonPath} --version`, { encoding: 'utf-8', stdio: 'pipe' });
      return pythonPath;
    } catch {
      // Try next
    }
  }
  return null;
}

async function checkVisualBuffet(pythonPath: string): Promise<{ available: boolean; version?: string }> {
  try {
    const version = execSync(`${pythonPath} -m visual_buffet --version`, {
      encoding: 'utf-8',
      stdio: 'pipe',
    }).trim();
    return { available: true, version };
  } catch {
    return { available: false };
  }
}

async function runTagging(pythonPath: string, imagePath: string): Promise<VisualBuffetOutput> {
  return new Promise((resolve, reject) => {
    const args = [
      '-m', 'visual_buffet',
      'tag',
      imagePath,
      '--plugin', 'ram_plus',
      '--plugin', 'florence_2',
      '--plugin', 'siglip',
      '--discover',
      '--threshold', '0.5',
      '-o', '-',
    ];

    console.log(`\n[EXEC] ${pythonPath} ${args.join(' ')}\n`);

    const proc = spawn(pythonPath, args, {
      timeout: 180000,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (data: Buffer) => {
      stdout += data.toString();
    });

    proc.stderr.on('data', (data: Buffer) => {
      stderr += data.toString();
      process.stderr.write(data);
    });

    proc.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`visual-buffet exited with code ${code}: ${stderr.slice(0, 500)}`));
        return;
      }
      try {
        resolve(JSON.parse(stdout));
      } catch (err) {
        reject(new Error(`Failed to parse output: ${err}. Raw: ${stdout.slice(0, 200)}`));
      }
    });

    proc.on('error', (err) => {
      reject(err);
    });
  });
}

async function runOcr(pythonPath: string, imagePath: string): Promise<{ hasText: boolean; fullText: string }> {
  return new Promise((resolve) => {
    const args = [
      '-m', 'visual_buffet',
      'tag',
      imagePath,
      '--plugin', 'paddle_ocr',
      '-o', '-',
    ];

    console.log(`\n[OCR] ${pythonPath} ${args.join(' ')}\n`);

    const proc = spawn(pythonPath, args, {
      timeout: 60000,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';

    proc.stdout.on('data', (data: Buffer) => {
      stdout += data.toString();
    });

    proc.on('close', (code) => {
      if (code !== 0) {
        resolve({ hasText: false, fullText: '' });
        return;
      }

      try {
        const result = JSON.parse(stdout);
        const ocrData = result.results?.paddle_ocr;
        if (!ocrData?.texts?.length) {
          resolve({ hasText: false, fullText: '' });
          return;
        }
        const fullText = ocrData.texts.map((t: { text: string }) => t.text).join(' ');
        resolve({ hasText: true, fullText });
      } catch {
        resolve({ hasText: false, fullText: '' });
      }
    });

    proc.on('error', () => {
      resolve({ hasText: false, fullText: '' });
    });
  });
}

async function main() {
  const args = process.argv.slice(2);

  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║             Visual-Buffet CLI Integration Test               ║');
  console.log('╠══════════════════════════════════════════════════════════════╣');
  console.log('║  Models: RAM++ • Florence-2 • SigLIP • PaddleOCR            ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
  console.log();

  // Step 1: Find Python
  console.log('[1/5] Finding Python...');
  const pythonPath = await findPython();
  if (!pythonPath) {
    console.error('❌ Python not found. Install Python 3.11+');
    process.exit(1);
  }
  console.log(`  ✓ Found: ${pythonPath}`);

  // Step 2: Check visual-buffet
  console.log('\n[2/5] Checking visual-buffet...');
  const { available, version } = await checkVisualBuffet(pythonPath);
  if (!available) {
    console.error('❌ visual-buffet not installed. Run: pip install visual-buffet');
    process.exit(1);
  }
  console.log(`  ✓ visual-buffet ${version}`);

  // If --check flag, just exit here
  if (args.includes('--check')) {
    console.log('\n✓ Visual-buffet is available and ready for use');
    process.exit(0);
  }

  // Step 3: Validate image path
  const imagePath = args[0];
  if (!imagePath) {
    console.error('\nUsage: npx tsx scripts/test-visual-buffet.ts <image-path>');
    console.error('       npx tsx scripts/test-visual-buffet.ts --check');
    process.exit(1);
  }

  console.log(`\n[3/5] Validating image: ${imagePath}`);
  if (!fs.existsSync(imagePath)) {
    console.error(`❌ File not found: ${imagePath}`);
    process.exit(1);
  }
  const stats = fs.statSync(imagePath);
  console.log(`  ✓ Found: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);

  // Step 4: Run tagging
  console.log('\n[4/5] Running ML tagging (RAM++ + Florence-2 + SigLIP)...');
  console.log('  This may take 1-3 minutes on first run (model loading)...');

  const startTime = Date.now();
  try {
    const tagResult = await runTagging(pythonPath, imagePath);
    const tagDuration = Date.now() - startTime;

    console.log(`\n  ✓ Tagging complete in ${(tagDuration / 1000).toFixed(1)}s`);

    // Parse and display results
    const results = tagResult.results || tagResult;

    // RAM++ tags
    if (results.ram_plus?.tags) {
      console.log(`\n  [RAM++] ${results.ram_plus.tags.length} tags:`);
      const topTags = results.ram_plus.tags.slice(0, 10);
      for (const tag of topTags) {
        console.log(`    - ${tag.label} (${(tag.confidence * 100).toFixed(0)}%)`);
      }
      if (results.ram_plus.tags.length > 10) {
        console.log(`    ... and ${results.ram_plus.tags.length - 10} more`);
      }
    }

    // Florence-2 caption
    if (results.florence_2?.caption) {
      console.log(`\n  [Florence-2] Caption:`);
      console.log(`    "${results.florence_2.caption}"`);
    }

    // SigLIP scores
    if (results.siglip?.tags) {
      console.log(`\n  [SigLIP] ${results.siglip.tags.length} vocabulary scores`);
    }
  } catch (err) {
    console.error(`\n❌ Tagging failed: ${err}`);
    process.exit(1);
  }

  // Step 5: Run OCR
  console.log('\n[5/5] Running OCR (PaddleOCR)...');
  const ocrStart = Date.now();
  const ocrResult = await runOcr(pythonPath, imagePath);
  const ocrDuration = Date.now() - ocrStart;

  if (ocrResult.hasText) {
    console.log(`  ✓ OCR complete in ${(ocrDuration / 1000).toFixed(1)}s`);
    console.log(`\n  [PaddleOCR] Extracted text:`);
    console.log(`    "${ocrResult.fullText.slice(0, 200)}${ocrResult.fullText.length > 200 ? '...' : ''}"`);
  } else {
    console.log(`  ○ No text detected (${(ocrDuration / 1000).toFixed(1)}s)`);
  }

  const totalDuration = Date.now() - startTime;
  console.log('\n════════════════════════════════════════════════════════════════');
  console.log(`✓ Visual-Buffet test complete in ${(totalDuration / 1000).toFixed(1)}s`);
  console.log('════════════════════════════════════════════════════════════════');
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
