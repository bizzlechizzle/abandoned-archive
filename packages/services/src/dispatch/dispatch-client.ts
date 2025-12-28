/**
 * Dispatch Client Service
 *
 * Handles all communication with the dispatch hub:
 * - Authentication (login, logout, token refresh)
 * - Socket.IO connection for real-time updates
 * - Job submission and tracking
 *
 * Platform-agnostic - uses injected TokenStorage.
 * All job processing goes through the central hub.
 */

import { io, Socket } from 'socket.io-client';
import { EventEmitter } from 'events';
import { FileStorage } from './token-storage.js';
import type {
  DispatchConfig,
  TokenStorage,
  JobSubmission,
  JobProgress,
  JobUpdate,
  DispatchStatus,
  Worker,
  ApiLocation,
  ApiLocationFilters,
  ApiCreateLocationInput,
  ApiMedia,
  ApiMediaFilters,
  ApiCreateMediaInput,
  MediaTag,
  AddTagInput,
  Sublocation,
  LocationNote,
  MapPoint,
  ParsedMapResult,
  DedupResult,
  MatchResult,
  ExportResult,
  PaginatedResponse,
} from './types.js';

export interface DispatchClientOptions {
  config: DispatchConfig;
  tokenStorage?: TokenStorage;
}

export class DispatchClient extends EventEmitter {
  private socket: Socket | null = null;
  private accessToken: string | null = null;
  private refreshToken: string | null = null;
  private config: DispatchConfig;
  private tokenStorage: TokenStorage;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private pendingJobs: Map<string, JobSubmission> = new Map();
  private isOnline: boolean = false;

  constructor(options: DispatchClientOptions) {
    super();
    this.config = options.config;
    this.tokenStorage = options.tokenStorage || new FileStorage(options.config.dataDir);
    this.loadStoredTokens();
  }

  // ============================================
  // Token Management
  // ============================================

  private loadStoredTokens(): void {
    try {
      const tokens = this.tokenStorage.load();
      if (tokens) {
        this.accessToken = tokens.accessToken;
        this.refreshToken = tokens.refreshToken;
      }
    } catch (error) {
      console.error('[DispatchClient] Failed to load stored tokens:', error);
      this.clearTokens();
    }
  }

  private saveTokens(accessToken: string, refreshToken: string): void {
    try {
      this.tokenStorage.save({ accessToken, refreshToken });
      this.accessToken = accessToken;
      this.refreshToken = refreshToken;
    } catch (error) {
      console.error('[DispatchClient] Failed to save tokens:', error);
    }
  }

  private clearTokens(): void {
    try {
      this.tokenStorage.clear();
    } catch (error) {
      // Ignore
    }
    this.accessToken = null;
    this.refreshToken = null;
  }

  // ============================================
  // Authentication
  // ============================================

  async login(username: string, password: string): Promise<boolean> {
    try {
      const response = await fetch(`${this.config.hubUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });

      if (!response.ok) {
        const errorData = (await response.json()) as { message?: string };
        throw new Error(errorData.message || 'Login failed');
      }

      const data = (await response.json()) as { accessToken: string; refreshToken: string };
      this.saveTokens(data.accessToken, data.refreshToken);

      // Connect socket after successful login
      this.connectSocket();

      return true;
    } catch (error) {
      this.emit('error', { type: 'auth', error });
      throw error;
    }
  }

  async refreshAccessToken(): Promise<boolean> {
    if (!this.refreshToken) {
      return false;
    }

    try {
      const response = await fetch(`${this.config.hubUrl}/api/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: this.refreshToken }),
      });

      if (!response.ok) {
        this.clearTokens();
        this.emit('auth:required');
        return false;
      }

      const data = (await response.json()) as { accessToken: string; refreshToken: string };
      this.saveTokens(data.accessToken, data.refreshToken);
      return true;
    } catch (error) {
      this.clearTokens();
      this.emit('auth:required');
      return false;
    }
  }

  async logout(): Promise<void> {
    if (this.accessToken) {
      try {
        await fetch(`${this.config.hubUrl}/api/auth/logout`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${this.accessToken}` },
        });
      } catch (error) {
        // Ignore logout errors
      }
    }

    this.clearTokens();
    this.disconnectSocket();
    this.emit('auth:logout');
  }

  isAuthenticated(): boolean {
    return this.accessToken !== null;
  }

  // ============================================
  // Socket.IO Connection
  // ============================================

  private connectSocket(): void {
    if (this.socket?.connected) {
      return;
    }

    this.socket = io(this.config.hubUrl, {
      auth: { token: this.accessToken },
      reconnection: this.config.autoReconnect,
      reconnectionDelay: this.config.reconnectInterval,
      reconnectionAttempts: 10,
    });

    this.socket.on('connect', () => {
      this.isOnline = true;
      this.emit('connected');
    });

    this.socket.on('disconnect', (reason) => {
      this.isOnline = false;
      this.emit('disconnected', reason);
    });

    this.socket.on('connect_error', async (error) => {
      if (error.message.includes('unauthorized')) {
        const refreshed = await this.refreshAccessToken();
        if (refreshed && this.socket) {
          this.socket.auth = { token: this.accessToken };
          this.socket.connect();
        }
      }
    });

    // Job events
    this.socket.on('job:progress', (data: JobProgress) => {
      this.emit('job:progress', data);
    });

    this.socket.on('job:updated', (data: JobUpdate) => {
      this.emit('job:updated', data);

      // Remove from pending if completed/failed
      if (['completed', 'failed', 'cancelled'].includes(data.status)) {
        this.pendingJobs.delete(data.jobId);
      }
    });
  }

  private disconnectSocket(): void {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
    this.isOnline = false;
  }

  // ============================================
  // Job Operations
  // ============================================

  private async apiRequest<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const url = `${this.config.hubUrl}${endpoint}`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string>),
    };

    if (this.accessToken) {
      headers['Authorization'] = `Bearer ${this.accessToken}`;
    }

    const response = await fetch(url, { ...options, headers });

    if (response.status === 401) {
      const refreshed = await this.refreshAccessToken();
      if (refreshed) {
        headers['Authorization'] = `Bearer ${this.accessToken}`;
        const retryResponse = await fetch(url, { ...options, headers });
        if (!retryResponse.ok) {
          throw new Error(`API request failed: ${retryResponse.statusText}`);
        }
        return (await retryResponse.json()) as T;
      }
      throw new Error('Authentication required');
    }

    if (!response.ok) {
      const errorData = (await response.json().catch(() => ({}))) as { message?: string };
      throw new Error(errorData.message || `API request failed: ${response.statusText}`);
    }

    return (await response.json()) as T;
  }

  async submitJob(job: JobSubmission): Promise<string> {
    if (!this.isOnline) {
      throw new Error('Cannot submit job: not connected to dispatch hub');
    }

    const result = await this.apiRequest<{ id: string }>('/api/jobs', {
      method: 'POST',
      body: JSON.stringify({
        type: job.type,
        plugin: job.plugin,
        priority: job.priority || 'NORMAL',
        data: job.data,
      }),
    });

    // Track pending job
    this.pendingJobs.set(result.id, job);

    return result.id;
  }

  async getJob(jobId: string): Promise<JobUpdate | null> {
    try {
      const result = await this.apiRequest<{ job: JobUpdate }>(`/api/jobs/${jobId}`);
      return result.job;
    } catch (error) {
      return null;
    }
  }

  async cancelJob(jobId: string): Promise<void> {
    await this.apiRequest(`/api/jobs/${jobId}/cancel`, { method: 'POST' });
    this.pendingJobs.delete(jobId);
  }

  async listJobs(filter?: { status?: string; limit?: number }): Promise<JobUpdate[]> {
    const params = new URLSearchParams();
    if (filter?.status) params.set('status', filter.status);
    if (filter?.limit) params.set('limit', String(filter.limit));

    const query = params.toString();
    const result = await this.apiRequest<{ jobs: JobUpdate[] }>(
      `/api/jobs${query ? `?${query}` : ''}`
    );
    return result.jobs;
  }

  // ============================================
  // Worker Operations
  // ============================================

  async listWorkers(): Promise<Worker[]> {
    const result = await this.apiRequest<{ workers: Worker[] }>('/api/workers');
    return result.workers;
  }

  // ============================================
  // Location Operations
  // ============================================

  async getLocations(filters?: ApiLocationFilters): Promise<PaginatedResponse<ApiLocation>> {
    const params = new URLSearchParams();
    if (filters?.search) params.set('search', filters.search);
    if (filters?.status) params.set('status', filters.status);
    if (filters?.state) params.set('state', filters.state);
    if (filters?.city) params.set('city', filters.city);
    if (filters?.category) params.set('category', filters.category);
    if (filters?.favorite !== undefined) params.set('favorite', String(filters.favorite));
    if (filters?.project !== undefined) params.set('project', String(filters.project));
    if (filters?.historic !== undefined) params.set('historic', String(filters.historic));
    if (filters?.limit) params.set('limit', String(filters.limit));
    if (filters?.offset) params.set('offset', String(filters.offset));

    const query = params.toString();
    return this.apiRequest<PaginatedResponse<ApiLocation>>(
      `/api/locations${query ? `?${query}` : ''}`
    );
  }

  async getLocation(id: string): Promise<ApiLocation> {
    const result = await this.apiRequest<{ location: ApiLocation }>(`/api/locations/${id}`);
    return result.location;
  }

  async createLocation(data: ApiCreateLocationInput): Promise<ApiLocation> {
    const result = await this.apiRequest<{ location: ApiLocation }>('/api/locations', {
      method: 'POST',
      body: JSON.stringify(data),
    });
    return result.location;
  }

  async updateLocation(id: string, data: Partial<ApiCreateLocationInput>): Promise<ApiLocation> {
    const result = await this.apiRequest<{ location: ApiLocation }>(`/api/locations/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
    return result.location;
  }

  async deleteLocation(id: string): Promise<void> {
    await this.apiRequest(`/api/locations/${id}`, { method: 'DELETE' });
  }

  async recordLocationView(id: string): Promise<void> {
    await this.apiRequest(`/api/locations/${id}/view`, { method: 'POST' });
  }

  async getLocationBounds(filters?: ApiLocationFilters): Promise<{
    minLat: number;
    maxLat: number;
    minLon: number;
    maxLon: number;
    count: number;
  }> {
    const params = new URLSearchParams();
    if (filters?.status) params.set('status', filters.status);
    if (filters?.state) params.set('state', filters.state);
    if (filters?.category) params.set('category', filters.category);

    const query = params.toString();
    return this.apiRequest(`/api/locations/bounds${query ? `?${query}` : ''}`);
  }

  async getNearbyLocations(
    lat: number,
    lon: number,
    radiusKm: number = 50,
    limit: number = 20
  ): Promise<Array<ApiLocation & { distance: number }>> {
    const params = new URLSearchParams({
      lat: String(lat),
      lon: String(lon),
      radius: String(radiusKm),
      limit: String(limit),
    });
    const result = await this.apiRequest<{ locations: Array<ApiLocation & { distance: number }> }>(
      `/api/locations/nearby?${params.toString()}`
    );
    return result.locations;
  }

  async getLocationFilterOptions(): Promise<{
    states: string[];
    cities: string[];
    categories: string[];
    classes: string[];
  }> {
    return this.apiRequest('/api/locations/filter-options');
  }

  // ============================================
  // Sublocation Operations
  // ============================================

  async getSublocations(locationId: string): Promise<Sublocation[]> {
    const result = await this.apiRequest<{ sublocations: Sublocation[] }>(
      `/api/locations/${locationId}/sublocations`
    );
    return result.sublocations;
  }

  async createSublocation(
    locationId: string,
    data: { name: string; shortName?: string; legacySubid?: string }
  ): Promise<Sublocation> {
    const result = await this.apiRequest<{ sublocation: Sublocation }>(
      `/api/locations/${locationId}/sublocations`,
      {
        method: 'POST',
        body: JSON.stringify(data),
      }
    );
    return result.sublocation;
  }

  async deleteSublocation(locationId: string, sublocationId: string): Promise<void> {
    await this.apiRequest(`/api/locations/${locationId}/sublocations/${sublocationId}`, {
      method: 'DELETE',
    });
  }

  // ============================================
  // Location Note Operations
  // ============================================

  async getLocationNotes(locationId: string): Promise<LocationNote[]> {
    const result = await this.apiRequest<{ notes: LocationNote[] }>(
      `/api/locations/${locationId}/notes`
    );
    return result.notes;
  }

  async createLocationNote(
    locationId: string,
    data: { noteText: string; noteType?: string }
  ): Promise<LocationNote> {
    const result = await this.apiRequest<{ note: LocationNote }>(
      `/api/locations/${locationId}/notes`,
      {
        method: 'POST',
        body: JSON.stringify(data),
      }
    );
    return result.note;
  }

  async deleteLocationNote(locationId: string, noteId: string): Promise<void> {
    await this.apiRequest(`/api/locations/${locationId}/notes/${noteId}`, {
      method: 'DELETE',
    });
  }

  // ============================================
  // Media Operations
  // ============================================

  async getMedia(filters?: ApiMediaFilters): Promise<PaginatedResponse<ApiMedia>> {
    const params = new URLSearchParams();
    if (filters?.locationId) params.set('locationId', filters.locationId);
    if (filters?.sublocationId) params.set('sublocationId', filters.sublocationId);
    if (filters?.mimeType) params.set('mimeType', filters.mimeType);
    if (filters?.limit) params.set('limit', String(filters.limit));
    if (filters?.offset) params.set('offset', String(filters.offset));

    const query = params.toString();
    return this.apiRequest<PaginatedResponse<ApiMedia>>(`/api/media${query ? `?${query}` : ''}`);
  }

  async getMediaById(id: string): Promise<ApiMedia> {
    const result = await this.apiRequest<{ media: ApiMedia }>(`/api/media/${id}`);
    return result.media;
  }

  async getMediaByHash(hash: string): Promise<ApiMedia | null> {
    try {
      const result = await this.apiRequest<{ media: ApiMedia }>(`/api/media/hash/${hash}`);
      return result.media;
    } catch {
      return null;
    }
  }

  async createMedia(data: ApiCreateMediaInput): Promise<ApiMedia> {
    const result = await this.apiRequest<{ media: ApiMedia }>('/api/media', {
      method: 'POST',
      body: JSON.stringify(data),
    });
    return result.media;
  }

  async updateMedia(id: string, data: Partial<ApiCreateMediaInput>): Promise<ApiMedia> {
    const result = await this.apiRequest<{ media: ApiMedia }>(`/api/media/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
    return result.media;
  }

  async deleteMedia(id: string): Promise<void> {
    await this.apiRequest(`/api/media/${id}`, { method: 'DELETE' });
  }

  async setMediaThumbnails(
    id: string,
    thumbnails: { thumbPath?: string; thumbPathSm?: string; thumbPathLg?: string; previewPath?: string; posterPath?: string }
  ): Promise<ApiMedia> {
    const result = await this.apiRequest<{ media: ApiMedia }>(`/api/media/${id}/thumbnails`, {
      method: 'PUT',
      body: JSON.stringify(thumbnails),
    });
    return result.media;
  }

  async hideMedia(id: string, reason?: string): Promise<ApiMedia> {
    const result = await this.apiRequest<{ media: ApiMedia }>(`/api/media/${id}/hide`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    });
    return result.media;
  }

  async unhideMedia(id: string): Promise<ApiMedia> {
    const result = await this.apiRequest<{ media: ApiMedia }>(`/api/media/${id}/unhide`, {
      method: 'POST',
    });
    return result.media;
  }

  // ============================================
  // Media Tag Operations
  // ============================================

  async getMediaTags(mediaId: string): Promise<MediaTag[]> {
    const result = await this.apiRequest<{ tags: MediaTag[] }>(`/api/media/${mediaId}/tags`);
    return result.tags;
  }

  async addMediaTag(mediaId: string, tag: AddTagInput): Promise<MediaTag> {
    const result = await this.apiRequest<{ tag: MediaTag }>(`/api/media/${mediaId}/tags`, {
      method: 'POST',
      body: JSON.stringify(tag),
    });
    return result.tag;
  }

  async removeMediaTag(mediaId: string, tagId: string): Promise<void> {
    await this.apiRequest(`/api/media/${mediaId}/tags/${tagId}`, { method: 'DELETE' });
  }

  // ============================================
  // Map Operations
  // ============================================

  async parseMapFile(format: string, content: string, name?: string): Promise<ParsedMapResult> {
    return this.apiRequest<ParsedMapResult>('/api/maps/parse', {
      method: 'POST',
      body: JSON.stringify({ format, content, name }),
    });
  }

  async deduplicatePoints(points: MapPoint[], radiusMeters: number = 100): Promise<DedupResult> {
    return this.apiRequest<DedupResult>('/api/maps/dedup', {
      method: 'POST',
      body: JSON.stringify({ points, radiusMeters }),
    });
  }

  async matchPointsToLocations(
    points: MapPoint[],
    options?: { radiusMeters?: number; requireName?: boolean }
  ): Promise<MatchResult> {
    return this.apiRequest<MatchResult>('/api/maps/match', {
      method: 'POST',
      body: JSON.stringify({ points, ...options }),
    });
  }

  async exportPoints(
    points: MapPoint[],
    format: 'kml' | 'gpx' | 'geojson' | 'csv',
    name?: string
  ): Promise<ExportResult> {
    return this.apiRequest<ExportResult>('/api/maps/export', {
      method: 'POST',
      body: JSON.stringify({ points, format, name }),
    });
  }

  // ============================================
  // Reference Map Operations
  // ============================================

  async getReferenceMaps(locationId?: string): Promise<Array<{
    id: string;
    name: string;
    sourceFile: string;
    format: string;
    pointCount: number;
    locationId?: string;
    createdAt: string;
  }>> {
    const params = new URLSearchParams();
    if (locationId) params.set('locationId', locationId);
    const query = params.toString();
    const result = await this.apiRequest<{ maps: Array<{
      id: string;
      name: string;
      sourceFile: string;
      format: string;
      pointCount: number;
      locationId?: string;
      createdAt: string;
    }> }>(`/api/maps/references${query ? `?${query}` : ''}`);
    return result.maps;
  }

  async createReferenceMap(data: {
    name: string;
    sourceFile: string;
    format: string;
    locationId?: string;
  }): Promise<{ id: string }> {
    return this.apiRequest<{ id: string }>('/api/maps/references', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async deleteReferenceMap(id: string): Promise<void> {
    await this.apiRequest(`/api/maps/references/${id}`, { method: 'DELETE' });
  }

  async getReferenceMapPoints(mapId: string): Promise<Array<MapPoint & { id: string; matchedLocationId?: string }>> {
    const result = await this.apiRequest<{ points: Array<MapPoint & { id: string; matchedLocationId?: string }> }>(
      `/api/maps/references/${mapId}/points`
    );
    return result.points;
  }

  async addReferenceMapPoints(mapId: string, points: MapPoint[]): Promise<{ count: number }> {
    return this.apiRequest<{ count: number }>(`/api/maps/references/${mapId}/points/bulk`, {
      method: 'POST',
      body: JSON.stringify({ points }),
    });
  }

  async matchReferenceMapPoint(mapId: string, pointId: string, locationId: string): Promise<void> {
    await this.apiRequest(`/api/maps/references/${mapId}/points/${pointId}/match`, {
      method: 'PUT',
      body: JSON.stringify({ locationId }),
    });
  }

  // ============================================
  // File Upload Operations
  // ============================================

  async uploadFile(
    locationId: string,
    file: { name: string; data: Buffer | Uint8Array; mimeType: string },
    sublocationId?: string
  ): Promise<{ jobId: string }> {
    // Create FormData-like structure for the upload
    const boundary = '----FormBoundary' + Math.random().toString(36).substring(2);
    const parts: Uint8Array[] = [];
    const encoder = new TextEncoder();

    // Add locationId field
    parts.push(encoder.encode(`--${boundary}\r\n`));
    parts.push(encoder.encode('Content-Disposition: form-data; name="locationId"\r\n\r\n'));
    parts.push(encoder.encode(`${locationId}\r\n`));

    // Add sublocationId if provided
    if (sublocationId) {
      parts.push(encoder.encode(`--${boundary}\r\n`));
      parts.push(encoder.encode('Content-Disposition: form-data; name="sublocationId"\r\n\r\n'));
      parts.push(encoder.encode(`${sublocationId}\r\n`));
    }

    // Add file
    parts.push(encoder.encode(`--${boundary}\r\n`));
    parts.push(
      encoder.encode(
        `Content-Disposition: form-data; name="file"; filename="${file.name}"\r\n`
      )
    );
    parts.push(encoder.encode(`Content-Type: ${file.mimeType}\r\n\r\n`));
    parts.push(file.data instanceof Buffer ? new Uint8Array(file.data) : file.data);
    parts.push(encoder.encode('\r\n'));
    parts.push(encoder.encode(`--${boundary}--\r\n`));

    // Combine all parts
    const totalLength = parts.reduce((sum, part) => sum + part.length, 0);
    const body = new Uint8Array(totalLength);
    let offset = 0;
    for (const part of parts) {
      body.set(part, offset);
      offset += part.length;
    }

    const url = `${this.config.hubUrl}/api/upload`;
    const headers: Record<string, string> = {
      'Content-Type': `multipart/form-data; boundary=${boundary}`,
    };

    if (this.accessToken) {
      headers['Authorization'] = `Bearer ${this.accessToken}`;
    }

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body,
    });

    if (response.status === 401) {
      const refreshed = await this.refreshAccessToken();
      if (refreshed) {
        headers['Authorization'] = `Bearer ${this.accessToken}`;
        const retryResponse = await fetch(url, { method: 'POST', headers, body });
        if (!retryResponse.ok) {
          throw new Error(`Upload failed: ${retryResponse.statusText}`);
        }
        return (await retryResponse.json()) as { jobId: string };
      }
      throw new Error('Authentication required');
    }

    if (!response.ok) {
      const errorData = (await response.json().catch(() => ({}))) as { message?: string };
      throw new Error(errorData.message || `Upload failed: ${response.statusText}`);
    }

    return (await response.json()) as { jobId: string };
  }

  // ============================================
  // Connection Status
  // ============================================

  isConnected(): boolean {
    return this.socket?.connected ?? false;
  }

  async checkConnection(): Promise<boolean> {
    try {
      const response = await fetch(`${this.config.hubUrl}/health`);
      return response.ok;
    } catch {
      return false;
    }
  }

  getStatus(): DispatchStatus {
    return {
      connected: this.isOnline,
      authenticated: this.isAuthenticated(),
      hubUrl: this.config.hubUrl,
    };
  }

  // ============================================
  // Configuration
  // ============================================

  setHubUrl(url: string): void {
    this.config.hubUrl = url;
    // Reconnect if authenticated
    if (this.isAuthenticated()) {
      this.disconnectSocket();
      this.connectSocket();
    }
  }

  getHubUrl(): string {
    return this.config.hubUrl;
  }

  // ============================================
  // Lifecycle
  // ============================================

  async initialize(): Promise<void> {
    if (this.accessToken) {
      // Validate existing token
      const valid = await this.refreshAccessToken();
      if (valid) {
        this.connectSocket();
      } else {
        this.emit('auth:required');
      }
    } else {
      this.emit('auth:required');
    }
  }

  destroy(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
    }
    this.disconnectSocket();
    this.removeAllListeners();
  }
}

// ============================================
// Singleton Factory
// ============================================

let dispatchClientInstance: DispatchClient | null = null;

export interface CreateDispatchClientOptions {
  hubUrl?: string;
  dataDir?: string;
  tokenStorage?: TokenStorage;
}

/**
 * Get or create the dispatch client singleton.
 */
export function getDispatchClient(options?: CreateDispatchClientOptions): DispatchClient {
  if (!dispatchClientInstance) {
    const hubUrl = options?.hubUrl || process.env.DISPATCH_HUB_URL || 'http://192.168.1.199:3000';
    const dataDir = options?.dataDir || process.env.DISPATCH_DATA_DIR;

    dispatchClientInstance = new DispatchClient({
      config: {
        hubUrl,
        autoReconnect: true,
        reconnectInterval: 5000,
        dataDir: dataDir || '',
      },
      tokenStorage: options?.tokenStorage,
    });
  }
  return dispatchClientInstance;
}

/**
 * Destroy the dispatch client singleton.
 */
export function destroyDispatchClient(): void {
  if (dispatchClientInstance) {
    dispatchClientInstance.destroy();
    dispatchClientInstance = null;
  }
}
