# Image Tagging Troubleshooting Plan

**Date:** 2025-12-17
**Goal:** Get image tagging working - fix blockers so ANY tagging runs successfully
**Python Env:** `scripts/ram-server/venv`

---

## Problem Summary

From terminal output analysis:

| Issue | Error | Root Cause |
|-------|-------|------------|
| Florence-2 fails | `ImportError: flash_attn, einops` | Missing packages + wrong attention implementation |
| SigLIP returns "unknown" | 100% confidence on unknown | Text embeddings may need regeneration OR cosine similarity issue |
| RAM++ fallback not triggering | N/A | Fallback logic only checks file existence, not runtime failures |

---

## Root Cause Analysis

### Issue 1: Florence-2 Missing Dependencies

**Location:** `scripts/florence_tagger.py:94-98`

```python
_model = AutoModelForCausalLM.from_pretrained(
    MODEL_NAME,
    torch_dtype=torch.float16 if device != "cpu" else torch.float32,
    trust_remote_code=True,  # Missing attn_implementation="sdpa"
).to(device)
```

**Problem:** Florence-2's custom code tries to import `flash_attn` for attention. On Mac MPS, flash_attn isn't available.

**Fix:** Add `attn_implementation="sdpa"` to use PyTorch's native scaled dot-product attention instead.

### Issue 2: SigLIP Returns "unknown"

**Location:** `packages/desktop/electron/services/tagging/scene-classifier.ts:380-387`

```typescript
// Normalize to 0-1 range using softmax-like transformation
const maxScore = Math.max(...Object.values(scores));
const minScore = Math.min(...Object.values(scores));
const range = maxScore - minScore || 1;

for (const vt of Object.keys(scores) as ViewType[]) {
  scores[vt] = (scores[vt] - minScore) / range;
}
```

**Hypothesis:** If all raw cosine similarities are very similar (e.g., 0.25 ± 0.01), this normalization maps them to 0-1 evenly, making the highest ~1.0 but if the raw scores are ALL below threshold before normalization, we lose the signal.

**Or:** The text embeddings file was generated with a different model/version than what's loaded.

**Fix:**
1. Regenerate embeddings with the exact same model
2. Debug by logging raw cosine similarities before normalization

### Issue 3: RAM++ Fallback Not Triggering

**Location:** `packages/desktop/electron/services/tagging/image-tagging-service.ts:297-311`

```typescript
if (this.florenceAvailable && this.config.taggerModel === 'florence') {
  rawResult = await this.tagViaFlorence(imagePath, {...});  // Throws on failure!
  // ... no catch to fallback
} else if (this.ramppAvailable) {
  rawResult = await this.tagViaRampp(imagePath);
}
```

**Problem:** If Florence-2 throws an error (which it does), the error propagates up. There's no try-catch to fall back to RAM++.

**Fix:** Wrap Florence-2 call in try-catch and fall back to RAM++ on failure.

---

## Fix Order (Dependencies)

```
1. Fix Florence-2 dependencies
   └─> 2. Test Florence-2 standalone
       └─> 3. Fix RAM++ fallback logic
           └─> 4. Regenerate SigLIP embeddings
               └─> 5. Debug SigLIP scoring
                   └─> 6. End-to-end test
```

---

## Phase 1: Fix Florence-2 (Blocking)

### 1.1 Install missing Python packages

```bash
cd "/Users/bryant/Documents/au archive"
source scripts/ram-server/venv/bin/activate
pip install einops
```

### 1.2 Modify florence_tagger.py to avoid flash_attn

**File:** `scripts/florence_tagger.py`
**Line:** ~94-98

**Before:**
```python
_model = AutoModelForCausalLM.from_pretrained(
    MODEL_NAME,
    torch_dtype=torch.float16 if device != "cpu" else torch.float32,
    trust_remote_code=True,
).to(device)
```

**After:**
```python
_model = AutoModelForCausalLM.from_pretrained(
    MODEL_NAME,
    torch_dtype=torch.float16 if device != "cpu" else torch.float32,
    trust_remote_code=True,
    attn_implementation="sdpa",  # Use PyTorch native attention (avoids flash_attn)
).to(device)
```

### 1.3 Test Florence-2 standalone

```bash
source scripts/ram-server/venv/bin/activate
python scripts/florence_tagger.py \
  --image "test images/Mary McClellan Hospital/IMG_5961.JPG" \
  --view-type interior \
  --location-type hospital \
  --state "New York" \
  --output text
```

**Expected:** Tags output, no ImportError

---

## Phase 2: Fix RAM++ Fallback Logic

### 2.1 Add try-catch fallback in image-tagging-service.ts

**File:** `packages/desktop/electron/services/tagging/image-tagging-service.ts`
**Lines:** ~297-311

**Before:**
```typescript
if (this.florenceAvailable && this.config.taggerModel === 'florence') {
  rawResult = await this.tagViaFlorence(imagePath, {...});
  source = 'florence';
  model = 'florence-2-large';
} else if (this.ramppAvailable) {
  rawResult = await this.tagViaRampp(imagePath);
  source = 'ram++';
  model = 'ram++-swin-large';
} else {
  throw new Error('No tagging model available');
}
```

**After:**
```typescript
// Try Florence-2 first, fall back to RAM++ on failure
if (this.florenceAvailable && this.config.taggerModel === 'florence') {
  try {
    rawResult = await this.tagViaFlorence(imagePath, {...});
    source = 'florence';
    model = 'florence-2-large';
  } catch (florenceError) {
    logger.warn('ImageTagging', `Florence-2 failed, falling back to RAM++: ${florenceError}`);
    if (this.ramppAvailable) {
      rawResult = await this.tagViaRampp(imagePath);
      source = 'ram++';
      model = 'ram++-swin-large';
    } else {
      throw florenceError;  // No fallback available
    }
  }
} else if (this.ramppAvailable) {
  rawResult = await this.tagViaRampp(imagePath);
  source = 'ram++';
  model = 'ram++-swin-large';
} else {
  throw new Error('No tagging model available');
}
```

---

## Phase 3: Regenerate SigLIP Embeddings

### 3.1 Verify Python environment has required packages

```bash
source scripts/ram-server/venv/bin/activate
pip install torch transformers numpy onnx
```

### 3.2 Regenerate embeddings

```bash
python scripts/download-siglip-onnx.py
```

**Expected output:**
- `resources/models/siglip-base-patch16-224.onnx` (regenerated)
- `resources/models/siglip-base-patch16-224-text-embeddings.json` (regenerated)
- `resources/models/siglip-base-patch16-224-info.json` (regenerated)

---

## Phase 4: Debug SigLIP Scoring (If Still Failing)

### 4.1 Add debug logging to scene-classifier.ts

**File:** `packages/desktop/electron/services/tagging/scene-classifier.ts`
**Method:** `computeViewTypeScores()`

Add logging before and after normalization to see raw cosine similarities.

---

## Verification Checklist

- [ ] `pip install einops` succeeds
- [ ] Florence-2 standalone test returns tags
- [ ] `pnpm build` succeeds
- [ ] `pnpm dev` starts without console errors
- [ ] Import a test image → tags appear in database
- [ ] Scene classifier returns non-"unknown" view type
- [ ] RAM++ works as fallback when Florence-2 disabled

---

## Files to Modify

| File | Change | Lines |
|------|--------|-------|
| `scripts/florence_tagger.py` | Add `attn_implementation="sdpa"` | ~94-98 |
| `packages/desktop/electron/services/tagging/image-tagging-service.ts` | Add try-catch fallback | ~297-311 |

## Files to Regenerate

| File | Command |
|------|---------|
| `resources/models/siglip-*.json` | `python scripts/download-siglip-onnx.py` |
| `resources/models/siglip-*.onnx` | `python scripts/download-siglip-onnx.py` |

---

## Risks

| Risk | Mitigation |
|------|------------|
| Florence-2 sdpa not supported | Test on Mac MPS first; CPU fallback exists |
| SigLIP model incompatible | Download fresh from HuggingFace |
| Venv missing dependencies | Full pip freeze audit before testing |

---

## Success Criteria

1. **Minimum:** ANY one of Florence-2 or RAM++ tags an image successfully
2. **Target:** Both taggers work, with Florence-2 as primary and RAM++ as fallback
3. **Stretch:** SigLIP scene classification returns correct view type with >50% confidence

---

End of Plan
