/**
 * PWA Install Button Implementation Guide
 * Add this to your dashboard or meeting page for a visible install button
 */

// ============================================
// HTML MARKUP (add to your dashboard.html or meeting.html)
// ============================================
/*
<!-- Add this to your navbar or header section -->
<div id="pwa-install-btn" class="pwa-install-container hidden">
  <button id="pwaInstallBtn" class="btn btn-brand" aria-label="Install MeetRecap app">
    <i class="bi bi-download"></i>
    <span>Install App</span>
  </button>
  <button id="pwaInstallDismiss" class="btn btn-ghost" aria-label="Dismiss install prompt">
    <i class="bi bi-x"></i>
  </button>
</div>

<!-- Offline notification bar -->
<div id="offline-notification" class="offline-notification" style="display: none;">
  <i class="bi bi-wifi-off"></i>
  <span>You are currently offline. Some features may be limited.</span>
</div>
*/

// ============================================
// CSS STYLING (add to your style.css)
// ============================================
/*
.pwa-install-container {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  border-radius: 8px;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
  animation: slideIn 0.3s ease-out;
}

.pwa-install-container.hidden {
  display: none;
}

.offline-notification {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  background-color: #ff9800;
  color: white;
  border-radius: 8px;
  margin: 12px;
  animation: slideDown 0.3s ease-out;
}

@keyframes slideIn {
  from {
    opacity: 0;
    transform: translateX(-20px);
  }
  to {
    opacity: 1;
    transform: translateX(0);
  }
}

@keyframes slideDown {
  from {
    opacity: 0;
    transform: translateY(-10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
*/

// ============================================
// JAVASCRIPT IMPLEMENTATION (add to your dashboard.js or meeting.js)
// ============================================

/**
 * Initialize PWA Install UI
 * Call this function on page load
 */
function initPWAUI() {
  const installBtn = document.getElementById('pwaInstallBtn');
  const dismissBtn = document.getElementById('pwaInstallDismiss');
  const installContainer = document.getElementById('pwa-install-btn');

  // Handle install button click
  if (installBtn) {
    installBtn.addEventListener('click', async () => {
      await window.showPWAInstallPrompt?.();
      // After installation, hide the button
      if (installContainer) {
        installContainer.classList.add('hidden');
      }
    });
  }

  // Handle dismiss button click
  if (dismissBtn) {
    dismissBtn.addEventListener('click', () => {
      if (installContainer) {
        installContainer.classList.add('hidden');
      }
      // Store in localStorage to not show again today
      localStorage.setItem('pwa-install-dismissed', Date.now().toString());
    });
  }

  // Show install button if PWA is installable
  checkPWAInstallability();
}

/**
 * Check if PWA can be installed and show button
 */
function checkPWAInstallability() {
  const installContainer = document.getElementById('pwa-install-btn');
  
  if (!installContainer) return;

  // Check if already dismissed today
  const lastDismissed = localStorage.getItem('pwa-install-dismissed');
  if (lastDismissed) {
    const dayAgo = Date.now() - (24 * 60 * 60 * 1000);
    if (parseInt(lastDismissed) > dayAgo) {
      return; // Don't show if dismissed within last 24 hours
    }
  }

  // Check if PWA is installable
  if (window.canInstallPWA?.()) {
    installContainer.classList.remove('hidden');
  } else {
    installContainer.classList.add('hidden');
  }
}

/**
 * Monitor online/offline status
 */
function initOfflineMonitor() {
  const offlineNotif = document.getElementById('offline-notification');
  
  if (!offlineNotif) return;

  window.addEventListener('online', () => {
    offlineNotif.style.display = 'none';
    console.log('App is online');
  });

  window.addEventListener('offline', () => {
    offlineNotif.style.display = 'flex';
    console.log('App is offline');
  });

  // Check initial status
  if (!navigator.onLine) {
    offlineNotif.style.display = 'flex';
  }
}

/**
 * Request notification permission and show sample notification
 */
async function initNotifications() {
  const hasPermission = await window.requestNotificationPermission?.();
  
  if (hasPermission) {
    console.log('Notification permission granted');
    // You can now send notifications
  }
}

/**
 * Set up notification listeners
 */
function setupNotificationListeners() {
  // Listen for messages from service worker
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.addEventListener('message', (event) => {
      console.log('[PWA] Message received:', event.data);
      
      if (event.data.type === 'NOTIFICATION_CLICKED') {
        // Handle notification click
        window.location.href = '/dashboard';
      }
    });
  }
}

// ============================================
// INITIALIZATION CODE (add to your page load handler)
// ============================================

/*
// In your dashboard.js or meeting.js, add this to your page load handler:

document.addEventListener('DOMContentLoaded', () => {
  // ... your existing code ...
  
  // Initialize PWA features
  initPWAUI();
  initOfflineMonitor();
  initNotifications();
  setupNotificationListeners();
});
*/

// ============================================
// USAGE EXAMPLES
// ============================================

/**
 * Example 1: Send notification from your app
 */
function notifyMeetingStarting(meetingName) {
  window.sendNotification?.('Meeting Starting', {
    body: `${meetingName} is starting now`,
    icon: '/icon.png',
    badge: '/icon.png',
    tag: 'meeting-notification'
  });
}

/**
 * Example 2: Check if device is online
 */
function isDeviceOnline() {
  return navigator.onLine;
}

/**
 * Example 3: Get cache storage info
 */
async function getCacheStorageInfo() {
  if ('storage' in navigator && 'estimate' in navigator.storage) {
    const estimate = await navigator.storage.estimate();
    const percentUsed = (estimate.usage / estimate.quota) * 100;
    
    console.log(`Cache usage: ${(estimate.usage / 1024 / 1024).toFixed(2)} MB`);
    console.log(`Cache quota: ${(estimate.quota / 1024 / 1024).toFixed(2)} MB`);
    console.log(`Percentage used: ${percentUsed.toFixed(2)}%`);
    
    return estimate;
  }
}

/**
 * Example 4: Clear all caches (for debugging)
 */
async function clearAllCaches() {
  if ('caches' in window) {
    const cacheNames = await caches.keys();
    await Promise.all(
      cacheNames.map(cacheName => caches.delete(cacheName))
    );
    console.log('All caches cleared');
  }
}

/**
 * Example 5: Update service worker
 */
async function updateServiceWorker() {
  if ('serviceWorker' in navigator) {
    const registration = await navigator.serviceWorker.getRegistration();
    if (registration) {
      await registration.update();
      console.log('Service Worker update checked');
    }
  }
}

// ============================================
// ADVANCED: Handle Service Worker Messages
// ============================================

/**
 * Send message to service worker
 */
function sendMessageToServiceWorker(message) {
  if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
    navigator.serviceWorker.controller.postMessage(message);
  }
}

/**
 * Example: Request data sync from service worker
 */
function requestDataSync() {
  sendMessageToServiceWorker({
    type: 'SYNC_DATA',
    data: {
      endpoint: '/api/sync',
      method: 'POST'
    }
  });
}

// ============================================
// EXPORT FOR USE IN OTHER FILES
// ============================================

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    initPWAUI,
    checkPWAInstallability,
    initOfflineMonitor,
    initNotifications,
    setupNotificationListeners,
    notifyMeetingStarting,
    isDeviceOnline,
    getCacheStorageInfo,
    clearAllCaches,
    updateServiceWorker,
    sendMessageToServiceWorker,
    requestDataSync
  };
}
