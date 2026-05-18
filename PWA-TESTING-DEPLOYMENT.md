# PWA Testing & Deployment Guide

## Local Testing

### Prerequisites
- Node.js and npm installed
- Your project running: `npm start`
- Access via `http://localhost:3000`

---

## Browser DevTools Testing

### Chrome/Edge DevTools

#### 1. View Service Worker Status
```
F12 → Application → Service Workers
```
You should see:
- Service worker registered
- Status: "activated and running"
- Scope: "/"

#### 2. View Manifest
```
F12 → Application → Manifest
```
Check that manifest.json loads properly with:
- App name
- Icons
- Colors
- Display mode

#### 3. View Cache Storage
```
F12 → Application → Cache Storage
```
Should show cached assets:
- meetrecap-static-v1 (initial cache)
- meetrecap-dynamic-v1 (runtime cache)

#### 4. Test Offline Mode
```
F12 → Network → Offline (checkbox)
```
- Navigate pages - they should load from cache
- API calls should show offline response
- Uncheck to go back online

#### 5. Check Performance
```
F12 → Lighthouse
```
Run audit to see PWA score:
- Target: 90+ for PWA compliance
- Check installability
- Check offline support

---

## Testing on Different Devices

### Desktop (Chrome, Edge, Opera)

#### Installation Test
1. Open app in browser
2. Look for install button in address bar
3. Click button
4. Review permissions
5. Click "Install"
6. App opens in app window
7. Verify icon on taskbar/application menu

#### Uninstall
Right-click app icon → Uninstall

### Mobile (Android)

#### Installation Test (Chrome)
1. Open app in Chrome
2. Look for install prompt at bottom
3. Tap "Install"
4. Tap "Install" again in dialog
5. Wait for installation
6. App appears on home screen
7. Tap icon to launch
8. Verify full-screen mode (no browser UI)

#### Installation Test (Firefox)
1. Open app in Firefox
2. Tap menu (three dots)
3. Scroll down and find install option
4. Tap "Install"
5. Follow prompts

#### Installation Test (Samsung Internet)
1. Open app in Samsung Internet
2. Tap menu (three dots)
3. Find "Add to Home screen"
4. Tap it
5. Choose location
6. Tap "Add"

### iOS (Safari)

#### Installation (iOS 11.3+)
1. Open app in Safari
2. Tap Share button (bottom of screen)
3. Scroll right and find "Add to Home Screen"
4. Tap it
5. Enter app name
6. Tap "Add"
7. Icon appears on home screen
8. Tap to launch

**Note:** iOS has limited PWA support:
- No background sync
- No push notifications
- No web share target
- Limited caching control

---

## Testing Offline Functionality

### Test 1: Page Caching
1. Open app online
2. Navigate to all pages (login, dashboard, meeting)
3. Go offline (DevTools → Network → Offline)
4. Navigate pages - should load from cache
5. Refresh pages - should still work

### Test 2: Static Assets
1. Open page online
2. Go offline
3. Refresh page
4. All CSS, JS, images should load from cache
5. Verify visual appearance is complete

### Test 3: API Fallback
1. Open app online (populate cache)
2. Go offline
3. Try API calls (if any sync)
4. Should show cached data or offline message
5. Go back online
6. New data should sync

### Test 4: Service Worker Updates
1. Edit `public/service-worker.js`
2. Make a small change (e.g., add comment)
3. Refresh page
4. Check DevTools → Service Workers
5. Should show "install → wait" state
6. Hard refresh (Ctrl+Shift+R)
7. New version should activate

---

## Testing Notifications

### Enable Notifications
```javascript
// In browser console
await window.requestNotificationPermission?.();
```

### Send Test Notification
```javascript
// In browser console
await window.sendNotification?.('Test Notification', {
  body: 'This is a test message',
  icon: '/icon.png',
  badge: '/icon.png',
  tag: 'test-tag'
});
```

### Test Notification Click
1. Send notification (see above)
2. Click the notification
3. App should come to foreground

---

## Performance Testing

### Lighthouse Audit (Chrome)
1. Open app
2. F12 → Lighthouse
3. Select PWA category
4. Run audit
5. Check score:
   - **100**: Perfect
   - **90+**: Excellent
   - **80+**: Good
   - **<80**: Needs work

### Common Issues and Fixes

| Issue | Cause | Fix |
|-------|-------|-----|
| Low Performance | Large assets | Minify/optimize images |
| Not installable | Missing manifest | Verify manifest.json valid |
| Service Worker fails | Cache quota exceeded | Clear caches in DevTools |
| Offline blank page | Missing offline fallback | Add offline.html |
| Slow load | Large bundle | Code splitting, lazy load |

### Test Cache Size
```javascript
// In browser console
navigator.storage.estimate?.().then(est => {
  console.log('Used:', (est.usage / 1024 / 1024).toFixed(2), 'MB');
  console.log('Quota:', (est.quota / 1024 / 1024).toFixed(2), 'MB');
  console.log('Percentage:', ((est.usage / est.quota) * 100).toFixed(2), '%');
});
```

---

## Deployment Testing

### Pre-Deployment Checklist

- [ ] Service worker has no console errors
- [ ] Manifest.json is valid (no warnings)
- [ ] App icon (192x192 minimum) exists
- [ ] Offline pages load without errors
- [ ] No console errors or warnings
- [ ] Lighthouse PWA score ≥ 90
- [ ] HTTPS enabled (or localhost)
- [ ] Cache headers are correct
- [ ] Security headers present
- [ ] All assets load in offline mode

### Production Deployment

#### 1. HTTPS Setup
PWA requires HTTPS in production:

**Option A: Using Let's Encrypt (Recommended)**
```bash
# Use certbot with your domain
certbot certonly --standalone -d yourdomain.com
```

**Option B: Self-signed (testing only)**
```bash
openssl req -x509 -newkey rsa:4096 -nodes -out cert.pem -keyout key.pem -days 365
```

#### 2. Update Node.js Server
```javascript
const https = require('https');
const fs = require('fs');

const options = {
  key: fs.readFileSync('key.pem'),
  cert: fs.readFileSync('cert.pem')
};

https.createServer(options, app).listen(3000);
```

#### 3. Set Environment
```bash
export NODE_ENV=production
npm start
```

#### 4. Verify HTTPS
```bash
curl -I https://yourdomain.com
# Should show 200 OK with HTTPS
```

### Deployment on Render, Heroku, etc.

#### Render.yaml
```yaml
services:
  - type: web
    name: meetrecap
    env: node
    buildCommand: npm install
    startCommand: npm start
    envVars:
      - key: NODE_ENV
        value: production
```

#### Environment Variables
```
NODE_ENV=production
SESSION_SECRET=your-secret-key
JWT_SECRET=your-jwt-key
```

---

## Monitoring in Production

### View Service Worker Logs
```javascript
// Add to your app
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then(registrations => {
    registrations.forEach(reg => {
      console.log('[SW] Registered:', reg);
    });
  });
}
```

### Monitor Cache Usage
Add to your dashboard:
```javascript
async function monitorCache() {
  const estimate = await navigator.storage.estimate();
  const percentUsed = (estimate.usage / estimate.quota) * 100;
  
  // Send to analytics
  gtag('event', 'cache_usage', {
    bytes_used: estimate.usage,
    bytes_quota: estimate.quota,
    percent_used: percentUsed
  });
}

// Call periodically
setInterval(monitorCache, 60000); // Every minute
```

### Track Installation Rate
Add to your app:
```javascript
window.addEventListener('appinstalled', () => {
  // Track installation
  gtag('event', 'app_installed');
  console.log('PWA installed successfully');
});
```

---

## Troubleshooting

### Service Worker Not Registering
**Problem:** Service worker fails to register
**Solution:**
1. Check console for errors
2. Verify manifest.json is valid
3. Ensure HTTPS (or localhost)
4. Clear browser cache and try again

### App Not Installable
**Problem:** No install button/prompt appears
**Solution:**
1. Verify manifest.json valid (DevTools → Manifest)
2. Check icon exists and is accessible
3. Run Lighthouse audit for issues
4. Ensure HTTPS or localhost
5. Try incognito window

### Offline Pages Blank
**Problem:** Pages show blank when offline
**Solution:**
1. Check Service Workers in DevTools
2. Verify cache contains pages (Cache Storage tab)
3. Check for 404 errors in network tab while offline
4. Add offline.html fallback page

### Cache Growing Too Large
**Problem:** App cache quota exceeded
**Solution:**
1. Clear old caches in service worker
2. Reduce number of cached assets
3. Remove unused images/fonts
4. Implement cache expiration strategy

### Notifications Not Working
**Problem:** Notifications don't appear
**Solution:**
1. Request permission first
2. Check browser notification settings
3. Ensure service worker is active
4. Verify notification API available
5. Check browser console for errors

---

## Performance Optimization

### Reduce Bundle Size
```bash
# Check bundle size
npm run build -- --analyze

# Optimize images
npx imagemin public/*.png --out-dir=public

# Minify CSS
npx cssnano style.css -o style.min.css
```

### Optimize Caching
1. Increase cache duration for static assets (to 1 week)
2. Use short cache for HTML (1 hour)
3. Remove unused assets from cache
4. Consider image optimization

### Test Performance
1. **Lighthouse** → PWA score
2. **Network** tab → Check asset sizes
3. **Performance** tab → Check load time
4. **Coverage** tab → Check unused code

---

## Advanced Testing

### Service Worker Update Testing
1. Increment version number in `service-worker.js`
2. Modify a small asset
3. Deploy to production
4. Old version users should see update notification
5. Hard refresh triggers update

### Cache Strategy Testing
1. Go online and visit page
2. Go offline and verify load
3. Go online and update content
4. Verify fresh content loads

### Multi-Device Testing
1. Test on 2+ Android devices
2. Test on iOS (Safari)
3. Test on desktop (Chrome, Firefox, Edge)
4. Test on tablet
5. Test on different networks (WiFi, 4G, offline)

---

## Security Testing

### Check Security Headers
```bash
curl -I https://yourdomain.com
```

Should include:
- X-Content-Type-Options: nosniff
- X-Frame-Options: SAMEORIGIN
- X-XSS-Protection: 1; mode=block

### Test HTTPS
```bash
# Verify certificate
curl -vI https://yourdomain.com

# Check SSL score
https://www.ssllabs.com/ssltest/
```

### Test Manifest Validity
```bash
curl https://yourdomain.com/manifest.json | python -m json.tool
```

Should be valid JSON with no errors.

---

## Final Checklist Before Launch

- [ ] HTTPS enabled
- [ ] Service worker active
- [ ] Manifest valid
- [ ] Offline pages work
- [ ] Lighthouse score ≥ 90
- [ ] No console errors
- [ ] App installs on desktop
- [ ] App installs on mobile
- [ ] Offline mode tested
- [ ] Notifications (if used) tested
- [ ] Performance optimized
- [ ] Security headers set
- [ ] Cache strategy tested
- [ ] Multi-device tested
- [ ] Analytics working
- [ ] Error logging enabled

---

**Your PWA is production-ready! 🚀**
