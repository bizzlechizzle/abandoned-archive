import { describe, it, expect } from 'vitest';
import {
  validate,
  UuidSchema,
  LimitSchema,
  OffsetSchema,
  FilePathSchema,
  UrlSchema,
  PaginationSchema,
} from '../../main/ipc-validation';
import { z } from 'zod';

describe('IPC Validation', () => {
  describe('UuidSchema', () => {
    it('should validate correct UUIDs', () => {
      const validUuids = [
        '123e4567-e89b-12d3-a456-426614174000',
        'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
        '00000000-0000-0000-0000-000000000000',
      ];

      validUuids.forEach((uuid) => {
        expect(() => UuidSchema.parse(uuid)).not.toThrow();
      });
    });

    it('should reject invalid UUIDs', () => {
      const invalidUuids = [
        'not-a-uuid',
        '123456',
        'zzzzzzzz-zzzz-zzzz-zzzz-zzzzzzzzzzzz',
        '',
        '123e4567-e89b-12d3-a456-42661417400', // too short
      ];

      invalidUuids.forEach((uuid) => {
        expect(() => UuidSchema.parse(uuid)).toThrow();
      });
    });
  });

  describe('LimitSchema', () => {
    it('should accept valid limits', () => {
      expect(LimitSchema.parse(10)).toBe(10);
      expect(LimitSchema.parse(100)).toBe(100);
      expect(LimitSchema.parse(1000)).toBe(1000);
      expect(LimitSchema.parse(1)).toBe(1);
    });

    it('should use default value of 10 when undefined', () => {
      expect(LimitSchema.parse(undefined)).toBe(10);
    });

    it('should reject limits over 1000', () => {
      expect(() => LimitSchema.parse(1001)).toThrow();
      expect(() => LimitSchema.parse(10000)).toThrow();
    });

    it('should reject negative and zero limits', () => {
      expect(() => LimitSchema.parse(0)).toThrow();
      expect(() => LimitSchema.parse(-1)).toThrow();
      expect(() => LimitSchema.parse(-100)).toThrow();
    });

    it('should reject non-integer limits', () => {
      expect(() => LimitSchema.parse(10.5)).toThrow();
      expect(() => LimitSchema.parse(99.99)).toThrow();
    });
  });

  describe('OffsetSchema', () => {
    it('should accept valid offsets', () => {
      expect(OffsetSchema.parse(0)).toBe(0);
      expect(OffsetSchema.parse(10)).toBe(10);
      expect(OffsetSchema.parse(1000)).toBe(1000);
    });

    it('should use default value of 0 when undefined', () => {
      expect(OffsetSchema.parse(undefined)).toBe(0);
    });

    it('should reject negative offsets', () => {
      expect(() => OffsetSchema.parse(-1)).toThrow();
      expect(() => OffsetSchema.parse(-100)).toThrow();
    });

    it('should reject non-integer offsets', () => {
      expect(() => OffsetSchema.parse(10.5)).toThrow();
    });
  });

  describe('FilePathSchema', () => {
    it('should accept valid file paths', () => {
      const validPaths = [
        '/home/user/file.txt',
        'C:\\Users\\User\\file.txt',
        './relative/path.jpg',
        'simple-file.pdf',
      ];

      validPaths.forEach((path) => {
        expect(() => FilePathSchema.parse(path)).not.toThrow();
      });
    });

    it('should reject empty paths', () => {
      expect(() => FilePathSchema.parse('')).toThrow();
    });

    it('should reject paths exceeding 4096 characters', () => {
      const longPath = 'a'.repeat(4097);
      expect(() => FilePathSchema.parse(longPath)).toThrow();
    });

    it('should accept paths at the limit (4096 chars)', () => {
      const maxPath = 'a'.repeat(4096);
      expect(() => FilePathSchema.parse(maxPath)).not.toThrow();
    });
  });

  describe('UrlSchema', () => {
    it('should accept valid URLs', () => {
      const validUrls = [
        'https://example.com',
        'http://localhost:3000',
        'https://sub.domain.example.com/path?query=value',
        'ftp://ftp.example.com/file.txt',
      ];

      validUrls.forEach((url) => {
        expect(() => UrlSchema.parse(url)).not.toThrow();
      });
    });

    it('should reject invalid URLs', () => {
      const invalidUrls = [
        'not-a-url',
        'example.com', // missing protocol
        'http://',
        '',
      ];

      invalidUrls.forEach((url) => {
        expect(() => UrlSchema.parse(url)).toThrow();
      });
    });

    it('should reject URLs exceeding 2048 characters', () => {
      const longUrl = 'https://example.com/' + 'a'.repeat(2040);
      expect(() => UrlSchema.parse(longUrl)).toThrow();
    });
  });

  describe('PaginationSchema', () => {
    it('should parse valid pagination params', () => {
      const result = PaginationSchema.parse({ limit: 20, offset: 40 });
      expect(result.limit).toBe(20);
      expect(result.offset).toBe(40);
    });

    it('should use defaults when params are undefined', () => {
      const result = PaginationSchema.parse({});
      expect(result.limit).toBe(10);
      expect(result.offset).toBe(0);
    });

    it('should reject invalid pagination params', () => {
      expect(() => PaginationSchema.parse({ limit: -1, offset: 0 })).toThrow();
      expect(() => PaginationSchema.parse({ limit: 10, offset: -1 })).toThrow();
      expect(() => PaginationSchema.parse({ limit: 2000, offset: 0 })).toThrow();
    });
  });

  describe('validate helper', () => {
    it('should return parsed data for valid input', () => {
      const schema = z.object({ name: z.string(), age: z.number() });
      const data = { name: 'John', age: 30 };

      const result = validate(schema, data);
      expect(result).toEqual(data);
    });

    it('should throw readable error for invalid input', () => {
      const schema = z.object({ name: z.string(), age: z.number() });
      const invalidData = { name: 'John', age: 'thirty' };

      expect(() => validate(schema, invalidData)).toThrow('Validation error');
      expect(() => validate(schema, invalidData)).toThrow('age');
    });

    it('should handle nested validation errors', () => {
      const schema = z.object({
        user: z.object({
          email: z.string().email(),
        }),
      });
      const invalidData = { user: { email: 'invalid-email' } };

      expect(() => validate(schema, invalidData)).toThrow('Validation error');
      expect(() => validate(schema, invalidData)).toThrow('email');
    });
  });
});
