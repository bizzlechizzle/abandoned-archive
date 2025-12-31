#!/usr/bin/env python3
"""
VLM Enhancer - Stage 2 Deep Image Analysis using Qwen2-VL

Provides rich image analysis including:
- Detailed descriptions
- Architectural style detection
- Construction period estimation
- Condition assessment
- Notable features extraction
- Search keyword generation

Usage:
    python vlm_enhancer.py --image /path/to/image.jpg
    python vlm_enhancer.py --image /path/to/image.jpg --view-type interior --location-type hospital

Requirements:
    - Python 3.12+
    - PyTorch with MPS/CUDA/CPU support
    - transformers >= 4.45.0
    - Pillow
    - accelerate

Setup:
    cd scripts/vlm-server
    python3.12 -m venv venv
    source venv/bin/activate
    pip install torch torchvision transformers accelerate pillow

@version 1.0
@see docs/plans/adaptive-brewing-cherny.md Phase 5
"""

import argparse
import json
import sys
import time
import re
from pathlib import Path
from typing import Optional

# Check for required dependencies
try:
    import torch
    from PIL import Image
    from transformers import Qwen2VLForConditionalGeneration, AutoProcessor
except ImportError as e:
    print(json.dumps({
        "error": f"Missing dependency: {e}. Run: pip install torch transformers accelerate pillow",
        "tags": [],
        "confidence": {}
    }))
    sys.exit(1)


# =============================================================================
# CONSTANTS
# =============================================================================

MODEL_ID = "Qwen/Qwen2-VL-7B-Instruct"

# Architectural styles for urbex contexts
ARCHITECTURAL_STYLES = [
    "Art Deco", "Art Nouveau", "Bauhaus", "Beaux-Arts", "Brutalist",
    "Colonial Revival", "Craftsman", "Federal", "Georgian", "Gothic Revival",
    "Greek Revival", "Industrial", "Italianate", "Mid-Century Modern",
    "Modernist", "Neo-Classical", "Post-Modern", "Prairie Style",
    "Queen Anne", "Romanesque Revival", "Tudor Revival", "Victorian"
]

# Condition assessment terms
CONDITION_TERMS = {
    "excellent": ["pristine", "well-maintained", "good condition", "intact"],
    "good": ["minor wear", "slight decay", "mostly intact", "preserved"],
    "fair": ["moderate decay", "some damage", "deteriorating", "weathered"],
    "poor": ["significant decay", "heavy damage", "collapsed areas", "unstable"],
    "critical": ["severe structural", "dangerous", "collapsing", "ruins"]
}


# =============================================================================
# MODEL LOADING
# =============================================================================

_model = None
_processor = None


def get_device() -> str:
    """Detect best available device."""
    if torch.backends.mps.is_available():
        return "mps"
    elif torch.cuda.is_available():
        return "cuda"
    return "cpu"


def load_model(device: Optional[str] = None):
    """Load Qwen2-VL model and processor."""
    global _model, _processor

    if _model is not None:
        return _model, _processor

    if device is None:
        device = get_device()

    print(f"[VLM] Loading {MODEL_ID} on {device}...", file=sys.stderr)
    start = time.time()

    try:
        # Load processor
        _processor = AutoProcessor.from_pretrained(MODEL_ID)

        # Load model with appropriate settings
        if device == "mps":
            _model = Qwen2VLForConditionalGeneration.from_pretrained(
                MODEL_ID,
                torch_dtype=torch.float16,
                device_map="auto",
                low_cpu_mem_usage=True,
            )
        elif device == "cuda":
            _model = Qwen2VLForConditionalGeneration.from_pretrained(
                MODEL_ID,
                torch_dtype=torch.bfloat16,
                device_map="auto",
            )
        else:
            _model = Qwen2VLForConditionalGeneration.from_pretrained(
                MODEL_ID,
                torch_dtype=torch.float32,
                device_map="cpu",
                low_cpu_mem_usage=True,
            )

        elapsed = time.time() - start
        print(f"[VLM] Model loaded in {elapsed:.1f}s", file=sys.stderr)

        return _model, _processor

    except Exception as e:
        print(f"[VLM] Failed to load model: {e}", file=sys.stderr)
        raise


# =============================================================================
# PROMPT BUILDING
# =============================================================================

def build_analysis_prompt(
    view_type: Optional[str] = None,
    location_type: Optional[str] = None,
    location_name: Optional[str] = None,
    state: Optional[str] = None,
    tags: Optional[list] = None
) -> str:
    """Build context-aware analysis prompt for VLM."""

    # Base context
    context_parts = []
    if location_name:
        context_parts.append(f"This is an image from '{location_name}'")
    if location_type:
        context_parts.append(f"an abandoned {location_type}")
    if state:
        context_parts.append(f"located in {state}")
    if view_type:
        context_parts.append(f"showing an {view_type} view")
    if tags:
        context_parts.append(f"Previous analysis detected: {', '.join(tags[:10])}")

    context = ". ".join(context_parts) + "." if context_parts else ""

    prompt = f"""Analyze this image of an abandoned location. {context}

Provide a detailed JSON response with the following structure:
{{
    "description": "A rich 2-3 sentence description of what you see",
    "caption": "A short alt-text caption (10-15 words)",
    "architectural_style": "Detected architectural style (e.g., Art Deco, Brutalist, Industrial) or null",
    "estimated_period": {{
        "start": 1920,
        "end": 1940,
        "confidence": 0.7,
        "reasoning": "Brief explanation of date clues"
    }},
    "condition_assessment": {{
        "overall": "excellent|good|fair|poor|critical",
        "score": 0.3,
        "details": "Description of decay/preservation state",
        "observations": ["specific observation 1", "specific observation 2"]
    }},
    "notable_features": ["feature1", "feature2", "feature3"],
    "search_keywords": ["keyword1", "keyword2", "keyword3"],
    "hazards": ["potential hazard 1", "potential hazard 2"]
}}

Focus on:
1. Architectural details and construction materials
2. Signs of age and decay
3. Historical elements and period-specific features
4. Safety considerations for explorers
5. Unique or notable characteristics

Return ONLY valid JSON, no additional text."""

    return prompt


# =============================================================================
# IMAGE ANALYSIS
# =============================================================================

def analyze_image(
    image_path: str,
    view_type: Optional[str] = None,
    location_type: Optional[str] = None,
    location_name: Optional[str] = None,
    state: Optional[str] = None,
    tags: Optional[list] = None,
    device: Optional[str] = None,
    max_tokens: int = 1024
) -> dict:
    """Analyze image using Qwen2-VL."""

    start_time = time.time()

    # Load model
    model, processor = load_model(device)
    device = get_device() if device is None else device

    # Load and prepare image
    image = Image.open(image_path).convert("RGB")

    # Build prompt
    prompt = build_analysis_prompt(
        view_type=view_type,
        location_type=location_type,
        location_name=location_name,
        state=state,
        tags=tags
    )

    # Prepare conversation format for Qwen2-VL
    messages = [
        {
            "role": "user",
            "content": [
                {"type": "image", "image": image},
                {"type": "text", "text": prompt}
            ]
        }
    ]

    # Process inputs
    text = processor.apply_chat_template(messages, tokenize=False, add_generation_prompt=True)
    inputs = processor(
        text=[text],
        images=[image],
        padding=True,
        return_tensors="pt"
    )
    inputs = inputs.to(model.device)

    # Generate response
    with torch.no_grad():
        generated_ids = model.generate(
            **inputs,
            max_new_tokens=max_tokens,
            do_sample=True,
            temperature=0.7,
            top_p=0.9,
        )

    # Decode response
    generated_ids_trimmed = [
        out_ids[len(in_ids):] for in_ids, out_ids in zip(inputs.input_ids, generated_ids)
    ]
    response_text = processor.batch_decode(
        generated_ids_trimmed,
        skip_special_tokens=True,
        clean_up_tokenization_spaces=False
    )[0]

    duration_ms = int((time.time() - start_time) * 1000)

    # Parse JSON response
    try:
        # Try to extract JSON from response
        json_match = re.search(r'\{[\s\S]*\}', response_text)
        if json_match:
            result = json.loads(json_match.group())
        else:
            result = {"description": response_text}
    except json.JSONDecodeError:
        result = {"description": response_text}

    # Ensure required fields
    result.setdefault("tags", [])
    result.setdefault("confidence", {})
    result.setdefault("description", "")
    result.setdefault("caption", "")

    # Extract tags from notable_features and search_keywords if present
    all_tags = list(result.get("notable_features", [])) + list(result.get("search_keywords", []))
    result["tags"] = list(set(all_tags))[:20]

    # Set confidence for all tags
    result["confidence"] = {tag: 0.85 for tag in result["tags"]}

    # Add metadata
    result["duration_ms"] = duration_ms
    result["model"] = "qwen2-vl-7b"
    result["device"] = device

    return result


# =============================================================================
# CLI
# =============================================================================

def main():
    parser = argparse.ArgumentParser(description="VLM deep image analysis using Qwen2-VL")
    parser.add_argument("--image", required=True, help="Path to image file")
    parser.add_argument("--view-type", help="View type from Stage 0 (interior/exterior/aerial/detail)")
    parser.add_argument("--location-type", help="Location type (hospital, factory, school, etc.)")
    parser.add_argument("--location-name", help="Name of the location")
    parser.add_argument("--state", help="US state")
    parser.add_argument("--tags", help="Comma-separated tags from Stage 1")
    parser.add_argument("--device", choices=["mps", "cuda", "cpu"], help="Device to use")
    parser.add_argument("--max-tokens", type=int, default=1024, help="Max tokens to generate")
    parser.add_argument("--output", choices=["json", "text"], default="json", help="Output format")

    args = parser.parse_args()

    # Validate image path
    image_path = Path(args.image)
    if not image_path.exists():
        print(json.dumps({"error": f"Image not found: {args.image}", "tags": [], "confidence": {}}))
        sys.exit(1)

    # Parse tags
    tags = args.tags.split(",") if args.tags else None

    try:
        result = analyze_image(
            image_path=str(image_path),
            view_type=args.view_type,
            location_type=args.location_type,
            location_name=args.location_name,
            state=args.state,
            tags=tags,
            device=args.device,
            max_tokens=args.max_tokens
        )

        if args.output == "json":
            print(json.dumps(result, indent=2))
        else:
            print(f"Description: {result.get('description', 'N/A')}")
            print(f"Caption: {result.get('caption', 'N/A')}")
            print(f"Architectural Style: {result.get('architectural_style', 'N/A')}")
            if result.get("estimated_period"):
                period = result["estimated_period"]
                print(f"Estimated Period: {period.get('start', '?')}-{period.get('end', '?')} "
                      f"(confidence: {period.get('confidence', 0):.0%})")
            if result.get("condition_assessment"):
                cond = result["condition_assessment"]
                print(f"Condition: {cond.get('overall', 'N/A')} ({cond.get('score', 0):.0%})")
            print(f"Tags: {', '.join(result.get('tags', []))}")
            print(f"Duration: {result.get('duration_ms', 0)}ms")

    except Exception as e:
        print(json.dumps({
            "error": str(e),
            "tags": [],
            "confidence": {}
        }))
        sys.exit(1)


if __name__ == "__main__":
    main()
