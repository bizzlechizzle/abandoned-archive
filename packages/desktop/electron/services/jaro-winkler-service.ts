/**
 * Jaro-Winkler String Similarity Service
 *
 * Implements the Jaro-Winkler distance algorithm for fuzzy string matching.
 * Used for matching user-entered location names against reference map points.
 *
 * Algorithm:
 * 1. Jaro similarity considers matching characters and transpositions
 * 2. Winkler modification boosts score for strings with common prefixes
 *
 * Default threshold: 0.92 (high confidence matches only)
 */

/**
 * Calculate Jaro similarity between two strings
 * Returns a value between 0 (no match) and 1 (exact match)
 */
function jaroSimilarity(s1: string, s2: string): number {
  // Handle edge cases
  if (s1 === s2) return 1.0;
  if (!s1 || !s2) return 0.0;
  if (s1.length === 0 || s2.length === 0) return 0.0;

  // Calculate match window
  const matchWindow = Math.floor(Math.max(s1.length, s2.length) / 2) - 1;
  if (matchWindow < 0) return 0.0;

  const s1Matches: boolean[] = new Array(s1.length).fill(false);
  const s2Matches: boolean[] = new Array(s2.length).fill(false);

  let matches = 0;
  let transpositions = 0;

  // Find matching characters
  for (let i = 0; i < s1.length; i++) {
    const start = Math.max(0, i - matchWindow);
    const end = Math.min(i + matchWindow + 1, s2.length);

    for (let j = start; j < end; j++) {
      if (s2Matches[j] || s1[i] !== s2[j]) continue;
      s1Matches[i] = true;
      s2Matches[j] = true;
      matches++;
      break;
    }
  }

  if (matches === 0) return 0.0;

  // Count transpositions
  let k = 0;
  for (let i = 0; i < s1.length; i++) {
    if (!s1Matches[i]) continue;
    while (!s2Matches[k]) k++;
    if (s1[i] !== s2[k]) transpositions++;
    k++;
  }

  // Calculate Jaro similarity
  const jaro = (
    matches / s1.length +
    matches / s2.length +
    (matches - transpositions / 2) / matches
  ) / 3;

  return jaro;
}

/**
 * Calculate common prefix length (max 4 characters)
 */
function commonPrefixLength(s1: string, s2: string): number {
  const maxPrefix = 4;
  let prefix = 0;

  for (let i = 0; i < Math.min(s1.length, s2.length, maxPrefix); i++) {
    if (s1[i] === s2[i]) {
      prefix++;
    } else {
      break;
    }
  }

  return prefix;
}

/**
 * Calculate Jaro-Winkler similarity between two strings
 *
 * @param s1 - First string
 * @param s2 - Second string
 * @param scalingFactor - Prefix scaling factor (default 0.1, max 0.25)
 * @returns Similarity score between 0 and 1
 */
export function jaroWinklerSimilarity(
  s1: string,
  s2: string,
  scalingFactor: number = 0.1
): number {
  // Normalize strings: lowercase and trim
  const str1 = (s1 || '').toLowerCase().trim();
  const str2 = (s2 || '').toLowerCase().trim();

  // Handle edge cases
  if (str1 === str2) return 1.0;
  if (!str1 || !str2) return 0.0;

  // Ensure scaling factor is within bounds
  const p = Math.min(Math.max(scalingFactor, 0), 0.25);

  // Calculate Jaro similarity
  const jaro = jaroSimilarity(str1, str2);

  // Calculate common prefix length
  const prefix = commonPrefixLength(str1, str2);

  // Apply Winkler modification
  const winkler = jaro + (prefix * p * (1 - jaro));

  return winkler;
}

/**
 * Check if two strings are similar above a threshold
 *
 * @param s1 - First string
 * @param s2 - Second string
 * @param threshold - Minimum similarity score (default 0.92)
 * @returns True if similarity >= threshold
 */
export function isMatch(s1: string, s2: string, threshold: number = 0.92): boolean {
  return jaroWinklerSimilarity(s1, s2) >= threshold;
}

/**
 * Find best matches from a list of candidates
 *
 * @param query - The string to match against
 * @param candidates - Array of candidate strings
 * @param threshold - Minimum similarity score (default 0.92)
 * @param limit - Maximum number of results (default 3)
 * @returns Array of matches with scores, sorted by score descending
 */
export function findBestMatches(
  query: string,
  candidates: string[],
  threshold: number = 0.92,
  limit: number = 3
): Array<{ candidate: string; score: number; index: number }> {
  if (!query || !candidates || candidates.length === 0) {
    return [];
  }

  const matches: Array<{ candidate: string; score: number; index: number }> = [];

  for (let i = 0; i < candidates.length; i++) {
    const candidate = candidates[i];
    if (!candidate) continue;

    const score = jaroWinklerSimilarity(query, candidate);
    if (score >= threshold) {
      matches.push({ candidate, score, index: i });
    }
  }

  // Sort by score descending and limit results
  return matches
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

/**
 * Find matches from objects with a name property
 *
 * @param query - The string to match against
 * @param items - Array of objects with name property
 * @param threshold - Minimum similarity score (default 0.92)
 * @param limit - Maximum number of results (default 3)
 * @returns Array of items with scores, sorted by score descending
 */
export function findMatchesInItems<T extends { name: string | null }>(
  query: string,
  items: T[],
  threshold: number = 0.92,
  limit: number = 3
): Array<{ item: T; score: number }> {
  if (!query || !items || items.length === 0) {
    return [];
  }

  const matches: Array<{ item: T; score: number }> = [];

  for (const item of items) {
    if (!item.name) continue;

    const score = jaroWinklerSimilarity(query, item.name);
    if (score >= threshold) {
      matches.push({ item, score });
    }
  }

  // Sort by score descending and limit results
  return matches
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

/**
 * Migration 38: Normalize a name for comparison
 * ADR: ADR-pin-conversion-duplicate-prevention.md
 *
 * - Lowercase
 * - Strip leading articles (The, A, An)
 * - Expand common abbreviations
 */
export function normalizeName(name: string): string {
  if (!name) return '';

  let normalized = name.toLowerCase().trim();

  // Strip leading articles
  normalized = normalized.replace(/^(the|a|an)\s+/i, '');

  // Expand abbreviations (order matters - process longer patterns first)
  const abbreviations: [RegExp, string][] = [
    [/\bst\.\s*/gi, 'saint '],
    [/\bmt\.\s*/gi, 'mount '],
    [/\bhosp\.\s*/gi, 'hospital '],
    [/\bmfg\.\s*/gi, 'manufacturing '],
    [/\bco\.\s*/gi, 'company '],
    [/\bcorp\.\s*/gi, 'corporation '],
    [/\binc\.\s*/gi, 'incorporated '],
    [/\bave\.\s*/gi, 'avenue '],
    [/\bblvd\.\s*/gi, 'boulevard '],
    [/\brd\.\s*/gi, 'road '],
  ];

  for (const [pattern, replacement] of abbreviations) {
    normalized = normalized.replace(pattern, replacement);
  }

  // Collapse multiple spaces
  normalized = normalized.replace(/\s+/g, ' ').trim();

  return normalized;
}

/**
 * Compare two names with normalization applied
 */
export function normalizedSimilarity(name1: string, name2: string): number {
  return jaroWinklerSimilarity(normalizeName(name1), normalizeName(name2));
}

// Default export for convenience
export default {
  jaroWinklerSimilarity,
  isMatch,
  findBestMatches,
  findMatchesInItems,
  normalizeName,
  normalizedSimilarity,
};
