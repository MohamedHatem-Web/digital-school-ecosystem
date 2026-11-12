# Database Architecture

## 1. Primary database: Firebase Firestore
The codebase uses Firebase Firestore as the authoritative structured data source. The Firestore bridge is initialized in `js/firebase.js` and used by nearly all service modules.

The design uses a tenant-like pattern:
- `/users/{uid}`
- `/schools/{schoolId}`

The active runtime school is defaulted to:
- `sch_cairo_sec_01`

## 2. User collection
Path:
- `/users/{uid}`

Fields observed in code:
- `email`
- `role`
- `schoolId`
- `displayName`
- `avatarUrl`
- `status`
- `lastLogin`
- `updatedAt`

Important evidence:
- `js/auth.js` creates and updates a user profile document during login
- `js/demo-seed.js` provisions demo accounts into users

## 3. School-level collections
The `firestore.rules` file defines the intended school structure. The code and rules show these document collections under `/schools/{schoolId}`:

- `classes` — academic sections and rooms
- `subjects` — subject catalog
- `students` — enrollment and digital files
- `devices` — tablets and IMEI inventory
- `batches` — government or supplier device batches
- `attendance` — daily attendance records
- `assessments` — tests and academic assessments
- `grades` — score entries and teacher feedback
- `cases` — social affairs or confidential student cases
- `notifications` — parent and user alerts
- `dismissals` — dismissal notices for the school day
- `cmsContent` — public website news and leadership content
- `albums` and `images` — gallery metadata and media items
- `auditLogs` — operational audit trail
- `disciplinaryActions` — social warnings and actions
- `parentMeetings` — parent meeting scheduling

## 4. Media storage architecture
Public images are uploaded to Cloudinary through the Cloudflare Worker, while Firestore stores metadata and delivery URLs. PDF and profile-image uploads are not enabled; do not persist files as Data URLs or local-storage fallbacks.

## 5. Caching and runtime pattern
The services do not rely solely on Firestore. They add browser `localStorage` caches around every major collection so the UI can render immediately with fallback data.

Examples:
- `student-service.js` caches students under keys like `dse_students_...`
- `tablet-service.js` caches batches and devices
- `attendance-service.js` caches attendance by date/class
- `audit-service.js` caches audit logs
- `school-service.js` stores a school profile with `dse_school_${schoolId}`

This means the project is intentionally resilient, but it also introduces a risk of stale or demo data overwriting live state unless carefully managed.

## 6. Data flow
The architecture is:
1. UI page loads
2. service function executes (`getStudents`, `getNotifications`, `getSchoolClasses`, etc.)
3. function checks localStorage cache first
4. function attempts Firestore fetch
5. function stores fallback default data or seeded demo records if no real data exists
6. audit service logs actions when data is modified

This flow is visible across `student-service.js`, `tablet-service.js`, `grade-service.js`, and `attendance-service.js`.

## 7. Seed-data architecture
Several services define `DEFAULT_*` arrays and automatically hydrate them into the browser and Firestore when the project is first loaded without data.

Examples:
- `DEFAULT_STUDENTS`
- `DEFAULT_DEVICES`
- `DEFAULT_BATCHES`
- `DEFAULT_ATTENDANCE_RECORDS`
- `DEFAULT_GRADES`
- `DEFAULT_DISCIPLINARY_ACTIONS`

This creates an immediate demo experience but also means the app is not strictly empty-state driven. Its real-world readiness depends on clearing or replacing this seeded data with real operational data.

## 8. Summary
The database design is coherent and intentionally tenant-aware, but the implementation is still heavily reliant on default school identity and seeded test data. It is better viewed as a multi-school architecture pattern with a single-school runtime configuration, not yet a proven multi-school production deployment.
