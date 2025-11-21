import { describe, it, expect, beforeEach } from 'vitest';
import { CryptoService } from '../../services/crypto-service';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import os from 'os';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('CryptoService', () => {
  let cryptoService: CryptoService;
  let tempDir: string;
  let testFilePath: string;

  beforeEach(() => {
    cryptoService = new CryptoService();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'crypto-test-'));
    testFilePath = path.join(tempDir, 'test-file.txt');
  });

  describe('calculateSHA256', () => {
    it('should generate consistent SHA256 hash for same file', async () => {
      const content = 'Hello, World!';
      fs.writeFileSync(testFilePath, content);

      const hash1 = await cryptoService.calculateSHA256(testFilePath);
      const hash2 = await cryptoService.calculateSHA256(testFilePath);

      expect(hash1).toBe(hash2);
      expect(hash1).toHaveLength(64);
      expect(hash1).toMatch(/^[a-f0-9]{64}$/);
    });

    it('should generate different hashes for different content', async () => {
      const file1 = path.join(tempDir, 'file1.txt');
      const file2 = path.join(tempDir, 'file2.txt');

      fs.writeFileSync(file1, 'Content A');
      fs.writeFileSync(file2, 'Content B');

      const hash1 = await cryptoService.calculateSHA256(file1);
      const hash2 = await cryptoService.calculateSHA256(file2);

      expect(hash1).not.toBe(hash2);
    });

    it('should generate known hash for known content', async () => {
      // SHA256 of "test" is a well-known value
      fs.writeFileSync(testFilePath, 'test');
      const hash = await cryptoService.calculateSHA256(testFilePath);

      // Expected SHA256 of "test" (without newline)
      expect(hash).toBe('9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08');
    });

    it('should throw error for non-existent file', async () => {
      await expect(cryptoService.calculateSHA256('/nonexistent/file.txt'))
        .rejects
        .toThrow();
    });
  });

  describe('calculateSHA256Buffer', () => {
    it('should generate consistent hash for same buffer', () => {
      const buffer = Buffer.from('test string');
      const hash1 = cryptoService.calculateSHA256Buffer(buffer);
      const hash2 = cryptoService.calculateSHA256Buffer(buffer);

      expect(hash1).toBe(hash2);
      expect(hash1).toHaveLength(64);
    });

    it('should generate different hashes for different buffers', () => {
      const buffer1 = Buffer.from('string1');
      const buffer2 = Buffer.from('string2');

      const hash1 = cryptoService.calculateSHA256Buffer(buffer1);
      const hash2 = cryptoService.calculateSHA256Buffer(buffer2);

      expect(hash1).not.toBe(hash2);
    });

    it('should handle empty buffer', () => {
      const buffer = Buffer.from('');
      const hash = cryptoService.calculateSHA256Buffer(buffer);

      expect(hash).toHaveLength(64);
      expect(hash).toMatch(/^[a-f0-9]{64}$/);
    });

    it('should handle unicode characters', () => {
      const buffer = Buffer.from('Hello 世界 🌍');
      const hash = cryptoService.calculateSHA256Buffer(buffer);

      expect(hash).toHaveLength(64);
      expect(hash).toMatch(/^[a-f0-9]{64}$/);
    });
  });

  // Cleanup
  afterEach(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });
});
