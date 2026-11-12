# Complete File Inventory

This inventory covers the relevant project files that matter to the system's architecture, business logic, integrations, and security posture.

## Root-level application files

- `index.html` — main public website homepage
- `about.html` — school description and institutional overview
- `news.html` — news content page
- `activities.html` — school activities and events
- `calendar.html` — academic calendar and schedule concepts
- `gallery.html` — public photo gallery
- `leadership.html` — leadership and staff directory
- `contact.html` — contact and location info
- `login.html` — common login portal
- `verify.html` — identity verification support page
- `offline.html` — offline fallback page
- `manifest.webmanifest` — PWA manifest
- `sw.js` — service worker for offline caching and fallback behavior
- `serve.js` — native static web server for local hosting on port 3000

## Dashboard pages

- `dashboard/admin-overview.html` — administrative overview for directors and senior roles
- `dashboard/tech-devices.html` — tablet inventory, IMEI, batch workflows
- `dashboard/student-affairs.html` — student enrollment and record work
- `dashboard/social-affairs.html` — confidential social cases and disciplinary actions
- `dashboard/teacher-portal.html` — class and grading workflows
- `dashboard/student-portal.html` — student dashboard
- `dashboard/parent-portal.html` — parent communication portal
- `dashboard/unauthorized.html` — blocked access route

## Styling

- `css/base.css` — base typography, spacing, global layout
- `css/components.css` — reusable widgets, cards, badges, forms
- `css/dashboard.css` — dashboard-specific styling
- `css/public-site.css` — public-facing web styling
- `css/tokens.css` — color, spacing, and design token definitions

## JavaScript

### Core runtime
- `js/config.js` — Firebase and media configuration, default school ID
- `js/firebase.js` — Firebase app initialization and exported SDK helpers
- `js/auth.js` — login, logout, role metadata, session persistence
- `js/router-guard.js` — route authorization enforcement and UI updates
- `js/components.js` — shared UI components and sidebars
- `js/i18n.js` — Arabic text, directionality, localization support
- `js/demo-seed.js` — seeded demo accounts and automatic Firebase provisioning

### Services
- `js/services/academic-service.js` — school stages, classes, subjects
- `js/services/attendance-service.js` — daily attendance and absence alerts
- `js/services/audit-service.js` — audit log creation and export
- `js/services/cloudinary-service.js` — signed Cloudinary upload and transformation logic
- `js/services/cms-service.js` — website content management for news/leadership
- `js/services/gate-pass-service.js` — gate/pass records if present for movement tracking
- `js/services/grade-service.js` — assessments and grades
- `js/services/media-service.js` — gallery and media categories
- `js/services/messaging-service.js` — internal messaging catalogs and recipient rules
- `js/services/notification-service.js` — parent dismissal and in-app notifications
- `js/services/push-service.js` — push notification hooks and integration references
- `js/services/qr-service.js` — QR-based or attendance/access utilities
- `js/services/report-card-service.js` — report card generation or summary logic
- `js/services/school-service.js` — school profile and branding
- `js/services/social-service.js` — warning, case, meeting, and disciplinary records
- `js/services/student-service.js` — student record creation, sync, and sanitization
- `js/services/tablet-service.js` — IMEI, batch, device registration and assignment

### UI views
- `js/views/audit-view.js` — audit dashboard rendering logic
- `js/views/cms-view.js` — CMS editor behavior
- `js/views/gallery-view.js` — gallery page behavior
- `js/views/gate-pass-view.js` — gate-pass display
- `js/views/messages-view.js` — messaging UI logic
- `js/views/social-view.js` — social affairs views
- `js/views/students-view.js` — student management rendering logic
- `js/views/tablets-view.js` — tablet management rendering logic

### Utilities
- `js/utils/export-utils.js` — CSV export support
- `js/utils/pdf-export.js` — PDF export helpers
- `js/utils/skeleton-utils.js` — loading state widgets

## Security and backend config
- `firestore.rules` — Firestore permission model
- `cloudflare-worker/worker.js` — Cloudinary signed-upload gateway
- `cloudflare-worker/wrangler.toml` — Cloudflare worker configuration

## Documentation and project metadata
- `FEATURE_STATUS.md` — feature declaration and status claims
- `SETUP_GUIDE.md` — local setup and project deployment notes
- `SECURITY_AUDIT.md` — project-level security summary
- `PROJECT_AUDIT.md` — general project audit snapshot
- `TEST_REPORT.md` — report of automated checks and live Firebase sign-ins
- `IMPLEMENTATION_PLAN.md` — planning/design notes
- `DESIGN_SYSTEM.md` — visual system specification
- `CLOUDFLARE_WORKER_SETUP.md` — worker setup instructions
- `CLOUDINARY_SETUP.md` — Cloudinary configuration notes

## Testing and scripts
- `scripts/run-tests.js` — syntax, HTTP connectivity, and Firebase auth validation script

## Exclusions and notable non-core content
The repository does not contain backend server code beyond the Node static host and the Cloudflare Worker. It does not contain a formal application framework, a build pipeline, or a compiled artifact directory. The project is intentionally a static web app plus cloud service integrations, rather than a Node/Express monolith.
