# VLM Server - Qwen2-VL Deep Image Analysis

Stage 2 deep image analysis for high-value images using Qwen2-VL 7B.

## Requirements

- Python 3.12+
- 16GB+ RAM recommended
- MPS (Apple Silicon) or CUDA GPU recommended
- ~7GB disk space for model weights

## Setup

```bash
cd scripts/vlm-server
python3.12 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

Model downloads automatically on first use (~7GB).

## Usage

```bash
source venv/bin/activate
python ../vlm_enhancer.py --image /path/to/image.jpg
```

With context from earlier pipeline stages:

```bash
python ../vlm_enhancer.py \
  --image /path/to/image.jpg \
  --view-type interior \
  --location-type hospital \
  --location-name "Abandoned Memorial Hospital" \
  --state "New York" \
  --tags "decay,graffiti,medical"
```

## Output

Returns structured JSON with:
- `description`: Rich 2-3 sentence description
- `caption`: Short alt-text caption
- `architectural_style`: Detected style (Art Deco, Industrial, etc.)
- `estimated_period`: Construction period estimation with reasoning
- `condition_assessment`: Decay/preservation state
- `notable_features`: Unique characteristics
- `search_keywords`: Indexing terms
- `hazards`: Safety considerations

## Integration

Called by AIService (`ai-service.ts`) when model `python/qwen2-vl-7b` is requested.
