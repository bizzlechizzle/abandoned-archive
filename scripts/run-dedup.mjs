#!/usr/bin/env node
/**
 * Migration 39: Run GPS-based deduplication on ref_map_points
 *
 * This script:
 * 1. Creates a backup before running
 * 2. Runs the aka_names migration if needed
 * 3. Finds duplicate pins by GPS proximity (~10m)
 * 4. Merges duplicates, keeping best name, storing alternates in aka_names
 *
 * Usage: node scripts/run-dedup.mjs
 */

import Database from 'better-sqlite3';
import { randomUUID } from 'crypto';
import { existsSync, copyFileSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_PATH = join(__dirname, '../packages/desktop/data/au-archive.db');
const BACKUP_DIR = join(__dirname, '../packages/desktop/data/backups');

// Name scoring function - higher is better
function scoreName(name) {
  if (!name) return 0;

  let score = name.length;

  // Penalize coordinate-style names
  if (/^-?\d+\.\d+,-?\d+\.\d+$/.test(name)) {
    score = 1;
  }

  // Penalize very short names
  if (name.length < 5) {
    score -= 10;
  }

  // Penalize generic names
  const genericPatterns = [
    /^house$/i, /^building$/i, /^place$/i,
    /^location$/i, /^point$/i, /^site$/i,
  ];
  for (const pattern of genericPatterns) {
    if (pattern.test(name)) score -= 20;
  }

  // Bonus for proper nouns
  const properNouns = name.match(/[A-Z][a-z]+/g);
  if (properNouns) score += properNouns.length * 5;

  // Bonus for descriptive suffixes
  const descriptiveSuffixes = [
    /factory/i, /hospital/i, /school/i, /church/i,
    /theater/i, /theatre/i, /mill/i, /farm/i,
    /brewery/i, /county/i, /poorhouse/i,
  ];
  for (const suffix of descriptiveSuffixes) {
    if (suffix.test(name)) score += 10;
  }

  return score;
}

function pickBestName(names) {
  const validNames = names.filter(n => n && n.trim() !== '');
  if (validNames.length === 0) return null;

  let bestName = validNames[0];
  let bestScore = scoreName(bestName);

  for (const name of validNames.slice(1)) {
    const score = scoreName(name);
    if (score > bestScore) {
      bestName = name;
      bestScore = score;
    }
  }

  return bestName;
}

function collectAkaNames(names, primaryName) {
  const validNames = names.filter(n =>
    n && n.trim() !== '' &&
    n !== primaryName &&
    !/^-?\d+\.\d+,-?\d+\.\d+$/.test(n) // Exclude coordinate-style
  );

  // Remove duplicates (case-insensitive)
  const uniqueNames = [...new Set(validNames.map(n => n.toLowerCase()))]
    .map(lower => validNames.find(n => n.toLowerCase() === lower));

  if (uniqueNames.length === 0) return null;
  return uniqueNames.join(' | ');
}

async function main() {
  console.log('='.repeat(60));
  console.log('Migration 39: GPS-based Deduplication for ref_map_points');
  console.log('='.repeat(60));

  // Check database exists
  if (!existsSync(DB_PATH)) {
    console.error(`Database not found at: ${DB_PATH}`);
    process.exit(1);
  }

  // Create backup
  if (!existsSync(BACKUP_DIR)) {
    mkdirSync(BACKUP_DIR, { recursive: true });
  }
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = join(BACKUP_DIR, `au-archive-dedup-${timestamp}.db`);
  console.log(`\nCreating backup: ${backupPath}`);
  copyFileSync(DB_PATH, backupPath);
  console.log('Backup created successfully.');

  // Open database
  const db = new Database(DB_PATH);
  db.pragma('foreign_keys = ON');

  // Run migration 39 if needed
  const akaColumnExists = db.prepare(
    "SELECT COUNT(*) as cnt FROM pragma_table_info('ref_map_points') WHERE name='aka_names'"
  ).get();

  if (akaColumnExists.cnt === 0) {
    console.log('\nRunning Migration 39: Adding aka_names column...');
    db.exec(`
      ALTER TABLE ref_map_points ADD COLUMN aka_names TEXT;
      CREATE INDEX IF NOT EXISTS idx_ref_map_points_gps_rounded
        ON ref_map_points(ROUND(lat, 4), ROUND(lng, 4));
    `);
    console.log('Migration 39 complete.');
  } else {
    console.log('\nMigration 39 already applied (aka_names column exists).');
  }

  // Get all points
  console.log('\nAnalyzing ref_map_points...');
  const points = db.prepare(`
    SELECT point_id, name, map_id, description, lat, lng
    FROM ref_map_points
  `).all();

  console.log(`Total points: ${points.length}`);

  // Group by rounded GPS coordinates (4 decimal places ≈ 10m)
  const groups = new Map();
  for (const point of points) {
    const roundedLat = Math.round(point.lat * 10000) / 10000;
    const roundedLng = Math.round(point.lng * 10000) / 10000;
    const key = `${roundedLat},${roundedLng}`;

    if (!groups.has(key)) {
      groups.set(key, { roundedLat, roundedLng, points: [] });
    }
    groups.get(key).points.push(point);
  }

  // Filter to only groups with duplicates
  const duplicateGroups = [...groups.values()].filter(g => g.points.length > 1);
  console.log(`Duplicate groups found: ${duplicateGroups.length}`);

  if (duplicateGroups.length === 0) {
    console.log('\nNo duplicates to clean up. Database is clean!');
    db.close();
    return;
  }

  // Process each duplicate group
  let pointsRemoved = 0;
  let pointsWithAka = 0;

  const updateStmt = db.prepare(`
    UPDATE ref_map_points
    SET name = ?, aka_names = ?
    WHERE point_id = ?
  `);

  const deleteStmt = db.prepare(`
    DELETE FROM ref_map_points WHERE point_id = ?
  `);

  console.log('\nProcessing duplicate groups...\n');

  for (const group of duplicateGroups) {
    const names = group.points.map(p => p.name);
    const bestName = pickBestName(names);
    const akaNames = collectAkaNames(names, bestName);

    // Find point with best name to keep
    let keepPoint = group.points[0];
    let keepScore = scoreName(keepPoint.name);

    for (const point of group.points.slice(1)) {
      const score = scoreName(point.name);
      if (score > keepScore) {
        keepPoint = point;
        keepScore = score;
      }
    }

    // Update keeper
    updateStmt.run(bestName, akaNames, keepPoint.point_id);

    if (akaNames) {
      pointsWithAka++;
    }

    // Delete duplicates
    const deleteIds = group.points
      .filter(p => p.point_id !== keepPoint.point_id)
      .map(p => p.point_id);

    for (const id of deleteIds) {
      deleteStmt.run(id);
    }

    pointsRemoved += deleteIds.length;

    console.log(`Merged ${group.points.length} pins at (${group.roundedLat}, ${group.roundedLng})`);
    console.log(`  Kept: "${bestName}"`);
    if (akaNames) console.log(`  AKA: "${akaNames}"`);
  }

  db.close();

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('DEDUPLICATION COMPLETE');
  console.log('='.repeat(60));
  console.log(`Total points before: ${points.length}`);
  console.log(`Points removed: ${pointsRemoved}`);
  console.log(`Unique locations remaining: ${points.length - pointsRemoved}`);
  console.log(`Points with AKA names: ${pointsWithAka}`);
  console.log(`Backup saved to: ${backupPath}`);
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
