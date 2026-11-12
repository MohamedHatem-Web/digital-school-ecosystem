# Feature Matrix

This matrix reflects what the codebase actually contains and how the implementation is evidenced in the repo.

| Feature | User role | Relevant files | Status | Evidence |
|---|---|---|---|---|
| Login and role-based access | All roles | `js/auth.js`, `js/router-guard.js`, `js/firebase.js`, `login.html` | IMPLEMENTED AND VERIFIED | `scripts/run-tests.js` confirms successful Firebase login for eight demo accounts. |
| Dashboard routing by role | All roles | `js/auth.js`, `dashboard/*.html` | IMPLEMENTED AND VERIFIED | `ROLE_DASHBOARDS` maps roles to dashboard pages. |
| Student record storage | Student affairs / admin | `js/services/student-service.js`, `firestore.rules` | IMPLEMENTED BUT NOT VERIFIED | Service initializes and syncs mock student records into Firestore/localStorage. |
| Academic classes and subjects | Director / teacher | `js/services/academic-service.js` | IMPLEMENTED BUT NOT VERIFIED | Lists default classes and subjects with `getSchoolClasses` and `getSchoolSubjects`. |
| Daily attendance | Teacher / student affairs | `js/services/attendance-service.js` | IMPLEMENTED BUT NOT VERIFIED | Records are saved per class and absent students trigger notifications. |
| Grade entry and reporting | Teacher / student / parent | `js/services/grade-service.js` | IMPLEMENTED BUT NOT VERIFIED | Default grade records exist and are read by portal logic. |
| Parent notifications and dismissal events | Parent / director | `js/services/notification-service.js` | PARTIALLY IMPLEMENTED | In-app notifications and dismissal records are implemented; actual SMS/push is not proven. |
| Social affairs cases | Social affairs / director | `js/services/social-service.js` | IMPLEMENTED BUT NOT VERIFIED | Case creation and notification hooks are present. |
| Tablet inventory and IMEI tracking | Tech specialist / director | `js/services/tablet-service.js` | IMPLEMENTED BUT NOT VERIFIED | Device and batch defaults exist and are written to Firestore/localStorage. |
| Media gallery and albums | Tech specialist / director | `js/services/media-service.js`, `js/services/cloudinary-service.js` | PARTIALLY IMPLEMENTED | Upload logic and Cloudinary gateway are present; actual deployment credentials/config not validated here. |
| Public website CMS | Director / tech specialist | `js/services/cms-service.js`, `js/views/cms-view.js` | IMPLEMENTED BUT NOT VERIFIED | CMS item creation and publication logic exists. |
| Audit logging | All staff | `js/services/audit-service.js` | IMPLEMENTED BUT NOT VERIFIED | Audit events are created and stored to Firestore/local cache. |
| School profile and branding | Director | `js/services/school-service.js` | IMPLEMENTED BUT NOT VERIFIED | Branding functions update DOM values and local storage. |
| School website public pages | Public visitors | `index.html`, `about.html`, etc. | IMPLEMENTED AND VERIFIED | HTTP 200 checks confirm main site pages are served. |
| Offline access | Public / logged-in users | `sw.js`, `offline.html` | IMPLEMENTED AND VERIFIED | Service worker and offline fallback exist. |
| Real SMS/email delivery | Parent / staff | `js/services/messaging-service.js` | UI ONLY / NOT IMPLEMENTED | Messaging logic is catalog and UI based; no transport service is wired in code. |
| Real push notifications | All roles | `js/services/push-service.js` | UI ONLY / NOT IMPLEMENTED | The project includes a push service layer but no concrete provider config or send logic is shown. |
| Multi-school tenant isolation | All roles | `firestore.rules`, `js/services/school-service.js` | PARTIALLY IMPLEMENTED | `schoolId` is used throughout, but the runtime is defaulted to one school and code still assumes one tenant. |
| File uploads | None | Not available | DISABLED | Student PDFs and user profile images are not uploaded; public website media uses Cloudinary. |
| Document export (CSV/PDF) | Admin / staff | `js/utils/export-utils.js`, `js/utils/pdf-export.js` | IMPLEMENTED BUT NOT VERIFIED | Code exists for CSV and PDF generation. |
| Role-specific messaging and permissions | Students / parents / teachers | `js/services/messaging-service.js` | PARTIALLY IMPLEMENTED | Recipient rules are coded, but no actual message delivery backend is evident. |
| Demo/seed environment provisioning | QA/testing | `js/demo-seed.js` | IMPLEMENTED AND VERIFIED | Seed accounts are created and tested by `run-tests.js`. |

## Notes on status labels
The project contains a large amount of evident functionality, but many of the most important business workflows are still represented as seeded data, browser-local defaults, and UI logic rather than end-to-end production data processing.
