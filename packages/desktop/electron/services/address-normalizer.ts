/**
 * Address Normalizer Service
 * Ensures consistent address formatting across all entry points
 * Per claude.md spec: address_state must be 2 characters, zipcode must match 5 or 5+4 format
 */

import { STATE_ABBREVIATIONS, VALID_STATE_CODES } from './us-state-codes';

export interface RawAddress {
  street?: string | null;
  houseNumber?: string | null;
  city?: string | null;
  county?: string | null;
  state?: string | null;
  stateCode?: string | null;
  zipcode?: string | null;
  country?: string | null;
  countryCode?: string | null;
}

export interface NormalizedAddress {
  street: string | null;
  city: string | null;
  county: string | null;
  state: string | null; // Always 2-letter state code (e.g., "NY")
  zipcode: string | null; // Always 5 or 5+4 format
  confidence: 'high' | 'medium' | 'low';
  geocodedAt: string | null;
}

export class AddressNormalizer {
  /**
   * Normalize a state input to a 2-letter code
   * Handles: "New York" -> "NY", "ny" -> "NY", "NY" -> "NY"
   */
  static normalizeStateCode(state: string | null | undefined): string | null {
    if (!state || typeof state !== 'string') {
      return null;
    }

    const trimmed = state.trim();
    if (!trimmed) {
      return null;
    }

    // If already a valid 2-letter code
    const upper = trimmed.toUpperCase();
    if (upper.length === 2 && VALID_STATE_CODES.has(upper)) {
      return upper;
    }

    // Try to map from full state name
    const lower = trimmed.toLowerCase();
    const abbr = STATE_ABBREVIATIONS[lower];
    if (abbr) {
      return abbr;
    }

    // Return null if we can't normalize it
    console.warn(`AddressNormalizer: Could not normalize state "${state}"`);
    return null;
  }

  /**
   * Normalize a zipcode to 5 or 5+4 format
   * Handles: "12345-6789" -> "12345-6789", "12345 6789" -> "12345-6789", "123456789" -> "12345-6789"
   */
  static normalizeZipcode(zipcode: string | null | undefined): string | null {
    if (!zipcode || typeof zipcode !== 'string') {
      return null;
    }

    // Remove all non-numeric characters except hyphen
    const cleaned = zipcode.replace(/[^\d-]/g, '');

    // Extract just digits
    const digits = cleaned.replace(/-/g, '');

    // Validate we have either 5 or 9 digits
    if (digits.length === 5) {
      return digits;
    }

    if (digits.length === 9) {
      return `${digits.slice(0, 5)}-${digits.slice(5)}`;
    }

    // If it's close to 5 digits, try to extract
    if (digits.length >= 5) {
      const fiveDigit = digits.slice(0, 5);
      if (/^\d{5}$/.test(fiveDigit)) {
        return fiveDigit;
      }
    }

    console.warn(`AddressNormalizer: Could not normalize zipcode "${zipcode}"`);
    return null;
  }

  /**
   * Normalize a street address
   * Handles: whitespace trimming, case normalization
   */
  static normalizeStreet(street: string | null | undefined): string | null {
    if (!street || typeof street !== 'string') {
      return null;
    }

    // Trim and collapse multiple spaces
    const normalized = street.trim().replace(/\s+/g, ' ');

    if (!normalized) {
      return null;
    }

    return normalized;
  }

  /**
   * Normalize a city name
   * Handles: whitespace trimming, title case
   */
  static normalizeCity(city: string | null | undefined): string | null {
    if (!city || typeof city !== 'string') {
      return null;
    }

    const trimmed = city.trim();
    if (!trimmed) {
      return null;
    }

    // Title case the city name
    return trimmed
      .toLowerCase()
      .replace(/\b\w/g, (char) => char.toUpperCase());
  }

  /**
   * Normalize a county name
   * Handles: whitespace trimming, removes " County" suffix if present
   */
  static normalizeCounty(county: string | null | undefined): string | null {
    if (!county || typeof county !== 'string') {
      return null;
    }

    let trimmed = county.trim();
    if (!trimmed) {
      return null;
    }

    // Remove " County" suffix if present (common in Nominatim responses)
    if (trimmed.toLowerCase().endsWith(' county')) {
      trimmed = trimmed.slice(0, -7);
    }

    // Title case
    return trimmed
      .toLowerCase()
      .replace(/\b\w/g, (char) => char.toUpperCase());
  }

  /**
   * Normalize a complete address from various sources
   * Primary method for normalizing geocoding results
   */
  static normalizeAddress(
    raw: RawAddress,
    confidence: 'high' | 'medium' | 'low' = 'medium'
  ): NormalizedAddress {
    // For state, prefer stateCode if available, otherwise try to extract from state
    let normalizedState: string | null = null;
    if (raw.stateCode) {
      normalizedState = this.normalizeStateCode(raw.stateCode);
    }
    if (!normalizedState && raw.state) {
      normalizedState = this.normalizeStateCode(raw.state);
    }

    // Build street address from components if needed
    let street = raw.street;
    if (raw.houseNumber && street) {
      // Nominatim sometimes separates house number
      street = `${raw.houseNumber} ${street}`;
    }

    return {
      street: this.normalizeStreet(street),
      city: this.normalizeCity(raw.city),
      county: this.normalizeCounty(raw.county),
      state: normalizedState,
      zipcode: this.normalizeZipcode(raw.zipcode),
      confidence,
      geocodedAt: new Date().toISOString(),
    };
  }

  /**
   * Validate if an address has minimum required fields
   * Returns true if address has at least state OR (city AND zipcode)
   */
  static isValidAddress(address: NormalizedAddress): boolean {
    // Must have state
    if (address.state) {
      return true;
    }
    // Or city and zipcode
    if (address.city && address.zipcode) {
      return true;
    }
    return false;
  }

  /**
   * Get a formatted display string for an address
   */
  static formatAddress(address: NormalizedAddress): string {
    const parts: string[] = [];

    if (address.street) {
      parts.push(address.street);
    }
    if (address.city) {
      parts.push(address.city);
    }
    if (address.state && address.zipcode) {
      parts.push(`${address.state} ${address.zipcode}`);
    } else if (address.state) {
      parts.push(address.state);
    } else if (address.zipcode) {
      parts.push(address.zipcode);
    }

    return parts.join(', ');
  }

  /**
   * Parse an address string into components (best effort)
   * This is for user-entered addresses, not geocoding results
   */
  static parseAddressString(addressString: string): Partial<NormalizedAddress> {
    if (!addressString || typeof addressString !== 'string') {
      return {};
    }

    const parts = addressString.split(',').map((p) => p.trim());
    const result: Partial<NormalizedAddress> = {};

    // Try to identify components from right to left (most reliable order)
    if (parts.length >= 1) {
      const lastPart = parts[parts.length - 1];

      // Check if last part is "STATE ZIPCODE" or just "STATE" or just "ZIPCODE"
      const stateZipMatch = lastPart.match(/^([A-Za-z]{2})\s*(\d{5}(?:-\d{4})?)$/);
      if (stateZipMatch) {
        result.state = this.normalizeStateCode(stateZipMatch[1]);
        result.zipcode = this.normalizeZipcode(stateZipMatch[2]);
        parts.pop();
      } else {
        const stateOnly = this.normalizeStateCode(lastPart);
        if (stateOnly) {
          result.state = stateOnly;
          parts.pop();
        } else {
          const zipOnly = this.normalizeZipcode(lastPart);
          if (zipOnly) {
            result.zipcode = zipOnly;
            parts.pop();
          }
        }
      }
    }

    // Next part (from right) should be city
    if (parts.length >= 1) {
      result.city = this.normalizeCity(parts.pop());
    }

    // Remaining parts are street address
    if (parts.length >= 1) {
      result.street = this.normalizeStreet(parts.join(', '));
    }

    return result;
  }
}
