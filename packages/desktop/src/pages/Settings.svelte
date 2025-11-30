<script lang="ts">
  import { onMount } from 'svelte';
  import DatabaseSettings from '../components/DatabaseSettings.svelte';
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

  onMount(() => {
    loadSettings();
    loadProxyCacheStats();
    loadRefMaps();
  });
</script>

<div class="p-8">
  <div class="mb-8">
    <div class="flex items-baseline justify-between">
      <h1 class="text-3xl font-bold text-foreground mb-2">Settings</h1>
      <span class="text-sm text-gray-400">v0.1.0</span>
    </div>
    <p class="text-gray-600">Configure application preferences</p>
  </div>

  {#if loading}
    <div class="max-w-2xl">
      <p class="text-gray-500">Loading settings...</p>
    </div>
  {:else}
    <div class="max-w-2xl">
      <!-- User Management -->
      <div class="bg-white rounded-lg shadow p-6 mb-6">
        <h2 class="text-lg font-semibold text-foreground mb-4">Users</h2>

        <!-- User List -->
        <div class="space-y-3">
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
                    {#if user.last_login}
                      <p class="text-xs text-gray-400">Last login: {new Date(user.last_login).toLocaleDateString()}</p>
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

          <!-- Security Settings -->
          <div class="border-t border-gray-200 pt-4 mt-4">
            <h3 class="text-sm font-medium text-gray-700 mb-3">Security</h3>
            <label class="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={requireLogin}
                onchange={toggleRequireLogin}
                class="mt-0.5 h-4 w-4 rounded border-gray-300 text-accent focus:ring-accent"
              />
              <div>
                <span class="text-sm text-foreground">Require PIN on startup</span>
                <p class="text-xs text-gray-500 mt-0.5">App will prompt for PIN each time it launches</p>
              </div>
            </label>
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
          {:else}
            <button
              onclick={openAddUser}
              class="w-full py-2 border-2 border-dashed border-gray-300 rounded-lg text-gray-500 hover:border-gray-400 hover:text-gray-600 transition text-sm"
            >
              + Add User
            </button>
          {/if}
        </div>
      </div>

      <div class="bg-white rounded-lg shadow p-6 mb-6">
        <h2 class="text-lg font-semibold mb-3 text-foreground">Archive Folder</h2>
        <div class="mb-4">
          <label for="archivePath" class="block text-sm font-medium text-gray-700 mb-2">
            Location
          </label>
          <div class="flex gap-2">
            <input
              id="archivePath"
              type="text"
              bind:value={archivePath}
              placeholder="/path/to/archive"
              class="flex-1 px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-accent"
            />
            <button
              onclick={selectArchiveFolder}
              class="px-4 py-2 bg-accent text-white rounded hover:opacity-90 transition"
            >
              Browse
            </button>
          </div>
          <p class="text-xs text-gray-500 mt-2">
            Where imported media files will be stored
          </p>
        </div>
      </div>

      <div class="bg-white rounded-lg shadow p-6 mb-6">
        <h2 class="text-lg font-semibold mb-3 text-foreground">Import Options</h2>
        <div class="space-y-3">
          <div class="flex items-center">
            <input
              type="checkbox"
              bind:checked={deleteOriginals}
              id="deleteOriginals"
              class="mr-2"
            />
            <label for="deleteOriginals" class="text-sm text-gray-700">
              Delete original files after import
            </label>
          </div>
          <p class="text-xs text-gray-500 ml-6">
            Original files will be moved to archive folder and deleted from source
          </p>

          <div class="flex items-center">
            <input
              type="checkbox"
              bind:checked={importMap}
              id="importMap"
              class="mr-2"
            />
            <label for="importMap" class="text-sm text-gray-700">
              Show map during import
            </label>
          </div>
          <p class="text-xs text-gray-500 ml-6">
            Display a map to pin location GPS during import
          </p>

          <div class="flex items-center">
            <input
              type="checkbox"
              bind:checked={mapImport}
              id="mapImport"
              class="mr-2"
            />
            <label for="mapImport" class="text-sm text-gray-700">
              Enable map-based import
            </label>
          </div>
          <p class="text-xs text-gray-500 ml-6">
            Allow creating locations directly from the map
          </p>
        </div>
      </div>


      <!-- Media Maintenance Section -->
      <div class="bg-white rounded-lg shadow p-6 mb-6">
        <h2 class="text-lg font-semibold mb-3 text-foreground">Media Maintenance</h2>
        <div class="space-y-3">
          <div>
            <div class="flex flex-wrap items-center gap-3">
              <button
                onclick={fixAllImages}
                disabled={regenerating || renderingDng}
                class="px-4 py-2 bg-accent text-white rounded hover:opacity-90 transition disabled:opacity-50"
              >
                {regenerating || renderingDng ? 'Processing...' : 'Fix Images'}
              </button>
              <button
                onclick={fixAllVideos}
                disabled={fixingVideos}
                class="px-4 py-2 bg-accent text-white rounded hover:opacity-90 transition disabled:opacity-50"
              >
                {fixingVideos ? 'Processing...' : 'Fix Videos'}
              </button>
              {#if regenMessage}
                <span class="text-sm text-gray-600">{regenMessage}</span>
              {/if}
              {#if dngMessage}
                <span class="text-sm text-gray-600">{dngMessage}</span>
              {/if}
              {#if videoFixMessage}
                <span class="text-sm text-gray-600">{videoFixMessage}</span>
              {/if}
            </div>
            <p class="text-xs text-gray-500 mt-2">
              Repairs thumbnails, rotations, and previews for all media files.
            </p>
          </div>

          <!-- Kanye9: Address Normalization -->
          <div class="mt-6 pt-6 border-t border-gray-200">
            <p class="text-sm text-gray-700 mb-2">
              Normalize all addresses using AddressService. This populates address_raw, address_normalized, and address_parsed_json fields for existing locations.
            </p>
            <div class="flex items-center gap-4">
              <button
                onclick={normalizeAllAddresses}
                disabled={normalizing}
                class="px-4 py-2 bg-accent text-white rounded hover:opacity-90 transition disabled:opacity-50"
              >
                {normalizing ? 'Normalizing...' : 'Normalize All Addresses'}
              </button>
              {#if normalizeMessage}
                <span class="text-sm text-gray-600">{normalizeMessage}</span>
              {/if}
            </div>
            <p class="text-xs text-gray-500 mt-2">
              Cleans city names (removes "Village Of", "City Of"), standardizes state codes, and stores both raw and normalized forms.
            </p>
          </div>

          <!-- DECISION-012: Region Backfill -->
          <div class="mt-6 pt-6 border-t border-gray-200">
            <p class="text-sm text-gray-700 mb-2">
              Populate region fields for existing locations. Calculates Census region, division, state direction, and cultural region based on address and GPS data.
            </p>
            <div class="flex items-center gap-4">
              <button
                onclick={backfillRegions}
                disabled={backfillingRegions}
                class="px-4 py-2 bg-accent text-white rounded hover:opacity-90 transition disabled:opacity-50"
              >
                {backfillingRegions ? 'Processing...' : 'Backfill Region Data'}
              </button>
              {#if backfillMessage}
                <span class="text-sm text-gray-600">{backfillMessage}</span>
              {/if}
            </div>
            <p class="text-xs text-gray-500 mt-2">
              Adds Census Region (Northeast/Midwest/South/West), Division, state direction (e.g., "Eastern NY"), and Cultural Region fields.
            </p>
          </div>

          <!-- Migration 23: Live Photo Detection -->
          <div class="mt-6 pt-6 border-t border-gray-200">
            <p class="text-sm text-gray-700 mb-2">
              Detect and auto-hide Live Photo companion videos and SDR duplicate images across all locations.
            </p>
            <div class="flex items-center gap-4">
              <button
                onclick={detectAllLivePhotos}
                disabled={detectingLivePhotos}
                class="px-4 py-2 bg-accent text-white rounded hover:opacity-90 transition disabled:opacity-50"
              >
                {detectingLivePhotos ? 'Scanning...' : 'Detect Live Photos'}
              </button>
              {#if livePhotoMessage}
                <span class="text-sm text-gray-600">{livePhotoMessage}</span>
              {/if}
            </div>
            <p class="text-xs text-gray-500 mt-2">
              iPhone Live Photo videos (.MOV paired with images) and SDR duplicates (_SDR suffix files) will be hidden from the gallery but remain accessible via "Show All".
            </p>
          </div>

          <!-- Migration 36: Video Proxy Cache -->
          <div class="mt-6 pt-6 border-t border-gray-200">
            <h3 class="text-sm font-semibold text-foreground mb-2">Video Preview Cache</h3>
            <p class="text-sm text-gray-700 mb-3">
              Optimized H.264 proxy videos are generated for smooth playback with instant scrubbing. Old proxies are automatically purged after 30 days.
            </p>

            <!-- Cache Stats -->
            {#if proxyCacheStats}
              <div class="bg-gray-50 rounded-lg p-4 mb-3">
                <div class="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span class="text-gray-500">Cached videos:</span>
                    <span class="font-medium ml-2">{proxyCacheStats.totalCount}</span>
                  </div>
                  <div>
                    <span class="text-gray-500">Cache size:</span>
                    <span class="font-medium ml-2">{proxyCacheStats.totalSizeMB} MB</span>
                  </div>
                </div>
              </div>
            {:else}
              <div class="bg-gray-50 rounded-lg p-4 mb-3 text-sm text-gray-500">
                Loading cache stats...
              </div>
            {/if}

            <div class="flex items-center gap-3">
              <button
                onclick={purgeOldProxies}
                disabled={purgingProxies || clearingProxies}
                class="px-4 py-2 bg-gray-600 text-white rounded hover:opacity-90 transition disabled:opacity-50"
              >
                {purgingProxies ? 'Purging...' : 'Purge Old (30+ days)'}
              </button>
              <button
                onclick={clearAllProxies}
                disabled={purgingProxies || clearingProxies}
                class="px-4 py-2 bg-red-600 text-white rounded hover:opacity-90 transition disabled:opacity-50"
              >
                {clearingProxies ? 'Clearing...' : 'Clear All'}
              </button>
              {#if proxyMessage}
                <span class="text-sm text-gray-600">{proxyMessage}</span>
              {/if}
            </div>
            <p class="text-xs text-gray-500 mt-2">
              Proxies are regenerated automatically when you view a video. "Purge Old" removes proxies for locations not viewed in 30+ days. "Clear All" removes everything.
            </p>
          </div>
        </div>
      </div>

      <!-- P6: Darktable section removed per v010steps.md -->

      <!-- Reference Maps -->
      <div class="bg-white rounded-lg shadow p-6 mb-6">
        <h2 class="text-lg font-semibold mb-3 text-foreground">Reference Maps</h2>
        <p class="text-sm text-gray-600 mb-4">
          Import map files to display as reference points on the Atlas. Supports KML, KMZ, GPX, GeoJSON, and CSV files.
        </p>

        <!-- Stats -->
        {#if refMapStats}
          <div class="bg-gray-50 rounded-lg p-4 mb-4">
            <div class="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span class="text-gray-500">Imported maps:</span>
                <span class="font-medium ml-2">{refMapStats.mapCount}</span>
              </div>
              <div>
                <span class="text-gray-500">Total points:</span>
                <span class="font-medium ml-2">{refMapStats.pointCount.toLocaleString()}</span>
              </div>
            </div>
          </div>
        {/if}

        <!-- Map List -->
        {#if refMaps.length > 0}
          <div class="space-y-2 mb-4 max-h-64 overflow-y-auto">
            {#each refMaps as map}
              <div class="flex items-center justify-between border border-gray-200 rounded-lg p-3">
                <div class="flex-1 min-w-0">
                  <div class="flex items-center gap-2">
                    <span class="font-medium text-foreground truncate">{map.mapName}</span>
                    <span class="text-xs bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded uppercase">{map.fileType}</span>
                  </div>
                  <p class="text-xs text-gray-500 mt-0.5">
                    {map.pointCount} points - {new Date(map.importedAt).toLocaleDateString()}
                  </p>
                </div>
                <button
                  onclick={() => deleteRefMap(map.mapId)}
                  class="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded"
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
          <div class="text-center text-gray-500 py-6 bg-gray-50 rounded-lg mb-4">
            <p class="text-sm">No reference maps imported yet</p>
          </div>
        {/if}

        <div class="flex items-center gap-3 flex-wrap">
          <button
            onclick={importRefMap}
            disabled={importingRefMap}
            class="px-4 py-2 bg-accent text-white rounded hover:opacity-90 transition disabled:opacity-50"
          >
            {importingRefMap ? 'Importing...' : 'Import Map File'}
          </button>
          {#if cataloguedCount > 0}
            <button
              onclick={purgeCataloguedPoints}
              disabled={purgingPoints}
              class="px-4 py-2 bg-gray-600 text-white rounded hover:opacity-90 transition disabled:opacity-50"
              title="Remove reference points that are already in your locations database"
            >
              {purgingPoints ? 'Purging...' : `Purge ${cataloguedCount} Catalogued`}
            </button>
          {/if}
          {#if refMapMessage}
            <span class="text-sm text-gray-600">{refMapMessage}</span>
          {/if}
          {#if purgeMessage}
            <span class="text-sm text-gray-600">{purgeMessage}</span>
          {/if}
        </div>
        <p class="text-xs text-gray-500 mt-2">
          Imported points appear as a separate "Reference Maps" layer on the Atlas. Points already in your database are automatically hidden.
        </p>
      </div>

      <DatabaseSettings />

      <HealthMonitoring />

      <button
        onclick={saveSettings}
        disabled={saving}
        class="px-6 py-2 bg-accent text-white rounded hover:opacity-90 transition disabled:opacity-50"
      >
        {saving ? 'Saving...' : 'Save Settings'}
      </button>
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
