# Role Analysis

## 1. Administrator / Director
### Existing pages
- `dashboard/admin-overview.html`
- `dashboard/tech-devices.html` (shared admin access)
- `dashboard/student-affairs.html` (shared admin access)

### Existing functionality
The director role is the highest privilege role in `js/auth.js` and `js/router-guard.js`. It can:
- access the administrative dashboard
- update school branding and profile via `saveSchoolProfile`
- create and manage classes and subjects
- review attendance and grade summaries
- trigger dismissal notices
- review audit logs
- approve or manage device inventory and specific school operations

### Database integration
- reads/writes `schools/{schoolId}` profile
actions
- reads/writes subcollections under the school
- audit records are written to `schools/{schoolId}/auditLogs`

### Permissions
The Firestore rules allow directors to write across school-level collections, subject to `schoolId` membership and role checks.

### Missing or weak areas
- the actual runtime still defaults to one school, `sch_cairo_sec_01`
- significant parts of the data are demo-generated, not operationally validated

## 2. Teacher
### Existing pages
- `dashboard/teacher-portal.html`

### Existing functionality
Teachers can:
- view assigned class contexts
- record attendance entries
- create assessments and update grades
- review student performance summaries
- send internal school message drafts to class-level recipients

### Database integration
- attendance is written to `/schools/{schoolId}/attendance`
- grades go to `/schools/{schoolId}/grades`
- assessments are stored under `/schools/{schoolId}/assessments`

### Permissions
The rules allow teachers to write attendance, assessments, grades, and notifications. This is coded in `firestore.rules`.

### Missing or weak areas
- no proven subject-to-teacher mapping from a real roster
- no real classroom or timetable management from a centralized academic master data source

## 3. Student
### Existing pages
- `dashboard/student-portal.html`

### Existing functionality
Students can access:
- profile sections and record metadata
- attendance summary
- grade and assessment history
- personal notifications
- portal-specific teacher communication if allowed by recipient logic

### Database integration
Student data is read from the student record list and grade records. The `student-service.js` and `grade-service.js` modules are the main sources.

### Permissions
The app allows students to view their own data indirectly through portal logic and role checks, while some family-sharing is enabled in `router-guard.js`.

### Missing or weak areas
- no evidence of secure per-student record restrictions beyond front-end logic
- not fully validated against a real database schema with role-based row-level permission enforcement for student-specific documents

## 4. Parent / Guardian
### Existing pages
- `dashboard/parent-portal.html`

### Existing functionality
Parents can access:
- child-linked profile summary
- attendance notices and absence alerts
- grade and assessment overview
- dismissals and school announcements
- parent communication catalog and message recipients

### Database integration
- notification creation via `createNotification`
- dismissal consumption via `getSchoolDismissals`
- student data read from student registry and grades

### Permissions
The `router-guard.js` intentionally allows students and parents to share some portal access through a mutual-family route rule.

### Missing or weak areas
- actual SMS or WhatsApp delivery is not integrated in code
- parent-child linking is implemented as demo data rather than as a robust identity-matching and verification system

## 5. Social Affairs Specialist
### Existing pages
- `dashboard/social-affairs.html`

### Existing functionality
Social affairs users can:
- view and create confidential student cases
- log disciplinary actions and warnings
- track parent meetings
- notify parents and maintain confidential records

### Database integration
- stored under `/schools/{schoolId}/cases`
- disciplinary actions in `social-service.js`
- parent meetings and case metadata in local caches/Firestore

### Permissions
Rules restrict these records to `social_affairs`, `director`, and `super_admin`.

### Missing or weak areas
- this is strong at the rules level, but the UI is still a demo structure and may not enforce strict actual access in every path

## 6. Technology Development Specialist
### Existing pages
- `dashboard/tech-devices.html`

### Existing functionality
The tech specialist can:
- manage tablet batches
- register devices and IEMI details
- track activation and delivery status
- assign devices to students
- manage media and gallery assets

### Database integration
- `/schools/{schoolId}/batches`
- `/schools/{schoolId}/devices`
- `/schools/{schoolId}/albums`
- media metadata under Cloudinary and Firestore

### Permissions
The rules explicitly allow this role to read/write device and batch collections, and to upload media with the worker route.

### Missing or weak areas
- real device assignment is still integrated mostly through demo data and local storage
- no evidence of a full asset lifecycle beyond front-end and signed upload logic

## 7. Cross-role conclusions
The role model is clear and well structured in the code. The strongest evidence is in the role metadata and route guard. The weak point is the actual operational depth of each role: several services rely on seeded defaults or local storage rather than a strict production data lifecycle.
