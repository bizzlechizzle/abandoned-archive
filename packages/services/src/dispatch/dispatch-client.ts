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
  WebSource,
  WebSourceVersion,
  TimelineEvent,
} from './types.js';

export interface DispatchClientOptions {
  config: DispatchConfig;
  tokenStorage?: TokenStorage;
  authDisabled?: boolean;
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
  private authDisabled: boolean = false;

  constructor(options: DispatchClientOptions) {
    super();
    this.config = options.config;
    this.authDisabled = options.authDisabled ?? false;
    this.tokenStorage = options.tokenStorage || new FileStorage(options.config.dataDir);
    if (!this.authDisabled) {
      this.loadStoredTokens();
    }
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
      const loginUrl = `${this.config.hubUrl}/api/auth/login`;
      console.log(`[DispatchClient] Attempting login to ${loginUrl} as ${username}`);

      const response = await fetch(loginUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });

      console.log(`[DispatchClient] Login response status: ${response.status}`);

      if (!response.ok) {
        const errorData = (await response.json()) as { message?: string };
        console.error(`[DispatchClient] Login failed:`, errorData);
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
    return this.authDisabled || this.accessToken !== null;
  }

  /**
   * Connect directly without authentication.
   * Use this when the dispatch hub has DISPATCH_AUTH_DISABLED=true.
   */
  async connectWithoutAuth(): Promise<void> {
    if (!this.authDisabled) {
      console.warn('[DispatchClient] connectWithoutAuth called but authDisabled is false');
    }
    this.connectSocket();
  }

  // ============================================
  // Socket.IO Connection
  // ============================================

  private connectSocket(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.socket?.connected) {
        resolve();
        return;
      }

      // When auth is disabled, connect without a token
      const auth = this.authDisabled ? {} : { token: this.accessToken };

      this.socket = io(this.config.hubUrl, {
        auth,
        reconnection: this.config.autoReconnect,
        reconnectionDelay: this.config.reconnectInterval,
        reconnectionAttempts: 10,
        timeout: 10000, // 10 second connection timeout
      });

      // Connection timeout
      const connectionTimeout = setTimeout(() => {
        reject(new Error('Socket connection timeout'));
      }, 15000);

      this.socket.on('connect', () => {
        clearTimeout(connectionTimeout);
        this.isOnline = true;
        this.emit('connected');
        resolve();
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
        } else {
          // For other errors, reject the promise on first attempt
          clearTimeout(connectionTimeout);
          // Don't reject - let socket.io retry
          console.warn('[DispatchClient] Connection error:', error.message);
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
    });
  }

  private disconnectSocket(): void {
    if (this.socket) {
      this.socket.removeAllListeners(); // Prevent memory leak on reconnection
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

    // Only add auth header if auth is enabled and we have a token
    if (!this.authDisabled && this.accessToken) {
      headers['Authorization'] = `Bearer ${this.accessToken}`;
    }

    const response = await fetch(url, { ...options, headers });

    // Skip auth retry logic when auth is disabled
    if (!this.authDisabled && response.status === 401) {
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
    if (!this.authDisabled && !this.isAuthenticated()) {
      throw new Error('Cannot submit job: not authenticated with dispatch hub');
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

  async getRecentlyViewedLocations(limit: number = 20): Promise<Array<{
    id: string;
    name: string;
    category: string | null;
    addressState: string | null;
    addressCity: string | null;
    lastViewedAt: string | null;
    viewCount: number;
  }>> {
    const result = await this.apiRequest<{ locations: Array<{
      id: string;
      name: string;
      category: string | null;
      addressState: string | null;
      addressCity: string | null;
      lastViewedAt: string | null;
      viewCount: number;
    }> }>(`/api/locations/recent-views?limit=${limit}`);
    return result.locations;
  }

  async getMostViewedLocations(limit: number = 20): Promise<Array<{
    id: string;
    name: string;
    category: string | null;
    addressState: string | null;
    addressCity: string | null;
    lastViewedAt: string | null;
    viewCount: number;
  }>> {
    const result = await this.apiRequest<{ locations: Array<{
      id: string;
      name: string;
      category: string | null;
      addressState: string | null;
      addressCity: string | null;
      lastViewedAt: string | null;
      viewCount: number;
    }> }>(`/api/locations/most-viewed?limit=${limit}`);
    return result.locations;
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

  async updateSublocation(
    locationId: string,
    sublocationId: string,
    data: { name?: string; shortName?: string }
  ): Promise<Sublocation> {
    const result = await this.apiRequest<{ sublocation: Sublocation }>(
      `/api/locations/${locationId}/sublocations/${sublocationId}`,
      {
        method: 'PUT',
        body: JSON.stringify(data),
      }
    );
    return result.sublocation;
  }

  async updateSublocationGps(
    locationId: string,
    sublocationId: string,
    data: { lat: number; lng: number; accuracy?: number; source?: string }
  ): Promise<Sublocation> {
    const result = await this.apiRequest<{ sublocation: Sublocation }>(
      `/api/locations/${locationId}/sublocations/${sublocationId}/gps`,
      {
        method: 'PUT',
        body: JSON.stringify(data),
      }
    );
    return result.sublocation;
  }

  async setSublocationPrimary(locationId: string, sublocationId: string): Promise<Sublocation> {
    const result = await this.apiRequest<{ sublocation: Sublocation }>(
      `/api/locations/${locationId}/sublocations/${sublocationId}/primary`,
      { method: 'PUT' }
    );
    return result.sublocation;
  }

  async getSublocationStats(locationId: string): Promise<{
    count: number;
    withGps: number;
    withMedia: number;
  }> {
    return this.apiRequest(`/api/locations/${locationId}/sublocations/stats`);
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

  async updateLocationNote(
    locationId: string,
    noteId: string,
    data: { noteText?: string; noteType?: string }
  ): Promise<LocationNote> {
    const result = await this.apiRequest<{ note: LocationNote }>(
      `/api/locations/${locationId}/notes/${noteId}`,
      {
        method: 'PUT',
        body: JSON.stringify(data),
      }
    );
    return result.note;
  }

  async getRecentNotes(limit: number = 20): Promise<Array<LocationNote & { locationName: string }>> {
    const result = await this.apiRequest<{ notes: Array<LocationNote & { locationName: string }> }>(
      `/api/notes/recent?limit=${limit}`
    );
    return result.notes;
  }

  // ============================================
  // Location Exclusion/Hidden Operations
  // ============================================

  async setLocationHidden(
    locationId: string,
    hidden: boolean,
    reason?: string
  ): Promise<ApiLocation> {
    const result = await this.apiRequest<{ location: ApiLocation }>(
      `/api/locations/${locationId}/hidden`,
      {
        method: 'PUT',
        body: JSON.stringify({ hidden, reason }),
      }
    );
    return result.location;
  }

  async getHiddenLocations(options?: {
    limit?: number;
    offset?: number;
  }): Promise<Array<{
    id: string;
    name: string;
    category: string | null;
    addressState: string | null;
    hiddenReason: string | null;
  }>> {
    const params = new URLSearchParams();
    if (options?.limit) params.set('limit', String(options.limit));
    if (options?.offset) params.set('offset', String(options.offset));
    const query = params.toString();
    const result = await this.apiRequest<{
      locations: Array<{
        id: string;
        name: string;
        category: string | null;
        addressState: string | null;
        hiddenReason: string | null;
      }>;
    }>(`/api/locations/hidden${query ? `?${query}` : ''}`);
    return result.locations;
  }

  // ============================================
  // Web Sources Operations
  // ============================================

  async getWebSources(filters?: {
    locationId?: string;
    status?: string;
    search?: string;
    limit?: number;
    offset?: number;
  }): Promise<{
    sources: Array<WebSource>;
    total: number;
    limit: number;
    offset: number;
  }> {
    const params = new URLSearchParams();
    if (filters?.locationId) params.set('locationId', filters.locationId);
    if (filters?.status) params.set('status', filters.status);
    if (filters?.search) params.set('search', filters.search);
    if (filters?.limit) params.set('limit', String(filters.limit));
    if (filters?.offset) params.set('offset', String(filters.offset));
    const query = params.toString();
    return this.apiRequest(`/api/websources${query ? `?${query}` : ''}`);
  }

  async getWebSource(id: string): Promise<WebSource> {
    return this.apiRequest(`/api/websources/${id}`);
  }

  async getWebSourceByUrl(url: string): Promise<WebSource | null> {
    try {
      return await this.apiRequest(`/api/websources/by-url?url=${encodeURIComponent(url)}`);
    } catch {
      return null;
    }
  }

  async getWebSourcesByLocation(
    locationId: string,
    options?: { limit?: number; offset?: number }
  ): Promise<{ sources: WebSource[] }> {
    const params = new URLSearchParams();
    if (options?.limit) params.set('limit', String(options.limit));
    if (options?.offset) params.set('offset', String(options.offset));
    const query = params.toString();
    return this.apiRequest(`/api/websources/by-location/${locationId}${query ? `?${query}` : ''}`);
  }

  async createWebSource(data: {
    url: string;
    title?: string;
    locationId?: string;
    sublocationId?: string;
    sourceType?: string;
    notes?: string;
  }): Promise<WebSource> {
    return this.apiRequest('/api/websources', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateWebSource(
    id: string,
    data: Partial<{
      title: string;
      locationId: string | null;
      sublocationId: string | null;
      sourceType: string;
      notes: string | null;
      status: string;
      extractedTitle: string | null;
      extractedAuthor: string | null;
      extractedDate: string | null;
      extractedPublisher: string | null;
      extractedText: string | null;
      wordCount: number;
      imageCount: number;
      videoCount: number;
      archivePath: string | null;
      screenshotPath: string | null;
      pdfPath: string | null;
      htmlPath: string | null;
      warcPath: string | null;
      archiveError: string | null;
      domain: string | null;
      canonicalUrl: string | null;
      language: string | null;
    }>
  ): Promise<WebSource> {
    return this.apiRequest(`/api/websources/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async deleteWebSource(id: string): Promise<void> {
    await this.apiRequest(`/api/websources/${id}`, { method: 'DELETE' });
  }

  async getWebSourceStats(): Promise<{
    total: number;
    pending: number;
    complete: number;
    failed: number;
    totalWords: number;
    totalImages: number;
  }> {
    return this.apiRequest('/api/websources/stats');
  }

  async searchWebSources(
    query: string,
    options?: { locationId?: string; limit?: number }
  ): Promise<{
    results: Array<{
      id: string;
      url: string;
      title: string | null;
      locationId: string | null;
      snippet: string;
    }>;
  }> {
    const params = new URLSearchParams({ q: query });
    if (options?.locationId) params.set('locationId', options.locationId);
    if (options?.limit) params.set('limit', String(options.limit));
    return this.apiRequest(`/api/websources/search?${params.toString()}`);
  }

  async getWebSourceVersions(sourceId: string): Promise<{
    versions: Array<WebSourceVersion>;
  }> {
    return this.apiRequest(`/api/websources/${sourceId}/versions`);
  }

  async getWebSourceVersion(
    sourceId: string,
    versionNumber: number
  ): Promise<WebSourceVersion | null> {
    try {
      return await this.apiRequest(`/api/websources/${sourceId}/versions/${versionNumber}`);
    } catch {
      return null;
    }
  }

  async createWebSourceVersion(
    sourceId: string,
    data: {
      archivePath: string;
      screenshotPath?: string;
      pdfPath?: string;
      htmlPath?: string;
      warcPath?: string;
      wordCount?: number;
      imageCount?: number;
      videoCount?: number;
      contentHash?: string;
    }
  ): Promise<WebSourceVersion> {
    return this.apiRequest(`/api/websources/${sourceId}/versions`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  // ============================================
  // Timeline Operations
  // ============================================

  async getTimelineEvents(filters?: {
    locationId?: string;
    eventType?: string;
    year?: number;
    month?: number;
    limit?: number;
    offset?: number;
  }): Promise<{
    events: TimelineEvent[];
    total: number;
    limit: number;
    offset: number;
  }> {
    const params = new URLSearchParams();
    if (filters?.locationId) params.set('locationId', filters.locationId);
    if (filters?.eventType) params.set('eventType', filters.eventType);
    if (filters?.year) params.set('year', String(filters.year));
    if (filters?.month) params.set('month', String(filters.month));
    if (filters?.limit) params.set('limit', String(filters.limit));
    if (filters?.offset) params.set('offset', String(filters.offset));
    const query = params.toString();
    return this.apiRequest(`/api/timeline${query ? `?${query}` : ''}`);
  }

  async getTimelineEvent(id: string): Promise<TimelineEvent> {
    return this.apiRequest(`/api/timeline/${id}`);
  }

  async getTimelineByLocation(
    locationId: string,
    options?: { limit?: number; offset?: number }
  ): Promise<{ events: TimelineEvent[] }> {
    const params = new URLSearchParams();
    if (options?.limit) params.set('limit', String(options.limit));
    if (options?.offset) params.set('offset', String(options.offset));
    const query = params.toString();
    return this.apiRequest(`/api/timeline/by-location/${locationId}${query ? `?${query}` : ''}`);
  }

  async getTimelineYears(): Promise<{ years: number[] }> {
    return this.apiRequest('/api/timeline/years');
  }

  async getTimelineStats(): Promise<{
    total: number;
    visits: number;
    established: number;
    approved: number;
    pending: number;
  }> {
    return this.apiRequest('/api/timeline/stats');
  }

  async createTimelineEvent(data: {
    locationId: string;
    sublocationId?: string;
    eventType: string;
    eventSubtype?: string;
    dateStart?: string;
    dateEnd?: string;
    datePrecision?: string;
    dateDisplay?: string;
    dateSort?: number;
    sourceType?: string;
    sourceRefs?: string;
    mediaCount?: number;
    mediaHashes?: string;
    notes?: string;
    autoApproved?: boolean;
  }): Promise<TimelineEvent> {
    return this.apiRequest('/api/timeline', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateTimelineEvent(
    id: string,
    data: Partial<{
      eventSubtype: string | null;
      dateStart: string | null;
      dateEnd: string | null;
      datePrecision: string;
      dateDisplay: string | null;
      dateSort: number | null;
      notes: string | null;
      userApproved: boolean;
    }>
  ): Promise<TimelineEvent> {
    return this.apiRequest(`/api/timeline/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async deleteTimelineEvent(id: string): Promise<void> {
    await this.apiRequest(`/api/timeline/${id}`, { method: 'DELETE' });
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
  // Project Operations
  // ============================================

  async getProjects(options?: { limit?: number; offset?: number }): Promise<{
    projects: Array<{
      id: string;
      name: string;
      description: string | null;
      createdAt: string;
      updatedAt: string;
      locationCount: number;
    }>;
    pagination: { total: number; limit: number; offset: number };
  }> {
    const params = new URLSearchParams();
    if (options?.limit) params.set('limit', String(options.limit));
    if (options?.offset) params.set('offset', String(options.offset));
    const query = params.toString();
    return this.apiRequest(`/api/projects${query ? `?${query}` : ''}`);
  }

  async getProject(projectId: string): Promise<{
    project: {
      id: string;
      name: string;
      description: string | null;
      createdAt: string;
      updatedAt: string;
      locations: Array<{
        locid: string;
        locnam: string;
        address_state: string | null;
        added_date: string | null;
      }>;
      locationCount: number;
    };
  }> {
    return this.apiRequest(`/api/projects/${projectId}`);
  }

  async createProject(data: { name: string; description?: string }): Promise<{
    project: {
      id: string;
      name: string;
      description: string | null;
      createdAt: string;
      updatedAt: string;
    };
  }> {
    return this.apiRequest('/api/projects', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateProject(
    projectId: string,
    data: { name?: string; description?: string }
  ): Promise<{
    project: {
      id: string;
      name: string;
      description: string | null;
      createdAt: string;
      updatedAt: string;
    };
  }> {
    return this.apiRequest(`/api/projects/${projectId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async deleteProject(projectId: string): Promise<void> {
    await this.apiRequest(`/api/projects/${projectId}`, { method: 'DELETE' });
  }

  async addLocationToProject(projectId: string, locationId: string): Promise<void> {
    await this.apiRequest(`/api/projects/${projectId}/locations`, {
      method: 'POST',
      body: JSON.stringify({ locationId }),
    });
  }

  async removeLocationFromProject(projectId: string, locationId: string): Promise<void> {
    await this.apiRequest(`/api/projects/${projectId}/locations/${locationId}`, {
      method: 'DELETE',
    });
  }

  async getProjectsForLocation(locationId: string): Promise<{
    projects: Array<{
      id: string;
      name: string;
      description: string | null;
      addedAt: string;
    }>;
  }> {
    return this.apiRequest(`/api/projects/for-location/${locationId}`);
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

    // Only add auth header if auth is enabled and we have a token
    if (!this.authDisabled && this.accessToken) {
      headers['Authorization'] = `Bearer ${this.accessToken}`;
    }

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body,
    });

    // Skip auth retry logic when auth is disabled
    if (!this.authDisabled && response.status === 401) {
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
    // If auth is disabled, just connect directly
    if (this.authDisabled) {
      console.log('[DispatchClient] Auth disabled - connecting without authentication');
      await this.connectSocket();
      console.log('[DispatchClient] Socket connected, isOnline:', this.isOnline);
      return;
    }

    if (this.accessToken) {
      // Validate existing token
      const valid = await this.refreshAccessToken();
      if (valid) {
        await this.connectSocket();
        console.log('[DispatchClient] Socket connected, isOnline:', this.isOnline);
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
  authDisabled?: boolean;
}

/**
 * Get or create the dispatch client singleton.
 */
export function getDispatchClient(options?: CreateDispatchClientOptions): DispatchClient {
  if (!dispatchClientInstance) {
    const hubUrl = options?.hubUrl || process.env.DISPATCH_HUB_URL || 'http://192.168.1.199:3000';
    const dataDir = options?.dataDir || process.env.DISPATCH_DATA_DIR;
    const authDisabled = options?.authDisabled ?? process.env.DISPATCH_AUTH_DISABLED === 'true';

    dispatchClientInstance = new DispatchClient({
      config: {
        hubUrl,
        autoReconnect: true,
        reconnectInterval: 5000,
        dataDir: dataDir || '',
      },
      tokenStorage: options?.tokenStorage,
      authDisabled,
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
