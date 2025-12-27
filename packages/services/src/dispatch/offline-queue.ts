/**
 * Offline Queue for Dispatch Jobs
 *
 * Queues jobs locally when disconnected from dispatch hub.
 * Auto-syncs when connection is restored.
 *
 * Platform-agnostic - uses configurable database path.
 */

import Database from 'better-sqlite3';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as crypto from 'crypto';
import type { JobSubmission, QueuedJob } from './types.js';

export class OfflineQueue {
  private db: Database.Database;

  /**
   * Create offline queue with configurable database location.
   * @param dataDir Directory for queue database. Defaults to ~/.abandoned-archive/
   */
  constructor(dataDir?: string) {
    const dir = dataDir || path.join(os.homedir(), '.abandoned-archive');
    const dbPath = path.join(dir, 'dispatch-offline-queue.db');

    // Ensure directory exists
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    this.db = new Database(dbPath);
    this.init();
  }

  private init(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS queued_jobs (
        id TEXT PRIMARY KEY,
        job TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        attempts INTEGER DEFAULT 0
      )
    `);
  }

  /**
   * Add a job to the queue.
   * @returns Queue ID
   */
  add(job: JobSubmission): string {
    const id = crypto.randomUUID();
    this.db
      .prepare('INSERT INTO queued_jobs (id, job, created_at) VALUES (?, ?, ?)')
      .run(id, JSON.stringify(job), Date.now());
    return id;
  }

  /**
   * Get all queued jobs, ordered by creation time.
   */
  getAll(): QueuedJob[] {
    const rows = this.db
      .prepare('SELECT * FROM queued_jobs ORDER BY created_at ASC')
      .all() as { id: string; job: string; created_at: number; attempts: number }[];

    return rows.map((row) => ({
      id: row.id,
      job: JSON.parse(row.job),
      createdAt: row.created_at,
      attempts: row.attempts,
    }));
  }

  /**
   * Get count of queued jobs.
   */
  getCount(): number {
    const result = this.db.prepare('SELECT COUNT(*) as count FROM queued_jobs').get() as {
      count: number;
    };
    return result.count;
  }

  /**
   * Remove a job from the queue.
   */
  remove(id: string): void {
    this.db.prepare('DELETE FROM queued_jobs WHERE id = ?').run(id);
  }

  /**
   * Increment attempt count for a job.
   */
  incrementAttempts(id: string): void {
    this.db
      .prepare('UPDATE queued_jobs SET attempts = attempts + 1 WHERE id = ?')
      .run(id);
  }

  /**
   * Clear all jobs from queue.
   */
  clear(): void {
    this.db.exec('DELETE FROM queued_jobs');
  }

  /**
   * Close the database connection.
   */
  close(): void {
    this.db.close();
  }
}
