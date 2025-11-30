<script lang="ts">
  import { onMount } from 'svelte';
  import HealthMonitoring from '../components/HealthMonitoring.svelte';
  import { thumbnailCache } from '../stores/thumbnail-cache-store';

  interface User {
    user_id: string;
    username: string;
    display_name: string | null;
    has_pin: boolean;
    is_active: boolean;
    last_login: string | null;
  }

  let archivePath = $state('');
  let deleteOriginals = $state(false);
  let currentUserId = $state<string | null>(null);
  let currentUsername = $state('default');
  let importMap = $state(true);
  let mapImport = $state(true);
  let loading = $state(true);
  let saving = $state(false);
  let saveMessage = $state('');

  // Migration 24: User management state
  let appMode = $state<'single' | 'multi'>('single');
  let requireLogin = $state(false);
  let users = $state<User[]>([]);
  let showAddUser = $state(false);
  let editingUserId = $state<string | null>(null);
  let changingPinUserId = $state<string | null>(null);

  // New user form
  let newUsername = $state('');
  let newDisplayName = $state('');
  let newPin = $state('');
  let newConfirmPin = $state('');
  let newUserError = $state('');

  // Edit user form
  let editUsername = $state('');
  let editDisplayName = $state('');
  let editError = $state('');

  // Change PIN form
  let changePin = $state('');
  let changeConfirmPin = $state('');
  let changePinError = $state('');

  // Users accordion state (collapsed by default)
  let usersExpanded = $state(false);

  // Archive accordion state (all closed by default)
  let archiveExpanded = $state(false);
  let mapsExpanded = $state(false);
  let maintenanceExpanded = $state(false);
  let databaseExpanded = $state(false);
  let healthExpanded = $state(false);

  // Storage bar state
  let storageStats = $state<{
    totalBytes: number;
    availableBytes: number;
    archiveBytes: number;
    drivePath: string;
  } | null>(null);
  let loadingStorage = $state(false);

  // PIN verification modal state
  let showPinModal = $state(false);
  let pinAction = $state<'archive' | 'deleteOnImport' | 'startupPin' | null>(null);
  let pinInput = $state('');
  let pinError = $state('');
  let pinVerifying = $state(false);

  // Delete warning modal state
  let showDeleteWarning = $state(false);

  // Location picker modal state
  interface LocationBasic {
    locid: string;
    locnam: string;
    state?: string;
  }
  let showLocationPicker = $state(false);
  let pickerMode = $state<'purge' | 'addresses' | 'images' | 'videos' | null>(null);
  let pickerSearchQuery = $state('');
  let pickerSearchResults = $state<LocationBasic[]>([]);
  let pickerSelectedLocation = $state<LocationBasic | null>(null);
  let pickerLoading = $state(false);
  let pickerMessage = $state('');

  // Kanye6: Thumbnail regeneration state
  let regenerating = $state(false);
  let regenProgress = $state(0);
  let regenTotal = $state(0);
  let regenMessage = $state('');

  // Kanye9: Address normalization state
  let normalizing = $state(false);
  let normalizeMessage = $state('');

  // DECISION-012: Region backfill state
  let backfillingRegions = $state(false);
  let backfillMessage = $state('');

  // Migration 23: Live Photo detection state
  let detectingLivePhotos = $state(false);
  let livePhotoMessage = $state('');

  // Migration 36: Video Proxy state
  let proxyCacheStats = $state<{
    totalCount: number;
    totalSizeBytes: number;
    totalSizeMB: number;
    oldestAccess: string | null;
    newestAccess: string | null;
  } | null>(null);
  let purgingProxies = $state(false);
  let clearingProxies = $state(false);
  let proxyMessage = $state('');

  // P6: Darktable state removed per v010steps.md

  // Reference Maps state
  interface RefMap {
    mapId: string;
    mapName: string;
    filePath: string;
    fileType: string;
    pointCount: number;
    importedAt: string;
    importedBy: string | null;
  }

  interface DuplicateMatchPreview {
    type: 'catalogued' | 'reference';
    newPointName: string;
    existingName: string;
    existingId: string;
    nameSimilarity: number;
    distanceMeters: number;
    mapName?: string;
  }

  interface ImportPreview {
    fileName: string;
    filePath: string;
    fileType: string;
    totalPoints: number;
    newPoints: number;
    cataloguedCount: number;
    referenceCount: number;
    cataloguedMatches: DuplicateMatchPreview[];
    referenceMatches: DuplicateMatchPreview[];
  }

  let refMaps = $state<RefMap[]>([]);
  let refMapStats = $state<{ mapCount: number; pointCount: number } | null>(null);
  let importingRefMap = $state(false);
  let refMapMessage = $state('');

  // Phase 3: Import preview modal state
  let showImportPreview = $state(false);
  let importPreview = $state<ImportPreview | null>(null);
  let previewLoading = $state(false);
  let skipDuplicates = $state(true);

  // Phase 4: Purge catalogued points state
  let cataloguedCount = $state(0);
  let purgingPoints = $state(false);
  let purgeMessage = $state('');

  async function loadSettings() {
    try {
      loading = true;
      if (!window.electronAPI?.settings) {
        console.error('Electron API not available - preload script may have failed to load');
        return;
      }
      const settings = await window.electronAPI.settings.getAll();

      archivePath = settings.archive_folder || '';
      deleteOriginals = settings.delete_on_import === 'true';
      currentUserId = settings.current_user_id || null;
      currentUsername = settings.current_user || 'default';
      appMode = (settings.app_mode as 'single' | 'multi') || 'single';
      requireLogin = settings.require_login === 'true';
      importMap = settings.import_map !== 'false'; // Default true
      mapImport = settings.map_import !== 'false'; // Default true

      // Load users for multi-user mode
      await loadUsers();
    } catch (error) {
      console.error('Error loading settings:', error);
    } finally {
      loading = false;
    }
  }

  async function loadUsers() {
    if (!window.electronAPI?.users) return;
    try {
      users = await window.electronAPI.users.findAll();
    } catch (error) {
      console.error('Error loading users:', error);
    }
  }

  async function switchToMultiUser() {
    if (!window.electronAPI?.settings) return;
    try {
      await window.electronAPI.settings.set('app_mode', 'multi');
      appMode = 'multi';
      saveMessage = 'Switched to multi-user mode';
      setTimeout(() => saveMessage = '', 3000);
    } catch (error) {
      console.error('Error switching mode:', error);
    }
  }

  async function switchToSingleUser() {
    if (!window.electronAPI?.settings) return;
    try {
      await window.electronAPI.settings.set('app_mode', 'single');
      appMode = 'single';
      saveMessage = 'Switched to single-user mode';
      setTimeout(() => saveMessage = '', 3000);
    } catch (error) {
      console.error('Error switching mode:', error);
    }
  }

  async function toggleRequireLogin() {
    if (!window.electronAPI?.settings) return;
    try {
      const newValue = !requireLogin;
      await window.electronAPI.settings.set('require_login', newValue.toString());
      requireLogin = newValue;
      saveMessage = newValue ? 'Login will be required at startup' : 'Login no longer required at startup';
      setTimeout(() => saveMessage = '', 3000);
    } catch (error) {
      console.error('Error toggling require login:', error);
    }
  }

  function openAddUser() {
    newUsername = '';
    newDisplayName = '';
    newPin = '';
    newConfirmPin = '';
    newUserError = '';
    showAddUser = true;
  }

  function cancelAddUser() {
    showAddUser = false;
    newUserError = '';
  }

  async function createUser() {
    if (!window.electronAPI?.users) return;

    newUserError = '';

    if (!newUsername.trim()) {
      newUserError = 'Username is required';
      return;
    }

    if (!newPin) {
      newUserError = 'PIN is required';
      return;
    }

    if (newPin.length < 4) {
      newUserError = 'PIN must be at least 4 digits';
      return;
    }

    if (!/^\d+$/.test(newPin)) {
      newUserError = 'PIN must contain only numbers';
      return;
    }

    if (newPin !== newConfirmPin) {
      newUserError = 'PINs do not match';
      return;
    }

    try {
      await window.electronAPI.users.create({
        username: newUsername.trim(),
        display_name: newDisplayName.trim() || null,
        pin: newPin,
      });

      showAddUser = false;
      await loadUsers();
      saveMessage = `User "${newUsername}" created`;
      setTimeout(() => saveMessage = '', 3000);
    } catch (error) {
      console.error('Error creating user:', error);
      newUserError = 'Failed to create user';
    }
  }

  function startEditUser(user: User) {
    editingUserId = user.user_id;
    editUsername = user.username;
    editDisplayName = user.display_name || '';
    editError = '';
  }

  function cancelEditUser() {
    editingUserId = null;
    editError = '';
  }

  async function saveEditUser() {
    if (!window.electronAPI?.users || !editingUserId) return;

    editError = '';

    if (!editUsername.trim()) {
      editError = 'Username is required';
      return;
    }

    try {
      await window.electronAPI.users.update(editingUserId, {
        username: editUsername.trim(),
        display_name: editDisplayName.trim() || null,
      });

      editingUserId = null;
      await loadUsers();
      saveMessage = 'User updated';
      setTimeout(() => saveMessage = '', 3000);
    } catch (error) {
      console.error('Error updating user:', error);
      editError = 'Failed to update user';
    }
  }

  function startChangePin(user: User) {
    changingPinUserId = user.user_id;
    changePin = '';
    changeConfirmPin = '';
    changePinError = '';
  }

  function cancelChangePin() {
    changingPinUserId = null;
    changePinError = '';
  }

  async function saveChangePin() {
    if (!window.electronAPI?.users || !changingPinUserId) return;

    changePinError = '';

    if (!changePin) {
      changePinError = 'PIN is required';
      return;
    }

    if (changePin.length < 4) {
      changePinError = 'PIN must be at least 4 digits';
      return;
    }

    if (!/^\d+$/.test(changePin)) {
      changePinError = 'PIN must contain only numbers';
      return;
    }

    if (changePin !== changeConfirmPin) {
      changePinError = 'PINs do not match';
      return;
    }

    try {
      await window.electronAPI.users.setPin(changingPinUserId, changePin);
      saveMessage = 'PIN changed successfully';

      changingPinUserId = null;
      await loadUsers();
      setTimeout(() => saveMessage = '', 3000);
    } catch (error) {
      console.error('Error changing PIN:', error);
      changePinError = 'Failed to change PIN';
    }
  }

  async function deleteUser(user: User) {
    if (!window.electronAPI?.users) return;

    if (users.length <= 1) {
      alert('Cannot delete the last user');
      return;
    }

    if (!confirm(`Are you sure you want to delete user "${user.display_name || user.username}"?`)) {
      return;
    }

    try {
      await window.electronAPI.users.delete(user.user_id);
      await loadUsers();
      saveMessage = 'User deleted';
      setTimeout(() => saveMessage = '', 3000);
    } catch (error) {
      console.error('Error deleting user:', error);
    }
  }

  async function selectArchiveFolder() {
    if (!window.electronAPI?.dialog) return;
    try {
      const folder = await window.electronAPI.dialog.selectFolder();
      if (folder) {
        archivePath = folder;
      }
    } catch (error) {
      console.error('Error selecting folder:', error);
    }
  }

  async function saveSettings() {
    if (!window.electronAPI?.settings) return;
    try {
      saving = true;
      saveMessage = '';

      await Promise.all([
        window.electronAPI.settings.set('archive_folder', archivePath),
        window.electronAPI.settings.set('delete_on_import', deleteOriginals.toString()),
        window.electronAPI.settings.set('import_map', importMap.toString()),
        window.electronAPI.settings.set('map_import', mapImport.toString()),
      ]);

      saveMessage = 'Settings saved successfully';
      setTimeout(() => {
        saveMessage = '';
      }, 3000);
    } catch (error) {
      console.error('Error saving settings:', error);
      saveMessage = 'Error saving settings';
    } finally {
      saving = false;
    }
  }

  /**
   * Kanye6: Regenerate thumbnails for all images missing multi-tier thumbnails
   * This repairs old imports that only have 256px thumbnails
   * @param force - If true, regenerate ALL thumbnails/previews (fixes rotation issues)
   */
  async function regenerateThumbnails(force: boolean = false) {
    if (!window.electronAPI?.media?.regenerateAllThumbnails) {
      regenMessage = 'Thumbnail regeneration not available';
      return;
    }

    try {
      regenerating = true;
      regenProgress = 0;
      regenTotal = 0;
      regenMessage = force ? 'Regenerating ALL thumbnails and previews...' : 'Starting thumbnail regeneration...';

      const result = await window.electronAPI.media.regenerateAllThumbnails({ force });

      if (result.total === 0 && result.rawTotal === 0) {
        regenMessage = 'All images already have thumbnails and previews';
      } else {
        // Kanye9: Show both thumbnail and preview extraction stats
        const thumbMsg = result.total > 0 ? `${result.generated}/${result.total} thumbnails` : '';
        const previewMsg = result.rawTotal > 0 ? `${result.previewsExtracted}/${result.rawTotal} RAW previews` : '';
        const failMsg = (result.failed + (result.previewsFailed || 0)) > 0 ? `(${result.failed + (result.previewsFailed || 0)} failed)` : '';
        regenMessage = `Processed: ${[thumbMsg, previewMsg].filter(Boolean).join(', ')} ${failMsg}`.trim();

        // Bust the cache to force all images to reload with new thumbnails
        thumbnailCache.bust();
      }

      setTimeout(() => {
        regenMessage = '';
      }, 5000);
    } catch (error) {
      console.error('Thumbnail regeneration failed:', error);
      regenMessage = 'Thumbnail regeneration failed';
    } finally {
      regenerating = false;
    }
  }

  // Migration 30: DNG LibRaw rendering state
  let renderingDng = $state(false);
  let dngMessage = $state('');

  // Video fix state
  let fixingVideos = $state(false);
  let videoFixMessage = $state('');

  /**
   * Migration 30: Regenerate DNG previews using LibRaw for full-quality rendering
   * This fixes "potato quality" drone shots where embedded preview is tiny (960x720 for 5376x3956)
   */
  async function regenerateDngPreviews() {
    if (!window.electronAPI?.media?.regenerateDngPreviews) {
      dngMessage = 'DNG rendering not available';
      return;
    }

    try {
      renderingDng = true;
      dngMessage = 'Rendering DNG files with LibRaw...';

      const result = await window.electronAPI.media.regenerateDngPreviews();

      if (result.total === 0) {
        dngMessage = 'No DNG files need re-rendering';
      } else {
        dngMessage = `Rendered ${result.rendered}/${result.total} DNG files${result.failed > 0 ? ` (${result.failed} failed)` : ''}`;
        // Bust cache to force reload
        thumbnailCache.bust();
      }

      setTimeout(() => {
        dngMessage = '';
      }, 5000);
    } catch (error) {
      console.error('DNG rendering failed:', error);
      dngMessage = 'DNG rendering failed';
    } finally {
      renderingDng = false;
    }
  }

  /**
   * Fix Images: Combined operation that runs all image repair operations sequentially
   * 1. Regenerate missing thumbnails
   * 2. Fix rotations (force regenerate)
   * 3. Fix DNG quality (LibRaw)
   */
  async function fixAllImages() {
    if (!window.electronAPI?.media?.regenerateAllThumbnails) {
      regenMessage = 'Image fix not available';
      return;
    }

    try {
      regenerating = true;
      regenMessage = 'Step 1/3: Regenerating missing thumbnails...';

      // Step 1: Regenerate missing thumbnails
      const step1 = await window.electronAPI.media.regenerateAllThumbnails({ force: false });

      regenMessage = 'Step 2/3: Fixing rotations...';

      // Step 2: Fix all rotations (force regenerate)
      const step2 = await window.electronAPI.media.regenerateAllThumbnails({ force: true });

      regenerating = false;
      renderingDng = true;
      regenMessage = '';
      dngMessage = 'Step 3/3: Fixing DNG quality...';

      // Step 3: Fix DNG quality
      const step3 = await window.electronAPI.media.regenerateDngPreviews?.() ?? { rendered: 0, failed: 0 };

      // Show combined results
      const totalProcessed = step1.total + step2.total + (step3.total || 0);
      const totalFailed = step1.failed + step2.failed + (step3.failed || 0);

      dngMessage = totalProcessed > 0
        ? `Done! Processed ${totalProcessed} images${totalFailed > 0 ? ` (${totalFailed} failed)` : ''}`
        : 'All images already up to date';

      thumbnailCache.bust();

      setTimeout(() => {
        dngMessage = '';
      }, 5000);
    } catch (error) {
      console.error('Fix images failed:', error);
      regenMessage = '';
      dngMessage = 'Image fix failed';
    } finally {
      regenerating = false;
      renderingDng = false;
    }
  }

  /**
   * Fix Videos: Regenerate poster frames and thumbnails for all videos
   */
  async function fixAllVideos() {
    if (!window.electronAPI?.media?.regenerateVideoThumbnails) {
      videoFixMessage = 'Video fix not available';
      return;
    }

    try {
      fixingVideos = true;
      videoFixMessage = 'Regenerating video thumbnails...';

      const result = await window.electronAPI.media.regenerateVideoThumbnails({ force: true });

      if (result.total === 0) {
        videoFixMessage = 'No videos to process';
      } else {
        videoFixMessage = `Done! Processed ${result.generated}/${result.total} videos${result.failed > 0 ? ` (${result.failed} failed)` : ''}`;
        thumbnailCache.bust();
      }

      setTimeout(() => {
        videoFixMessage = '';
      }, 5000);
    } catch (error) {
      console.error('Fix videos failed:', error);
      videoFixMessage = 'Video fix failed';
    } finally {
      fixingVideos = false;
    }
  }

  /**
   * Kanye9: Normalize all addresses using AddressService
   * This backfills address_raw, address_normalized, address_parsed_json for existing locations
   */
  async function normalizeAllAddresses() {
    if (!window.electronAPI?.locations) {
      normalizeMessage = 'Location API not available';
      return;
    }

    try {
      normalizing = true;
      normalizeMessage = 'Normalizing addresses...';

      // Get all locations
      const locations = await window.electronAPI.locations.findAll();
      let processed = 0;
      let updated = 0;

      for (const loc of locations) {
        // Skip if no address data
        if (!loc.address?.street && !loc.address?.city && !loc.address?.zipcode) {
          processed++;
          continue;
        }

        // Update location to trigger address normalization
        await window.electronAPI.locations.update(loc.locid, {
          address: loc.address
        });

        processed++;
        updated++;
        normalizeMessage = `Normalized ${processed} of ${locations.length} locations...`;
      }

      normalizeMessage = `Done! Normalized ${updated} locations with address data.`;
      setTimeout(() => {
        normalizeMessage = '';
      }, 5000);
    } catch (error) {
      console.error('Address normalization failed:', error);
      normalizeMessage = 'Normalization failed';
    } finally {
      normalizing = false;
    }
  }

  // P6: Darktable functions removed per v010steps.md

  /**
   * DECISION-012: Backfill region fields for existing locations
   * Populates Census region, division, state direction, and cultural region
   */
  async function backfillRegions() {
    if (!window.electronAPI?.locations?.backfillRegions) {
      backfillMessage = 'Region backfill not available';
      return;
    }

    try {
      backfillingRegions = true;
      backfillMessage = 'Calculating regions for all locations...';

      const result = await window.electronAPI.locations.backfillRegions();

      if (result.updated === 0) {
        backfillMessage = `All ${result.total} locations already have region data`;
      } else {
        backfillMessage = `Updated ${result.updated} of ${result.total} locations with region data`;
      }

      setTimeout(() => {
        backfillMessage = '';
      }, 5000);
    } catch (error) {
      console.error('Region backfill failed:', error);
      backfillMessage = 'Region backfill failed';
    } finally {
      backfillingRegions = false;
    }
  }

  /**
   * Migration 23: Detect and hide Live Photo videos and SDR duplicates
   * Scans all locations and auto-hides companion files
   */
  async function detectAllLivePhotos() {
    if (!window.electronAPI?.media?.detectLivePhotosAndSDR || !window.electronAPI?.locations) {
      livePhotoMessage = 'Live Photo detection not available';
      return;
    }

    try {
      detectingLivePhotos = true;
      livePhotoMessage = 'Scanning locations...';

      // Get all locations
      const locations = await window.electronAPI.locations.findAll();
      let processed = 0;
      let totalHidden = 0;

      for (const loc of locations) {
        processed++;
        livePhotoMessage = `Scanning ${processed} of ${locations.length} locations...`;

        const result = await window.electronAPI.media.detectLivePhotosAndSDR(loc.locid);
        if (result?.livePhotosHidden) {
          totalHidden += result.livePhotosHidden;
        }
        if (result?.sdrHidden) {
          totalHidden += result.sdrHidden;
        }
      }

      if (totalHidden === 0) {
        livePhotoMessage = `Scanned ${locations.length} locations. No new Live Photos or SDR duplicates found.`;
      } else {
        livePhotoMessage = `Done! Found and hid ${totalHidden} Live Photo videos and SDR duplicates across ${locations.length} locations.`;
      }

      setTimeout(() => {
        livePhotoMessage = '';
      }, 8000);
    } catch (error) {
      console.error('Live Photo detection failed:', error);
      livePhotoMessage = 'Detection failed';
    } finally {
      detectingLivePhotos = false;
    }
  }

  /**
   * Migration 36: Load video proxy cache statistics
   */
  async function loadProxyCacheStats() {
    if (!window.electronAPI?.media?.getProxyCacheStats) return;
    try {
      proxyCacheStats = await window.electronAPI.media.getProxyCacheStats();
    } catch (error) {
      console.error('Failed to load proxy cache stats:', error);
    }
  }

  /**
   * Migration 36: Purge old proxies (30 days)
   */
  async function purgeOldProxies() {
    if (!window.electronAPI?.media?.purgeOldProxies) {
      proxyMessage = 'Proxy purge not available';
      return;
    }

    try {
      purgingProxies = true;
      proxyMessage = 'Purging old proxies...';

      const result = await window.electronAPI.media.purgeOldProxies(30);

      if (result.deleted === 0) {
        proxyMessage = 'No proxies older than 30 days found';
      } else {
        proxyMessage = `Purged ${result.deleted} old proxies (freed ${result.freedMB} MB)`;
      }

      await loadProxyCacheStats();

      setTimeout(() => {
        proxyMessage = '';
      }, 5000);
    } catch (error) {
      console.error('Proxy purge failed:', error);
      proxyMessage = 'Purge failed';
    } finally {
      purgingProxies = false;
    }
  }

  /**
   * Migration 36: Clear all video proxies
   */
  async function clearAllProxies() {
    if (!window.electronAPI?.media?.clearAllProxies) {
      proxyMessage = 'Proxy clear not available';
      return;
    }

    if (!confirm('Are you sure you want to clear all video proxies? They will be regenerated as needed.')) {
      return;
    }

    try {
      clearingProxies = true;
      proxyMessage = 'Clearing all proxies...';

      const result = await window.electronAPI.media.clearAllProxies();
      proxyMessage = `Cleared ${result.deleted} proxies (freed ${result.freedMB} MB)`;

      await loadProxyCacheStats();

      setTimeout(() => {
        proxyMessage = '';
      }, 5000);
    } catch (error) {
      console.error('Proxy clear failed:', error);
      proxyMessage = 'Clear failed';
    } finally {
      clearingProxies = false;
    }
  }

  /**
   * Load reference maps list
   */
  async function loadRefMaps() {
    if (!window.electronAPI?.refMaps) return;
    try {
      refMaps = await window.electronAPI.refMaps.findAll();
      const stats = await window.electronAPI.refMaps.getStats();
      refMapStats = { mapCount: stats.mapCount, pointCount: stats.pointCount };

      // Load catalogued points count for purge button
      const cataloguedResult = await window.electronAPI.refMaps.findCataloguedPoints();
      if (cataloguedResult.success) {
        cataloguedCount = cataloguedResult.count;
      }
    } catch (error) {
      console.error('Failed to load reference maps:', error);
    }
  }

  /**
   * Purge reference points that are already catalogued
   */
  async function purgeCataloguedPoints() {
    if (!window.electronAPI?.refMaps?.purgeCataloguedPoints) {
      purgeMessage = 'Purge not available';
      return;
    }

    try {
      purgingPoints = true;
      purgeMessage = 'Purging catalogued points...';

      const result = await window.electronAPI.refMaps.purgeCataloguedPoints();

      if (!result.success) {
        purgeMessage = result.error || 'Purge failed';
      } else {
        purgeMessage = result.message || `Purged ${result.deleted} points`;
        await loadRefMaps(); // Refresh stats
      }

      setTimeout(() => { purgeMessage = ''; }, 5000);
    } catch (error) {
      console.error('Purge failed:', error);
      purgeMessage = 'Purge failed';
      setTimeout(() => { purgeMessage = ''; }, 5000);
    } finally {
      purgingPoints = false;
    }
  }

  /**
   * Import a new reference map file (with preview dialog)
   */
  async function importRefMap() {
    if (!window.electronAPI?.refMaps) {
      refMapMessage = 'Reference maps not available';
      return;
    }

    try {
      importingRefMap = true;
      refMapMessage = 'Selecting file...';

      // Open file dialog
      const result = await window.electronAPI.refMaps.selectFile();

      if (!result) {
        refMapMessage = '';
        importingRefMap = false;
        return;
      }

      // Show preview with deduplication check
      previewLoading = true;
      refMapMessage = 'Analyzing file...';

      const preview = await window.electronAPI.refMaps.previewImport(result);

      if (!preview.success) {
        refMapMessage = preview.error || 'Failed to analyze file';
        previewLoading = false;
        importingRefMap = false;
        setTimeout(() => { refMapMessage = ''; }, 5000);
        return;
      }

      // Show preview modal
      importPreview = {
        fileName: preview.fileName || '',
        filePath: preview.filePath || '',
        fileType: preview.fileType || '',
        totalPoints: preview.totalPoints || 0,
        newPoints: preview.newPoints || 0,
        cataloguedCount: preview.cataloguedCount || 0,
        referenceCount: preview.referenceCount || 0,
        cataloguedMatches: preview.cataloguedMatches || [],
        referenceMatches: preview.referenceMatches || [],
      };
      skipDuplicates = true;
      showImportPreview = true;
      previewLoading = false;
      refMapMessage = '';
    } catch (error) {
      console.error('Reference map import failed:', error);
      refMapMessage = 'Import failed';
      setTimeout(() => { refMapMessage = ''; }, 5000);
      previewLoading = false;
    } finally {
      importingRefMap = false;
    }
  }

  /**
   * Confirm import with deduplication options
   */
  async function confirmImport() {
    if (!window.electronAPI?.refMaps || !importPreview) return;

    try {
      importingRefMap = true;
      refMapMessage = 'Importing...';

      const result = await window.electronAPI.refMaps.importWithOptions(importPreview.filePath, {
        skipDuplicates,
        importedBy: currentUserId || undefined,
      });

      showImportPreview = false;
      importPreview = null;

      if (result.skippedAll) {
        refMapMessage = result.message || 'All points were duplicates';
      } else if (!result.success) {
        refMapMessage = result.error || 'Import failed';
      } else {
        const skippedMsg = result.skippedCount ? ` (${result.skippedCount} duplicates skipped)` : '';
        refMapMessage = `Imported "${result.map?.mapName}" with ${result.pointCount} points${skippedMsg}`;
        await loadRefMaps();
      }

      setTimeout(() => { refMapMessage = ''; }, 5000);
    } catch (error) {
      console.error('Reference map import failed:', error);
      refMapMessage = 'Import failed';
      setTimeout(() => { refMapMessage = ''; }, 5000);
    } finally {
      importingRefMap = false;
    }
  }

  /**
   * Cancel import preview
   */
  function cancelImportPreview() {
    showImportPreview = false;
    importPreview = null;
    refMapMessage = '';
  }

  /**
   * Delete a reference map
   */
  async function deleteRefMap(mapId: string) {
    if (!window.electronAPI?.refMaps) return;

    const map = refMaps.find(m => m.mapId === mapId);
    if (!confirm(`Delete "${map?.mapName}"? This will remove all ${map?.pointCount || 0} points.`)) {
      return;
    }

    try {
      await window.electronAPI.refMaps.delete(mapId);
      await loadRefMaps();
      refMapMessage = 'Map deleted';
      setTimeout(() => { refMapMessage = ''; }, 3000);
    } catch (error) {
      console.error('Failed to delete reference map:', error);
      refMapMessage = 'Delete failed';
      setTimeout(() => { refMapMessage = ''; }, 5000);
    }
  }

  // PIN verification helpers
  async function requestPinForAction(action: 'archive' | 'deleteOnImport' | 'startupPin') {
    // Check if current user has a PIN set
    if (!currentUserId) {
      // No user logged in, proceed directly
      executePinAction(action);
      return;
    }

    try {
      const hasPin = await window.electronAPI.users.hasPin(currentUserId);
      if (!hasPin) {
        // User doesn't have a PIN, proceed directly
        executePinAction(action);
        return;
      }

      // User has a PIN, show modal
      pinAction = action;
      pinInput = '';
      pinError = '';
      showPinModal = true;
    } catch (error) {
      console.error('Error checking PIN status:', error);
      // On error, proceed without PIN (fail open for usability)
      executePinAction(action);
    }
  }

  function closePinModal() {
    showPinModal = false;
    pinAction = null;
    pinInput = '';
    pinError = '';
    pinVerifying = false;
  }

  async function verifyAndExecutePinAction() {
    if (!currentUserId || !pinAction) return;

    pinVerifying = true;
    pinError = '';

    try {
      const result = await window.electronAPI.users.verifyPin(currentUserId, pinInput);
      if (result.success) {
        const action = pinAction;
        closePinModal();
        executePinAction(action);
      } else {
        pinError = 'Incorrect PIN';
        pinInput = '';
      }
    } catch (error) {
      console.error('Error verifying PIN:', error);
      pinError = 'Verification failed';
    } finally {
      pinVerifying = false;
    }
  }

  function executePinAction(action: 'archive' | 'deleteOnImport' | 'startupPin') {
    if (action === 'archive') {
      selectArchiveFolder();
    } else if (action === 'deleteOnImport') {
      // If turning ON delete on import, show warning first
      if (!deleteOriginals) {
        showDeleteWarning = true;
      } else {
        // Turning off, no warning needed
        toggleDeleteOnImport();
      }
    } else if (action === 'startupPin') {
      toggleRequireLogin();
    }
  }

  async function toggleDeleteOnImport() {
    deleteOriginals = !deleteOriginals;
    showDeleteWarning = false;
    // Auto-save the setting
    if (window.electronAPI?.settings) {
      await window.electronAPI.settings.set('delete_on_import', deleteOriginals.toString());
      saveMessage = deleteOriginals ? 'Files will be deleted after import' : 'Original files will be preserved';
      setTimeout(() => saveMessage = '', 3000);
    }
  }

  function cancelDeleteWarning() {
    showDeleteWarning = false;
  }

  // Location picker modal helpers
  function openLocationPicker(mode: 'purge' | 'addresses' | 'images' | 'videos') {
    pickerMode = mode;
    pickerSearchQuery = '';
    pickerSearchResults = [];
    pickerSelectedLocation = null;
    pickerMessage = '';
    showLocationPicker = true;
  }

  function closeLocationPicker() {
    showLocationPicker = false;
    pickerMode = null;
    pickerSearchQuery = '';
    pickerSearchResults = [];
    pickerSelectedLocation = null;
  }

  let searchDebounceTimer: ReturnType<typeof setTimeout>;
  async function handlePickerSearch() {
    if (searchDebounceTimer) clearTimeout(searchDebounceTimer);

    if (!pickerSearchQuery.trim()) {
      pickerSearchResults = [];
      return;
    }

    searchDebounceTimer = setTimeout(async () => {
      if (!window.electronAPI?.locations) return;
      try {
        const locations = await window.electronAPI.locations.findAll();
        const query = pickerSearchQuery.toLowerCase();
        pickerSearchResults = locations
          .filter((loc: { locnam: string; address?: { state?: string } }) =>
            loc.locnam.toLowerCase().includes(query)
          )
          .slice(0, 10)
          .map((loc: { locid: string; locnam: string; address?: { state?: string } }) => ({
            locid: loc.locid,
            locnam: loc.locnam,
            state: loc.address?.state
          }));
      } catch (error) {
        console.error('Search failed:', error);
      }
    }, 200);
  }

  function selectPickerLocation(loc: LocationBasic) {
    pickerSelectedLocation = loc;
    pickerSearchQuery = loc.locnam;
    pickerSearchResults = [];
  }

  function clearPickerLocation() {
    pickerSelectedLocation = null;
    pickerSearchQuery = '';
    pickerSearchResults = [];
  }

  function getPickerTitle(): string {
    switch (pickerMode) {
      case 'purge': return 'Purge Cache';
      case 'addresses': return 'Fix Addresses';
      case 'images': return 'Fix Images';
      case 'videos': return 'Fix Videos';
      default: return '';
    }
  }

  function getPickerButtonText(): string {
    const hasLocation = pickerSelectedLocation !== null;
    switch (pickerMode) {
      case 'purge': return hasLocation ? 'Purge' : 'Purge All';
      case 'addresses': return hasLocation ? 'Fix Addresses' : 'Fix All Addresses';
      case 'images': return hasLocation ? 'Fix Images' : 'Fix All Images';
      case 'videos': return hasLocation ? 'Fix Videos' : 'Fix All Videos';
      default: return 'Run';
    }
  }

  async function runPickerAction() {
    if (!pickerMode) return;

    pickerLoading = true;
    const locationId = pickerSelectedLocation?.locid;

    try {
      switch (pickerMode) {
        case 'purge':
          await runPurgeCache(locationId);
          break;
        case 'addresses':
          await runFixAddresses(locationId);
          break;
        case 'images':
          await runFixImagesWithLivePhoto(locationId);
          break;
        case 'videos':
          await runFixVideosWithLivePhoto(locationId);
          break;
      }
      closeLocationPicker();
    } catch (error) {
      console.error('Action failed:', error);
      pickerMessage = 'Operation failed';
    } finally {
      pickerLoading = false;
    }
  }

  // Combined fix functions with location targeting
  async function runPurgeCache(locationId?: string) {
    if (!window.electronAPI?.media?.clearAllProxies) {
      proxyMessage = 'Proxy clear not available';
      return;
    }

    try {
      proxyMessage = locationId ? 'Clearing proxies for location...' : 'Clearing all proxies...';
      // Note: Current API doesn't support per-location purge, so this clears all
      // In future, could add location-specific purge
      const result = await window.electronAPI.media.clearAllProxies();
      proxyMessage = `Cleared ${result.deleted} proxies (freed ${result.freedMB} MB)`;
      await loadProxyCacheStats();
      setTimeout(() => { proxyMessage = ''; }, 5000);
    } catch (error) {
      console.error('Proxy clear failed:', error);
      proxyMessage = 'Clear failed';
    }
  }

  async function runFixAddresses(locationId?: string) {
    if (!window.electronAPI?.locations) {
      normalizeMessage = 'Location API not available';
      return;
    }

    try {
      normalizing = true;
      backfillingRegions = true;

      // Step 1: Normalize addresses
      normalizeMessage = 'Step 1/2: Normalizing addresses...';
      const locations = locationId
        ? [await window.electronAPI.locations.findById(locationId)].filter(Boolean)
        : await window.electronAPI.locations.findAll();

      let processed = 0;
      for (const loc of locations) {
        if (loc.address?.street || loc.address?.city || loc.address?.zipcode) {
          await window.electronAPI.locations.update(loc.locid, { address: loc.address });
        }
        processed++;
        normalizeMessage = `Step 1/2: Normalized ${processed} of ${locations.length}...`;
      }

      // Step 2: Backfill regions
      normalizeMessage = 'Step 2/2: Backfilling regions...';
      if (window.electronAPI.locations.backfillRegions) {
        await window.electronAPI.locations.backfillRegions();
      }

      normalizeMessage = `Done! Processed ${locations.length} location${locations.length !== 1 ? 's' : ''}`;
      setTimeout(() => { normalizeMessage = ''; }, 5000);
    } catch (error) {
      console.error('Fix addresses failed:', error);
      normalizeMessage = 'Fix addresses failed';
    } finally {
      normalizing = false;
      backfillingRegions = false;
    }
  }

  async function runFixImagesWithLivePhoto(locationId?: string) {
    if (!window.electronAPI?.media?.regenerateAllThumbnails) {
      regenMessage = 'Image fix not available';
      return;
    }

    try {
      regenerating = true;

      // Step 1: Fix images (thumbnails + DNG)
      regenMessage = 'Step 1/2: Fixing images...';
      const step1 = await window.electronAPI.media.regenerateAllThumbnails({ force: true });

      if (window.electronAPI.media.regenerateDngPreviews) {
        await window.electronAPI.media.regenerateDngPreviews();
      }

      // Step 2: Detect Live Photos
      regenMessage = 'Step 2/2: Detecting Live Photos...';
      if (window.electronAPI.media.detectLivePhotosAndSDR && window.electronAPI.locations) {
        const locations = locationId
          ? [await window.electronAPI.locations.findById(locationId)].filter(Boolean)
          : await window.electronAPI.locations.findAll();

        for (const loc of locations) {
          await window.electronAPI.media.detectLivePhotosAndSDR(loc.locid);
        }
      }

      thumbnailCache.bust();
      regenMessage = 'Done! Images fixed and Live Photos detected';
      setTimeout(() => { regenMessage = ''; }, 5000);
    } catch (error) {
      console.error('Fix images failed:', error);
      regenMessage = 'Fix images failed';
    } finally {
      regenerating = false;
    }
  }

  async function runFixVideosWithLivePhoto(locationId?: string) {
    if (!window.electronAPI?.media?.regenerateVideoThumbnails) {
      videoFixMessage = 'Video fix not available';
      return;
    }

    try {
      fixingVideos = true;

      // Step 1: Fix videos
      videoFixMessage = 'Step 1/2: Fixing videos...';
      await window.electronAPI.media.regenerateVideoThumbnails({ force: true });

      // Step 2: Detect Live Photos
      videoFixMessage = 'Step 2/2: Detecting Live Photos...';
      if (window.electronAPI.media.detectLivePhotosAndSDR && window.electronAPI.locations) {
        const locations = locationId
          ? [await window.electronAPI.locations.findById(locationId)].filter(Boolean)
          : await window.electronAPI.locations.findAll();

        for (const loc of locations) {
          await window.electronAPI.media.detectLivePhotosAndSDR(loc.locid);
        }
      }

      thumbnailCache.bust();
      videoFixMessage = 'Done! Videos fixed and Live Photos detected';
      setTimeout(() => { videoFixMessage = ''; }, 5000);
    } catch (error) {
      console.error('Fix videos failed:', error);
      videoFixMessage = 'Fix videos failed';
    } finally {
      fixingVideos = false;
    }
  }

  // Database functions (moved from DatabaseSettings component)
  let backingUp = $state(false);
  let backupMessage = $state('');
  let restoring = $state(false);
  let restoreMessage = $state('');

  async function backupDatabase() {
    try {
      backingUp = true;
      backupMessage = '';

      const result = await window.electronAPI.database.backup();

      if (result.success) {
        backupMessage = `Backed up to: ${result.path}`;
      } else {
        backupMessage = result.message || 'Backup canceled';
      }

      setTimeout(() => { backupMessage = ''; }, 5000);
    } catch (error) {
      console.error('Error backing up database:', error);
      backupMessage = 'Error backing up database';
      setTimeout(() => { backupMessage = ''; }, 5000);
    } finally {
      backingUp = false;
    }
  }

  async function restoreDatabase() {
    try {
      restoring = true;
      restoreMessage = '';

      const result = await window.electronAPI.database.restore();

      if (result.success) {
        restoreMessage = result.message;
      } else {
        restoreMessage = result.message || 'Restore canceled';
        setTimeout(() => { restoreMessage = ''; }, 5000);
      }
    } catch (error) {
      console.error('Error restoring database:', error);
      restoreMessage = 'Error restoring database';
      setTimeout(() => { restoreMessage = ''; }, 5000);
    } finally {
      restoring = false;
    }
  }

  // Helper to format bytes to human readable
  function formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }

  // Load storage stats for archive drive
  async function loadStorageStats() {
    if (!window.electronAPI?.storage?.getStats) return;
    try {
      loadingStorage = true;
      storageStats = await window.electronAPI.storage.getStats();
    } catch (error) {
      console.error('Failed to load storage stats:', error);
    } finally {
      loadingStorage = false;
    }
  }

  onMount(() => {
    loadSettings();
    loadProxyCacheStats();
    loadRefMaps();
    loadStorageStats();
  });
</script>

<div class="p-8">
  <div class="mb-8">
    <div class="flex items-baseline justify-between">
      <h1 class="text-3xl font-bold text-foreground mb-2">Settings</h1>
      <span class="text-sm text-gray-400">v0.1.0</span>
    </div>
  </div>

  {#if loading}
    <div class="max-w-2xl">
      <p class="text-gray-500">Loading settings...</p>
    </div>
  {:else}
    <div class="max-w-2xl">
      <!-- User Management -->
      <div class="bg-white rounded-lg shadow mb-6 {usersExpanded ? 'p-6' : 'px-6 py-4'}">
        <!-- Accordion Header -->
        <button
          onclick={() => usersExpanded = !usersExpanded}
          aria-expanded={usersExpanded}
          class="w-full flex items-center justify-between text-left hover:opacity-80 transition-opacity"
        >
          <h2 class="text-lg font-semibold text-foreground leading-none">Users</h2>
          <svg
            class="w-5 h-5 text-accent transition-transform duration-200 {usersExpanded ? 'rotate-180' : ''}"
            fill="none"
            stroke="currentColor"
            stroke-width="2.5"
            viewBox="0 0 24 24"
          >
            <path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {#if usersExpanded}
        <!-- User List -->
        <div class="space-y-3 mt-4">
          {#each users as user}
            <div class="border border-gray-200 rounded-lg p-4">
              {#if editingUserId === user.user_id}
                <!-- Edit Mode -->
                <div class="space-y-3">
                  <div class="grid grid-cols-2 gap-3">
                    <div>
                      <label class="block text-xs font-medium text-gray-600 mb-1">Username</label>
                      <input
                        type="text"
                        bind:value={editUsername}
                        class="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-accent"
                      />
                    </div>
                    <div>
                      <label class="block text-xs font-medium text-gray-600 mb-1">Display Name</label>
                      <input
                        type="text"
                        bind:value={editDisplayName}
                        placeholder="Optional"
                        class="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-accent"
                      />
                    </div>
                  </div>
                  {#if editError}
                    <p class="text-red-500 text-xs">{editError}</p>
                  {/if}
                  <div class="flex gap-2">
                    <button
                      onclick={saveEditUser}
                      class="px-3 py-1 text-sm bg-accent text-white rounded hover:opacity-90"
                    >
                      Save
                    </button>
                    <button
                      onclick={cancelEditUser}
                      class="px-3 py-1 text-sm bg-gray-100 text-gray-700 rounded hover:bg-gray-200"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              {:else if changingPinUserId === user.user_id}
                <!-- Change PIN Mode -->
                <div class="space-y-3">
                  <p class="text-sm font-medium text-foreground">
                    Change PIN for {user.display_name || user.username}
                  </p>
                  <div class="grid grid-cols-2 gap-3">
                    <div>
                      <label class="block text-xs font-medium text-gray-600 mb-1">New PIN</label>
                      <input
                        type="password"
                        inputmode="numeric"
                        pattern="[0-9]*"
                        maxlength="6"
                        bind:value={changePin}
                        placeholder="4-6 digits"
                        class="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-accent text-center"
                      />
                    </div>
                    <div>
                      <label class="block text-xs font-medium text-gray-600 mb-1">Confirm PIN</label>
                      <input
                        type="password"
                        inputmode="numeric"
                        pattern="[0-9]*"
                        maxlength="6"
                        bind:value={changeConfirmPin}
                        placeholder="Re-enter"
                        class="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-accent text-center"
                      />
                    </div>
                  </div>
                  {#if changePinError}
                    <p class="text-red-500 text-xs">{changePinError}</p>
                  {/if}
                  <div class="flex gap-2">
                    <button
                      onclick={saveChangePin}
                      class="px-3 py-1 text-sm bg-accent text-white rounded hover:opacity-90"
                    >
                      Save PIN
                    </button>
                    <button
                      onclick={cancelChangePin}
                      class="px-3 py-1 text-sm bg-gray-100 text-gray-700 rounded hover:bg-gray-200"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              {:else}
                <!-- View Mode -->
                <div class="flex items-center justify-between">
                  <div>
                    <div class="flex items-center gap-2">
                      <span class="font-medium text-foreground">{user.display_name || user.username}</span>
                      {#if currentUserId === user.user_id}
                        <span class="text-xs bg-accent/10 text-accent px-1.5 py-0.5 rounded">Current</span>
                      {/if}
                    </div>
                    {#if user.display_name}
                      <p class="text-xs text-gray-500">@{user.username}</p>
                    {/if}
                  </div>
                  <div class="flex gap-1">
                    <button
                      onclick={() => startEditUser(user)}
                      class="p-1.5 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded"
                      title="Edit user"
                    >
                      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path>
                      </svg>
                    </button>
                    <button
                      onclick={() => startChangePin(user)}
                      class="p-1.5 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded"
                      title="Change PIN"
                    >
                      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"></path>
                      </svg>
                    </button>
                    {#if users.length > 1}
                      <button
                        onclick={() => deleteUser(user)}
                        class="p-1.5 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded"
                        title="Delete user"
                      >
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path>
                        </svg>
                      </button>
                    {/if}
                  </div>
                </div>
              {/if}
            </div>
          {/each}

          <!-- Add User row -->
          <div class="flex items-center justify-end border-t border-gray-200 pt-4 mt-4">
            <button
              onclick={openAddUser}
              class="text-sm text-accent hover:underline"
              title="Add user"
            >
              add user
            </button>
          </div>

          <!-- Add User Form -->
          {#if showAddUser}
            <div class="border border-accent rounded-lg p-4 bg-accent/5">
              <h3 class="font-medium text-foreground mb-3">Add New User</h3>
              <div class="space-y-3">
                <div class="grid grid-cols-2 gap-3">
                  <div>
                    <label class="block text-xs font-medium text-gray-600 mb-1">Username *</label>
                    <input
                      type="text"
                      bind:value={newUsername}
                      placeholder="Enter username"
                      class="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-accent"
                    />
                  </div>
                  <div>
                    <label class="block text-xs font-medium text-gray-600 mb-1">Display Name</label>
                    <input
                      type="text"
                      bind:value={newDisplayName}
                      placeholder="Optional"
                      class="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-accent"
                    />
                  </div>
                </div>
                <div class="grid grid-cols-2 gap-3">
                  <div>
                    <label class="block text-xs font-medium text-gray-600 mb-1">PIN *</label>
                    <input
                      type="password"
                      inputmode="numeric"
                      pattern="[0-9]*"
                      maxlength="6"
                      bind:value={newPin}
                      placeholder="4-6 digits"
                      class="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-accent text-center"
                    />
                  </div>
                  <div>
                    <label class="block text-xs font-medium text-gray-600 mb-1">Confirm PIN *</label>
                    <input
                      type="password"
                      inputmode="numeric"
                      pattern="[0-9]*"
                      maxlength="6"
                      bind:value={newConfirmPin}
                      placeholder="Re-enter"
                      class="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-accent text-center"
                    />
                  </div>
                </div>
                {#if newUserError}
                  <p class="text-red-500 text-xs">{newUserError}</p>
                {/if}
                <div class="flex gap-2">
                  <button
                    onclick={createUser}
                    class="px-3 py-1 text-sm bg-accent text-white rounded hover:opacity-90"
                  >
                    Create User
                  </button>
                  <button
                    onclick={cancelAddUser}
                    class="px-3 py-1 text-sm bg-gray-100 text-gray-700 rounded hover:bg-gray-200"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          {/if}
        </div>
        {/if}
      </div>

      <!-- Archive Accordion -->
      <div class="bg-white rounded-lg shadow mb-6 overflow-hidden">
        <button
          onclick={() => archiveExpanded = !archiveExpanded}
          class="w-full flex items-center justify-between text-left transition-colors hover:bg-gray-50 {archiveExpanded ? 'p-6' : 'px-6 py-4'}"
        >
          <h2 class="text-lg font-semibold text-foreground">Archive</h2>
          <svg
            class="w-5 h-5 text-accent transition-transform duration-200 {archiveExpanded ? 'rotate-180' : ''}"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {#if archiveExpanded}
        <div class="px-6 pb-6 space-y-4">
          <!-- Archive Location Row -->
          <div class="flex items-center justify-between py-2 border-b border-gray-100">
            <div class="flex-1">
              <span class="text-sm font-medium text-gray-700">Archive Location</span>
              {#if archivePath}
                <p class="text-xs text-gray-500 truncate max-w-[280px]" title={archivePath}>{archivePath}</p>
              {/if}
            </div>
            <button
              onclick={() => requestPinForAction('archive')}
              class="text-sm text-accent hover:underline"
            >
              edit
            </button>
          </div>

          <!-- Delete on Import Row -->
          <div class="flex items-center justify-between py-2 border-b border-gray-100">
            <div class="flex items-center gap-2">
              <span class="text-sm font-medium text-gray-700">Delete Original Files on Import</span>
              <span class="text-xs px-1.5 py-0.5 rounded {deleteOriginals ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-600'}">
                {deleteOriginals ? 'On' : 'Off'}
              </span>
            </div>
            <button
              onclick={() => requestPinForAction('deleteOnImport')}
              class="text-sm text-accent hover:underline"
            >
              edit
            </button>
          </div>

          <!-- Startup PIN Row -->
          <div class="flex items-center justify-between py-2 border-b border-gray-100">
            <div class="flex items-center gap-2">
              <span class="text-sm font-medium text-gray-700">Startup PIN Required</span>
              <span class="text-xs px-1.5 py-0.5 rounded {requireLogin ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}">
                {requireLogin ? 'On' : 'Off'}
              </span>
            </div>
            <button
              onclick={() => requestPinForAction('startupPin')}
              class="text-sm text-accent hover:underline"
            >
              edit
            </button>
          </div>

          <!-- Storage Bar -->
          <div class="py-3 border-b border-gray-100">
            <span class="text-sm font-medium text-gray-700 mb-2 block">Storage</span>
            {#if storageStats}
              {@const archivePercent = (storageStats.archiveBytes / storageStats.totalBytes) * 100}
              {@const otherUsedBytes = storageStats.totalBytes - storageStats.availableBytes - storageStats.archiveBytes}
              {@const otherUsedPercent = Math.max(0, (otherUsedBytes / storageStats.totalBytes) * 100)}
              <div class="h-4 bg-gray-200 rounded-full overflow-hidden flex">
                <div class="bg-accent" style="width: {archivePercent}%"></div>
                <div class="bg-gray-400" style="width: {otherUsedPercent}%"></div>
              </div>
              <div class="flex justify-between text-xs text-gray-500 mt-1">
                <span>Total: {formatBytes(storageStats.totalBytes)}</span>
                <span>Available: {formatBytes(storageStats.availableBytes)}</span>
                <span>Archive: {formatBytes(storageStats.archiveBytes)}</span>
              </div>
            {:else if loadingStorage}
              <div class="h-4 bg-gray-200 rounded-full animate-pulse"></div>
              <p class="text-xs text-gray-400 mt-1">Loading storage info...</p>
            {:else}
              <p class="text-xs text-gray-400">Storage info unavailable</p>
            {/if}
          </div>

          <!-- Database Sub-Accordion -->
          <div>
            <button
              onclick={() => databaseExpanded = !databaseExpanded}
              class="w-full flex items-center justify-between py-2 border-b border-gray-100 text-left hover:bg-gray-50 transition-colors"
            >
              <div class="flex items-center gap-2">
                <span class="text-sm font-medium text-gray-700">Database</span>
                <span class="text-xs px-1.5 py-0.5 rounded bg-green-100 text-green-700">healthy</span>
              </div>
              <svg
                class="w-4 h-4 text-accent transition-transform duration-200 {databaseExpanded ? 'rotate-180' : ''}"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {#if databaseExpanded}
            <div class="py-3">
              <div class="flex flex-wrap gap-2">
                <button
                  onclick={backupDatabase}
                  disabled={backingUp || restoring}
                  class="px-3 py-1.5 text-sm bg-accent text-white rounded hover:opacity-90 transition disabled:opacity-50"
                >
                  {backingUp ? 'Backing up...' : 'Backup'}
                </button>
                <button
                  onclick={restoreDatabase}
                  disabled={restoring || backingUp}
                  class="px-3 py-1.5 text-sm bg-accent text-white rounded hover:opacity-90 transition disabled:opacity-50"
                >
                  {restoring ? 'Restoring...' : 'Restore'}
                </button>
              </div>
              {#if backupMessage}
                <p class="text-sm mt-2 {backupMessage.includes('Error') || backupMessage.includes('canceled') ? 'text-red-600' : 'text-green-600'}">
                  {backupMessage}
                </p>
              {/if}
              {#if restoreMessage}
                <p class="text-sm mt-2 {restoreMessage.includes('Error') || restoreMessage.includes('canceled') || restoreMessage.includes('Invalid') ? 'text-red-600' : 'text-green-600'}">
                  {restoreMessage}
                </p>
              {/if}
            </div>
            {/if}
          </div>

          <!-- Maps Sub-Accordion -->
          <div>
            <button
              onclick={() => mapsExpanded = !mapsExpanded}
              class="w-full flex items-center justify-between py-2 border-b border-gray-100 text-left hover:bg-gray-50 transition-colors"
            >
              <span class="text-sm font-medium text-gray-700">Maps</span>
              <svg
                class="w-4 h-4 text-accent transition-transform duration-200 {mapsExpanded ? 'rotate-180' : ''}"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {#if mapsExpanded}
            <div class="pl-4 py-2">
              {#if refMaps.length > 0}
                <div class="space-y-2 mb-3 max-h-48 overflow-y-auto">
                  {#each refMaps as map}
                    <div class="flex items-center justify-between text-sm py-2 border-b border-gray-100 last:border-b-0">
                      <span class="font-medium text-foreground truncate flex-1">{map.mapName}</span>
                      <span class="text-gray-500 mx-4">{new Date(map.importedAt).toLocaleDateString()}</span>
                      <span class="text-gray-500 mr-4">{map.pointCount.toLocaleString()} points</span>
                      <button
                        onclick={() => deleteRefMap(map.mapId)}
                        class="p-1 text-gray-400 hover:text-red-600 rounded"
                        title="Delete map"
                      >
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path>
                        </svg>
                      </button>
                    </div>
                  {/each}
                </div>
              {:else}
                <p class="text-sm text-gray-500 py-2">No reference maps imported</p>
              {/if}
              <div class="flex justify-end">
                <button
                  onclick={importRefMap}
                  disabled={importingRefMap}
                  class="text-sm text-accent hover:underline"
                >
                  {importingRefMap ? 'importing...' : 'import map'}
                </button>
              </div>
              {#if refMapMessage}
                <p class="text-sm text-gray-600 mt-2">{refMapMessage}</p>
              {/if}
            </div>
            {/if}
          </div>

          <!-- Maps Repair Sub-Accordion -->
          <div>
            <button
              onclick={() => maintenanceExpanded = !maintenanceExpanded}
              class="w-full flex items-center justify-between py-2 border-b border-gray-100 text-left hover:bg-gray-50 transition-colors"
            >
              <span class="text-sm font-medium text-gray-700">Maps Repair</span>
              <svg
                class="w-4 h-4 text-accent transition-transform duration-200 {maintenanceExpanded ? 'rotate-180' : ''}"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {#if maintenanceExpanded}
            <div class="py-3">
              <div class="flex flex-wrap gap-2">
                <button
                  onclick={() => openLocationPicker('purge')}
                  disabled={purgingProxies || clearingProxies}
                  class="px-3 py-1.5 text-sm bg-accent text-white rounded hover:opacity-90 transition disabled:opacity-50"
                >
                  Purge Cache
                </button>
                <button
                  onclick={() => openLocationPicker('addresses')}
                  disabled={normalizing || backfillingRegions}
                  class="px-3 py-1.5 text-sm bg-accent text-white rounded hover:opacity-90 transition disabled:opacity-50"
                >
                  Fix Addresses
                </button>
                <button
                  onclick={() => openLocationPicker('images')}
                  disabled={regenerating || renderingDng || detectingLivePhotos}
                  class="px-3 py-1.5 text-sm bg-accent text-white rounded hover:opacity-90 transition disabled:opacity-50"
                >
                  Fix Images
                </button>
                <button
                  onclick={() => openLocationPicker('videos')}
                  disabled={fixingVideos || detectingLivePhotos}
                  class="px-3 py-1.5 text-sm bg-accent text-white rounded hover:opacity-90 transition disabled:opacity-50"
                >
                  Fix Videos
                </button>
              </div>
            </div>
            {/if}
          </div>

          <!-- Health Sub-Accordion -->
          <div>
            <button
              onclick={() => healthExpanded = !healthExpanded}
              class="w-full flex items-center justify-between py-2 border-b border-gray-100 text-left hover:bg-gray-50 transition-colors"
            >
              <span class="text-sm font-medium text-gray-700">Health</span>
              <svg
                class="w-4 h-4 text-accent transition-transform duration-200 {healthExpanded ? 'rotate-180' : ''}"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {#if healthExpanded}
            <div class="py-3">
              <HealthMonitoring />
            </div>
            {/if}
          </div>
        </div>
        {/if}
      </div>
    </div>
  {/if}
</div>

<!-- Import Preview Modal -->
{#if showImportPreview && importPreview}
  <div class="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
    <div class="bg-white rounded-lg shadow-xl max-w-lg w-full mx-4 max-h-[80vh] flex flex-col">
      <!-- Header -->
      <div class="p-4 border-b">
        <h2 class="text-lg font-semibold text-foreground">Import Reference Map</h2>
        <p class="text-sm text-gray-500">{importPreview.fileName}</p>
      </div>

      <!-- Content -->
      <div class="p-4 overflow-y-auto flex-1">
        <!-- Summary Stats -->
        <div class="bg-gray-50 rounded-lg p-4 mb-4">
          <div class="grid grid-cols-2 gap-3 text-sm">
            <div>
              <span class="text-gray-500">Total points:</span>
              <span class="font-medium ml-2">{importPreview.totalPoints}</span>
            </div>
            <div>
              <span class="text-gray-500">New points:</span>
              <span class="font-medium ml-2 text-green-600">{importPreview.newPoints}</span>
            </div>
            {#if importPreview.cataloguedCount > 0}
              <div>
                <span class="text-gray-500">Already catalogued:</span>
                <span class="font-medium ml-2 text-amber-600">{importPreview.cataloguedCount}</span>
              </div>
            {/if}
            {#if importPreview.referenceCount > 0}
              <div>
                <span class="text-gray-500">Duplicate refs:</span>
                <span class="font-medium ml-2 text-blue-600">{importPreview.referenceCount}</span>
              </div>
            {/if}
          </div>
        </div>

        <!-- Duplicate Details -->
        {#if importPreview.cataloguedCount > 0 || importPreview.referenceCount > 0}
          <div class="mb-4">
            <h3 class="text-sm font-medium text-foreground mb-2">Duplicate Matches</h3>
            <p class="text-xs text-gray-500 mb-3">
              Points matching existing data (name similarity 85%+ within 500m)
            </p>

            <!-- Catalogued Matches -->
            {#if importPreview.cataloguedMatches.length > 0}
              <div class="mb-3">
                <div class="text-xs font-medium text-amber-600 mb-1">
                  Already in Locations ({importPreview.cataloguedCount})
                </div>
                <div class="space-y-1 max-h-32 overflow-y-auto">
                  {#each importPreview.cataloguedMatches as match}
                    <div class="text-xs bg-amber-50 border border-amber-100 rounded px-2 py-1">
                      <span class="font-medium">{match.newPointName}</span>
                      <span class="text-gray-500"> matches </span>
                      <span class="font-medium">{match.existingName}</span>
                      <span class="text-gray-400 ml-1">
                        ({Math.round(match.nameSimilarity * 100)}%, {match.distanceMeters}m)
                      </span>
                    </div>
                  {/each}
                  {#if importPreview.cataloguedCount > 10}
                    <div class="text-xs text-gray-500 italic">
                      ...and {importPreview.cataloguedCount - 10} more
                    </div>
                  {/if}
                </div>
              </div>
            {/if}

            <!-- Reference Matches -->
            {#if importPreview.referenceMatches.length > 0}
              <div>
                <div class="text-xs font-medium text-blue-600 mb-1">
                  Already in Reference Maps ({importPreview.referenceCount})
                </div>
                <div class="space-y-1 max-h-32 overflow-y-auto">
                  {#each importPreview.referenceMatches as match}
                    <div class="text-xs bg-blue-50 border border-blue-100 rounded px-2 py-1">
                      <span class="font-medium">{match.newPointName}</span>
                      <span class="text-gray-500"> matches </span>
                      <span class="font-medium">{match.existingName}</span>
                      {#if match.mapName}
                        <span class="text-gray-400"> in {match.mapName}</span>
                      {/if}
                      <span class="text-gray-400 ml-1">
                        ({Math.round(match.nameSimilarity * 100)}%, {match.distanceMeters}m)
                      </span>
                    </div>
                  {/each}
                  {#if importPreview.referenceCount > 10}
                    <div class="text-xs text-gray-500 italic">
                      ...and {importPreview.referenceCount - 10} more
                    </div>
                  {/if}
                </div>
              </div>
            {/if}
          </div>

          <!-- Skip Duplicates Option -->
          <div class="border-t border-gray-200 pt-3">
            <label class="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                bind:checked={skipDuplicates}
                class="mt-0.5 h-4 w-4 rounded border-gray-300 text-accent focus:ring-accent"
              />
              <div>
                <span class="text-sm text-foreground">Skip duplicates</span>
                <p class="text-xs text-gray-500 mt-0.5">
                  Only import {importPreview.newPoints} new points, skip {importPreview.cataloguedCount + importPreview.referenceCount} duplicates
                </p>
              </div>
            </label>
          </div>
        {:else}
          <div class="bg-green-50 border border-green-100 rounded-lg p-3 text-sm text-green-700">
            All {importPreview.totalPoints} points are new. No duplicates found.
          </div>
        {/if}
      </div>

      <!-- Footer -->
      <div class="p-4 border-t bg-gray-50 rounded-b-lg flex justify-end gap-3">
        <button
          onclick={cancelImportPreview}
          class="px-4 py-2 bg-gray-100 text-gray-700 rounded hover:bg-gray-200 transition"
        >
          Cancel
        </button>
        <button
          onclick={confirmImport}
          disabled={importingRefMap}
          class="px-4 py-2 bg-accent text-white rounded hover:opacity-90 transition disabled:opacity-50"
        >
          {#if importingRefMap}
            Importing...
          {:else if skipDuplicates && (importPreview.cataloguedCount + importPreview.referenceCount > 0)}
            Import {importPreview.newPoints} Points
          {:else}
            Import All {importPreview.totalPoints} Points
          {/if}
        </button>
      </div>
    </div>
  </div>
{/if}

<!-- Location Picker Modal -->
{#if showLocationPicker && pickerMode}
  <div class="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
    <div class="bg-white rounded-lg shadow-xl max-w-md w-full mx-4">
      <!-- Header -->
      <div class="p-4 border-b flex items-center justify-between">
        <h2 class="text-lg font-semibold text-foreground">{getPickerTitle()}</h2>
        <button
          onclick={closeLocationPicker}
          class="p-1 text-gray-400 hover:text-gray-600 rounded"
        >
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <!-- Content -->
      <div class="p-4">
        <!-- Search Input -->
        <div class="relative">
          <input
            type="text"
            bind:value={pickerSearchQuery}
            oninput={handlePickerSearch}
            placeholder="Search location..."
            class="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-accent"
          />
          {#if pickerSelectedLocation}
            <button
              onclick={clearPickerLocation}
              class="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600"
            >
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          {/if}
        </div>

        <!-- Search Results Dropdown -->
        {#if pickerSearchResults.length > 0 && !pickerSelectedLocation}
          <div class="mt-2 border border-gray-200 rounded-lg max-h-48 overflow-y-auto">
            {#each pickerSearchResults as loc}
              <button
                onclick={() => selectPickerLocation(loc)}
                class="w-full px-3 py-2 text-left hover:bg-gray-50 text-sm flex items-center justify-between border-b border-gray-100 last:border-b-0"
              >
                <span class="font-medium text-foreground truncate">{loc.locnam}</span>
                {#if loc.state}
                  <span class="text-gray-500 ml-2">{loc.state}</span>
                {/if}
              </button>
            {/each}
          </div>
        {/if}

        <!-- Selected Location Display -->
        {#if pickerSelectedLocation}
          <div class="mt-2 bg-accent/10 border border-accent/30 rounded-lg px-3 py-2 flex items-center justify-between">
            <span class="text-sm font-medium text-foreground">{pickerSelectedLocation.locnam}</span>
            {#if pickerSelectedLocation.state}
              <span class="text-sm text-gray-500">{pickerSelectedLocation.state}</span>
            {/if}
          </div>
        {/if}

        <!-- Message -->
        {#if pickerMessage}
          <p class="mt-3 text-sm {pickerMessage.includes('Error') || pickerMessage.includes('failed') ? 'text-red-600' : 'text-green-600'}">
            {pickerMessage}
          </p>
        {/if}
      </div>

      <!-- Footer -->
      <div class="p-4 border-t bg-gray-50 rounded-b-lg flex justify-end">
        <button
          onclick={runPickerAction}
          disabled={pickerLoading}
          class="px-4 py-2 bg-accent text-white rounded hover:opacity-90 transition disabled:opacity-50"
        >
          {pickerLoading ? 'Processing...' : getPickerButtonText()}
        </button>
      </div>
    </div>
  </div>
{/if}

<!-- PIN Verification Modal -->
{#if showPinModal}
  <div class="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
    <div class="bg-white rounded-lg shadow-xl max-w-sm w-full mx-4">
      <!-- Header -->
      <div class="p-4 border-b flex items-center justify-between">
        <h2 class="text-lg font-semibold text-foreground">Enter PIN</h2>
        <button
          onclick={closePinModal}
          class="p-1 text-gray-400 hover:text-gray-600 rounded"
        >
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <!-- Content -->
      <div class="p-4">
        <p class="text-sm text-gray-600 mb-4">
          {#if pinAction === 'archive'}
            Enter your PIN to change the archive location.
          {:else if pinAction === 'deleteOnImport'}
            Enter your PIN to change the delete on import setting.
          {:else if pinAction === 'startupPin'}
            Enter your PIN to change the startup PIN requirement.
          {/if}
        </p>
        <input
          type="password"
          bind:value={pinInput}
          placeholder="Enter 4-6 digit PIN"
          maxlength="6"
          class="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-accent text-center text-xl tracking-widest"
          onkeydown={(e) => e.key === 'Enter' && verifyAndExecutePinAction()}
        />
        {#if pinError}
          <p class="text-sm text-red-600 mt-2">{pinError}</p>
        {/if}
      </div>

      <!-- Footer -->
      <div class="p-4 border-t bg-gray-50 rounded-b-lg flex justify-end gap-2">
        <button
          onclick={closePinModal}
          class="px-4 py-2 bg-gray-100 text-gray-700 rounded hover:bg-gray-200 transition"
        >
          Cancel
        </button>
        <button
          onclick={verifyAndExecutePinAction}
          disabled={pinVerifying || pinInput.length < 4}
          class="px-4 py-2 bg-accent text-white rounded hover:opacity-90 transition disabled:opacity-50"
        >
          {pinVerifying ? 'Verifying...' : 'Confirm'}
        </button>
      </div>
    </div>
  </div>
{/if}

<!-- Delete Warning Modal -->
{#if showDeleteWarning}
  <div class="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
    <div class="bg-white rounded-lg shadow-xl max-w-md w-full mx-4">
      <!-- Header -->
      <div class="p-4 border-b flex items-center gap-3">
        <div class="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center">
          <svg class="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        </div>
        <h2 class="text-lg font-semibold text-foreground">Permanent File Deletion</h2>
      </div>

      <!-- Content -->
      <div class="p-4">
        <p class="text-sm text-gray-700 mb-3">
          Enabling this setting will <strong class="text-red-600">permanently delete original files</strong> after they are imported into the archive.
        </p>
        <div class="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
          <strong>Warning:</strong> There is no way to recover deleted files from this software. Make sure you have backups before enabling this feature.
        </div>
      </div>

      <!-- Footer -->
      <div class="p-4 border-t bg-gray-50 rounded-b-lg flex justify-end gap-2">
        <button
          onclick={cancelDeleteWarning}
          class="px-4 py-2 bg-gray-100 text-gray-700 rounded hover:bg-gray-200 transition"
        >
          Cancel
        </button>
        <button
          onclick={toggleDeleteOnImport}
          class="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 transition"
        >
          Enable Deletion
        </button>
      </div>
    </div>
  </div>
{/if}
