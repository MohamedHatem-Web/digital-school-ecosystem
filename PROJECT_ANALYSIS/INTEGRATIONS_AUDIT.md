# Integrations Audit

## 1. Firebase integration
The project uses Firebase SDK modules loaded directly from Google’s CDN:
- Firebase App
- Firebase Auth
- Firebase Firestore

Files involved:
- `js/firebase.js`
- `js/config.js`
- `firestore.rules`

Firestore handles structured data. Privileged account administration and Cloudinary signing are server-side Cloudflare Worker responsibilities; the browser must not receive Admin credentials.

## 2. Cloudinary integration
Cloudinary is used for media hosting and optimized image delivery. The metadata and logic are in:
- `js/services/cloudinary-service.js`
- `js/services/media-service.js`
- `cloudflare-worker/worker.js`

The media flow is designed as:
1. User uploads file from browser
2. App requests signed upload payload from Cloudflare Worker
3. Worker verifies auth and signs a Cloudinary request
4. Browser uploads directly to Cloudinary
5. Firestore stores metadata and album info

This is a sound pattern for browser-based media management, provided the worker cryptographic validation is hardened.

## 3. Cloudflare Worker integration
The worker is used as a security boundary between the browser and Cloudinary. It handles:
- health check
- signed upload generation
- media deletion
- token parsing/role checks

This is a real architectural component, but the current implementation is not fully robust because it does not adequately verify JWT signatures and relies on insecure fallback behavior.

## 4. Notifications and messaging
The code has a clear concept for notifications and dismissals:
- `notification-service.js` creates in-app notifications
- `triggerSchoolDismissal()` records official dismissal notices
- `messaging-service.js` defines recipient catalogs and message threads

Important limitation: the code does not show a real SMS gateway, email provider, or push provider integration beyond existing service stubs and UI structure. Actual external message delivery is not evidenced.

## 5. Offline and PWA support
The project includes a service worker and offline page:
- `sw.js`
- `offline.html`

This is a meaningful capability for schools where connectivity is inconsistent. It supports offline navigation and cached assets.

## 6. Real-world deployment caveat
The app is configured for browser-based cloud usage, but the project does not include a complete backend deployment or production operations pipeline. It behaves much more like a demo environment with actual cloud services connected than a fully operational school system.
