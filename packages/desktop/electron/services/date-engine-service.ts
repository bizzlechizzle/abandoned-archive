/**
 * Date Engine Service
 * NLP-based date extraction using chrono-node with historical bias for urbex context
 */

import * as chrono from 'chrono-node';
import type { ParsedResult, ParsingResult, Refiner } from 'chrono-node';
import {
  type DateCategory,
  type DatePrecision,
  type ExtractionResult,
  type SentencePositionType,
  CATEGORY_KEYWORDS,
  AUTO_APPROVE_CATEGORIES,
  AUTO_APPROVE_MIN_CONFIDENCE,
} from '@au-archive/core';
import { parseDate as parseDateFromService, type ParsedDate } from './date-parser-service';

// =============================================================================
// Historical Bias Refiner
// =============================================================================

/**
 * Custom chrono refiner that biases ambiguous 2-digit years toward 1900s
 * For urbex context, "25" should mean 1925, not 2025
 */
function createHistoricalBiasRefiner(): Refiner {
  return {
    refine: (context: { text: string }, results: ParsedResult[]): ParsedResult[] => {
      for (const result of results) {
        const year = result.start.get('year');

        // Check if this looks like a 2-digit year that was auto-expanded to 2000s
        if (year && year >= 2020 && year <= 2099) {
          // Look for the original 2-digit year in the matched text
          const twoDigitMatch = result.text.match(/\b(\d{2})\b/);
          if (twoDigitMatch) {
            const twoDigit = parseInt(twoDigitMatch[1], 10);
            // Only adjust years 20-99 to 1920-1999
            if (twoDigit >= 20 && twoDigit <= 99) {
              result.start.assign('year', 1900 + twoDigit);
              // Tag this result as having century bias applied
              (result as any)._centuryBiasApplied = true;
              (result as any)._originalYearAmbiguous = true;
            }
          }
        }

        // Also check for ranges
        if (result.end) {
          const endYear = result.end.get('year');
          if (endYear && endYear >= 2020 && endYear <= 2099) {
            const twoDigitMatch = result.text.match(/\b(\d{2})\b/g);
            if (twoDigitMatch && twoDigitMatch.length > 1) {
              const twoDigit = parseInt(twoDigitMatch[1], 10);
              if (twoDigit >= 20 && twoDigit <= 99) {
                result.end.assign('year', 1900 + twoDigit);
              }
            }
          }
        }
      }
      return results;
    },
  };
}

// Create a custom chrono parser with historical bias
const historicalChrono = chrono.casual.clone();
historicalChrono.refiners.push(createHistoricalBiasRefiner());

// =============================================================================
// Sentence Extraction
// =============================================================================

/**
 * Extract the sentence containing a date from text
 * @param text Full text
 * @param dateIndex Starting index of the date in text
 * @returns The sentence containing the date
 */
export function extractSentence(text: string, dateIndex: number): string {
  // Common sentence terminators
  const terminators = /[.!?]\s+|[\n\r]{2,}/g;

  // Find sentence start (look backwards for terminator)
  let sentenceStart = 0;
  let lastEnd = 0;
  let match;

  // Reset regex
  terminators.lastIndex = 0;

  while ((match = terminators.exec(text)) !== null) {
    if (match.index + match[0].length <= dateIndex) {
      sentenceStart = match.index + match[0].length;
      lastEnd = match.index;
    } else {
      break;
    }
  }

  // Find sentence end (look forwards for terminator)
  terminators.lastIndex = dateIndex;
  const endMatch = terminators.exec(text);
  const sentenceEnd = endMatch ? endMatch.index + 1 : text.length;

  // Extract and clean sentence
  let sentence = text.slice(sentenceStart, sentenceEnd).trim();

  // Limit sentence length
  if (sentence.length > 500) {
    // Try to find a natural break point
    const halfIndex = Math.floor(sentence.length / 2);
    const relativeDate = dateIndex - sentenceStart;

    if (relativeDate < halfIndex) {
      sentence = sentence.slice(0, 500) + '...';
    } else {
      sentence = '...' + sentence.slice(-500);
    }
  }

  return sentence;
}

/**
 * Determine the position type of a date within a sentence
 */
export function getSentencePositionType(
  sentenceLength: number,
  datePosition: number
): SentencePositionType {
  const relative = datePosition / sentenceLength;
  if (relative <= 0.33) return 'beginning';
  if (relative <= 0.66) return 'middle';
  return 'end';
}

// =============================================================================
// Category Detection
// =============================================================================

/**
 * Detect the category of a date based on keyword proximity in the sentence
 * @param sentence The sentence containing the date
 * @param datePosition Position of the date in the sentence
 * @returns Category, confidence, and matched keywords
 */
export function detectCategory(
  sentence: string,
  datePosition: number
): { category: DateCategory; confidence: number; keywords: string[]; distance: number | null } {
  const lowerSentence = sentence.toLowerCase();

  let bestCategory: DateCategory = 'unknown';
  let bestConfidence = 0;
  let bestKeywords: string[] = [];
  let bestDistance: number | null = null;

  for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS) as [DateCategory, string[]][]) {
    if (category === 'unknown') continue;

    let categoryScore = 0;
    const matchedKeywords: string[] = [];
    let closestDistance: number | null = null;

    for (const keyword of keywords) {
      const keywordLower = keyword.toLowerCase();
      const keywordIndex = lowerSentence.indexOf(keywordLower);

      if (keywordIndex !== -1) {
        matchedKeywords.push(keyword);

        // Calculate distance from keyword to date
        const distance = Math.abs(keywordIndex - datePosition);
        if (closestDistance === null || distance < closestDistance) {
          closestDistance = distance;
        }

        // Score based on proximity (closer = better)
        let proximityScore: number;
        if (distance <= 10) {
          proximityScore = 1.0;
        } else if (distance <= 30) {
          proximityScore = 0.8;
        } else if (distance <= 50) {
          proximityScore = 0.5;
        } else {
          proximityScore = 0.2;
        }

        categoryScore += proximityScore;
      }
    }

    if (categoryScore > bestConfidence) {
      bestConfidence = categoryScore;
      bestCategory = category;
      bestKeywords = matchedKeywords;
      bestDistance = closestDistance;
    }
  }

  // Normalize confidence to 0-1 range
  const normalizedConfidence = Math.min(bestConfidence / 3, 1);

  return {
    category: bestCategory,
    confidence: normalizedConfidence,
    keywords: bestKeywords,
    distance: bestDistance,
  };
}

// =============================================================================
// Confidence Scoring
// =============================================================================

/**
 * Calculate overall confidence score from multiple factors
 */
export function calculateOverallConfidence(
  keywordDistance: number | null,
  sentencePositionType: SentencePositionType,
  categoryConfidence: number,
  parserConfidence: number
): number {
  // Weight factors (must sum to 1.0)
  const KEYWORD_DISTANCE_WEIGHT = 0.3;
  const SENTENCE_POSITION_WEIGHT = 0.2;
  const CATEGORY_CONFIDENCE_WEIGHT = 0.3;
  const PARSER_CONFIDENCE_WEIGHT = 0.2;

  // Calculate keyword distance score (0-1)
  let keywordDistanceScore = 0;
  if (keywordDistance !== null) {
    if (keywordDistance <= 10) {
      keywordDistanceScore = 1.0;
    } else if (keywordDistance <= 50) {
      keywordDistanceScore = 0.5;
    } else {
      keywordDistanceScore = 0.2;
    }
  }

  // Calculate sentence position score (0-1)
  let positionScore = 0.5;
  switch (sentencePositionType) {
    case 'beginning':
      positionScore = 1.0;
      break;
    case 'middle':
      positionScore = 0.7;
      break;
    case 'end':
      positionScore = 0.5;
      break;
  }

  // Combine scores
  const overall =
    keywordDistanceScore * KEYWORD_DISTANCE_WEIGHT +
    positionScore * SENTENCE_POSITION_WEIGHT +
    categoryConfidence * CATEGORY_CONFIDENCE_WEIGHT +
    parserConfidence * PARSER_CONFIDENCE_WEIGHT;

  return Math.round(overall * 100) / 100;
}

// =============================================================================
// Date Parsing & Conversion
// =============================================================================

/**
 * Convert chrono result to our date precision
 */
function chronoToPrecision(result: ParsedResult): DatePrecision {
  const hasDay = result.start.get('day') !== null;
  const hasMonth = result.start.get('month') !== null;
  const hasYear = result.start.get('year') !== null;

  if (result.end) {
    return 'range';
  }

  if (hasYear && hasMonth && hasDay) {
    return 'exact';
  } else if (hasYear && hasMonth) {
    return 'month';
  } else if (hasYear) {
    return 'year';
  }

  return 'unknown';
}

/**
 * Format a chrono result component to ISO date string
 */
function formatChronoDate(result: ParsedResult, useEnd = false): string | null {
  const component = useEnd && result.end ? result.end : result.start;

  const year = component.get('year');
  const month = component.get('month');
  const day = component.get('day');

  if (year === null) return null;

  if (month === null) {
    return year.toString();
  }

  const mm = month.toString().padStart(2, '0');

  if (day === null) {
    return `${year}-${mm}`;
  }

  const dd = day.toString().padStart(2, '0');
  return `${year}-${mm}-${dd}`;
}

/**
 * Generate EDTF (Extended Date/Time Format) string
 */
function toEdtf(precision: DatePrecision, dateStart: string | null, dateEnd: string | null): string {
  switch (precision) {
    case 'exact':
    case 'month':
    case 'year':
      return dateStart || '';
    case 'range':
      return dateStart && dateEnd ? `${dateStart}/${dateEnd}` : '';
    default:
      return '';
  }
}

/**
 * Calculate sort value for a date (YYYYMMDD format)
 */
function calculateDateSort(dateStart: string | null): number | null {
  if (!dateStart) return null;

  // Try to parse as ISO date
  if (dateStart.match(/^\d{4}-\d{2}-\d{2}$/)) {
    return parseInt(dateStart.replace(/-/g, ''), 10);
  } else if (dateStart.match(/^\d{4}-\d{2}$/)) {
    return parseInt(dateStart.replace(/-/g, '') + '01', 10);
  } else if (dateStart.match(/^\d{4}$/)) {
    return parseInt(dateStart + '0101', 10);
  }

  return null;
}

// =============================================================================
// Main Extraction Function
// =============================================================================

/**
 * Extract dates from text using chrono-node with historical bias
 * @param text Full text to extract dates from
 * @param articleDate Optional article publication date for relative date anchoring
 * @returns Array of extraction results
 */
export function extractDates(
  text: string,
  articleDate?: string | null
): ExtractionResult[] {
  const results: ExtractionResult[] = [];

  // Use article date as reference for relative dates
  const referenceDate = articleDate
    ? new Date(articleDate)
    : new Date();

  // Parse with chrono using historical bias
  const chronoResults = historicalChrono.parse(text, referenceDate, {
    forwardDate: false, // Don't prefer future dates
  });

  for (const result of chronoResults) {
    // Extract sentence containing this date
    const sentence = extractSentence(text, result.index);
    const sentencePosition = result.index;

    // Get relative position within sentence
    const localPosition = result.index - (text.indexOf(sentence) >= 0 ? text.indexOf(sentence) : 0);
    const positionType = getSentencePositionType(sentence.length, localPosition);

    // Detect category based on keywords
    const categoryResult = detectCategory(sentence, localPosition);

    // Convert to our format
    const precision = chronoToPrecision(result);
    const dateStart = formatChronoDate(result);
    const dateEnd = result.end ? formatChronoDate(result, true) : null;

    // Check for relative date markers
    const wasRelativeDate = Boolean(
      (result as any).tags?.relative ||
      result.text.match(/\b(ago|last|next|yesterday|tomorrow|recently)\b/i)
    );

    // Use date-parser-service for display formatting
    const parsedDisplay = parseDateFromService(result.text);

    // Calculate overall confidence
    const parserConfidence = 1.0; // chrono doesn't provide confidence, assume high
    const overallConfidence = calculateOverallConfidence(
      categoryResult.distance,
      positionType,
      categoryResult.confidence,
      parserConfidence
    );

    results.push({
      raw_text: result.text,
      parsed_date: dateStart,
      date_start: dateStart,
      date_end: dateEnd,
      date_precision: precision,
      date_display: parsedDisplay.display,
      date_edtf: toEdtf(precision, dateStart, dateEnd),
      date_sort: calculateDateSort(dateStart),
      sentence,
      sentence_position: sentencePosition,
      category: categoryResult.category,
      category_confidence: categoryResult.confidence,
      category_keywords: categoryResult.keywords,
      keyword_distance: categoryResult.distance,
      sentence_position_type: positionType,
      parser_confidence: parserConfidence,
      century_bias_applied: Boolean((result as any)._centuryBiasApplied),
      original_year_ambiguous: Boolean((result as any)._originalYearAmbiguous),
      was_relative_date: wasRelativeDate,
      relative_date_anchor: wasRelativeDate ? articleDate || null : null,
      overall_confidence: overallConfidence,
    });
  }

  return results;
}

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Check if an extraction should be auto-approved
 */
export function shouldAutoApprove(
  category: DateCategory,
  overallConfidence: number
): boolean {
  return (
    AUTO_APPROVE_CATEGORIES.includes(category) &&
    overallConfidence >= AUTO_APPROVE_MIN_CONFIDENCE
  );
}

/**
 * Get auto-approve reason text
 */
export function getAutoApproveReason(
  category: DateCategory,
  confidence: number
): string {
  return `Category "${category}" with confidence ${(confidence * 100).toFixed(0)}% meets auto-approval threshold`;
}

/**
 * Test a regex pattern against sample text
 * Returns extracted dates or error
 */
export function testPattern(
  pattern: string,
  testText: string
): { success: boolean; matches: string[]; error?: string } {
  try {
    const regex = new RegExp(pattern, 'gi');
    const matches: string[] = [];
    let match;

    // Prevent ReDoS with timeout
    const startTime = Date.now();
    const TIMEOUT_MS = 1000;

    while ((match = regex.exec(testText)) !== null) {
      if (Date.now() - startTime > TIMEOUT_MS) {
        return {
          success: false,
          matches: [],
          error: 'Pattern execution timed out (possible ReDoS)',
        };
      }
      matches.push(match[0]);
    }

    return { success: true, matches };
  } catch (error) {
    return {
      success: false,
      matches: [],
      error: error instanceof Error ? error.message : 'Invalid regex pattern',
    };
  }
}

/**
 * Validate a regex pattern
 */
export function validatePattern(pattern: string): { valid: boolean; error?: string } {
  if (pattern.length > 500) {
    return { valid: false, error: 'Pattern exceeds maximum length of 500 characters' };
  }

  try {
    new RegExp(pattern);
    return { valid: true };
  } catch (error) {
    return {
      valid: false,
      error: error instanceof Error ? error.message : 'Invalid regex pattern',
    };
  }
}
