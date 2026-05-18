// MeetRecap Service Worker
const CACHE_NAME = 'meetrecap-v1';
const STATIC_CACHE = 'meetrecap-static-v1';
const DYNAMIC_CACHE = 'meetrecap-dynamic-v1';

// Files to cache on install
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/login.html',
  '/meeting.html',
  '/dashboard.html',
  '/style.css',
  '/login.js',
  '/meeting.js',
  '/dashboard.js',
  '/runtime-config.js',
  '/icon.png',
  '/manifest.json'
];

// Install event - cache static assets
self.addEventListener('install', event => {
  console.log('[ServiceWorker] Installing...');
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then(cache => {
        console.log('[ServiceWorker] Caching static assets');
        return cache.addAll(STATIC_ASSETS);
      })
      .then(() => self.skipWaiting())
      .catch(err => console.error('[ServiceWorker] Install error:', err))
  );
});

// Activate event - clean up old caches
self.addEventListener('activate', event => {
  console.log('[ServiceWorker] Activating...');
  event.waitUntil(
    caches.keys()
      .then(cacheNames => {
        return Promise.all(
          cacheNames
            .filter(cacheName => cacheName !== STATIC_CACHE && cacheName !== DYNAMIC_CACHE)
            .map(cacheName => {
              console.log('[ServiceWorker] Deleting old cache:', cacheName);
              return caches.delete(cacheName);
            })
        );
      })
      .then(() => self.clients.claim())
  );
});

// Fetch event - Network first with cache fallback for API calls, Cache first for static assets
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests
  if (request.method !== 'GET') {
    return;
  }

  // API calls - network first, then cache
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/socket')) {
    event.respondWith(
      fetch(request)
        .then(response => {
          // Clone the response
          const clonedResponse = response.clone();
          
          // Cache successful responses
          if (response.ok) {
            caches.open(DYNAMIC_CACHE).then(cache => {
              cache.put(request, clonedResponse);
            });
          }
          
          return response;
        })
        .catch(() => {
          // Network request failed, try cache
          return caches.match(request)
            .then(cachedResponse => {
              if (cachedResponse) {
                return cachedResponse;
              }
              
              // Return offline page for navigation requests
              if (request.mode === 'navigate') {
                return caches.match('/index.html');
              }
              
              // Return offline response
              return new Response('Offline - Content unavailable', {
                status: 503,
                statusText: 'Service Unavailable'
              });
            });
        })
    );
  } 
  // Static assets - cache first, then network
  else {
    event.respondWith(
      caches.match(request)
        .then(cachedResponse => {
          if (cachedResponse) {
            return cachedResponse;
          }
          
          return fetch(request)
            .then(response => {
              // Don't cache non-successful responses
              if (!response || response.status !== 200 || response.type === 'error') {
                return response;
              }
              
              // Clone the response
              const clonedResponse = response.clone();
              
              // Cache the response
              caches.open(DYNAMIC_CACHE).then(cache => {
                cache.put(request, clonedResponse);
              });
              
              return response;
            })
            .catch(() => {
              // Failed to fetch, return cached version if available
              return caches.match(request)
                .then(cachedResponse => {
                  if (cachedResponse) {
                    return cachedResponse;
                  }
                  // Return a placeholder response
                  return new Response('Offline - Resource unavailable', {
                    status: 503,
                    statusText: 'Service Unavailable'
                  });
                });
            });
        })
    );
  }
});

// Background sync for offline actions (optional)
self.addEventListener('sync', event => {
  console.log('[ServiceWorker] Background sync:', event.tag);
  if (event.tag === 'sync-data') {
    event.waitUntil(syncData());
  }
});

// Periodic background sync (optional)
self.addEventListener('periodicsync', event => {
  console.log('[ServiceWorker] Periodic sync:', event.tag);
  if (event.tag === 'update-data') {
    event.waitUntil(updateData());
  }
});

// Helper functions
async function syncData() {
  try {
    // Implement your sync logic here
    console.log('[ServiceWorker] Syncing data...');
  } catch (error) {
    console.error('[ServiceWorker] Sync error:', error);
  }
}

async function updateData() {
  try {
    // Implement your update logic here
    console.log('[ServiceWorker] Updating data...');
  } catch (error) {
    console.error('[ServiceWorker] Update error:', error);
  }
}

// Push notification handler (optional)
self.addEventListener('push', event => {
  console.log('[ServiceWorker] Push notification received');
  if (event.data) {
    const options = {
      body: event.data.text(),
      icon: '/icon.png',
      badge: '/icon.png',
      tag: 'meetrecap-notification'
    };
    
    event.waitUntil(
      self.registration.showNotification('MeetRecap', options)
    );
  }
});

// Notification click handler (optional)
self.addEventListener('notificationclick', event => {
  console.log('[ServiceWorker] Notification clicked');
  event.notification.close();
  
  event.waitUntil(
    clients.matchAll({ type: 'window' }).then(clientList => {
      // Check if there is already a window/tab open with the target URL
      for (let i = 0; i < clientList.length; i++) {
        const client = clientList[i];
        if (client.url === '/' && 'focus' in client) {
          return client.focus();
        }
      }
      // If not, open a new window/tab with the target URL
      if (clients.openWindow) {
        return clients.openWindow('/');
      }
    })
  );
});
