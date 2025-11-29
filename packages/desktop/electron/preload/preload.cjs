"use strict";
// AU Archive Preload Script - Pure CommonJS
// This file is NOT processed by Vite - it's used directly by Electron
// IMPORTANT: Keep in sync with electron/preload/index.ts

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

const api = {
  versions: {
    node: () => process.versions.node,
    chrome: () => process.versions.chrome,
    electron: () => process.versions.electron,
  },
  platform: process.platform,

  locations: {
    findAll: (filters) => ipcRenderer.invoke("location:findAll", filters),
    findById: (id) => ipcRenderer.invoke("location:findById", id),
    create: (input) => ipcRenderer.invoke("location:create", input),
    update: (id, input) => ipcRenderer.invoke("location:update", id, input),
    delete: (id) => ipcRenderer.invoke("location:delete", id),
    count: (filters) => ipcRenderer.invoke("location:count", filters),
    random: () => ipcRenderer.invoke("location:random"),
    undocumented: () => ipcRenderer.invoke("location:undocumented"),
    historical: () => ipcRenderer.invoke("location:historical"),
    favorites: () => ipcRenderer.invoke("location:favorites"),
    toggleFavorite: (id) => ipcRenderer.invoke("location:toggleFavorite", id),
    findNearby: (lat, lng, radiusKm) => ipcRenderer.invoke("location:findNearby", lat, lng, radiusKm),
    // Kanye9: Check for duplicate locations by address
    checkDuplicates: (address) => ipcRenderer.invoke("location:checkDuplicates", address),
    // DECISION-018: Region data management
    updateRegionData: (id, regionData) => ipcRenderer.invoke("location:updateRegionData", id, regionData),
    backfillRegions: () => ipcRenderer.invoke("location:backfillRegions"),
    // Autocomplete helpers for Type/Sub-Type
    getDistinctTypes: () => ipcRenderer.invoke("location:getDistinctTypes"),
    getDistinctSubTypes: () => ipcRenderer.invoke("location:getDistinctSubTypes"),
    // Migration 34: View tracking
    trackView: (id) => ipcRenderer.invoke("location:trackView", id),
    getViewStats: (id) => ipcRenderer.invoke("location:getViewStats", id),
    getViewHistory: (id, limit) => ipcRenderer.invoke("location:getViewHistory", id, limit),
    // Dashboard: Recently viewed locations with hero thumbnails
    findRecentlyViewed: (limit) => ipcRenderer.invoke("location:findRecentlyViewed", limit),
    // Dashboard: Project locations with hero thumbnails
    findProjects: (limit) => ipcRenderer.invoke("location:findProjects", limit),
  },

  stats: {
    topStates: (limit) => ipcRenderer.invoke("stats:topStates", limit),
    topTypes: (limit) => ipcRenderer.invoke("stats:topTypes", limit),
    // Dashboard: Top types/states with hero thumbnails
    topTypesWithHero: (limit) => ipcRenderer.invoke("stats:topTypesWithHero", limit),
    topStatesWithHero: (limit) => ipcRenderer.invoke("stats:topStatesWithHero", limit),
  },

  settings: {
    get: (key) => ipcRenderer.invoke("settings:get", key),
    getAll: () => ipcRenderer.invoke("settings:getAll"),
    set: (key, value) => ipcRenderer.invoke("settings:set", key, value),
  },

  shell: {
    openExternal: (url) => ipcRenderer.invoke("shell:openExternal", url),
  },

  geocode: {
    reverse: (lat, lng) => ipcRenderer.invoke("geocode:reverse", lat, lng),
    forward: (address) => ipcRenderer.invoke("geocode:forward", address),
    // Kanye9: Cascade geocoding - tries full → city → zipcode → county → state
    forwardCascade: (address) => ipcRenderer.invoke("geocode:forwardCascade", address),
    clearCache: (daysOld) => ipcRenderer.invoke("geocode:clearCache", daysOld),
  },

  dialog: {
    selectFolder: () => ipcRenderer.invoke("dialog:selectFolder"),
  },

  database: {
    backup: () => ipcRenderer.invoke("database:backup"),
    restore: () => ipcRenderer.invoke("database:restore"),
    getLocation: () => ipcRenderer.invoke("database:getLocation"),
    changeLocation: () => ipcRenderer.invoke("database:changeLocation"),
    resetLocation: () => ipcRenderer.invoke("database:resetLocation"),
  },

  imports: {
    create: (input) => ipcRenderer.invoke("imports:create", input),
    findRecent: (limit) => ipcRenderer.invoke("imports:findRecent", limit),
    findByLocation: (locid) => ipcRenderer.invoke("imports:findByLocation", locid),
    findAll: () => ipcRenderer.invoke("imports:findAll"),
    getTotalMediaCount: () => ipcRenderer.invoke("imports:getTotalMediaCount"),
  },

  media: {
    // File selection and import
    selectFiles: () => ipcRenderer.invoke("media:selectFiles"),
    expandPaths: (paths) => ipcRenderer.invoke("media:expandPaths", paths),
    import: (input) => ipcRenderer.invoke("media:import", input),
    phaseImport: (input) => ipcRenderer.invoke("media:phaseImport", input),
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
    cancelImport: (importId) => ipcRenderer.invoke("media:import:cancel", importId),
    findByLocation: (locid) => ipcRenderer.invoke("media:findByLocation", locid),
    // Media viewing and processing
    openFile: (filePath) => ipcRenderer.invoke("media:openFile", filePath),
    showInFolder: (filePath) => ipcRenderer.invoke("media:showInFolder", filePath),
    getFullMetadata: (hash, mediaType) => ipcRenderer.invoke("media:getFullMetadata", hash, mediaType),
    generateThumbnail: (sourcePath, hash) => ipcRenderer.invoke("media:generateThumbnail", sourcePath, hash),
    extractPreview: (sourcePath, hash) => ipcRenderer.invoke("media:extractPreview", sourcePath, hash),
    generatePoster: (sourcePath, hash) => ipcRenderer.invoke("media:generatePoster", sourcePath, hash),
    getCached: (key) => ipcRenderer.invoke("media:getCached", key),
    preload: (mediaList, currentIndex) => ipcRenderer.invoke("media:preload", mediaList, currentIndex),
    readXmp: (mediaPath) => ipcRenderer.invoke("media:readXmp", mediaPath),
    writeXmp: (mediaPath, data) => ipcRenderer.invoke("media:writeXmp", mediaPath, data),
    regenerateAllThumbnails: (options) => ipcRenderer.invoke("media:regenerateAllThumbnails", options),
    regenerateVideoThumbnails: (options) => ipcRenderer.invoke("media:regenerateVideoThumbnails", options),
    // Kanye11: Regenerate preview/thumbnails for a single file
    regenerateSingleFile: (hash, filePath) => ipcRenderer.invoke("media:regenerateSingleFile", hash, filePath),
    // Migration 30: Regenerate DNG previews using LibRaw for full quality
    regenerateDngPreviews: () => ipcRenderer.invoke("media:regenerateDngPreviews"),
    // Hidden/Live Photo operations (Migration 23)
    setHidden: (input) => ipcRenderer.invoke("media:setHidden", input),
    detectLivePhotosAndSDR: (locid) => ipcRenderer.invoke("media:detectLivePhotosAndSDR", locid),
  },

  notes: {
    create: (input) => ipcRenderer.invoke("notes:create", input),
    findById: (noteId) => ipcRenderer.invoke("notes:findById", noteId),
    findByLocation: (locid) => ipcRenderer.invoke("notes:findByLocation", locid),
    findRecent: (limit) => ipcRenderer.invoke("notes:findRecent", limit),
    update: (noteId, updates) => ipcRenderer.invoke("notes:update", noteId, updates),
    delete: (noteId) => ipcRenderer.invoke("notes:delete", noteId),
    countByLocation: (locid) => ipcRenderer.invoke("notes:countByLocation", locid),
  },

  // Migration 28: Sub-location API
  sublocations: {
    create: (input) => ipcRenderer.invoke("sublocation:create", input),
    findById: (subid) => ipcRenderer.invoke("sublocation:findById", subid),
    findByLocation: (locid) => ipcRenderer.invoke("sublocation:findByLocation", locid),
    findWithHeroImages: (locid) => ipcRenderer.invoke("sublocation:findWithHeroImages", locid),
    update: (subid, updates) => ipcRenderer.invoke("sublocation:update", subid, updates),
    delete: (subid) => ipcRenderer.invoke("sublocation:delete", subid),
    setPrimary: (locid, subid) => ipcRenderer.invoke("sublocation:setPrimary", locid, subid),
    checkName: (locid, subnam, excludeSubid) => ipcRenderer.invoke("sublocation:checkName", locid, subnam, excludeSubid),
    count: (locid) => ipcRenderer.invoke("sublocation:count", locid),
    // Migration 31: Sub-location GPS (separate from host location)
    updateGps: (subid, gps) => ipcRenderer.invoke("sublocation:updateGps", subid, gps),
    clearGps: (subid) => ipcRenderer.invoke("sublocation:clearGps", subid),
    verifyGps: (subid) => ipcRenderer.invoke("sublocation:verifyGps", subid),
    findWithGps: (locid) => ipcRenderer.invoke("sublocation:findWithGps", locid),
  },

  projects: {
    create: (input) => ipcRenderer.invoke("projects:create", input),
    findById: (projectId) => ipcRenderer.invoke("projects:findById", projectId),
    findByIdWithLocations: (projectId) => ipcRenderer.invoke("projects:findByIdWithLocations", projectId),
    findAll: () => ipcRenderer.invoke("projects:findAll"),
    findRecent: (limit) => ipcRenderer.invoke("projects:findRecent", limit),
    findTopByLocationCount: (limit) => ipcRenderer.invoke("projects:findTopByLocationCount", limit),
    findByLocation: (locid) => ipcRenderer.invoke("projects:findByLocation", locid),
    update: (projectId, updates) => ipcRenderer.invoke("projects:update", projectId, updates),
    delete: (projectId) => ipcRenderer.invoke("projects:delete", projectId),
    addLocation: (projectId, locid) => ipcRenderer.invoke("projects:addLocation", projectId, locid),
    removeLocation: (projectId, locid) => ipcRenderer.invoke("projects:removeLocation", projectId, locid),
    isLocationInProject: (projectId, locid) => ipcRenderer.invoke("projects:isLocationInProject", projectId, locid),
  },

  bookmarks: {
    create: (input) => ipcRenderer.invoke("bookmarks:create", input),
    findById: (bookmarkId) => ipcRenderer.invoke("bookmarks:findById", bookmarkId),
    findByLocation: (locid) => ipcRenderer.invoke("bookmarks:findByLocation", locid),
    findRecent: (limit) => ipcRenderer.invoke("bookmarks:findRecent", limit),
    findAll: () => ipcRenderer.invoke("bookmarks:findAll"),
    update: (bookmarkId, updates) => ipcRenderer.invoke("bookmarks:update", bookmarkId, updates),
    delete: (bookmarkId) => ipcRenderer.invoke("bookmarks:delete", bookmarkId),
    count: () => ipcRenderer.invoke("bookmarks:count"),
    countByLocation: (locid) => ipcRenderer.invoke("bookmarks:countByLocation", locid),
  },

  users: {
    // CRUD
    create: (input) => ipcRenderer.invoke("users:create", input),
    findAll: () => ipcRenderer.invoke("users:findAll"),
    findById: (userId) => ipcRenderer.invoke("users:findById", userId),
    findByUsername: (username) => ipcRenderer.invoke("users:findByUsername", username),
    update: (userId, updates) => ipcRenderer.invoke("users:update", userId, updates),
    delete: (userId) => ipcRenderer.invoke("users:delete", userId),
    // Authentication (Migration 24)
    verifyPin: (userId, pin) => ipcRenderer.invoke("users:verifyPin", userId, pin),
    setPin: (userId, pin) => ipcRenderer.invoke("users:setPin", userId, pin),
    clearPin: (userId) => ipcRenderer.invoke("users:clearPin", userId),
    hasPin: (userId) => ipcRenderer.invoke("users:hasPin", userId),
    anyUserHasPin: () => ipcRenderer.invoke("users:anyUserHasPin"),
    updateLastLogin: (userId) => ipcRenderer.invoke("users:updateLastLogin", userId),
  },

  health: {
    getDashboard: () => ipcRenderer.invoke("health:getDashboard"),
    getStatus: () => ipcRenderer.invoke("health:getStatus"),
    runCheck: () => ipcRenderer.invoke("health:runCheck"),
    createBackup: () => ipcRenderer.invoke("health:createBackup"),
    getBackupStats: () => ipcRenderer.invoke("health:getBackupStats"),
    getDiskSpace: () => ipcRenderer.invoke("health:getDiskSpace"),
    checkIntegrity: () => ipcRenderer.invoke("health:checkIntegrity"),
    runMaintenance: () => ipcRenderer.invoke("health:runMaintenance"),
    getMaintenanceSchedule: () => ipcRenderer.invoke("health:getMaintenanceSchedule"),
    getRecoveryState: () => ipcRenderer.invoke("health:getRecoveryState"),
    attemptRecovery: () => ipcRenderer.invoke("health:attemptRecovery"),
  },

  backup: {
    onStatus: (callback) => {
      const listener = (_event, status) => callback(status);
      ipcRenderer.on("backup:status", listener);
      return () => ipcRenderer.removeListener("backup:status", listener);
    },
  },

  browser: {
    navigate: (url) => ipcRenderer.invoke("browser:navigate", url),
    show: (bounds) => ipcRenderer.invoke("browser:show", bounds),
    hide: () => ipcRenderer.invoke("browser:hide"),
    getUrl: () => ipcRenderer.invoke("browser:getUrl"),
    getTitle: () => ipcRenderer.invoke("browser:getTitle"),
    goBack: () => ipcRenderer.invoke("browser:goBack"),
    goForward: () => ipcRenderer.invoke("browser:goForward"),
    reload: () => ipcRenderer.invoke("browser:reload"),
    captureScreenshot: () => ipcRenderer.invoke("browser:captureScreenshot"),
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
    launch: () => ipcRenderer.invoke("research:launch"),
    close: () => ipcRenderer.invoke("research:close"),
    status: () => ipcRenderer.invoke("research:status"),
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
