# ML Tag Analyzer Tool - Implementation Plan

**Status:** PLANNING (Not approved for implementation)
**Date:** 2025-12-18
**Goal:** Build a comparison tool that runs multiple ML tagging models on images and outputs raw, unfiltered results

---

## Executive Summary

Create a standalone Python CLI tool (`scripts/ml_tag_analyzer.py`) that:
1. Accepts a single image OR folder of images
2. Runs 5-7 different ML tagging/captioning models
3. Outputs raw, unfiltered results in a comparison format
4. Helps evaluate which model produces the best tags for urbex photography

---

## Phase 1: Discovery Summary

### Current State
| Item | Status |
|------|--------|
| Existing analyzer tool | **None** - must be built |
| RAM++ | Installed and working |
| Florence-2 | Script exists (`florence_tagger.py`) but not confirmed working |
| Other models | Not installed |
| Python venv | `scripts/ram-server/venv/` with PyTorch 2.9.1, transformers 4.39.3 |
| Hardware | Mac with MPS (Metal Performance Shaders) |

### User Requirements
- Single image OR batch folder input
- RAW unfiltered output (no stoplist, no normalization)
- Side-by-side comparison of all models
- Authentic data evaluation (their actual urbex photos)

---

## Phase 2: Research - Top ML Tagging Models

Based on research from [Hugging Face](https://huggingface.co/microsoft/Florence-2-large), [RAM++ GitHub](https://github.com/xinyu1205/recognize-anything), [BLIP](https://huggingface.co/Salesforce/blip-image-captioning-base), and [ComfyUI-Miaoshouai-Tagger](https://github.com/miaoshouai/ComfyUI-Miaoshouai-Tagger):

### Recommended Models (2025 SOTA - All 8)

Based on research from [DataCamp](https://www.datacamp.com/blog/top-vision-language-models), [InternVL3 Blog](https://internvl.github.io/blog/2025-04-11-InternVL-3.0/), [Hugging Face VLMs 2025](https://huggingface.co/blog/vlms-2025):

| # | Model | Type | Size | Strengths | Install Status |
|---|-------|------|------|-----------|----------------|
| 1 | **RAM++** | Tag List | 2.8GB | Best pure tagging, 6400+ categories | **Installed** |
| 2 | **InternVL3-8B** | VLM | ~8GB | **2025 SOTA** - beats GPT-4o | NOT installed |
| 3 | **Qwen2.5-VL-7B** | VLM | ~7GB | Upgraded from 2.0, great OCR | NOT installed (have 2.0) |
| 4 | **Florence-2-large** | VLM | 1.5GB | Lightweight, prompt-based | **Script exists** |
| 5 | **MiniCPM-V 4.5** | VLM | ~5GB | 8B params beats 72B models | NOT installed |
| 6 | **CLIP** | Zero-shot | 0.4GB | Embeddings baseline | NOT installed |
| 7 | **WD14** | Tag List | 0.8GB | Detailed content tags | NOT installed |
| 8 | **Moondream** | VLM | 2GB | Ultra-fast, CPU-friendly | NOT installed |

**Total storage: ~28GB** (fits easily in 64GB M2 Ultra)

### Model Selection Rationale

**Pure Taggers (direct tag output):**
1. **RAM++** - Gold standard, 6400+ tags, highest accuracy
2. **WD14** - Specialized detailed tags, unique vocabulary

**2025 SOTA VLMs (caption → extract tags):**
3. **InternVL3-8B** - Current best open-source VLM, beats GPT-4o
4. **Qwen2.5-VL-7B** - Strong all-rounder, great for OCR/documents
5. **Florence-2** - Lightweight Microsoft VLM

**Efficient/Small VLMs:**
6. **MiniCPM-V 4.5** - 8B params outperforms 72B models
7. **Moondream** - 2B ultra-fast, runs on CPU

**Zero-shot Classification:**
8. **CLIP** - Industry standard for embeddings-based classification

---

## Phase 3: Architecture Design

### Tool Structure

```
scripts/
├── ml_tag_analyzer.py          # Main CLI tool (NEW)
├── analyzers/                  # Model-specific analyzers (NEW)
│   ├── __init__.py
│   ├── base_analyzer.py        # Abstract base class
│   ├── rampp_analyzer.py       # RAM++ wrapper
│   ├── internvl3_analyzer.py   # InternVL3-8B (2025 SOTA)
│   ├── qwen25vl_analyzer.py    # Qwen2.5-VL-7B
│   ├── florence_analyzer.py    # Florence-2 wrapper
│   ├── minicpm_analyzer.py     # MiniCPM-V 4.5
│   ├── clip_analyzer.py        # CLIP wrapper
│   ├── wd14_analyzer.py        # WD14 wrapper
│   └── moondream_analyzer.py   # Moondream (ultra-fast)
├── ram-server/                 # Existing venv (shared)
│   └── venv/
└── florence_tagger.py          # Existing (will wrap)
```

### CLI Interface

```bash
# Single image
python scripts/ml_tag_analyzer.py --image /path/to/photo.jpg

# Folder of images
python scripts/ml_tag_analyzer.py --folder /path/to/images/

# Select specific models
python scripts/ml_tag_analyzer.py --image photo.jpg --models rampp,florence,blip2

# Output formats
python scripts/ml_tag_analyzer.py --image photo.jpg --output json    # Machine-readable
python scripts/ml_tag_analyzer.py --image photo.jpg --output table   # Human-readable
python scripts/ml_tag_analyzer.py --image photo.jpg --output csv     # Spreadsheet

# Save results
python scripts/ml_tag_analyzer.py --folder ./images/ --output json --save results.json
```

### Output Format (JSON)

```json
{
  "image": "/path/to/photo.jpg",
  "timestamp": "2025-12-18T10:30:00Z",
  "models": {
    "rampp": {
      "model_version": "ram_plus_swin_large_14m",
      "duration_ms": 2340,
      "raw_tags": ["abandoned", "factory", "rust", "decay", "industrial", "..."],
      "tag_count": 45,
      "confidence": {"abandoned": 0.95, "factory": 0.87, "...": "..."}
    },
    "internvl3": {
      "model_version": "OpenGVLab/InternVL3-8B",
      "duration_ms": 4200,
      "raw_caption": "This image shows an abandoned industrial facility...",
      "extracted_tags": ["abandoned", "industrial", "facility", "decay", "..."],
      "tag_count": 38
    },
    "qwen25vl": {
      "model_version": "Qwen/Qwen2.5-VL-7B-Instruct",
      "duration_ms": 3800,
      "raw_caption": "A derelict factory building with rusted equipment...",
      "extracted_tags": ["derelict", "factory", "rusted", "equipment", "..."],
      "tag_count": 42
    },
    "florence2": {
      "model_version": "microsoft/Florence-2-large",
      "duration_ms": 1850,
      "raw_caption": "An abandoned industrial factory with rusted machinery...",
      "extracted_tags": ["abandoned", "industrial", "factory", "..."],
      "tag_count": 28
    },
    "minicpm": {
      "model_version": "openbmb/MiniCPM-V-4_5",
      "duration_ms": 2100,
      "raw_caption": "The photograph depicts an old factory in disrepair...",
      "extracted_tags": ["photograph", "old", "factory", "disrepair", "..."],
      "tag_count": 31
    },
    "clip": {
      "model_version": "openai/clip-vit-large-patch14",
      "duration_ms": 450,
      "zero_shot_scores": {
        "abandoned building": 0.89, "factory": 0.76, "industrial": 0.82, "...": "..."
      }
    },
    "wd14": {
      "model_version": "SmilingWolf/wd-vit-tagger-v3",
      "duration_ms": 890,
      "raw_tags": ["building", "industrial", "no_humans", "rust", "..."],
      "tag_count": 67,
      "confidence": {"building": 0.99, "industrial": 0.94, "...": "..."}
    },
    "moondream": {
      "model_version": "vikhyat/moondream2",
      "duration_ms": 680,
      "raw_caption": "An old abandoned factory building",
      "extracted_tags": ["old", "abandoned", "factory", "building"],
      "tag_count": 4
    }
  },
  "summary": {
    "total_unique_tags": 178,
    "common_tags": ["abandoned", "factory", "industrial", "rust", "building"],
    "model_agreement_score": 0.52
  }
}
```

### Output Format (Table - Human Readable)

```
╔═══════════════════════════════════════════════════════════════════════════════════╗
║ ML TAG ANALYZER - photo.jpg                                    8 models loaded    ║
╠═══════════════════════════════════════════════════════════════════════════════════╣

┌───────────────────────────────────────────────────────────────────────────────────┐
│ RAM++ (2340ms, 45 tags) ★ PURE TAGGER                                             │
├───────────────────────────────────────────────────────────────────────────────────┤
│ abandoned (0.95), factory (0.87), rust (0.83), industrial (0.81), decay (0.79),   │
│ machinery (0.76), brick (0.74), window (0.71), metal (0.68), concrete (0.65)...   │
└───────────────────────────────────────────────────────────────────────────────────┘

┌───────────────────────────────────────────────────────────────────────────────────┐
│ InternVL3-8B (4200ms) ★ 2025 SOTA                                                 │
├───────────────────────────────────────────────────────────────────────────────────┤
│ CAPTION: "This image shows an abandoned industrial facility with extensive rust   │
│ damage. The building appears to be a former factory with large windows..."        │
│ EXTRACTED: abandoned, industrial, facility, rust, damage, factory, windows...     │
└───────────────────────────────────────────────────────────────────────────────────┘

┌───────────────────────────────────────────────────────────────────────────────────┐
│ Qwen2.5-VL (3800ms)                                                               │
├───────────────────────────────────────────────────────────────────────────────────┤
│ CAPTION: "A derelict factory building with rusted equipment and broken windows.   │
│ The structure shows signs of abandonment with peeling paint and debris..."        │
│ EXTRACTED: derelict, factory, rusted, equipment, broken, windows, abandonment...  │
└───────────────────────────────────────────────────────────────────────────────────┘

┌───────────────────────────────────────────────────────────────────────────────────┐
│ Florence-2 (1850ms)                                                               │
├───────────────────────────────────────────────────────────────────────────────────┤
│ CAPTION: "An abandoned industrial factory with rusted machinery and decay"        │
│ EXTRACTED: abandoned, industrial, factory, rusted, machinery, decay               │
└───────────────────────────────────────────────────────────────────────────────────┘

┌───────────────────────────────────────────────────────────────────────────────────┐
│ MiniCPM-V 4.5 (2100ms) ★ EFFICIENT                                                │
├───────────────────────────────────────────────────────────────────────────────────┤
│ CAPTION: "The photograph depicts an old factory in disrepair with rusted metal"   │
│ EXTRACTED: photograph, old, factory, disrepair, rusted, metal                     │
└───────────────────────────────────────────────────────────────────────────────────┘

┌───────────────────────────────────────────────────────────────────────────────────┐
│ CLIP Zero-Shot (450ms)                                                            │
├───────────────────────────────────────────────────────────────────────────────────┤
│ abandoned building (0.89), industrial site (0.82), factory (0.76),                │
│ warehouse (0.54), hospital (0.12), school (0.08)...                               │
└───────────────────────────────────────────────────────────────────────────────────┘

┌───────────────────────────────────────────────────────────────────────────────────┐
│ WD14 (890ms, 67 tags) ★ PURE TAGGER                                               │
├───────────────────────────────────────────────────────────────────────────────────┤
│ building (0.99), industrial (0.94), no_humans (0.92), rust (0.88), debris (0.85), │
│ broken_window (0.82), graffiti (0.78), concrete (0.75), metal (0.72)...           │
└───────────────────────────────────────────────────────────────────────────────────┘

┌───────────────────────────────────────────────────────────────────────────────────┐
│ Moondream (680ms) ★ ULTRA-FAST                                                    │
├───────────────────────────────────────────────────────────────────────────────────┤
│ CAPTION: "An old abandoned factory building"                                      │
│ EXTRACTED: old, abandoned, factory, building                                      │
└───────────────────────────────────────────────────────────────────────────────────┘

════════════════════════════════════════════════════════════════════════════════════
SUMMARY: 178 unique tags across 8 models | Total time: 16.3s
CONSENSUS (6+ models): factory, abandoned, industrial, building, rust
MODEL AGREEMENT: 52%
════════════════════════════════════════════════════════════════════════════════════
```

### NEW: Enhanced Comparison Output

**Tag Overlap Matrix** (shows which models agree):
```
TAG AGREEMENT MATRIX
                RAM++  Intern  Qwen  Flor2  Mini  CLIP   WD14  Moon   Count
abandoned         ✓      ✓      ✓      ✓      -     ✓      -     ✓     6/8 ★
factory           ✓      ✓      ✓      ✓      ✓     ✓      -     ✓     7/8 ★
rust              ✓      ✓      ✓      ✓      ✓     -      ✓     -     6/8 ★
industrial        ✓      ✓      -      ✓      -     ✓      ✓     -     5/8
building          ✓      ✓      ✓      -      -     ✓      ✓     ✓     6/8 ★
decay             ✓      -      -      ✓      -     -      -     -     2/8
no_humans         -      -      -      -      -     -      ✓     -     1/8  (WD14 specific)

★ = high agreement (6+ models)
```

**Confidence Comparison** (same tag across models):
```
CONFIDENCE BY MODEL: "abandoned"
  RAM++:      0.95 ████████████████████░░░░
  InternVL3:  0.88 █████████████████░░░░░░░  (extracted)
  Qwen2.5:    0.85 █████████████████░░░░░░░  (extracted)
  Florence:   0.82 ████████████████░░░░░░░░  (extracted)
  MiniCPM:    N/A  (not in output)
  CLIP:       0.89 █████████████████░░░░░░░  (zero-shot)
  WD14:       N/A  (tag not produced)
  Moondream:  0.70 ██████████████░░░░░░░░░░  (extracted)
```

**Timing Breakdown**:
```
PERFORMANCE BREAKDOWN
Model         Load(ms)  Warm-up(ms)  Inference(ms)  Total(ms)
RAM++            3200          450           1890       5540
InternVL3        9500         1500           2700      13700
Qwen2.5-VL       8200         1200           2400      11800
Florence-2       2100          380           1470       3950
MiniCPM-V        5500          800           1300       7600
CLIP              800          120            330       1250
WD14              450           80            810       1340
Moondream         600          100            580       1280
───────────────────────────────────────────────────────────
TOTAL           30350         4630          11480      46460
```

**Consensus Tags** (weighted by confidence × model count):
```
TOP 10 CONSENSUS TAGS (confidence × agreement)
1. factory        (6/6 models, avg conf: 0.87) → Score: 5.22
2. abandoned      (5/6 models, avg conf: 0.85) → Score: 4.25
3. industrial     (5/6 models, avg conf: 0.81) → Score: 4.05
4. building       (5/6 models, avg conf: 0.78) → Score: 3.90
5. rust           (4/6 models, avg conf: 0.82) → Score: 3.28
...
```

---

## Phase 4: Implementation Steps

### Hardware Profile: M2 Ultra + 64GB Unified Memory

**Optimal Strategy:** Load ALL models simultaneously, process in parallel.

With 64GB unified memory:
- All 5 models (~9GB total VRAM) fit comfortably
- MPS (Metal Performance Shaders) acceleration on all models
- Can process multiple images in parallel
- No need to load/unload models between runs

### Step 1: Setup Additional Models

**Dependencies to add to venv:**
```bash
# In scripts/ram-server/venv
pip install open-clip-torch    # CLIP
pip install salesforce-lavis   # BLIP-2
# WD14 - uses onnxruntime, separate setup
pip install onnxruntime
```

**Model Downloads (~9GB total):**
| Model | Size | Download Method |
|-------|------|-----------------|
| RAM++ | 2.8GB | Already have |
| Florence-2-large | ~1.5GB | Auto-downloads via transformers |
| BLIP-2 | ~3.6GB | Auto-downloads via LAVIS |
| CLIP | ~0.4GB | Auto-downloads via open-clip |
| WD14 | ~0.8GB | Manual ONNX download |

### Step 2: Create Base Analyzer Class

```python
# scripts/analyzers/base_analyzer.py
from abc import ABC, abstractmethod
from dataclasses import dataclass

@dataclass
class AnalyzerResult:
    model_name: str
    model_version: str
    duration_ms: int
    raw_output: dict  # Model-specific raw output
    tags: list[str]   # Extracted tags (raw, unfiltered)
    confidence: dict[str, float]  # Tag → confidence mapping
    caption: str | None = None  # For caption models

class BaseAnalyzer(ABC):
    @abstractmethod
    def load_model(self) -> None: ...

    @abstractmethod
    def analyze(self, image_path: str) -> AnalyzerResult: ...

    @abstractmethod
    def is_available(self) -> bool: ...
```

### Step 3: Implement Individual Analyzers

Each analyzer wraps one model:
- `rampp_analyzer.py` - Wrap existing `ram_tagger.py`
- `florence_analyzer.py` - Wrap existing `florence_tagger.py`
- `blip2_analyzer.py` - New, using salesforce-lavis
- `clip_analyzer.py` - New, using open-clip-torch
- `wd14_analyzer.py` - New, using ONNX runtime

### Step 4: Build Main CLI

```python
# scripts/ml_tag_analyzer.py
import argparse
from pathlib import Path
from analyzers import ALL_ANALYZERS

def main():
    parser = argparse.ArgumentParser(description="Compare ML tagging models")
    parser.add_argument("--image", help="Single image path")
    parser.add_argument("--folder", help="Folder of images")
    parser.add_argument("--models", default="all", help="Comma-separated model list")
    parser.add_argument("--output", choices=["json", "table", "csv"], default="table")
    parser.add_argument("--save", help="Save results to file")
    # ...
```

### Step 5: Caption→Tag Extraction Strategy

**Problem:** Florence, BLIP-2, and Qwen produce captions/descriptions, not tag lists.

**Solution:** Consistent extraction pipeline for all caption models:

```python
def extract_tags_from_caption(caption: str) -> list[tuple[str, float]]:
    """
    Extract tags from caption text with estimated confidence.

    1. Tokenize into words and 2-word phrases
    2. Apply consistent stoplist (articles, prepositions, etc.)
    3. Preserve meaningful phrases ("peeling paint", "broken window")
    4. Estimate confidence from word position and frequency
    """
    # Stoplist: words to always remove
    STOPLIST = {
        'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been',
        'this', 'that', 'these', 'those', 'it', 'its',
        'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'from',
        'and', 'or', 'but', 'as', 'if', 'than', 'so',
        'image', 'photo', 'photograph', 'picture', 'shows', 'appears',
        'can', 'see', 'seen', 'visible', 'there', 'here',
    }

    # Preserve phrases that match urbex vocabulary
    PRESERVE_PHRASES = {
        'peeling paint', 'broken window', 'water damage', 'fire damage',
        'art deco', 'mid century', 'stained glass', 'spiral staircase',
        # ... pull from urbex-taxonomy.ts
    }
```

### Step 6: Failure Handling

| Scenario | Behavior |
|----------|----------|
| Model timeout (60s) | Mark as `TIMEOUT`, continue with other models |
| Model crashes | Mark as `ERROR: {message}`, continue |
| Empty output | Mark as `NO_TAGS`, include in summary |
| Model not installed | Mark as `SKIPPED`, suggest install command |

Output example:
```
┌─────────────────────────────────────────────────────────────────┐
│ BLIP-2 - ERROR                                                  │
├─────────────────────────────────────────────────────────────────┤
│ Status: TIMEOUT after 60000ms                                   │
│ Suggestion: Try --timeout 120 or check GPU memory               │
└─────────────────────────────────────────────────────────────────┘
```

### Step 7: CLI Flags (Updated)

```bash
python scripts/ml_tag_analyzer.py \
  --image photo.jpg \
  --models all \              # or: rampp,florence,clip
  --output table \            # table, json, csv
  --timeout 60 \              # per-model timeout (seconds)
  --warmup \                  # run warm-up inference first (accurate timing)
  --show-matrix \             # include tag overlap matrix
  --show-timing \             # include timing breakdown
  --show-confidence TAG \     # show confidence comparison for specific tag
  --top N \                   # show top N consensus tags (default: 10)
  --threshold 0.5 \           # minimum confidence to include tag
  --verbose                   # show model loading progress
```

### Step 8: Testing Protocol

1. Run on 5-10 sample images from actual archive
2. Compare output quality across models
3. Document which model performs best for urbex content
4. Identify any models that consistently fail or timeout

---

## Phase 5: Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Model download fails | Medium | High | Provide manual download instructions |
| MPS compatibility issues | Medium | Medium | Fallback to CPU mode |
| VRAM exhaustion | High | Medium | Load/unload models sequentially |
| Slow batch processing | High | Low | Add progress bar, parallel option |
| Model produces garbage | Low | Medium | Include model health check |

---

## Phase 6: CLAUDE.md Compliance Check

| Rule | Compliance | Notes |
|------|------------|-------|
| Rule 1: Scope Discipline | **PASS** | Tool is self-contained, doesn't modify archive |
| Rule 5: One Script = One Function | **NEEDS SPLIT** | Main CLI + separate analyzer modules |
| Rule 8: Binary Dependencies Welcome | **PASS** | ONNX, model weights acceptable |
| Rule 9: Local LLMs for background | **PASS** | All inference is local |
| Rule 10: Verify Build Before Done | **N/A** | Python script, no build step |
| lilbits.md | **UPDATE NEEDED** | Must add entry after implementation |

---

## Phase 7: Estimated Effort (Final - 8 Models)

| Task | Complexity | Est. Lines |
|------|------------|------------|
| Base analyzer class | Low | ~60 |
| RAM++ analyzer | Low | ~80 (wrapper) |
| **InternVL3 analyzer** | Medium | ~120 (new) |
| **Qwen2.5-VL analyzer** | Medium | ~120 (upgrade from 2.0) |
| Florence-2 analyzer | Low | ~80 (wrapper) |
| **MiniCPM-V analyzer** | Medium | ~120 (new) |
| CLIP analyzer | Medium | ~120 (with urbex-taxonomy categories) |
| WD14 analyzer | Medium | ~130 |
| **Moondream analyzer** | Low | ~80 (new, simple) |
| **Caption extraction util** | Medium | ~100 (consistent stoplist/phrase) |
| Main CLI | Medium | ~280 (more flags, 8 models) |
| **Enhanced output formatters** | Medium | ~250 (matrix, timing, consensus) |
| **Failure handling** | Low | ~60 |
| **Total** | | **~1600 lines** |

**Storage:** ~28GB model weights
**First run:** ~5-10 min to download all models
**Per-image time:** ~16-20 seconds (all 8 models parallel on M2 Ultra)

---

## User Decisions (Final)

1. **Model scope**: All 8 models (2025 SOTA lineup):
   - RAM++, InternVL3-8B, Qwen2.5-VL, Florence-2
   - MiniCPM-V 4.5, CLIP, WD14, Moondream

2. **Hardware**: M2 Ultra + 64GB unified memory
   - Strategy: Load all 8 models simultaneously (~28GB)
   - Processing: Parallel (all models on each image concurrently)

3. **Output**: Print to terminal only (no file saving by default)
   - User can redirect with `> output.json` if needed

4. **CLIP categories**: Pull from existing `urbex-taxonomy.ts` (~200 curated tags):
   - Building types: factory, hospital, school, prison, church, residential, warehouse, mill, hotel, theater, asylum, sanatorium...
   - Conditions: abandoned, decay, graffiti, overgrown, fire damage, water damage, collapsed, deteriorated, weathered...
   - Views: interior, exterior, aerial, detail
   - Features: machinery, equipment, furniture, staircase, hallway, window, columns, arches, skylight...
   - Eras: victorian, art deco, mid-century, brutalist, industrial revolution...

5. **Caption extraction**: Consistent stoplist + phrase preservation across InternVL3/Qwen2.5/Florence/MiniCPM/Moondream

6. **Failure handling**: Timeout, crash, empty output all handled gracefully

7. **Enhanced comparison output**:
   - Tag overlap matrix (which models agree)
   - Confidence comparison per tag
   - Timing breakdown (load vs inference)
   - Consensus tags (weighted score)

---

## Next Steps (Pending Approval)

1. [ ] User approves this plan
2. [ ] Clarify open questions above
3. [ ] Create `scripts/analyzers/` directory structure
4. [ ] Implement base class + RAM++ analyzer first
5. [ ] Test on 3 sample images
6. [ ] Add remaining analyzers one by one
7. [ ] Build CLI and output formatters
8. [ ] Full test on batch of images
9. [ ] Update lilbits.md with new script entry

---

## Sources

- [RAM++ GitHub](https://github.com/xinyu1205/recognize-anything)
- [Florence-2 on Hugging Face](https://huggingface.co/microsoft/Florence-2-large)
- [BLIP Models](https://huggingface.co/Salesforce/blip-image-captioning-base)
- [CLIP Interrogator](https://github.com/pharmapsychotic/clip-interrogator)
- [Image-to-Text Model Comparison](https://nednex.com/en/image-to-text-models-clip-blip-and-wd14/)
- [Florence-2 Overview](https://www.ultralytics.com/blog/florence-2-microsofts-latest-vision-language-model)
