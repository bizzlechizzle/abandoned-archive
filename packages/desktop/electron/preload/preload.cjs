"use strict";
// AU Archive Preload Script - Pure CommonJS
// This file is NOT processed by Vite - it's used directly by Electron
// IMPORTANT: Keep in sync with electron/preload/index.ts
// OPT-034: Added IPC timeout wrapper for all invoke calls

// DEBUG: Check what electron exports
const electronModule = require("electron");
const keys = Object.keys(electronModule);
console.log("[Preload] Electron module keys:", keys.join(", "));
console.log("[Preload] Electron version:", process.versions.electron);
console.log("[Preload] webUtils in keys:", keys.includes("webUtils"));

// Try different ways to access webUtils
let webUtils = electronModule.webUtils;
if (!webUtils) {
  // Try direct require (Electron 28+ preload pattern)
  try {
    const { webUtils: wu } = require("electron");
    webUtils = wu;
    console.log("[Preload] webUtils via destructure:", !!webUtils);
  } catch (e) {
    console.log("[Preload] webUtils destructure failed:", e.message);
  }
}

const { contextBridge, ipcRenderer } = electronModule;
console.log("[Preload] contextBridge available:", !!contextBridge);
console.log("[Preload] ipcRenderer available:", !!ipcRenderer);
console.log("[Preload] webUtils final:", !!webUtils);

// OPT-034: IPC timeout wrapper to prevent hanging operations
const DEFAULT_IPC_TIMEOUT = 30000; // 30 seconds for most operations
const LONG_IPC_TIMEOUT = 120000; // 2 minutes for import/regeneration operations
const VERY_LONG_IPC_TIMEOUT = 600000; // 10 minutes for batch operations

// OPT-034b: Dynamic import timeout constants for chunked imports
// Scales timeout based on file count to prevent timeout on large imports
const IMPORT_BASE_TIMEOUT = 60000;    // 1 minute base overhead (setup, post-processing)
const IMPORT_PER_FILE_TIMEOUT = 5000; // 5 seconds per file (hash + metadata + copy)
const IMPORT_MIN_TIMEOUT = 120000;    // 2 minute floor (maintains current behavior for small imports)
const IMPORT_MAX_TIMEOUT = 300000;    // 5 minute ceiling per chunk (prevents runaway)

/**
 * Wrap an IPC invoke call with a timeout
 * @param {Promise} promise - The IPC invoke promise
 * @param {number} timeoutMs - Timeout in milliseconds
 * @param {string} channel - The IPC channel name (for error messages)
 * @returns {Promise} - Promise that rejects on timeout
 */
function withTimeout(promise, timeoutMs, channel) {
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      setTimeout(() => {
        reject(new Error(`IPC timeout after ${timeoutMs}ms on channel: ${channel}`));
      }, timeoutMs);
    })
  ]);
}

/**
 * Create a wrapped IPC invoke function with timeout
 * @param {string} channel - The IPC channel
 * @param {number} timeout - Timeout in ms (default: DEFAULT_IPC_TIMEOUT)
 * @returns {Function} - Wrapped invoke function
 */
function invoke(channel, timeout = DEFAULT_IPC_TIMEOUT) {
  return (...args) => withTimeout(ipcRenderer.invoke(channel, ...args), timeout, channel);
}

// Long-running operation channels that need extended timeouts
const longOperationChannels = [
  "media:import",
  "media:phaseImport",
  "media:regenerateAllThumbnails",
  "media:regenerateVideoThumbnails",
  "media:regenerateDngPreviews",
  "media:generateProxiesForLocation",
  "refMaps:import",
  "refMaps:importFromPath",
  "refMaps:importWithOptions",
  "refMaps:deduplicate",
  "health:checkIntegrity",
  "health:runMaintenance",
  "database:backup",
  "database:restore",
  "location:backfillRegions",
  "bagit:validateAll",
  "bagit:regenerate",
];

const veryLongOperationChannels = [
  "media:regenerateAllThumbnails",
  "media:regenerateVideoThumbnails",
  "media:regenerateDngPreviews",
];

/**
 * Get appropriate timeout for a channel
 * @param {string} channel - The IPC channel
 * @returns {number} - Timeout in ms
 */
function getTimeout(channel) {
  if (veryLongOperationChannels.includes(channel)) {
    return VERY_LONG_IPC_TIMEOUT;
  }
  if (longOperationChannels.includes(channel)) {
    return LONG_IPC_TIMEOUT;
  }
  return DEFAULT_IPC_TIMEOUT;
}

/**
 * Create a wrapped IPC invoke function with auto-detected timeout
 * @param {string} channel - The IPC channel
 * @returns {Function} - Wrapped invoke function
 */
function invokeAuto(channel) {
  return invoke(channel, getTimeout(channel));
}

/**
 * Calculate dynamic timeout for import operations based on file count
 * OPT-034b: Scales timeout with file count to prevent large import timeouts
 * Formula: BASE + (fileCount * PER_FILE), clamped to [MIN, MAX]
 * @param {number} fileCount - Number of files being imported
 * @returns {number} - Timeout in ms
 */
function calculateImportTimeout(fileCount) {
  const calculated = IMPORT_BASE_TIMEOUT + (fileCount * IMPORT_PER_FILE_TIMEOUT);
  return Math.max(IMPORT_MIN_TIMEOUT, Math.min(calculated, IMPORT_MAX_TIMEOUT));
}

// OPT-034: All IPC calls now use timeout wrappers via invokeAuto()
const api = {
  versions: {
    node: () => process.versions.node,
    chrome: () => process.versions.chrome,
    electron: () => process.versions.electron,
  },
  platform: process.platform,

  locations: {
    findAll: (filters) => invokeAuto("location:findAll")(filters),
    findById: (id) => invokeAuto("location:findById")(id),
    create: (input) => invokeAuto("location:create")(input),
    update: (id, input) => invokeAuto("location:update")(id, input),
    delete: (id) => invokeAuto("location:delete")(id),
    count: (filters) => invokeAuto("location:count")(filters),
    random: () => invokeAuto("location:random")(),
    undocumented: () => invokeAuto("location:undocumented")(),
    historical: () => invokeAuto("location:historical")(),
    favorites: () => invokeAuto("location:favorites")(),
    toggleFavorite: (id) => invokeAuto("location:toggleFavorite")(id),
    findNearby: (lat, lng, radiusKm) => invokeAuto("location:findNearby")(lat, lng, radiusKm),
    // Kanye9: Check for duplicate locations by address
    checkDuplicates: (address) => invokeAuto("location:checkDuplicates")(address),
    // DECISION-018: Region data management
    updateRegionData: (id, regionData) => invokeAuto("location:updateRegionData")(id, regionData),
    backfillRegions: () => invokeAuto("location:backfillRegions")(),
    // Autocomplete helpers for Type/Sub-Type
    getDistinctTypes: () => invokeAuto("location:getDistinctTypes")(),
    getDistinctSubTypes: () => invokeAuto("location:getDistinctSubTypes")(),
    // Migration 34: View tracking
    trackView: (id) => invokeAuto("location:trackView")(id),
    getViewStats: (id) => invokeAuto("location:getViewStats")(id),
    getViewHistory: (id, limit) => invokeAuto("location:getViewHistory")(id, limit),
    // Dashboard: Recently viewed locations with hero thumbnails
    findRecentlyViewed: (limit) => invokeAuto("location:findRecentlyViewed")(limit),
    // Dashboard: Project locations with hero thumbnails
    findProjects: (limit) => invokeAuto("location:findProjects")(limit),
  },

  stats: {
    topStates: (limit) => invokeAuto("stats:topStates")(limit),
    topTypes: (limit) => invokeAuto("stats:topTypes")(limit),
    // Dashboard: Top types/states with hero thumbnails
    topTypesWithHero: (limit) => invokeAuto("stats:topTypesWithHero")(limit),
    topStatesWithHero: (limit) => invokeAuto("stats:topStatesWithHero")(limit),
  },

  settings: {
    get: (key) => invokeAuto("settings:get")(key),
    getAll: () => invokeAuto("settings:getAll")(),
    set: (key, value) => invokeAuto("settings:set")(key, value),
  },

  shell: {
    openExternal: (url) => invokeAuto("shell:openExternal")(url),
  },

  geocode: {
    reverse: (lat, lng) => invokeAuto("geocode:reverse")(lat, lng),
    forward: (address) => invokeAuto("geocode:forward")(address),
    // Kanye9: Cascade geocoding - tries full → city → zipcode → county → state
    forwardCascade: (address) => invokeAuto("geocode:forwardCascade")(address),
    clearCache: (daysOld) => invokeAuto("geocode:clearCache")(daysOld),
  },

  dialog: {
    selectFolder: () => invokeAuto("dialog:selectFolder")(),
  },

  database: {
    backup: () => invokeAuto("database:backup")(),
    restore: () => invokeAuto("database:restore")(),
    getLocation: () => invokeAuto("database:getLocation")(),
    changeLocation: () => invokeAuto("database:changeLocation")(),
    resetLocation: () => invokeAuto("database:resetLocation")(),
    // Phase 2: Database stats and internal backup management
    getStats: () => invokeAuto("database:getStats")(),
    exportBackup: () => invokeAuto("database:exportBackup")(),
    listBackups: () => invokeAuto("database:listBackups")(),
    restoreFromInternal: (backupId) => invokeAuto("database:restoreFromInternal")(backupId),
    // Database Archive Export: Export to archive folder for portable backup
    archiveExport: () => invokeAuto("database:archiveExport")(),
    archiveStatus: () => invokeAuto("database:archiveStatus")(),
  },

  imports: {
    create: (input) => invokeAuto("imports:create")(input),
    findRecent: (limit) => invokeAuto("imports:findRecent")(limit),
    findByLocation: (locid) => invokeAuto("imports:findByLocation")(locid),
    findAll: () => invokeAuto("imports:findAll")(),
    getTotalMediaCount: () => invokeAuto("imports:getTotalMediaCount")(),
  },

  media: {
    // File selection and import
    selectFiles: () => invokeAuto("media:selectFiles")(),
    expandPaths: (paths) => invokeAuto("media:expandPaths")(paths),
    // OPT-034b: Dynamic timeout based on file count for chunked imports
    import: (input) => {
      const fileCount = input?.files?.length || 1;
      const timeout = calculateImportTimeout(fileCount);
      return invoke("media:import", timeout)(input);
    },
    // OPT-034b: Dynamic timeout based on file count for chunked imports
    phaseImport: (input) => {
      const fileCount = input?.files?.length || 1;
      const timeout = calculateImportTimeout(fileCount);
      return invoke("media:phaseImport", timeout)(input);
    },
    onPhaseImportProgress: (callback) => {
      const listener = (_event, progress) => callback(progress);
      ipcRenderer.on("media:phaseImport:progress", listener);
      return () => ipcRenderer.removeListener("media:phaseImport:progress", listener);
    },
    onImportProgress: (callback) => {
      const listener = (_event, progress) => callback(progress);
      ipcRenderer.on("media:import:progress", listener);
      return () => ipcRenderer.removeListener("media:import:progress", listener);
    },
    cancelImport: (importId) => invokeAuto("media:import:cancel")(importId),
    findByLocation: (locid) => invokeAuto("media:findByLocation")(locid),
    findImageByHash: (hash) => invokeAuto("media:findImageByHash")(hash),
    // Media viewing and processing
    openFile: (filePath) => invokeAuto("media:openFile")(filePath),
    showInFolder: (filePath) => invokeAuto("media:showInFolder")(filePath),
    getFullMetadata: (hash, mediaType) => invokeAuto("media:getFullMetadata")(hash, mediaType),
    generateThumbnail: (sourcePath, hash) => invokeAuto("media:generateThumbnail")(sourcePath, hash),
    extractPreview: (sourcePath, hash) => invokeAuto("media:extractPreview")(sourcePath, hash),
    generatePoster: (sourcePath, hash) => invokeAuto("media:generatePoster")(sourcePath, hash),
    getCached: (key) => invokeAuto("media:getCached")(key),
    preload: (mediaList, currentIndex) => invokeAuto("media:preload")(mediaList, currentIndex),
    readXmp: (mediaPath) => invokeAuto("media:readXmp")(mediaPath),
    writeXmp: (mediaPath, data) => invokeAuto("media:writeXmp")(mediaPath, data),
    regenerateAllThumbnails: (options) => invokeAuto("media:regenerateAllThumbnails")(options),
    regenerateVideoThumbnails: (options) => invokeAuto("media:regenerateVideoThumbnails")(options),
    // Kanye11: Regenerate preview/thumbnails for a single file
    regenerateSingleFile: (hash, filePath) => invokeAuto("media:regenerateSingleFile")(hash, filePath),
    // Migration 30: Regenerate DNG previews using LibRaw for full quality
    regenerateDngPreviews: () => invokeAuto("media:regenerateDngPreviews")(),
    // Hidden/Live Photo operations (Migration 23)
    setHidden: (input) => invokeAuto("media:setHidden")(input),
    detectLivePhotosAndSDR: (locid) => invokeAuto("media:detectLivePhotosAndSDR")(locid),

    // Location-specific media fixes
    fixLocationImages: (locid) => invokeAuto("media:fixLocationImages")(locid),
    fixLocationVideos: (locid) => invokeAuto("media:fixLocationVideos")(locid),

    // Video Proxy System (Migration 36)
    // Generate optimized H.264 proxy for smooth playback
    generateProxy: (vidsha, sourcePath, metadata) =>
      invokeAuto("media:generateProxy")(vidsha, sourcePath, metadata),
    getProxyPath: (vidsha) =>
      invokeAuto("media:getProxyPath")(vidsha),
    getProxyCacheStats: () =>
      invokeAuto("media:getProxyCacheStats")(),
    purgeOldProxies: (daysOld) =>
      invokeAuto("media:purgeOldProxies")(daysOld),
    clearAllProxies: () =>
      invokeAuto("media:clearAllProxies")(),
    touchLocationProxies: (locid) =>
      invokeAuto("media:touchLocationProxies")(locid),
    generateProxiesForLocation: (locid) =>
      invokeAuto("media:generateProxiesForLocation")(locid),
    onProxyProgress: (callback) => {
      const listener = (_event, progress) => callback(progress);
      ipcRenderer.on("media:proxyProgress", listener);
      return () => ipcRenderer.removeListener("media:proxyProgress", listener);
    },
  },

  notes: {
    create: (input) => invokeAuto("notes:create")(input),
    findById: (noteId) => invokeAuto("notes:findById")(noteId),
    findByLocation: (locid) => invokeAuto("notes:findByLocation")(locid),
    findRecent: (limit) => invokeAuto("notes:findRecent")(limit),
    update: (noteId, updates) => invokeAuto("notes:update")(noteId, updates),
    delete: (noteId) => invokeAuto("notes:delete")(noteId),
    countByLocation: (locid) => invokeAuto("notes:countByLocation")(locid),
  },

  // Migration 28: Sub-location API
  sublocations: {
    create: (input) => invokeAuto("sublocation:create")(input),
    findById: (subid) => invokeAuto("sublocation:findById")(subid),
    findByLocation: (locid) => invokeAuto("sublocation:findByLocation")(locid),
    findWithHeroImages: (locid) => invokeAuto("sublocation:findWithHeroImages")(locid),
    update: (subid, updates) => invokeAuto("sublocation:update")(subid, updates),
    delete: (subid) => invokeAuto("sublocation:delete")(subid),
    setPrimary: (locid, subid) => invokeAuto("sublocation:setPrimary")(locid, subid),
    checkName: (locid, subnam, excludeSubid) => invokeAuto("sublocation:checkName")(locid, subnam, excludeSubid),
    count: (locid) => invokeAuto("sublocation:count")(locid),
    // Migration 31: Sub-location GPS (separate from host location)
    updateGps: (subid, gps) => invokeAuto("sublocation:updateGps")(subid, gps),
    clearGps: (subid) => invokeAuto("sublocation:clearGps")(subid),
    verifyGps: (subid) => invokeAuto("sublocation:verifyGps")(subid),
    findWithGps: (locid) => invokeAuto("sublocation:findWithGps")(locid),
  },

  projects: {
    create: (input) => invokeAuto("projects:create")(input),
    findById: (projectId) => invokeAuto("projects:findById")(projectId),
    findByIdWithLocations: (projectId) => invokeAuto("projects:findByIdWithLocations")(projectId),
    findAll: () => invokeAuto("projects:findAll")(),
    findRecent: (limit) => invokeAuto("projects:findRecent")(limit),
    findTopByLocationCount: (limit) => invokeAuto("projects:findTopByLocationCount")(limit),
    findByLocation: (locid) => invokeAuto("projects:findByLocation")(locid),
    update: (projectId, updates) => invokeAuto("projects:update")(projectId, updates),
    delete: (projectId) => invokeAuto("projects:delete")(projectId),
    addLocation: (projectId, locid) => invokeAuto("projects:addLocation")(projectId, locid),
    removeLocation: (projectId, locid) => invokeAuto("projects:removeLocation")(projectId, locid),
    isLocationInProject: (projectId, locid) => invokeAuto("projects:isLocationInProject")(projectId, locid),
  },

  bookmarks: {
    create: (input) => invokeAuto("bookmarks:create")(input),
    findById: (bookmarkId) => invokeAuto("bookmarks:findById")(bookmarkId),
    findByLocation: (locid) => invokeAuto("bookmarks:findByLocation")(locid),
    findRecent: (limit) => invokeAuto("bookmarks:findRecent")(limit),
    findAll: () => invokeAuto("bookmarks:findAll")(),
    update: (bookmarkId, updates) => invokeAuto("bookmarks:update")(bookmarkId, updates),
    delete: (bookmarkId) => invokeAuto("bookmarks:delete")(bookmarkId),
    count: () => invokeAuto("bookmarks:count")(),
    countByLocation: (locid) => invokeAuto("bookmarks:countByLocation")(locid),
  },

  users: {
    // CRUD
    create: (input) => invokeAuto("users:create")(input),
    findAll: () => invokeAuto("users:findAll")(),
    findById: (userId) => invokeAuto("users:findById")(userId),
    findByUsername: (username) => invokeAuto("users:findByUsername")(username),
    update: (userId, updates) => invokeAuto("users:update")(userId, updates),
    delete: (userId) => invokeAuto("users:delete")(userId),
    // Authentication (Migration 24)
    verifyPin: (userId, pin) => invokeAuto("users:verifyPin")(userId, pin),
    setPin: (userId, pin) => invokeAuto("users:setPin")(userId, pin),
    clearPin: (userId) => invokeAuto("users:clearPin")(userId),
    hasPin: (userId) => invokeAuto("users:hasPin")(userId),
    anyUserHasPin: () => invokeAuto("users:anyUserHasPin")(),
    updateLastLogin: (userId) => invokeAuto("users:updateLastLogin")(userId),
  },

  health: {
    getDashboard: () => invokeAuto("health:getDashboard")(),
    getStatus: () => invokeAuto("health:getStatus")(),
    runCheck: () => invokeAuto("health:runCheck")(),
    createBackup: () => invokeAuto("health:createBackup")(),
    getBackupStats: () => invokeAuto("health:getBackupStats")(),
    getDiskSpace: () => invokeAuto("health:getDiskSpace")(),
    checkIntegrity: () => invokeAuto("health:checkIntegrity")(),
    runMaintenance: () => invokeAuto("health:runMaintenance")(),
    getMaintenanceSchedule: () => invokeAuto("health:getMaintenanceSchedule")(),
    getRecoveryState: () => invokeAuto("health:getRecoveryState")(),
    attemptRecovery: () => invokeAuto("health:attemptRecovery")(),
  },

  backup: {
    onStatus: (callback) => {
      const listener = (_event, status) => callback(status);
      ipcRenderer.on("backup:status", listener);
      return () => ipcRenderer.removeListener("backup:status", listener);
    },
  },

  browser: {
    navigate: (url) => invokeAuto("browser:navigate")(url),
    show: (bounds) => invokeAuto("browser:show")(bounds),
    hide: () => invokeAuto("browser:hide")(),
    getUrl: () => invokeAuto("browser:getUrl")(),
    getTitle: () => invokeAuto("browser:getTitle")(),
    goBack: () => invokeAuto("browser:goBack")(),
    goForward: () => invokeAuto("browser:goForward")(),
    reload: () => invokeAuto("browser:reload")(),
    captureScreenshot: () => invokeAuto("browser:captureScreenshot")(),
    onNavigated: (callback) => {
      const listener = (_event, url) => callback(url);
      ipcRenderer.on("browser:navigated", listener);
      return () => ipcRenderer.removeListener("browser:navigated", listener);
    },
    onTitleChanged: (callback) => {
      const listener = (_event, title) => callback(title);
      ipcRenderer.on("browser:titleChanged", listener);
      return () => ipcRenderer.removeListener("browser:titleChanged", listener);
    },
    onLoadingChanged: (callback) => {
      const listener = (_event, loading) => callback(loading);
      ipcRenderer.on("browser:loadingChanged", listener);
      return () => ipcRenderer.removeListener("browser:loadingChanged", listener);
    },
  },

  // Research Browser - external Ungoogled Chromium
  research: {
    launch: () => invokeAuto("research:launch")(),
    close: () => invokeAuto("research:close")(),
    status: () => invokeAuto("research:status")(),
  },

  // Reference Maps - imported KML, GPX, GeoJSON, CSV files
  storage: {
    getStats: () => invokeAuto("storage:getStats")(),
  },

  // BagIt Self-Documenting Archive (RFC 8493)
  bagit: {
    regenerate: (locid) => invokeAuto("bagit:regenerate")(locid),
    validate: (locid) => invokeAuto("bagit:validate")(locid),
    validateAll: () => invokeAuto("bagit:validateAll")(),
    status: (locid) => invokeAuto("bagit:status")(locid),
    summary: () => invokeAuto("bagit:summary")(),
    lastValidation: () => invokeAuto("bagit:lastValidation")(),
    isValidationDue: () => invokeAuto("bagit:isValidationDue")(),
    scheduleValidation: () => invokeAuto("bagit:scheduleValidation")(),
    // Listen for validation progress events
    onProgress: (callback) => {
      const listener = (_event, progress) => callback(progress);
      ipcRenderer.on("bagit:progress", listener);
      return () => ipcRenderer.removeListener("bagit:progress", listener);
    },
  },

  refMaps: {
    selectFile: () => invokeAuto("refMaps:selectFile")(),
    import: (importedBy) => invokeAuto("refMaps:import")(importedBy),
    importFromPath: (filePath, importedBy) => invokeAuto("refMaps:importFromPath")(filePath, importedBy),
    findAll: () => invokeAuto("refMaps:findAll")(),
    findById: (mapId) => invokeAuto("refMaps:findById")(mapId),
    getAllPoints: () => invokeAuto("refMaps:getAllPoints")(),
    update: (mapId, updates) => invokeAuto("refMaps:update")(mapId, updates),
    delete: (mapId) => invokeAuto("refMaps:delete")(mapId),
    getStats: () => invokeAuto("refMaps:getStats")(),
    getSupportedExtensions: () => invokeAuto("refMaps:getSupportedExtensions")(),
    // Phase 2: Auto-matching for location creation
    findMatches: (query, options) => invokeAuto("refMaps:findMatches")(query, options),
    // Phase 3: Deduplication on import
    previewImport: (filePath) => invokeAuto("refMaps:previewImport")(filePath),
    importWithOptions: (filePath, options) => invokeAuto("refMaps:importWithOptions")(filePath, options),
    // Phase 4: Purge catalogued points
    findCataloguedPoints: () => invokeAuto("refMaps:findCataloguedPoints")(),
    purgeCataloguedPoints: () => invokeAuto("refMaps:purgeCataloguedPoints")(),
    // Phase 5: Delete single point from map popup
    deletePoint: (pointId) => invokeAuto("refMaps:deletePoint")(pointId),
    // Migration 39: GPS-based deduplication within ref_map_points
    previewDedup: () => invokeAuto("refMaps:previewDedup")(),
    deduplicate: () => invokeAuto("refMaps:deduplicate")(),
    // Migration 42: GPS enrichment - apply ref point GPS to existing location
    applyEnrichment: (input) => invokeAuto("refMaps:applyEnrichment")(input),
    applyAllEnrichments: (enrichments) => invokeAuto("refMaps:applyAllEnrichments")(enrichments),
    // Link ref point to existing location (manual association from Atlas)
    linkToLocation: (pointId, locationId) => invokeAuto("refMaps:linkToLocation")({ pointId, locationId }),
  },

  // Import Intelligence - Smart location matching during import
  importIntelligence: {
    // Full scan for matches near GPS point (excludeRefPointId filters out a specific ref point)
    scan: (lat, lng, hints, excludeRefPointId) => invokeAuto("import-intelligence:scan")(lat, lng, hints, excludeRefPointId),
    // Quick check if GPS has nearby matches
    hasNearby: (lat, lng) => invokeAuto("import-intelligence:hasNearby")(lat, lng),
    // Add AKA name to existing location
    addAkaName: (locid, newName) => invokeAuto("import-intelligence:addAkaName")(locid, newName),
  },
};

contextBridge.exposeInMainWorld("electronAPI", api);

// Drag-Drop File Path Extraction
let lastDroppedPaths = [];

const setupDropListener = () => {
  document.addEventListener("drop", (event) => {
    console.log("[Preload] Drop event captured");
    lastDroppedPaths = [];

    if (!event.dataTransfer?.files || event.dataTransfer.files.length === 0) {
      console.log("[Preload] No files in drop event");
      return;
    }

    console.log("[Preload] Processing", event.dataTransfer.files.length, "dropped files");

    for (const file of Array.from(event.dataTransfer.files)) {
      try {
        // Try webUtils first (Electron 28+), fallback to deprecated file.path
        let filePath = null;
        if (webUtils && typeof webUtils.getPathForFile === 'function') {
          filePath = webUtils.getPathForFile(file);
          console.log("[Preload] Got path via webUtils:", filePath);
        } else if (file.path) {
          // Fallback: deprecated file.path still works in Electron 28
          filePath = file.path;
          console.log("[Preload] Got path via file.path (fallback):", filePath);
        } else {
          console.warn("[Preload] Neither webUtils nor file.path available for:", file.name);
        }

        if (filePath) {
          lastDroppedPaths.push(filePath);
        }
      } catch (e) {
        console.error("[Preload] Failed to get path for file:", file.name, e);
      }
    }

    console.log("[Preload] Total paths extracted:", lastDroppedPaths.length);
  }, { capture: true });
};

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", setupDropListener);
} else {
  setupDropListener();
}

contextBridge.exposeInMainWorld("getDroppedFilePaths", () => {
  const paths = [...lastDroppedPaths];
  console.log("[Preload] getDroppedFilePaths called, returning", paths.length, "paths");
  return paths;
});

contextBridge.exposeInMainWorld("extractFilePaths", (_files) => {
  console.log("[Preload] extractFilePaths called");
  return [...lastDroppedPaths];
});
