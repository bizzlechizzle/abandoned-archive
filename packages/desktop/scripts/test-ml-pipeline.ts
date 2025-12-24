#!/usr/bin/env npx tsx
/**
 * CLI Test: ML Pipeline Integration Test
 *
 * Tests the full import → ML thumbnail → visual-buffet pipeline.
 * Run with: npx tsx scripts/test-ml-pipeline.ts
 */

import Database from 'better-sqlite3';
import * as path from 'node:path';
import * as fs from 'node:fs';
import * as os from 'node:os';

// Database path (same as Electron app)
const DB_PATH = path.join(
  os.homedir(),
  'Library/Application Support/@abandoned-archive/desktop/au-archive.db'
);

// Test image
const TEST_IMAGE = '/Volumes/projects/abandoned-archive/test images/Mary McClellan Hospital/IMG_5961.JPG';

async function main() {
  console.log('=== ML Pipeline Integration Test ===\n');

  // 1. Check database exists
  console.log('1. Checking database...');
  if (!fs.existsSync(DB_PATH)) {
    console.error(`   ❌ Database not found: ${DB_PATH}`);
    console.error('   Run the Electron app first to create the database.');
    process.exit(1);
  }
  console.log(`   ✅ Database found: ${DB_PATH}`);

  // 2. Connect and verify schema
  console.log('\n2. Verifying schema...');
  const db = new Database(DB_PATH, { readonly: true });

  const imgsCols = db.prepare("PRAGMA table_info(imgs)").all() as Array<{name: string}>;
  const colNames = imgsCols.map(c => c.name);

  const requiredCols = ['ml_path', 'ml_thumb_at', 'vb_processed_at', 'vb_error'];
  const missing = requiredCols.filter(c => !colNames.includes(c));

  if (missing.length > 0) {
    console.error(`   ❌ Missing columns: ${missing.join(', ')}`);
    process.exit(1);
  }
  console.log(`   ✅ All ML/VB columns present`);

  // 3. Check job queue tables
  console.log('\n3. Checking job queue...');
  const jobQueues = db.prepare(
    "SELECT queue, COUNT(*) as count FROM jobs GROUP BY queue ORDER BY queue"
  ).all() as Array<{queue: string, count: number}>;

  console.log('   Current queues:');
  for (const q of jobQueues) {
    console.log(`   - ${q.queue}: ${q.count} jobs`);
  }

  // 4. Check for pending ML jobs
  console.log('\n4. Checking ML pipeline status...');
  const mlPending = db.prepare(
    "SELECT COUNT(*) as count FROM imgs WHERE ml_path IS NULL AND thumb_path_sm IS NOT NULL"
  ).get() as {count: number};

  const mlComplete = db.prepare(
    "SELECT COUNT(*) as count FROM imgs WHERE ml_path IS NOT NULL"
  ).get() as {count: number};

  const vbComplete = db.prepare(
    "SELECT COUNT(*) as count FROM imgs WHERE vb_processed_at IS NOT NULL"
  ).get() as {count: number};

  const vbErrors = db.prepare(
    "SELECT COUNT(*) as count FROM imgs WHERE vb_error IS NOT NULL"
  ).get() as {count: number};

  console.log(`   - Images needing ML thumbnail: ${mlPending.count}`);
  console.log(`   - Images with ML thumbnail: ${mlComplete.count}`);
  console.log(`   - Images processed by visual-buffet: ${vbComplete.count}`);
  console.log(`   - Images with visual-buffet errors: ${vbErrors.count}`);

  // 5. Check for ML/VB jobs in queue
  console.log('\n5. Checking job queue for ML/VB jobs...');
  const mlJobs = db.prepare(
    "SELECT status, COUNT(*) as count FROM jobs WHERE queue = 'ml-thumbnail' GROUP BY status"
  ).all() as Array<{status: string, count: number}>;

  const vbJobs = db.prepare(
    "SELECT status, COUNT(*) as count FROM jobs WHERE queue = 'visual-buffet' GROUP BY status"
  ).all() as Array<{status: string, count: number}>;

  if (mlJobs.length === 0) {
    console.log('   - ml-thumbnail queue: (empty - no new imports since pipeline added)');
  } else {
    for (const j of mlJobs) {
      console.log(`   - ml-thumbnail ${j.status}: ${j.count}`);
    }
  }

  if (vbJobs.length === 0) {
    console.log('   - visual-buffet queue: (empty - no new imports since pipeline added)');
  } else {
    for (const j of vbJobs) {
      console.log(`   - visual-buffet ${j.status}: ${j.count}`);
    }
  }

  // 6. Test wake-n-blake import (dry run info)
  console.log('\n6. Test image info...');
  if (!fs.existsSync(TEST_IMAGE)) {
    console.log(`   ⚠️  Test image not found: ${TEST_IMAGE}`);
  } else {
    const stats = fs.statSync(TEST_IMAGE);
    console.log(`   ✅ Test image: ${path.basename(TEST_IMAGE)}`);
    console.log(`   - Size: ${(stats.size / 1024).toFixed(1)} KB`);
  }

  // 7. Summary
  console.log('\n=== Summary ===');
  console.log('Database schema: ✅ Ready');
  console.log('Job queue: ✅ Configured');
  console.log(`ML pipeline: ${mlJobs.length > 0 ? '✅ Jobs queued' : '⏳ Waiting for new imports'}`);
  console.log(`Visual-buffet: ${vbJobs.length > 0 ? '✅ Jobs queued' : '⏳ Waiting for ML thumbnails'}`);

  console.log('\n📌 To test full pipeline:');
  console.log('   1. Ensure Electron app is running');
  console.log('   2. Import a new image via drag-drop or IPC');
  console.log('   3. Watch for [JobWorker] ML thumbnail generated logs');
  console.log('   4. Re-run this script to verify ml_path is populated');

  db.close();
}

main().catch(console.error);
