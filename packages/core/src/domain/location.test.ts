import { describe, it, expect } from 'vitest';
import { LocationEntity, GPSCoordinatesSchema, AddressSchema, LocationInputSchema } from './location';

describe('LocationEntity', () => {
  describe('generateShortName', () => {
    it('should generate short names from location names', () => {
      expect(LocationEntity.generateShortName('Old Factory')).toBe('old-factory');
      expect(LocationEntity.generateShortName('Amazing Hospital Complex')).toBe('amazing-hosp');
      expect(LocationEntity.generateShortName('Test (123)')).toBe('test-123');
    });

    it('should handle special characters', () => {
      expect(LocationEntity.generateShortName("O'Brien's Mill")).toBe('obriens-mill');
      expect(LocationEntity.generateShortName('Factory @ Main St.')).toBe('factory-main');
    });

    it('should truncate to 12 characters', () => {
      const longName = 'This is a very long location name';
      const result = LocationEntity.generateShortName(longName);
      expect(result.length).toBeLessThanOrEqual(12);
    });
  });

  describe('generateLoc12', () => {
    it('should generate 12-character IDs from UUIDs', () => {
      const uuid = '550e8400-e29b-41d4-a716-446655440000';
      const loc12 = LocationEntity.generateLoc12(uuid);
      expect(loc12).toBe('550e8400e29b');
      expect(loc12.length).toBe(12);
    });
  });

  describe('getGPSConfidence', () => {
    it('should return verified for user map click with verification', () => {
      const location = {
        locid: '550e8400-e29b-41d4-a716-446655440000',
        loc12: '550e8400e29b',
        locnam: 'Test Location',
        gps: {
          lat: 40.7128,
          lng: -74.0060,
          source: 'user_map_click' as const,
          verifiedOnMap: true
        },
        historic: false,
        sublocs: [],
        regions: [],
        locadd: new Date().toISOString()
      };
      const entity = new LocationEntity(location);
      expect(entity.getGPSConfidence()).toBe('verified');
    });

    it('should return high for photo EXIF with good accuracy', () => {
      const location = {
        locid: '550e8400-e29b-41d4-a716-446655440000',
        loc12: '550e8400e29b',
        locnam: 'Test Location',
        gps: {
          lat: 40.7128,
          lng: -74.0060,
          source: 'photo_exif' as const,
          verifiedOnMap: false,
          accuracy: 5
        },
        historic: false,
        sublocs: [],
        regions: [],
        locadd: new Date().toISOString()
      };
      const entity = new LocationEntity(location);
      expect(entity.getGPSConfidence()).toBe('high');
    });

    it('should return medium for geocoded address', () => {
      const location = {
        locid: '550e8400-e29b-41d4-a716-446655440000',
        loc12: '550e8400e29b',
        locnam: 'Test Location',
        gps: {
          lat: 40.7128,
          lng: -74.0060,
          source: 'geocoded_address' as const,
          verifiedOnMap: false
        },
        historic: false,
        sublocs: [],
        regions: [],
        locadd: new Date().toISOString()
      };
      const entity = new LocationEntity(location);
      expect(entity.getGPSConfidence()).toBe('medium');
    });

    it('should return none for no GPS data', () => {
      const location = {
        locid: '550e8400-e29b-41d4-a716-446655440000',
        loc12: '550e8400e29b',
        locnam: 'Test Location',
        historic: false,
        sublocs: [],
        regions: [],
        locadd: new Date().toISOString()
      };
      const entity = new LocationEntity(location);
      expect(entity.getGPSConfidence()).toBe('none');
    });
  });

  describe('hasValidGPS', () => {
    it('should return true for valid GPS coordinates', () => {
      const location = {
        locid: '550e8400-e29b-41d4-a716-446655440000',
        loc12: '550e8400e29b',
        locnam: 'Test Location',
        gps: {
          lat: 40.7128,
          lng: -74.0060,
          source: 'user_map_click' as const,
          verifiedOnMap: true
        },
        historic: false,
        sublocs: [],
        regions: [],
        locadd: new Date().toISOString()
      };
      const entity = new LocationEntity(location);
      expect(entity.hasValidGPS()).toBe(true);
    });

    it('should return false for invalid latitude', () => {
      const location = {
        locid: '550e8400-e29b-41d4-a716-446655440000',
        loc12: '550e8400e29b',
        locnam: 'Test Location',
        gps: {
          lat: 91,
          lng: -74.0060,
          source: 'user_map_click' as const,
          verifiedOnMap: true
        },
        historic: false,
        sublocs: [],
        regions: [],
        locadd: new Date().toISOString()
      };
      const entity = new LocationEntity(location);
      expect(entity.hasValidGPS()).toBe(false);
    });

    it('should return false for no GPS data', () => {
      const location = {
        locid: '550e8400-e29b-41d4-a716-446655440000',
        loc12: '550e8400e29b',
        locnam: 'Test Location',
        historic: false,
        sublocs: [],
        regions: [],
        locadd: new Date().toISOString()
      };
      const entity = new LocationEntity(location);
      expect(entity.hasValidGPS()).toBe(false);
    });
  });
});

describe('Zod Schemas', () => {
  describe('GPSCoordinatesSchema', () => {
    it('should validate valid GPS coordinates', () => {
      const validGPS = {
        lat: 40.7128,
        lng: -74.0060,
        source: 'user_map_click'
      };
      const result = GPSCoordinatesSchema.safeParse(validGPS);
      expect(result.success).toBe(true);
    });

    it('should reject invalid latitude', () => {
      const invalidGPS = {
        lat: 100,
        lng: -74.0060,
        source: 'user_map_click'
      };
      const result = GPSCoordinatesSchema.safeParse(invalidGPS);
      expect(result.success).toBe(false);
    });

    it('should reject invalid source', () => {
      const invalidGPS = {
        lat: 40.7128,
        lng: -74.0060,
        source: 'invalid_source'
      };
      const result = GPSCoordinatesSchema.safeParse(invalidGPS);
      expect(result.success).toBe(false);
    });
  });

  describe('AddressSchema', () => {
    it('should validate valid address', () => {
      const validAddress = {
        street: '123 Main St',
        city: 'New York',
        state: 'NY',
        zipcode: '10001'
      };
      const result = AddressSchema.safeParse(validAddress);
      expect(result.success).toBe(true);
    });

    it('should reject invalid state code', () => {
      const invalidAddress = {
        state: 'NEW'
      };
      const result = AddressSchema.safeParse(invalidAddress);
      expect(result.success).toBe(false);
    });

    it('should reject invalid zipcode format', () => {
      const invalidAddress = {
        zipcode: '123'
      };
      const result = AddressSchema.safeParse(invalidAddress);
      expect(result.success).toBe(false);
    });
  });

  describe('LocationInputSchema', () => {
    it('should validate minimum required fields', () => {
      const validInput = {
        locnam: 'Test Location'
      };
      const result = LocationInputSchema.safeParse(validInput);
      expect(result.success).toBe(true);
    });

    it('should reject empty location name', () => {
      const invalidInput = {
        locnam: ''
      };
      const result = LocationInputSchema.safeParse(invalidInput);
      expect(result.success).toBe(false);
    });
  });
});
