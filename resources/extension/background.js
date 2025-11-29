/**
 * background.js
 *
 * Extension service worker for AU Archive Clipper
 * Handles side panel opening and context menu for quick bookmarking
 */

const API_BASE = 'http://localhost:47123';

// Menu item IDs
const MENU_PARENT = 'au-archive-menu';
const MENU_SEPARATOR = 'menu-separator';
const MENU_CHOOSE = 'choose-location';
const MENU_LOC_PREFIX = 'location-';

// Cache for recent locations
let recentLocations = [];

/**
 * Set side panel to open on action click
 */
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true })
  .catch((error) => console.error('[AU Archive] Failed to set panel behavior:', error));

/**
 * Fetch recent locations from the API
 */
async function fetchRecentLocations() {
  try {
    const res = await fetch(`${API_BASE}/api/recent-locations?limit=5`, {
      signal: AbortSignal.timeout(3000)
    });
    if (res.ok) {
      const data = await res.json();
      recentLocations = data.locations || [];
      return true;
    }
  } catch (error) {
    console.log('[AU Archive] App not running, context menu will show basic options');
  }
  recentLocations = [];
  return false;
}

/**
 * Build the context menu with current recent locations
 */
async function buildContextMenu() {
  // Remove all existing menu items first
  await chrome.contextMenus.removeAll();

  // Create parent menu
  chrome.contextMenus.create({
    id: MENU_PARENT,
    title: 'Save to AU Archive',
    contexts: ['page', 'link'],
  });

  // Only add location options if we have any
  if (recentLocations.length > 0) {
    // Recent locations
    for (let i = 0; i < recentLocations.length; i++) {
      const loc = recentLocations[i];
      const stateStr = loc.address_state ? ` (${loc.address_state})` : '';
      chrome.contextMenus.create({
        id: `${MENU_LOC_PREFIX}${loc.locid}`,
        parentId: MENU_PARENT,
        title: `${loc.locnam}${stateStr}`,
        contexts: ['page', 'link'],
      });
    }

    // Separator before "Choose Location"
    chrome.contextMenus.create({
      id: `${MENU_SEPARATOR}-2`,
      parentId: MENU_PARENT,
      type: 'separator',
      contexts: ['page', 'link'],
    });
  }

  // Open Panel (for full search)
  chrome.contextMenus.create({
    id: MENU_CHOOSE,
    parentId: MENU_PARENT,
    title: 'Open Panel...',
    contexts: ['page', 'link'],
  });
}

/**
 * Capture a screenshot of the current tab
 * Returns base64 data URL or null if capture fails
 */
async function captureScreenshot(tabId) {
  try {
    const tab = await chrome.tabs.get(tabId);
    if (!tab.windowId) return null;

    const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, {
      format: 'jpeg',
      quality: 80,
    });

    return dataUrl;
  } catch (error) {
    console.log('[AU Archive] Screenshot capture failed:', error.message);
    return null;
  }
}

/**
 * Save a bookmark via the API
 */
async function saveBookmark(url, title, locid = null, tabId = null) {
  try {
    // Try to capture a screenshot if we have a tab ID
    let thumbnail = null;
    if (tabId) {
      thumbnail = await captureScreenshot(tabId);
    }

    const res = await fetch(`${API_BASE}/api/bookmark`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, title, locid, thumbnail }),
    });

    const data = await res.json();
    return data.success;
  } catch (error) {
    console.error('[AU Archive] Failed to save bookmark:', error);
    return false;
  }
}

/**
 * Show success badge on the extension icon
 */
function showSuccessBadge(tabId) {
  if (!tabId) return;

  chrome.action.setBadgeText({ text: '✓', tabId });
  chrome.action.setBadgeBackgroundColor({ color: '#4CAF50' });

  setTimeout(() => {
    chrome.action.setBadgeText({ text: '', tabId });
  }, 2000);
}

/**
 * Show error badge on the extension icon
 */
function showErrorBadge(tabId) {
  if (!tabId) return;

  chrome.action.setBadgeText({ text: '!', tabId });
  chrome.action.setBadgeBackgroundColor({ color: '#f44336' });

  setTimeout(() => {
    chrome.action.setBadgeText({ text: '', tabId });
  }, 2000);
}

/**
 * Handle context menu clicks
 */
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  const menuItemId = info.menuItemId;
  const url = info.linkUrl || info.pageUrl;
  const title = tab?.title || url;
  const tabId = tab?.id || null;

  // Open Panel - open the side panel
  if (menuItemId === MENU_CHOOSE) {
    if (tabId) {
      chrome.sidePanel.open({ tabId });
    }
    return;
  }

  // Location-specific save
  if (typeof menuItemId === 'string' && menuItemId.startsWith(MENU_LOC_PREFIX)) {
    const locid = menuItemId.replace(MENU_LOC_PREFIX, '');
    const success = await saveBookmark(url, title, locid, tabId);
    if (success) {
      showSuccessBadge(tabId);
      // Refresh menu - this location should now be at the top
      await fetchRecentLocations();
      await buildContextMenu();
    } else {
      showErrorBadge(tabId);
    }
    return;
  }
});

/**
 * Initialize extension on install/update
 */
chrome.runtime.onInstalled.addListener(async () => {
  console.log('[AU Archive] Extension installed/updated');
  await fetchRecentLocations();
  await buildContextMenu();
});

/**
 * Refresh menu when service worker starts (e.g., browser restart)
 */
chrome.runtime.onStartup.addListener(async () => {
  console.log('[AU Archive] Extension starting up');
  await fetchRecentLocations();
  await buildContextMenu();
});

// Initial setup when service worker loads
(async () => {
  await fetchRecentLocations();
  await buildContextMenu();
})();
