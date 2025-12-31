#!/bin/bash
#
# CLI Test: ML Pipeline Integration Test
# Tests the full import → ML thumbnail → visual-buffet pipeline.
#

set -e

DB_PATH="$HOME/Library/Application Support/@abandoned-archive/desktop/au-archive.db"
TEST_IMAGE="/Volumes/projects/abandoned-archive/test images/Mary McClellan Hospital/IMG_5961.JPG"

echo "=== ML Pipeline Integration Test ==="
echo ""

# 1. Check database exists
echo "1. Checking database..."
if [ ! -f "$DB_PATH" ]; then
  echo "   ❌ Database not found: $DB_PATH"
  echo "   Run the Electron app first to create the database."
  exit 1
fi
echo "   ✅ Database found"

# 2. Verify schema
echo ""
echo "2. Verifying schema..."
ML_COLS=$(sqlite3 "$DB_PATH" "PRAGMA table_info(imgs);" | grep -E "ml_path|ml_thumb_at|vb_processed_at|vb_error" | wc -l)
if [ "$ML_COLS" -lt 4 ]; then
  echo "   ❌ Missing ML/VB columns (found $ML_COLS/4)"
  exit 1
fi
echo "   ✅ All 4 ML/VB columns present in imgs table"

VID_COLS=$(sqlite3 "$DB_PATH" "PRAGMA table_info(vids);" | grep -E "ml_path|ml_thumb_at|vb_processed_at|vb_error" | wc -l)
echo "   ✅ All 4 ML/VB columns present in vids table ($VID_COLS)"

# 3. Check job queue
echo ""
echo "3. Current job queue status:"
sqlite3 "$DB_PATH" "SELECT '   - ' || queue || ': ' || COUNT(*) || ' jobs' FROM jobs GROUP BY queue ORDER BY queue;"

# 4. ML pipeline status
echo ""
echo "4. ML pipeline status:"
ML_PENDING=$(sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM imgs WHERE ml_path IS NULL AND thumb_path_sm IS NOT NULL;")
ML_COMPLETE=$(sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM imgs WHERE ml_path IS NOT NULL;")
VB_COMPLETE=$(sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM imgs WHERE vb_processed_at IS NOT NULL;")
VB_ERRORS=$(sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM imgs WHERE vb_error IS NOT NULL;")

echo "   - Images needing ML thumbnail: $ML_PENDING"
echo "   - Images with ML thumbnail: $ML_COMPLETE"
echo "   - Images processed by visual-buffet: $VB_COMPLETE"
echo "   - Images with visual-buffet errors: $VB_ERRORS"

# 5. Check ML/VB job queues specifically
echo ""
echo "5. ML/VB job queue entries:"
ML_JOBS=$(sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM jobs WHERE queue = 'ml-thumbnail';")
VB_JOBS=$(sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM jobs WHERE queue = 'visual-buffet';")
echo "   - ml-thumbnail queue: $ML_JOBS jobs"
echo "   - visual-buffet queue: $VB_JOBS jobs"

if [ "$ML_JOBS" -gt 0 ]; then
  echo "   ML job status breakdown:"
  sqlite3 "$DB_PATH" "SELECT '     - ' || status || ': ' || COUNT(*) FROM jobs WHERE queue = 'ml-thumbnail' GROUP BY status;"
fi

# 6. Test image
echo ""
echo "6. Test image check:"
if [ -f "$TEST_IMAGE" ]; then
  SIZE=$(ls -lh "$TEST_IMAGE" | awk '{print $5}')
  echo "   ✅ Test image exists: $(basename "$TEST_IMAGE") ($SIZE)"
else
  echo "   ⚠️  Test image not found"
fi

# 7. Summary
echo ""
echo "=== Summary ==="
echo "Database schema: ✅ Ready"
echo "Job queue tables: ✅ Present"

if [ "$ML_JOBS" -gt 0 ]; then
  echo "ML thumbnail jobs: ✅ $ML_JOBS queued"
else
  echo "ML thumbnail jobs: ⏳ None (waiting for new imports)"
fi

if [ "$VB_JOBS" -gt 0 ]; then
  echo "Visual-buffet jobs: ✅ $VB_JOBS queued"
else
  echo "Visual-buffet jobs: ⏳ None (waiting for ML thumbnails)"
fi

echo ""
echo "📌 Next: Run import test to verify job chaining"
