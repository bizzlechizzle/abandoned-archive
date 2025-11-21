import { createHash } from 'crypto';
import { createReadStream } from 'fs';

/**
 * Service for cryptographic operations
 */
export class CryptoService {
  /**
   * Calculate SHA256 hash of a file
   * @param filePath - Absolute path to the file
   * @returns Promise resolving to hex-encoded SHA256 hash
   */
  async calculateSHA256(filePath: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const hash = createHash('sha256');
      const stream = createReadStream(filePath);

      stream.on('data', (chunk) => {
        hash.update(chunk);
      });

      stream.on('end', () => {
        resolve(hash.digest('hex'));
      });

      stream.on('error', (error) => {
        reject(error);
      });
    });
  }

  /**
   * Calculate SHA256 hash of a buffer
   * @param buffer - Buffer to hash
   * @returns Hex-encoded SHA256 hash
   */
  calculateSHA256Buffer(buffer: Buffer): string {
    return createHash('sha256').update(buffer).digest('hex');
  }
}
