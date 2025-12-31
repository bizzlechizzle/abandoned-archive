/**
 * Progress Socket Server
 *
 * Unix socket server for receiving progress messages from pipeline tools.
 * Child processes connect to this socket to report progress.
 */

import { createServer, type Server, type Socket } from 'net';
import { createInterface, type Interface } from 'readline';
import { unlink } from 'fs/promises';
import { existsSync } from 'fs';
import type { ProgressMessage, ControlMessage } from './types';

/**
 * Progress listener callback
 */
export type ProgressListener = (
  sessionId: string,
  message: ProgressMessage
) => void;

/**
 * Progress Socket Server
 *
 * Creates a Unix socket that pipeline tools connect to for reporting progress.
 * The orchestrator spawns tools with PROGRESS_SOCKET env var pointing here.
 */
export class ProgressServer {
  private server: Server | null = null;
  private connections: Map<string, Socket> = new Map();
  private listeners: Set<ProgressListener> = new Set();
  private lineReaders: Map<Socket, Interface> = new Map();

  constructor(private socketPath: string) {}

  /**
   * Start the progress server
   */
  async start(): Promise<void> {
    // Cleanup stale socket
    if (existsSync(this.socketPath)) {
      await unlink(this.socketPath);
    }

    return new Promise((resolve, reject) => {
      this.server = createServer((socket) => this.handleConnection(socket));

      this.server.on('error', (err) => {
        console.error('[ProgressServer] Server error:', err);
        reject(err);
      });

      this.server.listen(this.socketPath, () => {
        console.log(`[ProgressServer] Listening on ${this.socketPath}`);
        resolve();
      });
    });
  }

  /**
   * Stop the progress server
   */
  async stop(): Promise<void> {
    // Close all connections
    for (const [sessionId, socket] of this.connections) {
      socket.destroy();
      this.connections.delete(sessionId);
    }

    // Close line readers
    for (const reader of this.lineReaders.values()) {
      reader.close();
    }
    this.lineReaders.clear();

    // Close server
    if (this.server) {
      return new Promise((resolve) => {
        this.server!.close(() => {
          this.server = null;
          // Cleanup socket file
          if (existsSync(this.socketPath)) {
            unlink(this.socketPath).catch(() => {});
          }
          resolve();
        });
      });
    }
  }

  /**
   * Add a progress listener
   */
  addListener(listener: ProgressListener): void {
    this.listeners.add(listener);
  }

  /**
   * Remove a progress listener
   */
  removeListener(listener: ProgressListener): void {
    this.listeners.delete(listener);
  }

  /**
   * Send control message to a session
   */
  sendControl(sessionId: string, message: ControlMessage): boolean {
    const socket = this.connections.get(sessionId);
    if (!socket || socket.destroyed) {
      return false;
    }

    try {
      socket.write(JSON.stringify(message) + '\n');
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Pause a session
   */
  pause(sessionId: string, reason?: string): boolean {
    return this.sendControl(sessionId, {
      type: 'control',
      command: 'pause',
      reason,
    });
  }

  /**
   * Resume a session
   */
  resume(sessionId: string): boolean {
    return this.sendControl(sessionId, {
      type: 'control',
      command: 'resume',
    });
  }

  /**
   * Cancel a session
   */
  cancel(sessionId: string, reason?: string): boolean {
    return this.sendControl(sessionId, {
      type: 'control',
      command: 'cancel',
      reason,
    });
  }

  /**
   * Get active session IDs
   */
  getActiveSessions(): string[] {
    return Array.from(this.connections.keys());
  }

  /**
   * Check if a session is connected
   */
  isConnected(sessionId: string): boolean {
    const socket = this.connections.get(sessionId);
    return socket !== undefined && !socket.destroyed;
  }

  /**
   * Handle new connection
   */
  private handleConnection(socket: Socket): void {
    let sessionId: string | null = null;

    // Create line reader for JSON messages
    const reader = createInterface({ input: socket });
    this.lineReaders.set(socket, reader);

    reader.on('line', (line) => {
      try {
        const message = JSON.parse(line) as ProgressMessage;

        // Track session ID from first message
        if (!sessionId && message.session_id) {
          sessionId = message.session_id;
          this.connections.set(sessionId, socket);
          console.log(`[ProgressServer] Session connected: ${sessionId}`);
        }

        // Notify listeners
        if (sessionId) {
          for (const listener of this.listeners) {
            try {
              listener(sessionId, message);
            } catch (err) {
              console.error('[ProgressServer] Listener error:', err);
            }
          }
        }
      } catch (err) {
        console.warn('[ProgressServer] Invalid message:', line);
      }
    });

    socket.on('close', () => {
      if (sessionId) {
        this.connections.delete(sessionId);
        console.log(`[ProgressServer] Session disconnected: ${sessionId}`);
      }
      const reader = this.lineReaders.get(socket);
      if (reader) {
        reader.close();
        this.lineReaders.delete(socket);
      }
    });

    socket.on('error', (err) => {
      console.warn('[ProgressServer] Socket error:', err.message);
    });
  }

  /**
   * Get socket path for child processes
   */
  getSocketPath(): string {
    return this.socketPath;
  }
}

/**
 * Create a progress server instance
 */
export function createProgressServer(socketPath: string): ProgressServer {
  return new ProgressServer(socketPath);
}
