/**
 * GPS validation and distance calculation service
 */
export class GPSValidator {
  /**
   * Calculate Haversine distance between two GPS coordinates (in meters)
   * Formula: a = sin²(Δφ/2) + cos φ1 * cos φ2 * sin²(Δλ/2)
   *          c = 2 * atan2( √a, √(1−a) )
   *          d = R * c
   */
  static haversineDistance(
    lat1: number,
    lng1: number,
    lat2: number,
    lng2: number
  ): number {
    const R = 6371000; // Earth radius in meters
    const φ1 = (lat1 * Math.PI) / 180;
    const φ2 = (lat2 * Math.PI) / 180;
    const Δφ = ((lat2 - lat1) * Math.PI) / 180;
    const Δλ = ((lng2 - lng1) * Math.PI) / 180;

    const a =
      Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
      Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c; // Distance in meters
  }

  /**
   * Check if GPS coordinates are valid
   */
  static isValidGPS(lat: number | null, lng: number | null): boolean {
    if (lat === null || lng === null) {
      return false;
    }

    return lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
  }

  /**
   * Check if GPS coordinates differ significantly (> threshold)
   * Returns object with mismatch flag and distance
   */
  static checkGPSMismatch(
    locationGPS: { lat: number | null; lng: number | null },
    mediaGPS: { lat: number | null; lng: number | null },
    thresholdMeters: number = 10000 // 10km default
  ): { mismatch: boolean; distance: number | null; severity: 'none' | 'minor' | 'major' } {
    // If either GPS is missing, no mismatch
    if (!this.isValidGPS(locationGPS.lat, locationGPS.lng)) {
      return { mismatch: false, distance: null, severity: 'none' };
    }

    if (!this.isValidGPS(mediaGPS.lat, mediaGPS.lng)) {
      return { mismatch: false, distance: null, severity: 'none' };
    }

    const distance = this.haversineDistance(
      locationGPS.lat!,
      locationGPS.lng!,
      mediaGPS.lat!,
      mediaGPS.lng!
    );

    // Classify severity
    let severity: 'none' | 'minor' | 'major' = 'none';
    if (distance > thresholdMeters) {
      severity = 'major'; // > 10km
    } else if (distance > 1000) {
      severity = 'minor'; // > 1km
    }

    return {
      mismatch: distance > thresholdMeters,
      distance,
      severity,
    };
  }

  /**
   * Format distance for display
   */
  static formatDistance(meters: number): string {
    if (meters < 1000) {
      return `${Math.round(meters)}m`;
    }
    return `${(meters / 1000).toFixed(2)}km`;
  }
}
