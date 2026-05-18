# PWA (Progressive Web App) Setup Guide

## Overview
Your MeetRecap project has been enhanced with full Progressive Web App (PWA) support. This allows users to:
- **Install the app** on their devices (mobile, desktop, tablet)
- **Use offline** with cached content
- **Receive notifications** from the app
- **Fast performance** with optimized caching strategies
- **App-like experience** with standalone display mode

---

## What's Been Added

### 1. **Manifest File** (`public/manifest.json`)
- Defines app metadata (name, icon, colors, display mode, etc.)
- Enables installation on mobile home screens and desktop
- Includes shortcuts for quick actions
- Specifies app categories and screenshots

### 2. **Service Worker** (`public/service-worker.js`)
- Handles offline functionality
- Implements caching strategies:
  - **Static assets**: Cache-first strategy (CSS, JS, images)
  - **API calls**: Network-first strategy (with fallback to cache)
- Supports push notifications
- Enables background sync

### 3. **PWA Initialization Script** (`public/pwa-init.js`)
- Registers the service worker
- Handles install prompts for app installation
- Manages online/offline status
- Provides utilities for notifications

### 4. **HTML Updates**
- Added `<link rel="manifest" href="/manifest.json">` to all HTML files
- Added Apple mobile web app meta tags for iOS support
- Added theme-color meta tags for UI consistency

### 5. **Server Configuration** (`server.js`)
- Proper MIME type serving for manifest.json
- Cache-control headers for optimal performance
- Security headers (X-Frame-Options, X-Content-Type-Options, etc.)

---

## Installation & Usage

### For Desktop Users (Chrome, Edge, Opera, Brave)
1. Open your MeetRecap app in the browser
2. Look for the **"Install MeetRecap"** button in the address bar or app menu
3. Click the install button
4. The app will be installed and added to your desktop/applications menu

### For Mobile Users (Android)
1. Open MeetRecap in Chrome/Firefox
2. Tap the **install prompt** at the bottom of the screen
3. Tap **"Install"**
4. The app will be added to your home screen

### For iOS Users
1. Open MeetRecap in Safari
2. Tap the **Share** button
3. Select **"Add to Home Screen"**
4. Give it a name and tap **"Add"**
5. The app will appear on your home screen

---

## JavaScript API

### Check if PWA Can Be Installed
```javascript
if (window.canInstallPWA?.()) {
  // Show install button
}
```

### Trigger Install Prompt
```javascript
window.showPWAInstallPrompt?.();
```

### Request Notification Permission
```javascript
const hasPermission = await window.requestNotificationPermission?.();
if (hasPermission) {
  console.log('Notifications enabled');
}
```

### Send Notification
```javascript
await window.sendNotification?.('Meeting starting soon', {
  body: 'Your meeting starts in 5 minutes',
  icon: '/icon.png',
  badge: '/icon.png'
});
```

---

## Features

### ✅ Offline Support
- Core pages (login, dashboard, meeting) are cached
- Static assets are cached for fast loading
- API requests fall back to cached data when offline

### ✅ Installation
- Users can install the app on their devices
- Custom app icon and splash screen
- Standalone display mode (no browser UI)

### ✅ Push Notifications
- Service worker can receive and display push notifications
- Clickable notifications with action handlers

### ✅ Background Sync
- Framework in place for syncing data when connection is restored
- (Can be extended for your specific needs)

### ✅ Performance
- Intelligent caching strategies
- Static assets cached for 1 week
- API responses cached with network-first approach
- HTML files cached for 1 hour with revalidation

---

## Caching Strategy

### Static Assets (CSS, JS, Images)
- **Strategy**: Cache First
- **Duration**: 604,800 seconds (1 week)
- **Fallback**: Cached version if offline

### API Calls & Socket.IO
- **Strategy**: Network First
- **Duration**: Dynamic (from response headers)
- **Fallback**: Cached response if offline

### HTML Pages
- **Strategy**: Network First
- **Duration**: 3,600 seconds (1 hour)
- **Fallback**: Must revalidate

---

## Configuration

### Update App Metadata
Edit `public/manifest.json` to customize:
```json
{
  "name": "Your App Name",
  "short_name": "Short Name",
  "description": "App description",
  "start_url": "/login",
  "display": "standalone",
  "background_color": "#ffffff",
  "theme_color": "#080d1a",
  "icons": [...],
  "categories": ["productivity", "business"]
}
```

### Customize Service Worker Cache
Edit `public/service-worker.js` to add more assets to static cache:
```javascript
const STATIC_ASSETS = [
  // Add your assets here
  '/your-page.html',
  '/your-image.png'
];
```

### Add Custom Notifications
Edit `public/pwa-init.js` to add notification listeners:
```javascript
window.addEventListener('push', (event) => {
  // Handle push notifications
});
```

---

## Browser Support

| Browser | Support | Notes |
|---------|---------|-------|
| Chrome | ✅ Full | Version 39+ |
| Firefox | ✅ Full | Version 44+ |
| Safari | ⚠️ Partial | iOS 11.3+, limited features |
| Edge | ✅ Full | Version 17+ |
| Opera | ✅ Full | Version 26+ |
| Samsung Internet | ✅ Full | Version 4+ |

---

## Debugging & Troubleshooting

### View Service Worker Status
1. Open DevTools (F12)
2. Go to **Application** tab
3. Click **Service Workers** in the left sidebar
4. You should see your service worker registered

### View Cache Storage
1. Open DevTools
2. Go to **Application** tab
3. Click **Cache Storage** in the left sidebar
4. You can inspect and clear cached data

### View Manifest
1. Open DevTools
2. Go to **Application** tab
3. Click **Manifest** in the left sidebar

### Common Issues

**Service Worker Not Installing?**
- Ensure HTTPS or localhost
- Check browser console for errors
- Try hard refresh (Ctrl+Shift+R)

**App Not Installing?**
- Ensure manifest.json is valid
- Check that app icon exists
- Try clearing browser cache

**Offline Page Not Loading?**
- Check service worker cache in DevTools
- Verify offline fallback in service-worker.js

---

## Testing

### Test Offline Mode
1. Open DevTools (F12)
2. Go to **Network** tab
3. Check **Offline** checkbox
4. Navigate the app - cached content should still load

### Test Install Prompt
1. Open app in desktop Chrome
2. Look for install button in address bar
3. Click and complete installation
4. Launch from desktop/app drawer

### Test Notifications
```javascript
// In browser console
await window.requestNotificationPermission?.();
await window.sendNotification?.('Test', { body: 'Test notification' });
```

---

## Deployment Considerations

### HTTPS Requirement
- PWA features **require HTTPS** in production
- Localhost works for development
- Self-signed certificates work for testing

### Environment Variables
Ensure your `.env` file has:
```
NODE_ENV=production  # For production PWA features
```

### Performance Optimization
1. Optimize images (use WebP where possible)
2. Minify CSS/JS for production
3. Use CDN for static assets
4. Monitor cache size (keep under 50MB per app)

---

## Extending PWA Features

### Add Background Sync
```javascript
// In your app code
if ('serviceWorker' in navigator) {
  const registration = await navigator.serviceWorker.ready;
  registration.sync.register('sync-data');
}
```

### Add Periodic Sync
```javascript
const registration = await navigator.serviceWorker.ready;
await registration.periodicSync.register('update-data', {
  minInterval: 60 * 60 * 1000 // 1 hour
});
```

### Add Shortcuts
Update `manifest.json` shortcuts array to add quick actions.

---

## Monitoring

### Check Service Worker Updates
The service worker checks for updates every minute. Users will be prompted to reload when updates are available.

### Monitor Cache Size
```javascript
caches.storage.estimate().then(estimate => {
  console.log('Cache usage:', estimate.usage, 'bytes');
  console.log('Cache quota:', estimate.quota, 'bytes');
});
```

---

## Support & Documentation

- **PWA Documentation**: https://web.dev/progressive-web-apps/
- **Service Worker API**: https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API
- **Web App Manifest**: https://developer.mozilla.org/en-US/docs/Web/Manifest
- **Caching Strategies**: https://web.dev/service-worker-caching-strategies/

---

## Next Steps

1. **Test the PWA** on various devices and browsers
2. **Customize manifest.json** with your branding
3. **Update icons** with high-quality images
4. **Monitor analytics** for installation rates
5. **Gather user feedback** on offline features

---

## Quick Checklist

- [ ] Icon file exists at `/public/icon.png`
- [ ] manifest.json properly configured
- [ ] Service worker registers without errors
- [ ] App works offline
- [ ] Installation prompt appears
- [ ] Tested on mobile and desktop
- [ ] HTTPS enabled in production
- [ ] Cache storage monitored
- [ ] Performance optimized

---

**Your PWA is ready! 🚀**
