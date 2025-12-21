# Image Tagging Fix - Implementation Guide

**For:** Less experienced coders
**Date:** 2025-12-17
**Time Estimate:** 20-30 minutes

---

## Prerequisites

Before starting, make sure you have:
- Terminal open in the project directory: `/Users/bryant/Documents/au archive`
- No Electron instances running (close the app if open)
- Git available to commit changes

---

## Part 1: Fix Florence-2 Python Dependencies

### Step 1.1: Activate the Python Virtual Environment

Open terminal and run:

```bash
cd "/Users/bryant/Documents/au archive"
source scripts/ram-server/venv/bin/activate
```

Your terminal prompt should now show `(venv)` at the beginning.

### Step 1.2: Check Current Package Versions

```bash
pip show transformers einops 2>/dev/null || echo "Package not installed"
```

**Expected output:** Either shows version info or "Package not installed"

### Step 1.3: Install/Upgrade Required Packages

```bash
pip install --upgrade einops>=0.7.0
```

**What this does:** Installs `einops`, a tensor operation library that Florence-2 needs.

### Step 1.4: Verify Installation

```bash
python -c "import einops; print(f'einops version: {einops.__version__}')"
```

**Expected:** `einops version: 0.7.x` or higher

---

## Part 2: Modify Florence-2 Script

### Step 2.1: Open the File

The file to edit is:
```
scripts/florence_tagger.py
```

### Step 2.2: Find the Code Block to Change

Look for lines around 94-98 that look like this:

```python
_model = AutoModelForCausalLM.from_pretrained(
    MODEL_NAME,
    torch_dtype=torch.float16 if device != "cpu" else torch.float32,
    trust_remote_code=True,
).to(device)
```

### Step 2.3: Add the Missing Parameter

Change it to:

```python
_model = AutoModelForCausalLM.from_pretrained(
    MODEL_NAME,
    torch_dtype=torch.float16 if device != "cpu" else torch.float32,
    trust_remote_code=True,
    attn_implementation="sdpa",  # Use PyTorch native attention (avoids flash_attn)
).to(device)
```

**Why this works:**
- Florence-2's code tries to use `flash_attn` (a CUDA-only library) for attention
- On Mac with MPS (Metal), this fails because flash_attn doesn't support MPS
- `sdpa` (Scaled Dot-Product Attention) is PyTorch's built-in alternative that works everywhere

### Step 2.4: Test Florence-2 Standalone

```bash
python scripts/florence_tagger.py \
  --image "test images/Mary McClellan Hospital/IMG_5961.JPG" \
  --view-type interior \
  --location-type hospital \
  --state "New York" \
  --output text
```

**Expected output:**
- Model loads (~10-15 seconds first time)
- Tags are printed (e.g., "hallway, decay, hospital, abandoned")
- No `ImportError` about flash_attn

**If it fails with ImportError:** Make sure you ran `pip install einops` in the venv.

---

## Part 3: Fix RAM++ Fallback Logic

### Step 3.1: Open the TypeScript Service File

The file to edit is:
```
packages/desktop/electron/services/tagging/image-tagging-service.ts
```

### Step 3.2: Find the Tagging Logic

Look for lines around 297-311 that contain:

```typescript
if (this.florenceAvailable && this.config.taggerModel === 'florence') {
  rawResult = await this.tagViaFlorence(imagePath, {
    viewType,
    locationType: context?.locationType,
    state: context?.state,
  });
  source = 'florence';
  model = 'florence-2-large';
} else if (this.ramppAvailable) {
```

### Step 3.3: Wrap in Try-Catch

Replace the entire block with:

```typescript
// Try Florence-2 first, fall back to RAM++ on failure
if (this.florenceAvailable && this.config.taggerModel === 'florence') {
  try {
    rawResult = await this.tagViaFlorence(imagePath, {
      viewType,
      locationType: context?.locationType,
      state: context?.state,
    });
    source = 'florence';
    model = 'florence-2-large';
  } catch (florenceError) {
    logger.warn('ImageTagging', `Florence-2 failed, falling back to RAM++: ${florenceError}`);
    if (this.ramppAvailable) {
      rawResult = await this.tagViaRampp(imagePath);
      source = 'ram++';
      model = 'ram++-swin-large';
    } else {
      throw florenceError;  // No fallback available, propagate error
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

**Why this works:**
- Before: If Florence-2 crashed, the error stopped everything
- After: If Florence-2 crashes, we log a warning and try RAM++ instead
- If RAM++ also isn't available, THEN we throw the original error

---

## Part 4: Regenerate SigLIP Embeddings

### Step 4.1: Ensure Dependencies

```bash
source scripts/ram-server/venv/bin/activate
pip install torch transformers numpy
```

### Step 4.2: Run the Download Script

```bash
python scripts/download-siglip-onnx.py
```

**Expected output:**
```
Loading model: google/siglip-base-patch16-224
Output directory: /Users/bryant/Documents/au archive /resources/models
Using MPS (Apple Silicon) acceleration

[1/3] Exporting vision encoder to ONNX...
   Saved vision encoder to: .../siglip-base-patch16-224.onnx
   ONNX model verification: PASSED
   Model size: 352.1 MB

[2/3] Computing text embeddings for classification prompts...
   Processing 20 prompts...
   Saved 20 text embeddings to: .../siglip-base-patch16-224-text-embeddings.json

[3/3] Creating model info...
   Saved model info to: .../siglip-base-patch16-224-info.json

SUCCESS! SigLIP model exported and ready for use.
```

**Time:** 2-5 minutes depending on download speed

---

## Part 5: Build and Test

### Step 5.1: Build the Project

```bash
pnpm build
```

**Expected:** Build completes without errors

### Step 5.2: Start the App

```bash
pnpm dev
```

**Expected:** App opens, no console errors about tagging services

### Step 5.3: Test Tagging

1. Open the app
2. Go to a location with images
3. Check if images have tags in the database

OR trigger tagging via DevTools:
```javascript
// In Electron DevTools console (Cmd+Shift+I)
await window.electron.tagging.testConnection()
```

---

## Troubleshooting

### "ModuleNotFoundError: No module named 'einops'"

You're not in the venv. Run:
```bash
source scripts/ram-server/venv/bin/activate
pip install einops
```

### "Florence-2 inference failed (exit code 1)"

Check the full error message. Common causes:
- Missing `einops`: Install it
- Missing `attn_implementation="sdpa"`: Edit florence_tagger.py
- Out of memory: Close other apps, try `--device cpu`

### "SigLIP model not found"

Run the download script:
```bash
python scripts/download-siglip-onnx.py
```

### "RAM++ tagger not found"

Check that `scripts/ram_tagger.py` exists. If not, there may be a git issue.

### Build fails with TypeScript errors

Make sure you saved the changes correctly. The try-catch syntax must match exactly.

---

## Summary of Changes

| File | Change |
|------|--------|
| `scripts/florence_tagger.py` | Added `attn_implementation="sdpa"` parameter |
| `packages/desktop/electron/services/tagging/image-tagging-service.ts` | Wrapped Florence-2 call in try-catch with RAM++ fallback |
| `resources/models/siglip-*` | Regenerated (via script) |

---

## Verification Checklist

After all steps, verify:

- [ ] `pnpm build` succeeds
- [ ] `pnpm dev` starts without tagging errors in console
- [ ] Florence-2 standalone test works
- [ ] App can tag an imported image
- [ ] Console shows "Stage 0: interior/exterior/aerial/detail" (not "unknown" with 100%)

---

End of Implementation Guide
