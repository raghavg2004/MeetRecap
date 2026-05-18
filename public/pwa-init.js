/**
 * PWA Initialization Script
 * Handles service worker registration and PWA setup
 */

(function() {
  'use strict';

  // Check if service workers are supported
  if (!('serviceWorker' in navigator)) {
    console.log('[PWA] Service Workers not supported');
    return;
  }

  // Register service worker on page load
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/service-worker.js')
      .then(registration => {
        console.log('[PWA] Service Worker registered successfully', registration);
        
        // Check for updates periodically
        setInterval(() => {
          registration.update();
        }, 60000); // Check every minute
      })
      .catch(error => {
        console.error('[PWA] Service Worker registration failed:', error);
      });
  });

  // Handle service worker updates
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    console.log('[PWA] Service Worker controller changed');
  });

  // Listen for messages from service worker
  navigator.serviceWorker.addEventListener('message', event => {
    console.log('[PWA] Message from Service Worker:', event.data);
    
    // Example: Handle offline/online status
    if (event.data.type === 'OFFLINE') {
      showOfflineNotification();
    } else if (event.data.type === 'ONLINE') {
      showOnlineNotification();
    }
  });

  // Track online/offline status
  window.addEventListener('online', () => {
    console.log('[PWA] App is online');
    if (navigator.serviceWorker.controller) {
      navigator.serviceWorker.controller.postMessage({ type: 'ONLINE' });
    }
  });

  window.addEventListener('offline', () => {
    console.log('[PWA] App is offline');
    if (navigator.serviceWorker.controller) {
      navigator.serviceWorker.controller.postMessage({ type: 'OFFLINE' });
    }
  });

  // Handle beforeinstallprompt event for PWA install prompt
  let deferredPrompt;

  window.addEventListener('beforeinstallprompt', event => {
    console.log('[PWA] Install prompt triggered');
    // Prevent the mini-infobar from appearing
    event.preventDefault();
    // Stash the event for later use
    deferredPrompt = event;
    
    // Show PWA install button
    showInstallPrompt();
  });

  window.addEventListener('appinstalled', () => {
    console.log('[PWA] PWA installed successfully');
    deferredPrompt = null;
    hideInstallPrompt();
  });

  // Function to show install prompt
  window.showPWAInstallPrompt = async function() {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      console.log(`[PWA] User response to install prompt: ${outcome}`);
      deferredPrompt = null;
    }
  };

  // Function to check if app can be installed
  window.canInstallPWA = function() {
    return !!deferredPrompt;
  };

  // Notification helpers
  function showOfflineNotification() {
    const notification = document.getElementById('offline-notification');
    if (notification) {
      notification.style.display = 'flex';
    }
  }

  function showOnlineNotification() {
    const notification = document.getElementById('offline-notification');
    if (notification) {
      notification.style.display = 'none';
    }
  }

  function showInstallPrompt() {
    const installBtn = document.getElementById('pwa-install-btn');
    if (installBtn) {
      installBtn.style.display = 'flex';
    }
  }

  function hideInstallPrompt() {
    const installBtn = document.getElementById('pwa-install-btn');
    if (installBtn) {
      installBtn.style.display = 'none';
    }
  }

  // Request notification permission
  window.requestNotificationPermission = async function() {
    if (!('Notification' in window)) {
      console.log('[PWA] Notifications not supported');
      return false;
    }

    if (Notification.permission === 'granted') {
      return true;
    }

    if (Notification.permission !== 'denied') {
      const permission = await Notification.requestPermission();
      return permission === 'granted';
    }

    return false;
  };

  // Send notification
  window.sendNotification = async function(title, options = {}) {
    if (Notification.permission === 'granted' && navigator.serviceWorker.controller) {
      navigator.serviceWorker.controller.postMessage({
        type: 'SHOW_NOTIFICATION',
        title: title,
        options: options
      });
    }
  };

  console.log('[PWA] PWA initialization complete');
})();
