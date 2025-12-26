# Resume: Visual-Buffet Integration

## Status: Partially Complete

### What's Done

1. **IPC Handler Fixed** (`electron/main/ipc-handlers/tagging.ts`)
   - Removed `auto_tags_by_source` column from SELECT (doesn't exist in DB)
   - Uses `buildTagsBySource()` fallback to split tags by source
   - Hash validation updated to accept 16-64 char hex

2. **Visual-Buffet Service Fixed** (`electron/services/visual-buffet-service.ts`)
   - Removed `--discover` flag (was only outputting SigLIP)
   - Added `--plugin paddle_ocr` for text detection
   - Lowered threshold from 0.5 to 0.1 for more tags
   - Now outputs: RAM++ (~197), Florence-2 (~42), SigLIP (~56), PaddleOCR

3. **ML Insights Modal** (`src/components/MediaViewer.svelte`)
   - Full-screen modal for viewing all tags
   - Sections: Caption, RAM++, Florence-2, SigLIP Scores, OCR Text
   - Braun design compliant (dark overlay, proper typography)
   - Escape key closes modal

4. **100 Images Retagged**
   - First 100 images have full tag data in XMP sidecars
   - Remaining 896 images still have old SigLIP-only data

### What Needs To Be Done

#### 1. Retag Remaining Images (896 images)
```bash
# Run this to complete the retag (will take ~70 minutes)
cd /tmp
for i in $(seq 3 20); do
  START=$(((i-1) * 50 + 1))
  END=$((i * 50))
  if [ $END -gt 996 ]; then END=996; fi

  echo "=== Batch $i: $START-$END ==="
  sed -n "${START},${END}p" /tmp/retag-paths.txt > /tmp/batch-$i.txt

  visual-buffet tag \
    --plugin ram_plus \
    --plugin florence_2 \
    --plugin siglip \
    --plugin paddle_ocr \
    --threshold 0.1 \
    --xmp \
    -o /tmp/retag-batch-$i.json \
    $(cat /tmp/batch-$i.txt | tr "\n" " ")
done
```

#### 2. Sync XMP to Database
After retagging, sync the XMP sidecar data to the database:
- Use Settings > ML Tagging > "Sync from XMP" button
- Or call `tagging:syncFromXmp` IPC handler

#### 3. Database Schema (Optional Enhancement)
Add `auto_tags_by_source` column to store per-source breakdown:
```sql
ALTER TABLE imgs ADD COLUMN auto_tags_by_source TEXT;
```
Then update `visual-buffet-service.ts` to populate it.

#### 4. Florence-2 Captions
Currently visual-buffet `tag` command doesn't output captions.
Options:
- Check if there's a `--caption` flag or separate caption command
- Use Qwen3-VL plugin for captions instead
- Accept tags-only for now

### Key Files

| File | Purpose |
|------|---------|
| `electron/main/ipc-handlers/tagging.ts` | Tag fetching/editing IPC |
| `electron/services/visual-buffet-service.ts` | CLI wrapper |
| `src/components/MediaViewer.svelte` | Lightbox with ML modal |
| `/tmp/retag-paths.txt` | All 996 ML thumbnail paths |
| `/tmp/retag-batch-*.json` | Completed batch results |

### Test Command
```bash
# Test single image with full pipeline
visual-buffet tag \
  --plugin ram_plus \
  --plugin florence_2 \
  --plugin siglip \
  --plugin paddle_ocr \
  --threshold 0.1 \
  --no-xmp \
  -o /tmp/test.json \
  "/path/to/image_ml_2560.jpg"

# Check results
python3 -c "import json; d=json.load(open('/tmp/test.json'))[0]['results']; print('RAM++:', len(d.get('ram_plus',{}).get('tags',[]))); print('Florence:', len(d.get('florence_2',{}).get('tags',[]))); print('SigLIP:', len(d.get('siglip',{}).get('tags',[])))"
```

### Expected Tag Counts Per Image
| Source | Count | Notes |
|--------|-------|-------|
| RAM++ | 150-200 | General recognition |
| Florence-2 | 30-50 | Caption-derived |
| SigLIP | 40-60 | Semantic scoring |
| **Total** | 220-310 | Before deduplication |
| **Deduplicated** | 60-100 | Stored in `auto_tags` |
