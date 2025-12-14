/**
 * Agent Prompt Templates
 *
 * Carefully crafted prompts for the two specialized extraction agents:
 * 1. Date Extraction Agent - Extracts dates with category and confidence
 * 2. Summary/Title Agent - Generates titles and summaries
 *
 * Key design decisions:
 * - Explicit JSON schema in prompts
 * - Few-shot examples for consistency
 * - Clear rules about what to extract vs ignore
 * - Historical context awareness for urbex documents
 *
 * @version 1.0
 */

import type {
  ExtractedDate,
  ExtractedPerson,
  ExtractedOrganization,
  ExtractedLocation,
  ExtractedSummary,
  ExtractionResult,
  DateCategory,
  DatePrecision,
  PersonRole,
  OrganizationType,
  LocationRefType,
} from '../extraction-types';

// =============================================================================
// DATE EXTRACTION AGENT PROMPT
// =============================================================================

/**
 * System prompt for the date extraction agent
 */
export const DATE_EXTRACTION_SYSTEM_PROMPT = `You are an expert historian specializing in extracting dates from historical documents about abandoned places, buildings, and urban exploration.

Your task is to find ALL dates mentioned in documents and categorize them correctly. You understand that:
- "built in 1923" is a BUILD_DATE
- "closed in 2008" is a CLOSURE date
- "visited on Saturday" is a VISIT date
- "published April 2025" is a PUBLICATION date
- Numbers like "110 to 130 employees" are NOT dates
- Measurements like "50 feet" are NOT dates
- Phone numbers and addresses are NOT dates

You return ONLY valid JSON matching the exact schema provided. No explanations or commentary.`;

/**
 * Main prompt template for date extraction
 */
export const DATE_EXTRACTION_PROMPT = `Extract ALL dates from this document about an abandoned/historical location.

## DOCUMENT:
---
{text}
---

## REQUIRED OUTPUT FORMAT (JSON):
{
  "dates": [
    {
      "rawText": "exact quote from document containing the date",
      "parsedDate": "YYYY-MM-DD or YYYY-MM or YYYY",
      "parsedDateEnd": "YYYY-MM-DD for ranges, otherwise null",
      "precision": "exact|month|year|decade|approximate",
      "category": "build_date|opening|closure|demolition|visit|publication|renovation|event|unknown",
      "confidence": 0.0 to 1.0,
      "context": "the full sentence containing this date",
      "isApproximate": true or false
    }
  ]
}

## EXTRACTION RULES:

### What IS a date:
- Full dates: "March 15, 1968", "03/15/1968", "1968-03-15"
- Month + Year: "March 1968", "Sept. 1923"
- Year with context: "built in 1923", "closed 2008"
- Approximate: "circa 1920", "late 1800s", "the 1920s"
- Ranges: "from 1920 to 1940", "1920-1940"

### What is NOT a date (DO NOT EXTRACT):
- Employee counts: "110 to 130 employees", "500 workers"
- Measurements: "50 feet", "1,500 square feet"
- Currency: "$1,923", "1,500 dollars"
- Times: "9:00 AM", "4:30 PM"
- Phone numbers: "555-1234"
- Route numbers: "Route 66", "Highway 1"
- Room/building numbers: "Room 123", "Building 5"
- Percentages: "50%"
- Coordinates: "42.1234, -73.5678"

### Category Keywords:
- build_date: built, constructed, erected, established, founded, completed, dating from
- opening: opened, inaugurated, grand opening, began operations
- closure: closed, shut down, abandoned, ceased operations, shuttered
- demolition: demolished, torn down, razed, destroyed, bulldozed
- visit: visited, explored, photographed, toured, expedition
- publication: published, posted, written, updated, article dated
- renovation: renovated, restored, refurbished, rebuilt
- event: fire, flood, accident, incident, disaster

### Confidence Scoring:
- 0.95-1.0: Explicit full date with clear context ("opened March 15, 1968")
- 0.80-0.94: Clear date with good context ("built in 1923")
- 0.60-0.79: Date with some context ("in 1923")
- 0.40-0.59: Ambiguous context or approximate ("around 1920")
- Below 0.40: Do not include - too uncertain

### Precision Levels:
- exact: Full date (YYYY-MM-DD)
- month: Month and year (YYYY-MM)
- year: Year only (YYYY)
- decade: Decade reference ("the 1920s")
- approximate: Circa, about, around

## EXAMPLES:

INPUT: "The Sterling Steel Factory was built in 1923. It employed 500 workers and closed in 2008."
OUTPUT:
{
  "dates": [
    {
      "rawText": "built in 1923",
      "parsedDate": "1923",
      "parsedDateEnd": null,
      "precision": "year",
      "category": "build_date",
      "confidence": 0.92,
      "context": "The Sterling Steel Factory was built in 1923.",
      "isApproximate": false
    },
    {
      "rawText": "closed in 2008",
      "parsedDate": "2008",
      "parsedDateEnd": null,
      "precision": "year",
      "category": "closure",
      "confidence": 0.90,
      "context": "It employed 500 workers and closed in 2008.",
      "isApproximate": false
    }
  ]
}
NOTE: "500 workers" is NOT a date - it's an employee count.

INPUT: "This Victorian mansion dates from the late 1800s, circa 1885. It was demolished in March 2010."
OUTPUT:
{
  "dates": [
    {
      "rawText": "late 1800s, circa 1885",
      "parsedDate": "1885",
      "parsedDateEnd": null,
      "precision": "approximate",
      "category": "build_date",
      "confidence": 0.75,
      "context": "This Victorian mansion dates from the late 1800s, circa 1885.",
      "isApproximate": true
    },
    {
      "rawText": "demolished in March 2010",
      "parsedDate": "2010-03",
      "parsedDateEnd": null,
      "precision": "month",
      "category": "demolition",
      "confidence": 0.95,
      "context": "It was demolished in March 2010.",
      "isApproximate": false
    }
  ]
}

Return ONLY the JSON object. No markdown, no explanation.`;

// =============================================================================
// SUMMARY/TITLE AGENT PROMPT
// =============================================================================

/**
 * System prompt for the summary/title agent
 */
export const SUMMARY_TITLE_SYSTEM_PROMPT = `You are an expert archivist and historian who creates concise, informative titles and summaries for documents about abandoned places, historical buildings, and urban exploration sites.

Your titles should be:
- Under 60 characters
- Descriptive and specific (not generic)
- Include the location type or name when known
- Focus on what makes this location notable

Your summaries should be:
- 2-3 sentences (50-150 words)
- Capture the key historical facts
- Mention dates, people, and organizations if relevant
- Written for researchers and historians

You return ONLY valid JSON matching the exact schema provided. No explanations or commentary.`;

/**
 * Main prompt template for summary/title generation
 */
export const SUMMARY_TITLE_PROMPT = `Generate a title and summary for this document about an abandoned/historical location.

## LOCATION NAME (if known): {locationName}

## DOCUMENT:
---
{text}
---

## REQUIRED OUTPUT FORMAT (JSON):
{
  "title": "Short descriptive title under 60 characters",
  "summary": "2-3 sentence summary of key facts (50-150 words)",
  "keyFacts": [
    "Specific fact 1",
    "Specific fact 2",
    "Specific fact 3"
  ],
  "confidence": 0.0 to 1.0
}

## TITLE GUIDELINES:
- Maximum 60 characters
- Include location type: "Factory", "Hospital", "School", etc.
- Include key identifier: name, city, or unique feature
- Focus on historical significance
- Avoid generic phrases like "An Abandoned Building"

Good titles:
- "Sterling Steel Factory: 85 Years of Industrial History"
- "Riverside State Hospital Closure (1923-2008)"
- "The Fall of Millbrook Textile Mill"
- "Lafayette Hills Asylum: A Photographic Record"

Bad titles:
- "Abandoned Place Article"
- "Old Building History"
- "Exploration Report"

## SUMMARY GUIDELINES:
- Start with what the location is/was
- Include key dates (construction, operation, closure)
- Mention notable people or organizations
- Note current state if described
- Use past tense for historical facts
- Be factual, not sensational

## KEY FACTS GUIDELINES:
- 3-5 specific, verifiable facts
- Each fact should be distinct
- Prioritize dates, numbers, names
- Avoid opinions or speculation

## CONFIDENCE SCORING:
- 0.90-1.0: Rich document with clear facts and dates
- 0.70-0.89: Good document with some key information
- 0.50-0.69: Limited information, basic summary possible
- Below 0.50: Very little usable content

## EXAMPLES:

INPUT (locationName: "Sterling Steel Factory"):
"The Sterling Steel Factory was built in 1923 by John Sterling. At its peak, it employed over 500 workers and produced steel for the automotive industry. The factory closed in 2008 due to foreign competition and has sat abandoned since. The main building still stands but is deteriorating rapidly."

OUTPUT:
{
  "title": "Sterling Steel Factory: From Industrial Giant to Abandonment",
  "summary": "The Sterling Steel Factory operated from 1923 to 2008, founded by John Sterling to serve the automotive industry. At its peak, the facility employed over 500 workers before closing due to foreign competition. The main building remains standing but continues to deteriorate.",
  "keyFacts": [
    "Founded in 1923 by John Sterling",
    "Employed over 500 workers at peak operation",
    "Produced steel for the automotive industry",
    "Closed in 2008 due to foreign competition",
    "Main building still standing but deteriorating"
  ],
  "confidence": 0.95
}

Return ONLY the JSON object. No markdown, no explanation.`;

// =============================================================================
// COMBINED EXTRACTION PROMPT (for single-pass extraction)
// =============================================================================

/**
 * Combined prompt for extracting both dates and summary in one pass
 * Use when you want to minimize API calls
 */
export const COMBINED_EXTRACTION_PROMPT = `Extract all dates and generate a summary for this document about an abandoned/historical location.

## LOCATION NAME (if known): {locationName}

## DOCUMENT:
---
{text}
---

## REQUIRED OUTPUT FORMAT (JSON):
{
  "dates": [
    {
      "rawText": "exact quote containing the date",
      "parsedDate": "YYYY-MM-DD or YYYY-MM or YYYY",
      "parsedDateEnd": "for ranges only, otherwise null",
      "precision": "exact|month|year|decade|approximate",
      "category": "build_date|opening|closure|demolition|visit|publication|renovation|event|unknown",
      "confidence": 0.0 to 1.0,
      "context": "the sentence containing this date",
      "isApproximate": true or false
    }
  ],
  "people": [
    {
      "name": "Full Name",
      "role": "owner|architect|developer|employee|founder|visitor|photographer|historian|unknown",
      "mentions": ["all name variations in text"],
      "confidence": 0.0 to 1.0
    }
  ],
  "organizations": [
    {
      "name": "Organization Name",
      "type": "company|government|school|hospital|church|nonprofit|military|unknown",
      "mentions": ["all name variations in text"],
      "confidence": 0.0 to 1.0
    }
  ],
  "locations": [
    {
      "name": "Location Name",
      "type": "city|state|country|address|landmark|region|neighborhood|unknown",
      "confidence": 0.0 to 1.0
    }
  ],
  "summaryData": {
    "title": "Short title under 60 chars",
    "summary": "2-3 sentence summary",
    "keyFacts": ["Fact 1", "Fact 2", "Fact 3"],
    "confidence": 0.0 to 1.0
  }
}

## IMPORTANT RULES:
1. Extract ONLY information explicitly stated in the document
2. Numbers like "500 workers", "50 feet", "$1,923" are NOT dates
3. Confidence scores must reflect how explicit the information is
4. If nothing found for a category, use empty array []
5. Focus on historical significance and verifiable facts

Return ONLY the JSON object. No markdown, no explanation.`;

// =============================================================================
// RESPONSE PARSING
// =============================================================================

/**
 * Parse the LLM's JSON response into our structured types
 * Handles common LLM mistakes: markdown blocks, trailing text, malformed JSON
 */
export function parseStructuredResponse(response: string): {
  dates: ExtractedDate[];
  people: ExtractedPerson[];
  organizations: ExtractedOrganization[];
  locations: ExtractedLocation[];
  summaryData?: ExtractedSummary;
  warnings: string[];
} {
  const warnings: string[] = [];
  let jsonStr = response.trim();

  // Step 1: Remove markdown code blocks
  const codeBlockMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlockMatch) {
    jsonStr = codeBlockMatch[1].trim();
  }

  // Step 2: Find JSON object boundaries
  const firstBrace = jsonStr.indexOf('{');
  const lastBrace = jsonStr.lastIndexOf('}');

  if (firstBrace === -1 || lastBrace === -1 || lastBrace < firstBrace) {
    warnings.push('No valid JSON object found in response');
    return emptyResult(warnings);
  }

  jsonStr = jsonStr.substring(firstBrace, lastBrace + 1);

  // Step 3: Fix common LLM JSON mistakes
  jsonStr = fixCommonJsonErrors(jsonStr);

  // Step 4: Parse with error recovery
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(jsonStr);
  } catch (e) {
    // Try to salvage partial data
    const partialResult = attemptPartialParse(jsonStr);
    if (partialResult) {
      warnings.push('JSON was malformed but partially recovered');
      parsed = partialResult;
    } else {
      warnings.push(`JSON parse failed: ${e instanceof Error ? e.message : 'unknown'}`);
      return emptyResult(warnings);
    }
  }

  // Step 5: Validate and normalize
  return normalizeResult(parsed, warnings);
}

/**
 * Fix common JSON errors that LLMs make
 */
function fixCommonJsonErrors(json: string): string {
  let fixed = json;

  // Remove JavaScript-style comments
  fixed = fixed.replace(/\/\/.*$/gm, '');
  fixed = fixed.replace(/\/\*[\s\S]*?\*\//g, '');

  // Remove trailing commas before } or ]
  fixed = fixed.replace(/,(\s*[}\]])/g, '$1');

  // Fix unquoted keys (common LLM mistake)
  fixed = fixed.replace(/(\{|,)\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*:/g, '$1"$2":');

  // Fix single quotes to double quotes (be careful with apostrophes in text)
  // Only replace quotes that are clearly string delimiters
  fixed = fixed.replace(/:\s*'([^']*?)'/g, ': "$1"');

  return fixed;
}

/**
 * Attempt to extract partial data from malformed JSON
 */
function attemptPartialParse(json: string): Record<string, unknown> | null {
  const result: Record<string, unknown> = {
    dates: [],
    people: [],
    organizations: [],
    locations: [],
  };

  const patterns: Record<string, RegExp> = {
    dates: /"dates"\s*:\s*\[([\s\S]*?)\]/,
    people: /"people"\s*:\s*\[([\s\S]*?)\]/,
    organizations: /"organizations"\s*:\s*\[([\s\S]*?)\]/,
    locations: /"locations"\s*:\s*\[([\s\S]*?)\]/,
    summaryData: /"summaryData"\s*:\s*(\{[\s\S]*?\})/,
    title: /"title"\s*:\s*"([^"]*)"/,
    summary: /"summary"\s*:\s*"([^"]*)"/,
  };

  for (const [key, pattern] of Object.entries(patterns)) {
    const match = json.match(pattern);
    if (match) {
      try {
        if (key === 'title' || key === 'summary') {
          result[key] = match[1];
        } else if (key === 'summaryData') {
          result[key] = JSON.parse(match[1]);
        } else {
          const arrayContent = match[1].trim();
          if (arrayContent) {
            result[key] = JSON.parse(`[${arrayContent}]`);
          }
        }
      } catch {
        // Keep empty/default value
      }
    }
  }

  // Check if we got anything useful
  const hasData =
    (result.dates as unknown[]).length > 0 ||
    (result.people as unknown[]).length > 0 ||
    (result.organizations as unknown[]).length > 0 ||
    (result.locations as unknown[]).length > 0 ||
    result.summaryData ||
    result.title ||
    result.summary;

  return hasData ? result : null;
}

/**
 * Normalize and validate the parsed result
 */
function normalizeResult(
  parsed: Record<string, unknown>,
  warnings: string[]
): {
  dates: ExtractedDate[];
  people: ExtractedPerson[];
  organizations: ExtractedOrganization[];
  locations: ExtractedLocation[];
  summaryData?: ExtractedSummary;
  warnings: string[];
} {
  // Validate and normalize dates
  const dates: ExtractedDate[] = ((parsed.dates as unknown[]) || [])
    .filter((d: unknown): d is Record<string, unknown> => d !== null && typeof d === 'object' && 'rawText' in d)
    .map((d) => ({
      rawText: String(d.rawText || ''),
      parsedDate: d.parsedDate ? String(d.parsedDate) : null,
      parsedDateEnd: d.parsedDateEnd ? String(d.parsedDateEnd) : undefined,
      precision: validateEnum<DatePrecision>(
        d.precision,
        ['exact', 'month', 'year', 'decade', 'approximate'],
        'year'
      ),
      category: validateEnum<DateCategory>(
        d.category,
        ['build_date', 'opening', 'closure', 'demolition', 'visit', 'publication', 'renovation', 'event', 'unknown'],
        'unknown'
      ),
      confidence: normalizeConfidence(d.confidence),
      context: String(d.context || d.rawText || ''),
      isApproximate: Boolean(d.isApproximate),
    }));

  // Validate and normalize people
  const people: ExtractedPerson[] = ((parsed.people as unknown[]) || [])
    .filter((p: unknown): p is Record<string, unknown> => p !== null && typeof p === 'object' && 'name' in p)
    .map((p) => ({
      name: String(p.name || ''),
      role: validateEnum<PersonRole>(
        p.role,
        ['owner', 'architect', 'developer', 'employee', 'founder', 'visitor', 'photographer', 'historian', 'unknown'],
        'unknown'
      ),
      mentions: Array.isArray(p.mentions) ? (p.mentions as unknown[]).map(String) : [String(p.name || '')],
      confidence: normalizeConfidence(p.confidence),
    }));

  // Validate and normalize organizations
  const organizations: ExtractedOrganization[] = ((parsed.organizations as unknown[]) || [])
    .filter((o: unknown): o is Record<string, unknown> => o !== null && typeof o === 'object' && 'name' in o)
    .map((o) => ({
      name: String(o.name || ''),
      type: validateEnum<OrganizationType>(
        o.type,
        ['company', 'government', 'school', 'hospital', 'church', 'nonprofit', 'military', 'unknown'],
        'unknown'
      ),
      mentions: Array.isArray(o.mentions) ? (o.mentions as unknown[]).map(String) : [String(o.name || '')],
      confidence: normalizeConfidence(o.confidence),
    }));

  // Validate and normalize locations
  const locations: ExtractedLocation[] = ((parsed.locations as unknown[]) || [])
    .filter((l: unknown): l is Record<string, unknown> => l !== null && typeof l === 'object' && 'name' in l)
    .map((l) => ({
      name: String(l.name || ''),
      type: validateEnum<LocationRefType>(
        l.type,
        ['city', 'state', 'country', 'address', 'landmark', 'region', 'neighborhood', 'unknown'],
        'unknown'
      ),
      confidence: normalizeConfidence(l.confidence),
    }));

  // Validate and normalize summary
  let summaryData: ExtractedSummary | undefined;
  const summarySource = parsed.summaryData as Record<string, unknown> | undefined;

  if (summarySource || parsed.title || parsed.summary) {
    summaryData = {
      title: String(summarySource?.title || parsed.title || ''),
      summary: String(summarySource?.summary || parsed.summary || ''),
      keyFacts: Array.isArray(summarySource?.keyFacts || parsed.keyFacts)
        ? ((summarySource?.keyFacts || parsed.keyFacts) as unknown[]).map(String)
        : [],
      confidence: normalizeConfidence((summarySource?.confidence || parsed.confidence) as unknown),
    };

    // Filter out empty summary
    if (!summaryData.title && !summaryData.summary) {
      summaryData = undefined;
    }
  }

  return { dates, people, organizations, locations, summaryData, warnings };
}

/**
 * Validate a value is one of the allowed enum values
 */
function validateEnum<T extends string>(value: unknown, allowed: T[], defaultValue: T): T {
  const str = String(value || '').toLowerCase();
  return allowed.includes(str as T) ? (str as T) : defaultValue;
}

/**
 * Normalize confidence to 0-1 range
 */
function normalizeConfidence(value: unknown): number {
  const num = Number(value);
  if (isNaN(num)) return 0.5;
  if (num > 1) return num / 100; // Handle percentages
  return Math.max(0, Math.min(1, num));
}

/**
 * Return empty result with warnings
 */
function emptyResult(warnings: string[]): {
  dates: ExtractedDate[];
  people: ExtractedPerson[];
  organizations: ExtractedOrganization[];
  locations: ExtractedLocation[];
  summaryData?: ExtractedSummary;
  warnings: string[];
} {
  return {
    dates: [],
    people: [],
    organizations: [],
    locations: [],
    warnings,
  };
}

// =============================================================================
// PROMPT BUILDERS
// =============================================================================

/**
 * Build the date extraction prompt with text inserted
 */
export function buildDateExtractionPrompt(text: string): string {
  return DATE_EXTRACTION_PROMPT.replace('{text}', text);
}

/**
 * Build the summary/title prompt with text and location name inserted
 */
export function buildSummaryTitlePrompt(text: string, locationName?: string): string {
  return SUMMARY_TITLE_PROMPT
    .replace('{text}', text)
    .replace('{locationName}', locationName || 'Unknown');
}

/**
 * Build the combined extraction prompt
 */
export function buildCombinedPrompt(text: string, locationName?: string): string {
  return COMBINED_EXTRACTION_PROMPT
    .replace('{text}', text)
    .replace('{locationName}', locationName || 'Unknown');
}

// =============================================================================
// VALIDATION & POST-PROCESSING
// =============================================================================

/**
 * Validate extractions against source text to catch hallucinations
 */
export function validateExtractions(
  input: { text: string },
  result: {
    dates: ExtractedDate[];
    people: ExtractedPerson[];
    organizations: ExtractedOrganization[];
    locations: ExtractedLocation[];
    summaryData?: ExtractedSummary;
    warnings: string[];
  }
): typeof result {
  const text = input.text.toLowerCase();
  const warnings = [...(result.warnings || [])];

  // Validate dates appear in source
  const validDates = result.dates.filter((date) => {
    const rawLower = date.rawText.toLowerCase();
    // Check if raw text or parsed year appears in source
    const yearStr = date.parsedDate?.split('-')[0];
    if (!text.includes(rawLower) && yearStr && !text.includes(yearStr)) {
      warnings.push(`Filtered hallucinated date: ${date.rawText}`);
      return false;
    }
    return true;
  });

  // Validate people appear in source
  const validPeople = result.people.filter((person) => {
    const nameParts = person.name.toLowerCase().split(' ');
    // Check if any significant part of name appears
    const found = nameParts.some((part) => part.length > 2 && text.includes(part));
    if (!found) {
      warnings.push(`Filtered hallucinated person: ${person.name}`);
      return false;
    }
    return true;
  });

  // Validate organizations appear in source
  const validOrgs = result.organizations.filter((org) => {
    const orgWords = org.name.toLowerCase().split(' ').filter((w) => w.length > 2);
    const found = orgWords.some((word) => text.includes(word));
    if (!found) {
      warnings.push(`Filtered hallucinated organization: ${org.name}`);
      return false;
    }
    return true;
  });

  return {
    dates: validDates,
    people: validPeople,
    organizations: validOrgs,
    locations: result.locations, // Locations are harder to validate
    summaryData: result.summaryData,
    warnings,
  };
}

/**
 * Recalibrate confidence scores based on extraction characteristics
 */
export function recalibrateConfidence(date: ExtractedDate, text: string): number {
  let confidence = date.confidence;

  // Boost: Explicit date format (MM/DD/YYYY, etc.)
  if (/\d{1,2}\/\d{1,2}\/\d{4}/.test(date.rawText) || /\d{4}-\d{2}-\d{2}/.test(date.rawText)) {
    confidence = Math.min(1.0, confidence + 0.1);
  }

  // Boost: Strong keyword present in context
  const strongKeywords = ['built', 'constructed', 'established', 'founded', 'opened', 'closed', 'demolished'];
  const contextLower = (date.context || '').toLowerCase();
  if (strongKeywords.some((k) => contextLower.includes(k))) {
    confidence = Math.min(1.0, confidence + 0.1);
  }

  // Penalty: Very short context
  if (date.context && date.context.length < 20) {
    confidence = Math.max(0.1, confidence - 0.1);
  }

  // Penalty: Approximate date
  if (date.isApproximate) {
    confidence = Math.max(0.1, confidence - 0.05);
  }

  // Penalty: Unknown category
  if (date.category === 'unknown') {
    confidence = Math.max(0.1, confidence - 0.1);
  }

  return Math.round(confidence * 100) / 100;
}
