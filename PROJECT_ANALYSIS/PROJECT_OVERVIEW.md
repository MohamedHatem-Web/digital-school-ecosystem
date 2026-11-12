# Project Overview

## 1. Actual purpose of the codebase
The repository is a single-page, browser-based school administration platform for a fictional Egyptian secondary school. It is not a full backend application by itself; it is a front-end system that reads and writes application data through Firebase services and browser-local caches.

The project is designed to support:
- school leadership and administration
- teacher workflows
- student tracking and digital records
- parent communication and notifications
- social affairs case handling
- technology-device management (tablets/IMEI)
- public school website content management

The implemented code is centered on a single school ID, `sch_cairo_sec_01`, and uses realistic demo identities for staff, students, and parents. The platform presents itself as a multi-school-ready design but the runtime code is still effectively single-school in practice.

## 2. Actual technology stack
Evidence from the codebase shows:
- HTML5 pages and static assets
- CSS for a custom Arabic/RTL design system
- Vanilla JavaScript modules, no framework
- Firebase Auth for sign-in and session state
- Cloud Firestore for structured data
- Cloudinary media delivery through the Cloudflare Worker
- Cloudflare Worker for signed Cloudinary uploads
- Cloudinary for media hosting and delivery
- Node.js native static server (`serve.js`) for local hosting
- PWA service worker for offline entry points

The project is browser-first and data is persisted in both Firestore and browser `localStorage` as a caching layer.

## 3. High-level architecture
The design follows a layered pattern:
- UI pages under root and `dashboard/`
- JS modules under `js/`
- service modules under `js/services/`
- Firebase bridge in `js/firebase.js`
- auth/route guard in `js/auth.js` and `js/router-guard.js`
- data access via service functions such as `getStudents`, `getTabletDevices`, `getNotifications`, `getCmsItems`, `recordAuditEvent`
- Cloudinary and Cloudflare integration for media
- default seed data to ensure the UI is populated immediately

## 4. Major modules
- `js/auth.js`: login flow, role metadata, session cache, role-based dashboard routing
- `js/router-guard.js`: route protection and UI role enforcement
- `js/services/student-service.js`: student registry, demo records, enrollment data
- `js/services/tablet-service.js`: tablets, IMEI, delivery workflow
- `js/services/attendance-service.js`: daily attendance records and absence alerts
- `js/services/grade-service.js`: assessments and grade records
- `js/services/social-service.js`: social cases and disciplinary actions
- `js/services/notification-service.js`: parent notifications and dismissal notices
- `js/services/school-service.js`: school branding and school profile logic
- `js/services/media-service.js`: albums and media gallery
- `js/services/cloudinary-service.js`: signed uploads and Cloudinary transformation helpers
- `js/services/cms-service.js`: public website content for news, leadership, announcements
- `js/services/audit-service.js`: operational audit trail

## 5. What is actually working from code evidence
The repository contains a functioning static web app structure and a live Firebase authentication flow. The project test script confirms HTTP 200 status for all main pages and successful sign-in for the demo accounts in the configured Firebase project.

Important caveat: a successful login and page serve does not establish production-grade operational readiness. The app heavily relies on demo data, hardcoded identities, and cached fallback records.

## 6. Current maturity level
This is best described as a working demo/prototype with a rich UI and a clear architecture for a school platform. It is not yet a proven multi-school production system. It shows strong design intent and good UI/role mapping, but it still depends on several assumptions that need operational hardening.

## 7. Evidence used
This summary was derived from:
- `js/config.js`
- `js/auth.js`
- `js/router-guard.js`
- `js/firebase.js`
- `firestore.rules`
- `cloudflare-worker/worker.js`
- `js/services/*.js`
- `scripts/run-tests.js`

The project is therefore a real, code-backed prototype rather than a purely speculative design document.
