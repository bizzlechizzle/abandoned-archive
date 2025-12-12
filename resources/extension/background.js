/**
 * background.js
 *
 * Extension service worker for AU Archive Clipper
 * Handles:
 * - Side panel opening and context menu for quick bookmarking
 * - Browser command handling for zero-detection Research Browser
 * - Tab event reporting to main application
 *
 * Communication Protocol:
 * - Connects to WebSocket server on ws://localhost:47124
 * - Registers as 'extension:register' to enable browser commands
 * - Receives 'browser:command' messages and executes them
 * - Sends 'browser:response' with results
 * - Reports 'browser:event' for tab changes, navigation, etc.
 */

const API_BASE = 'http://localhost:47123';
const WS_URL = 'ws://localhost:47124';

// Menu item IDs
const MENU_PARENT = 'au-archive-menu';
const MENU_SEPARATOR = 'menu-separator';
const MENU_CHOOSE = 'choose-location';
const MENU_LOC_PREFIX = 'location-';

// Cache for recent locations
let recentLocations = [];

// WebSocket connection for browser commands
let commandSocket = null;
let commandSocketReconnectTimeout = null;
const HEARTBEAT_INTERVAL = 5000; // 5 seconds
let heartbeatInterval = null;

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
  // Connect to command WebSocket for browser control
  connectCommandSocket();
})();

// ============================================================================
// Browser Command WebSocket - Zero-Detection Research Browser Support
// ============================================================================

/**
 * Connect to the AU Archive WebSocket server for browser commands
 */
function connectCommandSocket() {
  if (commandSocket && commandSocket.readyState === WebSocket.OPEN) {
    return;
  }

  try {
    commandSocket = new WebSocket(WS_URL);

    commandSocket.onopen = () => {
      console.log('[AU Archive] Command WebSocket connected');

      // Register as browser extension for commands
      commandSocket.send(JSON.stringify({ type: 'extension:register' }));

      // Start heartbeat
      startHeartbeat();

      // Clear any pending reconnect
      if (commandSocketReconnectTimeout) {
        clearTimeout(commandSocketReconnectTimeout);
        commandSocketReconnectTimeout = null;
      }

      // Report extension ready
      sendBrowserEvent({ name: 'extensionReady' });
    };

    commandSocket.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        handleCommandMessage(message);
      } catch (err) {
        console.error('[AU Archive] Invalid command message:', err);
      }
    };

    commandSocket.onclose = () => {
      console.log('[AU Archive] Command WebSocket disconnected');
      stopHeartbeat();
      scheduleCommandReconnect();
    };

    commandSocket.onerror = (err) => {
      console.error('[AU Archive] Command WebSocket error:', err);
    };
  } catch (err) {
    console.error('[AU Archive] Command WebSocket connection failed:', err);
    scheduleCommandReconnect();
  }
}

/**
 * Schedule WebSocket reconnection
 */
function scheduleCommandReconnect() {
  if (commandSocketReconnectTimeout) return;

  commandSocketReconnectTimeout = setTimeout(() => {
    commandSocketReconnectTimeout = null;
    connectCommandSocket();
  }, 5000);
}

/**
 * Start heartbeat to keep connection alive
 */
function startHeartbeat() {
  stopHeartbeat();
  heartbeatInterval = setInterval(() => {
    if (commandSocket && commandSocket.readyState === WebSocket.OPEN) {
      commandSocket.send(JSON.stringify({ type: 'extension:heartbeat' }));
    }
  }, HEARTBEAT_INTERVAL);
}

/**
 * Stop heartbeat
 */
function stopHeartbeat() {
  if (heartbeatInterval) {
    clearInterval(heartbeatInterval);
    heartbeatInterval = null;
  }
}

/**
 * Handle incoming command messages from main app
 */
function handleCommandMessage(message) {
  if (message.type === 'browser:command') {
    executeBrowserCommand(message.requestId, message.command);
  } else if (message.type === 'heartbeat:ack') {
    // Heartbeat acknowledged
  }
}

/**
 * Execute a browser command and send response
 */
async function executeBrowserCommand(requestId, command) {
  let response = { type: 'browser:response', requestId, success: false };

  try {
    switch (command.action) {
      case 'navigate':
        response = await handleNavigateCommand(requestId, command.url);
        break;

      case 'newTab':
        response = await handleNewTabCommand(requestId, command.url);
        break;

      case 'closeTab':
        response = await handleCloseTabCommand(requestId, command.tabId);
        break;

      case 'screenshot':
        response = await handleScreenshotCommand(requestId);
        break;

      case 'getActiveTab':
        response = await handleGetActiveTabCommand(requestId);
        break;

      case 'getTabs':
        response = await handleGetTabsCommand(requestId);
        break;

      case 'focusTab':
        response = await handleFocusTabCommand(requestId, command.tabId);
        break;

      case 'ping':
        response = { type: 'browser:response', requestId, success: true, data: 'pong' };
        break;

      default:
        response = {
          type: 'browser:response',
          requestId,
          success: false,
          error: `Unknown command: ${command.action}`,
        };
    }
  } catch (error) {
    response = {
      type: 'browser:response',
      requestId,
      success: false,
      error: error.message || String(error),
    };
  }

  // Send response
  if (commandSocket && commandSocket.readyState === WebSocket.OPEN) {
    commandSocket.send(JSON.stringify(response));
  }
}

/**
 * Send a browser event to the main app
 */
function sendBrowserEvent(event) {
  if (commandSocket && commandSocket.readyState === WebSocket.OPEN) {
    commandSocket.send(JSON.stringify({
      type: 'browser:event',
      event,
    }));
  }
}

// ============================================================================
// Command Handlers
// ============================================================================

/**
 * Navigate active tab to URL
 */
async function handleNavigateCommand(requestId, url) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) {
    return { type: 'browser:response', requestId, success: false, error: 'No active tab' };
  }

  await chrome.tabs.update(tab.id, { url });
  return { type: 'browser:response', requestId, success: true, data: { tabId: tab.id } };
}

/**
 * Open new tab with optional URL
 */
async function handleNewTabCommand(requestId, url) {
  const tab = await chrome.tabs.create({ url: url || 'about:blank' });
  return { type: 'browser:response', requestId, success: true, data: { tabId: tab.id } };
}

/**
 * Close a specific tab or active tab
 */
async function handleCloseTabCommand(requestId, tabId) {
  if (tabId) {
    await chrome.tabs.remove(tabId);
  } else {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab) {
      await chrome.tabs.remove(tab.id);
    }
  }
  return { type: 'browser:response', requestId, success: true };
}

/**
 * Capture screenshot of active tab
 */
async function handleScreenshotCommand(requestId) {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !tab.windowId) {
      return { type: 'browser:response', requestId, success: false, error: 'No active tab' };
    }

    const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, {
      format: 'jpeg',
      quality: 80,
    });

    return { type: 'browser:response', requestId, success: true, data: dataUrl };
  } catch (error) {
    return { type: 'browser:response', requestId, success: false, error: error.message };
  }
}

/**
 * Get information about the active tab
 */
async function handleGetActiveTabCommand(requestId) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) {
    return { type: 'browser:response', requestId, success: false, error: 'No active tab' };
  }

  return {
    type: 'browser:response',
    requestId,
    success: true,
    data: {
      tabId: tab.id,
      url: tab.url || '',
      title: tab.title || '',
    },
  };
}

/**
 * Get all open tabs
 */
async function handleGetTabsCommand(requestId) {
  const tabs = await chrome.tabs.query({});
  const tabData = tabs.map((tab) => ({
    id: tab.id,
    url: tab.url || '',
    title: tab.title || '',
    active: tab.active,
    windowId: tab.windowId,
  }));

  return { type: 'browser:response', requestId, success: true, data: tabData };
}

/**
 * Focus a specific tab
 */
async function handleFocusTabCommand(requestId, tabId) {
  const tab = await chrome.tabs.get(tabId);
  if (!tab) {
    return { type: 'browser:response', requestId, success: false, error: 'Tab not found' };
  }

  // Focus the window first
  await chrome.windows.update(tab.windowId, { focused: true });
  // Then activate the tab
  await chrome.tabs.update(tabId, { active: true });

  return { type: 'browser:response', requestId, success: true };
}

// ============================================================================
// Tab Event Listeners - Report browser state changes to main app
// ============================================================================

/**
 * Report when a tab becomes active
 */
chrome.tabs.onActivated.addListener(async (activeInfo) => {
  try {
    const tab = await chrome.tabs.get(activeInfo.tabId);
    sendBrowserEvent({
      name: 'tabActivated',
      tabId: tab.id,
      url: tab.url || '',
      title: tab.title || '',
    });
  } catch (error) {
    console.log('[AU Archive] Error getting activated tab:', error.message);
  }
});

/**
 * Report when a tab is updated (URL change, title change, etc.)
 */
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  // Only report when page finishes loading or URL changes
  if (changeInfo.status === 'complete' || changeInfo.url) {
    sendBrowserEvent({
      name: 'tabUpdated',
      tabId,
      url: tab.url || '',
      title: tab.title || '',
    });
  }
});

/**
 * Report when a tab is closed
 */
chrome.tabs.onRemoved.addListener((tabId) => {
  sendBrowserEvent({
    name: 'tabClosed',
    tabId,
  });
});
