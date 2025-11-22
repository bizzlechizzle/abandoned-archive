/**
 * LocalStorageAdapter Unit Tests
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { LocalStorageAdapter } from '../../src/adapters/local-storage.js';

describe('LocalStorageAdapter', () => {
  let adapter: LocalStorageAdapter;
  let testDir: string;

  beforeEach(async () => {
    adapter = new LocalStorageAdapter();
    testDir = await fs.mkdtemp(path.join(os.tmpdir(), 'au-storage-test-'));
  });

  afterEach(async () => {
    await fs.rm(testDir, { recursive: true, force: true });
  });

  describe('read/write operations', () => {
    it('should write and read a file', async () => {
      const filePath = path.join(testDir, 'test.txt');
      const content = Buffer.from('Hello, World!');

      await adapter.write(filePath, content);
      const result = await adapter.read(filePath);

      expect(result.toString()).toBe('Hello, World!');
    });

    it('should create parent directories when writing', async () => {
      const filePath = path.join(testDir, 'nested', 'deep', 'test.txt');
      const content = Buffer.from('Nested content');

      await adapter.write(filePath, content);
      const result = await adapter.read(filePath);

      expect(result.toString()).toBe('Nested content');
    });

    it('should throw when reading non-existent file', async () => {
      const filePath = path.join(testDir, 'nonexistent.txt');
      await expect(adapter.read(filePath)).rejects.toThrow();
    });
  });

  describe('exists operation', () => {
    it('should return true for existing file', async () => {
      const filePath = path.join(testDir, 'exists.txt');
      await fs.writeFile(filePath, 'content');

      expect(await adapter.exists(filePath)).toBe(true);
    });

    it('should return false for non-existing file', async () => {
      const filePath = path.join(testDir, 'nope.txt');
      expect(await adapter.exists(filePath)).toBe(false);
    });

    it('should return true for existing directory', async () => {
      expect(await adapter.exists(testDir)).toBe(true);
    });
  });

  describe('delete operation', () => {
    it('should delete an existing file', async () => {
      const filePath = path.join(testDir, 'delete-me.txt');
      await fs.writeFile(filePath, 'content');

      await adapter.delete(filePath);

      expect(await adapter.exists(filePath)).toBe(false);
    });

    it('should throw when deleting non-existent file', async () => {
      const filePath = path.join(testDir, 'ghost.txt');
      await expect(adapter.delete(filePath)).rejects.toThrow();
    });
  });

  describe('copy operation', () => {
    it('should copy a file', async () => {
      const source = path.join(testDir, 'source.txt');
      const dest = path.join(testDir, 'dest.txt');
      await fs.writeFile(source, 'copy me');

      const result = await adapter.copy(source, dest);

      expect(result.success).toBe(true);
      expect(result.bytesTransferred).toBe(7);
      expect(await adapter.read(dest)).toEqual(Buffer.from('copy me'));
    });

    it('should create destination directory if needed', async () => {
      const source = path.join(testDir, 'source.txt');
      const dest = path.join(testDir, 'new-dir', 'dest.txt');
      await fs.writeFile(source, 'content');

      const result = await adapter.copy(source, dest);

      expect(result.success).toBe(true);
      expect(await adapter.exists(dest)).toBe(true);
    });

    it('should verify checksum when requested', async () => {
      const source = path.join(testDir, 'source.txt');
      const dest = path.join(testDir, 'dest.txt');
      await fs.writeFile(source, 'verify me');

      const result = await adapter.copy(source, dest, { checksum: true });

      expect(result.success).toBe(true);
      expect(result.verified).toBe(true);
    });
  });

  describe('mkdir operation', () => {
    it('should create a directory', async () => {
      const dirPath = path.join(testDir, 'new-dir');

      await adapter.mkdir(dirPath);

      const stat = await fs.stat(dirPath);
      expect(stat.isDirectory()).toBe(true);
    });

    it('should create nested directories', async () => {
      const dirPath = path.join(testDir, 'a', 'b', 'c');

      await adapter.mkdir(dirPath);

      const stat = await fs.stat(dirPath);
      expect(stat.isDirectory()).toBe(true);
    });
  });

  describe('list operation', () => {
    it('should list files in directory', async () => {
      await fs.writeFile(path.join(testDir, 'file1.txt'), 'a');
      await fs.writeFile(path.join(testDir, 'file2.txt'), 'b');
      await fs.mkdir(path.join(testDir, 'subdir'));

      const files = await adapter.list(testDir);

      expect(files.length).toBe(3);
      const names = files.map((f) => f.name).sort();
      expect(names).toEqual(['file1.txt', 'file2.txt', 'subdir']);
    });

    it('should include stat info for each file', async () => {
      await fs.writeFile(path.join(testDir, 'file.txt'), 'content');

      const files = await adapter.list(testDir);

      expect(files[0].stat.isFile).toBe(true);
      expect(files[0].stat.size).toBe(7);
    });
  });

  describe('stat operation', () => {
    it('should return file stats', async () => {
      const filePath = path.join(testDir, 'stat-me.txt');
      await fs.writeFile(filePath, 'hello');

      const stat = await adapter.stat(filePath);

      expect(stat.size).toBe(5);
      expect(stat.isFile).toBe(true);
      expect(stat.isDirectory).toBe(false);
      expect(stat.mtime).toBeInstanceOf(Date);
    });

    it('should return directory stats', async () => {
      const stat = await adapter.stat(testDir);

      expect(stat.isFile).toBe(false);
      expect(stat.isDirectory).toBe(true);
    });
  });

  describe('path operations', () => {
    it('should join paths', () => {
      expect(adapter.join('a', 'b', 'c')).toBe(path.join('a', 'b', 'c'));
    });

    it('should get dirname', () => {
      expect(adapter.dirname('/a/b/c.txt')).toBe('/a/b');
    });

    it('should get basename', () => {
      expect(adapter.basename('/a/b/c.txt')).toBe('c.txt');
    });

    it('should get extname (lowercase)', () => {
      expect(adapter.extname('/a/b/FILE.JPG')).toBe('.jpg');
      expect(adapter.extname('/a/b/file.txt')).toBe('.txt');
    });
  });

  describe('stream operations', () => {
    it('should create readable stream', async () => {
      const filePath = path.join(testDir, 'stream.txt');
      await fs.writeFile(filePath, 'stream content');

      const stream = adapter.createReadStream(filePath);
      const chunks: Buffer[] = [];

      for await (const chunk of stream) {
        chunks.push(chunk as Buffer);
      }

      expect(Buffer.concat(chunks).toString()).toBe('stream content');
    });

    it('should create writable stream', async () => {
      const filePath = path.join(testDir, 'write-stream.txt');
      const stream = adapter.createWriteStream(filePath);

      await new Promise<void>((resolve, reject) => {
        stream.write('streamed content', (err) => {
          if (err) reject(err);
          stream.end(resolve);
        });
      });

      const content = await fs.readFile(filePath, 'utf-8');
      expect(content).toBe('streamed content');
    });
  });
});
