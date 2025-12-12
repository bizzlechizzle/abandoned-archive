#!/usr/bin/env python3
"""
extract-text.py - OPT-115 Text Extraction Service

Comprehensive text extraction from HTML using multiple strategies:
1. Trafilatura (main article content, metadata)
2. BeautifulSoup (structured extraction)
3. Readability (fallback for article detection)

Usage:
    python3 scripts/extract-text.py <html_file> [--output json|text|all]
    python3 scripts/extract-text.py --stdin [--output json|text|all]

Returns JSON with extracted content, or plain text if --output text.

Dependencies:
    pip3 install trafilatura beautifulsoup4 lxml readability-lxml

Lines: ~280
"""

import sys
import json
import argparse
from pathlib import Path
from typing import Optional
from dataclasses import dataclass, asdict

# Lazy imports to avoid startup cost when not needed
def get_trafilatura():
    try:
        import trafilatura
        return trafilatura
    except ImportError:
        return None

def get_beautifulsoup():
    try:
        from bs4 import BeautifulSoup
        return BeautifulSoup
    except ImportError:
        return None

def get_readability():
    try:
        from readability import Document
        return Document
    except ImportError:
        return None


@dataclass
class ExtractedMetadata:
    """Metadata extracted from the page."""
    title: Optional[str] = None
    author: Optional[str] = None
    date: Optional[str] = None
    description: Optional[str] = None
    sitename: Optional[str] = None
    categories: list = None
    tags: list = None
    language: Optional[str] = None


@dataclass
class ExtractionResult:
    """Complete extraction result."""
    success: bool
    text: Optional[str] = None
    word_count: int = 0
    metadata: Optional[ExtractedMetadata] = None
    method: Optional[str] = None
    error: Optional[str] = None
    # Additional content
    title_extracted: Optional[str] = None
    headings: list = None
    links: list = None
    images: list = None


def extract_with_trafilatura(html: str) -> ExtractionResult:
    """Extract text using Trafilatura - best for articles."""
    trafilatura = get_trafilatura()
    if not trafilatura:
        return ExtractionResult(success=False, error="trafilatura not installed")

    try:
        # Extract main content
        text = trafilatura.extract(
            html,
            include_links=False,
            include_images=False,
            include_tables=True,
            no_fallback=False,
            favor_precision=True,
        )

        if not text:
            return ExtractionResult(success=False, error="trafilatura returned empty")

        # Extract metadata
        meta = trafilatura.extract_metadata(html)
        metadata = None
        if meta:
            metadata = ExtractedMetadata(
                title=meta.title,
                author=meta.author,
                date=meta.date,
                description=meta.description,
                sitename=meta.sitename,
                categories=list(meta.categories) if meta.categories else None,
                tags=list(meta.tags) if meta.tags else None,
                language=meta.language,
            )

        words = text.split()
        return ExtractionResult(
            success=True,
            text=text,
            word_count=len(words),
            metadata=metadata,
            method="trafilatura",
            title_extracted=meta.title if meta else None,
        )
    except Exception as e:
        return ExtractionResult(success=False, error=f"trafilatura error: {str(e)}")


def extract_with_beautifulsoup(html: str) -> ExtractionResult:
    """Extract text using BeautifulSoup - structured extraction."""
    BeautifulSoup = get_beautifulsoup()
    if not BeautifulSoup:
        return ExtractionResult(success=False, error="beautifulsoup4 not installed")

    try:
        soup = BeautifulSoup(html, 'lxml')

        # Remove unwanted elements
        for element in soup.find_all(['script', 'style', 'nav', 'header', 'footer',
                                       'aside', 'noscript', 'iframe', 'svg']):
            element.decompose()

        # Extract title
        title = None
        title_tag = soup.find('title')
        if title_tag:
            title = title_tag.get_text(strip=True)

        # Extract headings
        headings = []
        for h in soup.find_all(['h1', 'h2', 'h3', 'h4', 'h5', 'h6']):
            headings.append({
                'level': int(h.name[1]),
                'text': h.get_text(strip=True)[:200]
            })

        # Extract links
        links = []
        for a in soup.find_all('a', href=True):
            href = a.get('href', '')
            if href and not href.startswith('#') and not href.startswith('javascript:'):
                links.append({
                    'url': href,
                    'text': a.get_text(strip=True)[:200]
                })

        # Extract images
        images = []
        for img in soup.find_all('img', src=True):
            images.append({
                'url': img.get('src', ''),
                'alt': img.get('alt', '')[:200] if img.get('alt') else None
            })

        # Extract main text from body
        body = soup.find('body')
        if body:
            # Try to find main content area
            main = body.find('main') or body.find('article') or body.find(id='content')
            text_source = main if main else body
            text = text_source.get_text(separator=' ', strip=True)
        else:
            text = soup.get_text(separator=' ', strip=True)

        # Clean up whitespace
        import re
        text = re.sub(r'\s+', ' ', text).strip()

        words = text.split()
        return ExtractionResult(
            success=True,
            text=text,
            word_count=len(words),
            method="beautifulsoup",
            title_extracted=title,
            headings=headings[:50],  # Limit to 50 headings
            links=links[:500],  # Limit to 500 links
            images=images[:100],  # Limit to 100 images
        )
    except Exception as e:
        return ExtractionResult(success=False, error=f"beautifulsoup error: {str(e)}")


def extract_with_readability(html: str) -> ExtractionResult:
    """Extract text using Readability - article-focused fallback."""
    Document = get_readability()
    BeautifulSoup = get_beautifulsoup()

    if not Document:
        return ExtractionResult(success=False, error="readability-lxml not installed")
    if not BeautifulSoup:
        return ExtractionResult(success=False, error="beautifulsoup4 not installed")

    try:
        doc = Document(html)
        content = doc.summary()
        title = doc.title()

        # Parse the cleaned content
        soup = BeautifulSoup(content, 'lxml')
        text = soup.get_text(separator=' ', strip=True)

        import re
        text = re.sub(r'\s+', ' ', text).strip()

        words = text.split()
        return ExtractionResult(
            success=True,
            text=text,
            word_count=len(words),
            method="readability",
            title_extracted=title,
        )
    except Exception as e:
        return ExtractionResult(success=False, error=f"readability error: {str(e)}")


def extract_text(html: str) -> ExtractionResult:
    """
    Extract text using multiple strategies, preferring Trafilatura.
    Falls back through methods if primary fails.
    """
    # Strategy 1: Trafilatura (best for articles)
    result = extract_with_trafilatura(html)
    if result.success and result.word_count > 50:
        return result

    # Strategy 2: Readability (article detection)
    result_readability = extract_with_readability(html)
    if result_readability.success and result_readability.word_count > 50:
        return result_readability

    # Strategy 3: BeautifulSoup (structured extraction)
    result_bs = extract_with_beautifulsoup(html)
    if result_bs.success:
        return result_bs

    # If Trafilatura partially worked, use it
    if result.success:
        return result

    # Return error from first attempt
    return result


def main():
    parser = argparse.ArgumentParser(
        description='Extract text from HTML using multiple strategies'
    )
    parser.add_argument('file', nargs='?', help='HTML file to process')
    parser.add_argument('--stdin', action='store_true', help='Read HTML from stdin')
    parser.add_argument('--output', choices=['json', 'text', 'all'], default='json',
                        help='Output format (default: json)')

    args = parser.parse_args()

    # Read HTML
    if args.stdin:
        html = sys.stdin.read()
    elif args.file:
        html = Path(args.file).read_text(encoding='utf-8')
    else:
        parser.print_help()
        sys.exit(1)

    # Extract
    result = extract_text(html)

    # Output
    if args.output == 'text':
        if result.success:
            print(result.text)
        else:
            print(f"Error: {result.error}", file=sys.stderr)
            sys.exit(1)
    elif args.output == 'all':
        # Include all extraction methods for comparison
        results = {
            'trafilatura': asdict(extract_with_trafilatura(html)),
            'beautifulsoup': asdict(extract_with_beautifulsoup(html)),
            'readability': asdict(extract_with_readability(html)),
            'preferred': asdict(result),
        }
        print(json.dumps(results, indent=2, default=str))
    else:
        # Convert to dict, handling dataclasses
        output = asdict(result)
        if result.metadata:
            output['metadata'] = asdict(result.metadata)
        print(json.dumps(output, indent=2, default=str))


if __name__ == '__main__':
    main()
