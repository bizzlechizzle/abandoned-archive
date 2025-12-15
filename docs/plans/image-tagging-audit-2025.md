# Image Tagging System Audit & Upgrade Plan

**Date:** 2025-12-15
**Status:** DRAFT - Awaiting Review

---

## Executive Summary

This document audits the current image tagging system and proposes a two-stage architecture:
- **Stage 1**: Fast, offline model (no LLM) for basic tag extraction
- **Stage 2**: VLM-enhanced tagging with Qwen3-VL for contextual understanding

---

## Part 1: Current System Audit

### 1.1 Architecture Overview

The current system has **three competing approaches** that were "slapped together":

| Component | File | Purpose | Status |
|-----------|------|---------|--------|
| RAM++ Python Tagger | `scripts/ram_tagger.py` | Local inference via subprocess | Working but slow startup |
| RAM++ API Server | `scripts/ram-server/ram_api_server.py` | HTTP API for remote GPU | Underutilized |
| RAM Tagging Service | `electron/services/tagging/ram-tagging-service.ts` | Orchestration layer | Complex fallback chain |
| Urbex Taxonomy | `electron/services/tagging/urbex-taxonomy.ts` | Domain-specific normalization | Good but bypassed |
| Location Aggregator | `electron/services/tagging/location-tag-aggregator.ts` | Roll-up to location level | Working |

### 1.2 Current Model: RAM++ (Recognize Anything Model)

**Model Specs:**
- **Architecture:** RAM++ Swin-Large (2.8GB weights, 14M tag vocabulary)
- **File:** `scripts/ram-server/ram_plus_swin_large_14m.pth`
- **Performance:** ~5.5 seconds per image on Mac Studio M1 Max with MPS
- **Output:** 5-30 semantic tags per image (generic vocabulary)

**Strengths:**
- Zero-shot recognition of 6400+ common tags
- Outperforms CLIP and BLIP by ~20% on standard benchmarks
- No manual annotation required for training
- Works offline with local weights

**Weaknesses:**
- **Generic vocabulary** - "building", "window", "brick" vs urbex-specific like "asylum", "foundry"
- **Slow startup** - Model loading takes 10-15 seconds per cold start
- **No context** - Doesn't understand "this is an abandoned place"
- **No relationships** - Can't describe spatial relationships or conditions
- **MPS compatibility issues** - Requires fallback handling

### 1.3 Code Quality Issues

**ram_tagger.py (315 lines):**
```python
# Issue 1: Three model fallback chains - overly complex
1. recognize-anything package (original RAM++)
2. HuggingFace BLIP (caption fallback)
3. HuggingFace RAM-HF (zero-shot fallback)

# Issue 2: Hardcoded stoplist of ~60 generic tags
STOPLIST = {'appear', 'attach', 'back', 'call'...}  # Filtering in wrong layer

# Issue 3: Fixed candidate labels for RAM-HF fallback
candidate_labels = ["abandoned building", "factory", "hospital"...]  # Should be configurable
```

**ram-tagging-service.ts (675 lines):**
```typescript
// Issue 1: Complex path resolution (8 candidate paths tried)
const scriptCandidates = [
  path.resolve(appPath, '../../scripts/ram_tagger.py'),
  path.resolve(__dirname, '../../../../scripts/ram_tagger.py'),
  // ... 6 more attempts
];

// Issue 2: Mock results returned on ANY failure
if (!scriptPath) {
  return this.getMockResult();  // Silent failure mode
}

// Issue 3: Taxonomy normalization bypassed
// Line 487-488: "SIMPLIFIED: Return raw tags directly without filtering"
const relevantTags = raw.tags;  // Urbex taxonomy work ignored
```

**urbex-taxonomy.ts (590 lines):**
- Well-designed hierarchical taxonomy
- Maps generic RAM++ tags to urbex-specific terminology
- **Currently bypassed** in ram-tagging-service.ts (see Issue 3 above)
- Includes era detection, condition scoring, view type classification

### 1.4 Integration Points

| Entry Point | File | Uses Tagging? |
|-------------|------|---------------|
| Local Import v2 | `finalizer.ts` | Yes (via job-builder) |
| Web Image Download | `image-downloader.ts` | Yes (queueImageProcessingJobs) |
| Manual trigger | Settings UI | No direct access |
| Backfill script | `backfill-image-processing.py` | Queues jobs only |

### 1.5 Database Schema (imgs table)

```sql
-- Current tagging columns
auto_tags TEXT,              -- JSON array of tags
auto_tags_source TEXT,       -- 'ram++' | 'mock'
auto_tags_confidence TEXT,   -- JSON object {tag: confidence}
auto_tags_at TEXT,           -- ISO timestamp
quality_score REAL,          -- 0-1 for hero selection
view_type TEXT,              -- 'interior' | 'exterior' | 'aerial' | 'detail'
```

---

## Part 2: Model Research & Recommendations

### 2.1 Stage 1 Candidates (Fast, Offline, No LLM)

| Model | Size | Speed (Mac M1) | Tags | Notes |
|-------|------|----------------|------|-------|
| **RAM++** (current) | 2.8GB | ~5.5s | 6400+ | Generic vocabulary |
| **Florence-2-base** | 0.2GB | ~1.5s | Task-dependent | Prompt-based, flexible |
| **Florence-2-large** | 0.7GB | ~2.5s | Task-dependent | Better accuracy |
| **CLIP ViT-L/14** | 0.4GB | ~0.3s | Embedding only | Needs classifier head |
| **SigLIP** | 0.4GB | ~0.3s | Embedding only | Google's improved CLIP |

**Recommendation:** **Florence-2-large** (0.7GB)

**Rationale:**
1. **10x smaller** than RAM++ (0.7GB vs 2.8GB)
2. **Prompt-based** - Can ask "list tags for this abandoned building"
3. **Zero-shot capable** - No fine-tuning required
4. **Better benchmarks** - Outperforms Kosmos-2 despite 2x fewer params
5. **MIT License** - Free for commercial use
6. **Active community** - Fine-tuned variants available (MiaoshouAI Tagger)

**Downside:** May need custom prompt engineering for urbex domain.

### 2.2 Stage 2: VLM for Enhanced Tagging

| Model | Size | VRAM | Inference | Capabilities |
|-------|------|------|-----------|--------------|
| **Qwen3-VL-2B** | 4GB | ~6GB | ~3s | Basic image understanding |
| **Qwen3-VL-8B** | 16GB | ~20GB | ~8s | Strong reasoning |
| **Qwen3-VL-32B** | 64GB | ~80GB | ~20s | Near-GPT-4V quality |
| **InternVL2.5-8B** | 16GB | ~20GB | ~8s | Better data efficiency |
| **Qwen2.5-VL-7B** | 14GB | ~18GB | ~6s | Ollama available |

**Recommendation:** **Qwen3-VL-8B** (or Qwen2.5-VL-7B via Ollama)

**Rationale:**
1. **"Recognize everything"** - Explicitly designed for comprehensive recognition
2. **Contextual understanding** - Can understand "abandoned place" context
3. **Spatial perception** - Object positions, viewpoints, occlusions
4. **32-language OCR** - Can read signs in photos
5. **Already have Ollama** - Qwen2.5-VL-7B available via `ollama pull qwen2.5vl`

### 2.3 Three-Stage Architecture (Revised)

**Key Insight:** Current system detects view type AFTER tagging by analyzing returned tags.
This is backwards - we should classify FIRST to inform the tagging prompt.

```
┌─────────────────────────────────────────────────────────────┐
│                    Image Import Pipeline                     │
│                                                             │
│  CONTEXT AVAILABLE FROM DATABASE:                           │
│  - location_type (hospital, school, factory, etc.)          │
│  - location_name ("Willard Asylum")                         │
│  - era ("1870-1910")                                        │
│  - state, county, city                                      │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│  STAGE 0: Scene Classification (SigLIP) — Mac M2 Ultra      │
│  ─────────────────────────────────────────────              │
│  Purpose: Fast view type detection BEFORE tagging           │
│  Model:   google/siglip-base-patch16-224 (~400MB ONNX)      │
│  Speed:   ~0.3s per image (Node.js native, no Python)       │
│  Method:  Zero-shot with prompts:                           │
│           - "interior of an abandoned building"             │
│           - "exterior of an abandoned building"             │
│           - "aerial view of abandoned buildings"            │
│           - "close-up detail shot of decay"                 │
│  Output:  view_type, view_confidence                        │
│                                                             │
│  WHY: Enables context-aware prompts in Stage 1              │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│  STAGE 1: Context-Aware Tagging (Florence-2) — Mac M2 Ultra │
│  ─────────────────────────────────────────────              │
│  Purpose: Generate tags with full context                   │
│  Model:   microsoft/Florence-2-large (~700MB)               │
│  Speed:   ~2.5s per image (Python subprocess)               │
│                                                             │
│  DYNAMIC PROMPT CONSTRUCTION:                               │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ "List detailed tags for this {view_type} photograph │   │
│  │  of an abandoned {location_type} in {state}.        │   │
│  │  Include: architectural features, decay indicators, │   │
│  │  equipment, materials, and condition."              │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  EXAMPLES:                                                  │
│  - "...interior photograph of an abandoned hospital..."     │
│  - "...exterior photograph of an abandoned factory..."      │
│  - "...aerial view of an abandoned school in New York..."   │
│                                                             │
│  Output: tags[], quality_score                              │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼ (Background queue - OPTIONAL)
┌─────────────────────────────────────────────────────────────┐
│  STAGE 2: VLM Enhancement (Qwen3-VL) — Mac M2 Ultra (64GB)  │
│  ─────────────────────────────────────────────              │
│  Purpose: Deep contextual understanding                     │
│  Model:   Qwen3-VL-8B (~16GB) via Ollama local              │
│  Speed:   ~6-8s per image (MPS acceleration)                │
│  Trigger: Hybrid - auto-queue, process in background        │
│                                                             │
│  RICH CONTEXTUAL PROMPT:                                    │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ "This is a {view_type} of {location_name}, an       │   │
│  │  abandoned {location_type} built circa {era} in     │   │
│  │  {city}, {state}. Stage 1 detected: {tags}.         │   │
│  │                                                     │   │
│  │  Please describe:                                   │   │
│  │  1. Architectural style and notable features        │   │
│  │  2. Current condition and decay indicators          │   │
│  │  3. Any visible text, signs, or equipment           │   │
│  │  4. Estimated abandonment timeframe                 │   │
│  │  5. Additional tags not captured in Stage 1"        │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  Output: description, condition_notes, enhanced_tags[],     │
│          era_hints, readable_text[], spatial_notes          │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│  Urbex Taxonomy Normalization                                │
│  - Re-enable! Currently bypassed                            │
│  - Maps generic → urbex-specific                            │
│  - Applies confidence scoring                               │
│  - Validates view_type from Stage 0                         │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│  Location Tag Aggregator                                     │
│  - Roll up image tags to location level                     │
│  - Suggest location_type, era (if not set)                  │
│  - Auto-select hero image by quality_score                  │
└─────────────────────────────────────────────────────────────┘
```

### 2.4 Why Stage 0 Matters

**Current Problem (urbex-taxonomy.ts:409-446):**
```typescript
// AFTER tagging - too late!
export function detectViewType(tags: string[]): ViewTypeResult {
  const interiorScore = URBEX_TAXONOMY.view_interior.tags
    .filter(t => lowerTags.some(lt => lt.includes(t))).length;
  // ...counting tag matches to GUESS view type
}
```

**With Stage 0:**
- View type determined in ~0.3s via CLIP zero-shot
- Florence-2 receives contextual prompt
- Tags are more accurate and domain-specific
- No wasted inference on wrong assumptions

### 2.5 Model Stack Summary

| Stage | Model | Size | Speed | Runs On | Machine |
|-------|-------|------|-------|---------|---------|
| 0 | SigLIP (ONNX) | ~400MB | ~0.3s | Every image | Mac M2 Ultra |
| 1 | Florence-2-large | ~700MB | ~2.5s | Every image | Mac M2 Ultra |
| 2 | Qwen3-VL-8B | ~16GB | ~6-8s | Background | Mac M2 Ultra |

**All stages run locally on Mac M2 Ultra (64GB unified memory)**

| Scenario | Models Loaded | Time/Image | Memory Used |
|----------|---------------|------------|-------------|
| Stage 0+1 only | ~1.1GB | ~2.8s | ~1.1GB |
| All stages | ~17GB | ~9s | ~17GB |

---

## Part 3: Implementation Plan

### Phase 1: Cleanup & Stabilization

1. **Re-enable urbex-taxonomy.ts**
   - Currently bypassed in ram-tagging-service.ts line 487-488
   - This is well-designed code that's being wasted

2. **Remove mock fallback**
   - Silent failures mask real issues
   - Fail loud, log clearly

3. **Simplify path resolution**
   - Current: 8 candidate paths tried
   - Target: Single config-based path

### Phase 2: Stage 0 - Scene Classification (SigLIP)

1. **Download SigLIP weights**
   - Model: `google/siglip-base-patch16-224` (~400MB)
   - Export to ONNX for Python-free inference
   - Store in `resources/models/siglip-base.onnx`

2. **Create scene-classifier.ts (Node.js native)**
   ```typescript
   // Use ONNX Runtime for Node.js - no Python subprocess!
   import * as ort from 'onnxruntime-node';

   const VIEW_TYPE_PROMPTS = [
     "interior of an abandoned building",
     "exterior of an abandoned building",
     "aerial view of abandoned buildings",
     "close-up detail shot of decay or equipment"
   ];

   async function classifyScene(imagePath: string): Promise<{
     viewType: 'interior' | 'exterior' | 'aerial' | 'detail';
     confidence: number;
   }>
   ```

3. **Why SigLIP over CLIP?**
   - ~10-15% better accuracy on scene classification
   - Same size, same speed
   - No reason to build twice with inferior model

4. **Why Node.js native?**
   - Eliminates Python subprocess overhead (~10s startup)
   - ONNX Runtime is fast and well-supported
   - Model stays loaded in memory between calls

### Phase 3: Stage 1 - Context-Aware Tagging

1. **Download Florence-2-large weights**
   - From HuggingFace: `microsoft/Florence-2-large`
   - Export to ONNX (or keep PyTorch for now)

2. **Create florence-tagger.py**
   - Replace ram_tagger.py
   - Accept context parameters:
     ```bash
     python florence-tagger.py \
       --image /path/to/image.jpg \
       --view-type interior \
       --location-type hospital \
       --state "New York"
     ```
   - Build dynamic prompt from parameters

3. **Update service layer**
   - Rename `ram-tagging-service.ts` → `image-tagging-service.ts`
   - Orchestrate Stage 0 → Stage 1 pipeline
   - Pass database context to Florence

### Phase 4: Stage 2 - VLM Enhancement

1. **Add Qwen2.5-VL to Ollama**
   ```bash
   ollama pull qwen2.5vl:7b
   ```

2. **Create vlm-enhancement-service.ts**
   - Reuse existing Ollama provider from ExtractionService
   - Build rich contextual prompt with:
     - View type from Stage 0
     - Tags from Stage 1
     - Location metadata from database
   - Outputs structured JSON

3. **Schema additions**
   ```sql
   -- Stage 0 results
   ALTER TABLE imgs ADD COLUMN scene_view_type TEXT;
   ALTER TABLE imgs ADD COLUMN scene_confidence REAL;
   ALTER TABLE imgs ADD COLUMN scene_model TEXT;

   -- Stage 2 results (VLM enhancement)
   ALTER TABLE imgs ADD COLUMN vlm_description TEXT;
   ALTER TABLE imgs ADD COLUMN vlm_condition_notes TEXT;
   ALTER TABLE imgs ADD COLUMN vlm_enhanced_tags TEXT;  -- JSON
   ALTER TABLE imgs ADD COLUMN vlm_readable_text TEXT;  -- JSON array
   ALTER TABLE imgs ADD COLUMN vlm_processed_at TEXT;
   ALTER TABLE imgs ADD COLUMN vlm_model TEXT;
   ```

### Phase 5: Settings UI

1. **Model selection** in Settings → Data Engine → Image Tagging
   - Stage 0: CLIP vs SigLIP (radio)
   - Stage 1: Florence-2 (always on, no choice)
   - Stage 2: VLM selection (Qwen2.5-VL, Qwen3-VL, disabled)

2. **Processing options**
   - "Run VLM on all imports" toggle
   - "Batch enhance existing images" button
   - Progress indicator with ETA

3. **Per-location override**
   - "Enhance all images for this location" in location detail view

---

## Part 4: Migration Path

### For Existing Images

1. **Backfill with Florence-2**
   - Create migration script
   - Preserve existing RAM++ tags in `auto_tags_legacy`
   - Overwrite with Florence-2 results

2. **Optional VLM enhancement**
   - Queue as background jobs
   - User can trigger batch or per-location

### Database Migration

```sql
-- Migration XX: Image tagging v2
ALTER TABLE imgs ADD COLUMN auto_tags_legacy TEXT;
ALTER TABLE imgs ADD COLUMN tagging_model TEXT DEFAULT 'florence-2';
ALTER TABLE imgs ADD COLUMN vlm_description TEXT;
ALTER TABLE imgs ADD COLUMN vlm_condition_notes TEXT;
ALTER TABLE imgs ADD COLUMN vlm_enhanced_tags TEXT;
ALTER TABLE imgs ADD COLUMN vlm_processed_at TEXT;
ALTER TABLE imgs ADD COLUMN vlm_model TEXT;

-- Copy existing tags to legacy
UPDATE imgs SET auto_tags_legacy = auto_tags WHERE auto_tags IS NOT NULL;
```

---

## Part 5: Decisions (Confirmed)

1. **Stage 0 model: SigLIP** ✅
   - ~10-15% better accuracy than CLIP
   - Same size (~400MB), same speed (~0.3s)
   - No reason to build twice - start with the better model

2. **Stage 0 implementation: Node.js ONNX** ✅
   - Eliminates Python subprocess overhead (~10s cold start)
   - Model stays loaded in memory
   - Uses `onnxruntime-node` package

3. **Stage 1: Florence-2** ✅
   - Smaller (0.7 vs 2.8GB), prompt-based, flexible
   - Remove RAM++ after Florence-2 validated

4. **Stage 2 model: Qwen3-VL-8B on Mac via Ollama** ✅
   - Available NOW: `ollama pull qwen3-vl:8b`
   - Mac M2 Ultra 64GB handles it easily (~16GB model, 47GB free)
   - Future: Offload to Windows 3090 if bottleneck

5. **Stage 2 trigger: Hybrid** ✅
   - Queue automatically on import
   - Process in background when system idle
   - User can also trigger manually

6. **Missing context: Generic fallback + re-tag option** ✅
   - Use "abandoned building" when location_type unknown
   - Add "Re-tag images" button in Location Settings
   - User triggers re-tag after completing location metadata

7. **RAM++ removal: After Florence-2 validated** ✅

8. **Backfill: Manual via button** ✅
   - Test database only has ~1k images
   - User triggers via Settings or Location detail
   - No automatic backfill needed

---

## Part 6: Hardware Deployment Plan

### Simplified: Everything on Mac M2 Ultra

The Mac M2 Ultra with 64GB unified memory can run **all three stages locally**:

| Model | Size | Memory After Load |
|-------|------|-------------------|
| SigLIP (ONNX) | ~400MB | 63.6GB free |
| Florence-2-large | ~700MB | 62.9GB free |
| Qwen3-VL-8B | ~16GB | **47GB free** |

**No network complexity needed to start.**

### Deployment Architecture (Simple)

```
┌─────────────────────────────────────────────────────────────┐
│  MAC M2 ULTRA (Everything Local)                            │
│  ─────────────────────────────────────                      │
│  Stage 0: SigLIP (ONNX, Node.js native)     ~0.3s           │
│  Stage 1: Florence-2 (Python subprocess)     ~2.5s          │
│  Stage 2: Qwen3-VL-8B (Ollama)               ~6-8s          │
│  Database: SQLite                                           │
│                                                             │
│  Total per image (all stages): ~9s                          │
│  Total per image (Stage 0+1 only): ~2.8s                    │
└─────────────────────────────────────────────────────────────┘
                              │
                              │ SMB/NFS (10GBE)
                              ▼
┌─────────────────────────────────────────────────────────────┐
│  NAS DS1821+ (Archive Storage)                              │
│  ─────────────────────────────────────                      │
│  Archive folder: /volume1/au-archive/                       │
│  Database backup: /volume1/au-archive/_database/            │
│  Mounted on Mac via SMB or NFS                              │
└─────────────────────────────────────────────────────────────┘
```

### Setup on Mac

```bash
# Install Ollama (if not already)
brew install ollama

# Pull Qwen3-VL-8B (~16GB download)
ollama pull qwen3-vl:8b

# Verify it works
ollama run qwen3-vl:8b "Describe this image" --images /path/to/test.jpg
```

### Future Optimization (Optional)

If Stage 2 becomes a bottleneck, offload to Windows 3090:
- Faster CUDA inference (~3-4s vs ~6-8s on MPS)
- Frees Mac resources for UI
- Requires network service setup

But **start simple** - Mac handles everything.

---

## Sources

### Stage 0 - Scene Classification
- [CLIP Zero-Shot Prompting GitHub](https://github.com/abhinav-neil/clip-zs-prompting)
- [RS-TransCLIP (ICASSP 2025)](https://github.com/elkhouryk/rs-transclip)
- [Zero-Shot Aerial Scene Classification (IJSRA 2025)](https://journalijsra.com/sites/default/files/fulltext_pdf/IJSRA-2025-2948.pdf)
- [OpenVINO CLIP Zero-Shot Tutorial](https://docs.openvino.ai/2024/notebooks/clip-zero-shot-classification-with-output.html)
- [SenCLIP View-Specific Prompts (Dec 2024)](https://arxiv.org/html/2412.08536v1)

### Stage 1 - Tagging Models
- [RAM++ Paper (arXiv)](https://arxiv.org/abs/2306.03514)
- [RAM++ GitHub](https://github.com/xinyu1205/recognize-anything)
- [Florence-2 on HuggingFace](https://huggingface.co/microsoft/Florence-2-large)
- [Florence-2 Introduction (Datature)](https://datature.io/blog/introducing-florence-2-microsofts-latest-multi-modal-compact-visual-language-model)
- [Florence-2 Zero-Shot Guide (Ultralytics)](https://www.ultralytics.com/blog/florence-2-microsofts-latest-vision-language-model)
- [Fine-tuning Florence-2 (HuggingFace Blog)](https://huggingface.co/blog/finetune-florence2)
- [MiaoshouAI Tagger (Florence-2 fine-tuned)](https://github.com/miaoshouai/ComfyUI-Miaoshouai-Tagger)

### Stage 2 - VLM Enhancement
- [Qwen3-VL GitHub](https://github.com/QwenLM/Qwen3-VL)
- [Qwen2.5-VL on HuggingFace](https://huggingface.co/Qwen/Qwen2.5-VL-7B-Instruct)
- [Qwen2.5-VL Guide (Apatero)](https://apatero.com/blog/qwen-25-vl-image-understanding-complete-guide-2025)
- [Qwen2.5-VL on Ollama](https://ollama.com/library/qwen2.5vl)
- [InternVL2.5 Blog](https://internvl.github.io/blog/2024-12-05-InternVL-2.5/)

### General Resources
- [CLIP Alternatives Guide (Roboflow)](https://roboflow.com/model-alternatives/clip)
- [Image Classification Models 2025 (LabelYourData)](https://labelyourdata.com/articles/image-classification-models)
- [ONNX Model Zoo (HuggingFace)](https://huggingface.co/onnxmodelzoo)
