#!/bin/bash
#
# CLI Test: Full Import Pipeline Test
# Imports a test image and verifies ML/VB jobs are queued
#

set -e

DB_PATH="$HOME/Library/Application Support/@abandoned-archive/desktop/au-archive.db"
TEST_IMAGE="/Volumes/projects/abandoned-archive/test images/Mary McClellan Hospital/IMG_5961.JPG"
ARCHIVE_PATH=$(sqlite3 "$DB_PATH" "SELECT value FROM settings WHERE key = 'archive_folder';" 2>/dev/null || echo "")

echo "=== Full Import Pipeline Test ==="
echo ""

# Check prerequisites
if [ -z "$ARCHIVE_PATH" ]; then
  echo "❌ No archive folder configured in database"
  echo "   Run Electron app and configure archive path first"
  exit 1
fi
echo "Archive path: $ARCHIVE_PATH"

# Check if Electron app is running (needed for job processing)
if ! pgrep -f "Electron" > /dev/null; then
  echo "⚠️  Electron app not running - jobs will queue but not process"
fi

# Get a test location
TEST_LOCID=$(sqlite3 "$DB_PATH" "SELECT locid FROM locs LIMIT 1;" 2>/dev/null || echo "")
if [ -z "$TEST_LOCID" ]; then
  echo "❌ No locations in database. Create a location first."
  exit 1
fi
TEST_LOCNAME=$(sqlite3 "$DB_PATH" "SELECT locnam FROM locs WHERE locid = '$TEST_LOCID';" 2>/dev/null)
echo "Test location: $TEST_LOCNAME ($TEST_LOCID)"
echo ""

# Count jobs before import
JOBS_BEFORE=$(sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM jobs;")
ML_JOBS_BEFORE=$(sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM jobs WHERE queue = 'ml-thumbnail';")
echo "Jobs before import: $JOBS_BEFORE (ML: $ML_JOBS_BEFORE)"

# Use wake-n-blake to hash and create the import
echo ""
echo "Running wake-n-blake import..."
cd /Volumes/projects/abandoned-archive/packages/wake-n-blake

# Create a temp source directory with our test image
TEMP_SRC=$(mktemp -d)
cp "$TEST_IMAGE" "$TEMP_SRC/"
echo "   Source: $TEMP_SRC"
echo "   Destination: $ARCHIVE_PATH/locations"

# Run wake-n-blake import (using Node directly since it's ESM)
node --experimental-specifier-resolution=node -e "
import { runImport } from './dist/index.js';
import * as path from 'path';
import * as fs from 'fs';

const source = '$TEMP_SRC';
const destination = '$ARCHIVE_PATH/locations/$TEST_LOCID/data';

// Ensure destination exists
fs.mkdirSync(destination, { recursive: true });

console.log('Importing from:', source);
console.log('To:', destination);

const result = await runImport(source, destination, {
  sidecar: true,
  verify: true,
  onProgress: (session) => {
    if (session.status !== 'idle') {
      console.log('  Status:', session.status, 'Files:', session.processedFiles + '/' + session.totalFiles);
    }
  },
  onFile: (file, action) => {
    console.log('  File:', action, path.basename(file.path), file.hash?.slice(0,12) || '');
  }
});

console.log('');
console.log('Import complete:');
console.log('  Total:', result.totalFiles);
console.log('  Processed:', result.processedFiles);
console.log('  Duplicates:', result.duplicateFiles);
console.log('  Errors:', result.errorFiles);

// Output file info for database insertion
if (result.files.length > 0) {
  const f = result.files[0];
  if (f.hash && f.destPath) {
    console.log('');
    console.log('FILE_HASH=' + f.hash);
    console.log('FILE_DEST=' + f.destPath);
  }
}
" 2>&1 | tee /tmp/import-result.txt

# Extract hash from output
FILE_HASH=$(grep "FILE_HASH=" /tmp/import-result.txt | cut -d= -f2)
FILE_DEST=$(grep "FILE_DEST=" /tmp/import-result.txt | cut -d= -f2)

if [ -z "$FILE_HASH" ]; then
  echo ""
  echo "⚠️  Could not extract file hash from import"
  rm -rf "$TEMP_SRC"
  exit 1
fi

echo ""
echo "Imported file hash: ${FILE_HASH:0:16}..."
echo "Destination: $FILE_DEST"

# Now we need to insert into database and queue jobs
# This simulates what import-service.ts does
echo ""
echo "Inserting into database and queuing jobs..."

# Insert image record
TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
FILENAME=$(basename "$FILE_DEST")
sqlite3 "$DB_PATH" "
INSERT OR IGNORE INTO imgs (
  imghash, imgnam, imgnamo, imgloc, imgloco, locid, subid, imgadd
) VALUES (
  '$FILE_HASH',
  '$FILENAME',
  '$FILENAME',
  '$FILE_DEST',
  '$FILE_DEST',
  '$TEST_LOCID',
  NULL,
  '$TIMESTAMP'
);
"

# Queue jobs with proper dependency chain
EXIF_JOB_ID=$(uuidgen | tr '[:upper:]' '[:lower:]')
THUMB_JOB_ID=$(uuidgen | tr '[:upper:]' '[:lower:]')
ML_JOB_ID=$(uuidgen | tr '[:upper:]' '[:lower:]')
VB_JOB_ID=$(uuidgen | tr '[:upper:]' '[:lower:]')

# Insert jobs with dependencies
sqlite3 "$DB_PATH" "
-- ExifTool job (no dependency)
INSERT INTO jobs (job_id, queue, priority, status, payload, created_at)
VALUES ('$EXIF_JOB_ID', 'exiftool', 100, 'pending',
  '{\"hash\":\"$FILE_HASH\",\"mediaType\":\"image\",\"archivePath\":\"$FILE_DEST\",\"locid\":\"$TEST_LOCID\"}',
  '$TIMESTAMP');

-- Thumbnail job (depends on exiftool)
INSERT INTO jobs (job_id, queue, priority, status, payload, created_at, depends_on)
VALUES ('$THUMB_JOB_ID', 'thumbnail', 100, 'pending',
  '{\"hash\":\"$FILE_HASH\",\"mediaType\":\"image\",\"archivePath\":\"$FILE_DEST\",\"locid\":\"$TEST_LOCID\"}',
  '$TIMESTAMP', '$EXIF_JOB_ID');

-- ML Thumbnail job (depends on thumbnail, BACKGROUND priority)
INSERT INTO jobs (job_id, queue, priority, status, payload, created_at, depends_on)
VALUES ('$ML_JOB_ID', 'ml-thumbnail', 0, 'pending',
  '{\"hash\":\"$FILE_HASH\",\"mediaType\":\"image\",\"archivePath\":\"$FILE_DEST\",\"locid\":\"$TEST_LOCID\"}',
  '$TIMESTAMP', '$THUMB_JOB_ID');

-- Visual-Buffet job (depends on ML thumbnail, BACKGROUND priority)
INSERT INTO jobs (job_id, queue, priority, status, payload, created_at, depends_on)
VALUES ('$VB_JOB_ID', 'visual-buffet', 0, 'pending',
  '{\"hash\":\"$FILE_HASH\",\"mediaType\":\"image\",\"archivePath\":\"$FILE_DEST\",\"locid\":\"$TEST_LOCID\"}',
  '$TIMESTAMP', '$ML_JOB_ID');
"

echo "   ✅ Inserted image record"
echo "   ✅ Queued 4 jobs: exiftool → thumbnail → ml-thumbnail → visual-buffet"

# Cleanup
rm -rf "$TEMP_SRC"

# Count jobs after
echo ""
echo "Verifying job queue..."
JOBS_AFTER=$(sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM jobs;")
ML_JOBS_AFTER=$(sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM jobs WHERE queue = 'ml-thumbnail';")
VB_JOBS_AFTER=$(sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM jobs WHERE queue = 'visual-buffet';")

echo "   Jobs after import: $JOBS_AFTER (+$((JOBS_AFTER - JOBS_BEFORE)))"
echo "   ML thumbnail jobs: $ML_JOBS_AFTER"
echo "   Visual-buffet jobs: $VB_JOBS_AFTER"

# Show the job chain
echo ""
echo "Job chain created:"
sqlite3 "$DB_PATH" "
SELECT '   ' || queue || ' [' || status || '] → depends on: ' || COALESCE(depends_on, '(none)')
FROM jobs
WHERE job_id IN ('$EXIF_JOB_ID', '$THUMB_JOB_ID', '$ML_JOB_ID', '$VB_JOB_ID')
ORDER BY priority DESC, created_at;
"

echo ""
echo "=== Test Complete ==="
echo ""
echo "📌 If Electron app is running, watch for:"
echo "   - [JobWorker] Processing exiftool job"
echo "   - [JobWorker] Thumbnails generated via shoemaker"
echo "   - [JobWorker] ML thumbnail generated"
echo "   - [VisualBuffet] visual-buffet not installed (expected)"
echo ""
echo "📌 Re-run ./scripts/test-ml-pipeline.sh to verify status"
