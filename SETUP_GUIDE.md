# دليل التشغيل والتثبيت الميداني (SETUP & DEPLOYMENT GUIDE)
**منظومة المدرسة الرقمية — Digital School Ecosystem (DSE)**

---

## 1. متطلبات التشغيل (System Prerequisites)
- **بيئة التشغيل:** أي حاسوب أو خادم يدعم Node.js (الإصدار 18 أو أحدث) أو خادم استضافة ثابتة (Static Web Hosting).
- **المكتبات الخارجية:** **صفر مكتبات خارجية (Zero Dependencies)** — النظام مبني بـ Pure HTML5/CSS3/Vanilla JS ويستخدم خادم Node.js الأصيل `http`.

---

## 2. خطوات التشغيل المحلي (Local Running)
1. افتح موجه الأوامر (Terminal) في مجلد المشروع الرئيسي:
   ```bash
   cd digital-school-ecosystem
   ```
2. شغّل خادم الويب المحلي الأصيل:
   ```bash
   node serve.js
   ```
3. افتح المتصفح على العنوان التالي:
   ```text
   http://localhost:3000
   ```

---

## 3. بيانات حسابات الاختبار المعتمدة (QA Accounts Credentials)
جميع الحسابات مفعلة على خوادم **Firebase Authentication** وتستخدم كلمة المرور الموحدة:
```text
Password@2026
```

| الدور الوظيفي | البريد الإلكتروني | مسار اللوحة المباشر |
|---|---|---|
| **مدير المدرسة** | `director@dse.edu.eg` | `dashboard/admin-overview.html` |
| **مسؤول التطوير التكنولوجي** | `tech@dse.edu.eg` | `dashboard/tech-devices.html` |
| **مسؤول شؤون الطلاب** | `affairs@dse.edu.eg` | `dashboard/student-affairs.html` |
| **معلم معتمد** | `teacher@dse.edu.eg` | `dashboard/teacher-portal.html` |
| **طالب** | `student@dse.edu.eg` | `dashboard/student-portal.html` |
| **ولي أمر** | `parent@dse.edu.eg` | `dashboard/parent-portal.html` |
| **أخصائي اجتماعي** | `social@dse.edu.eg` | `dashboard/social-affairs.html` |
| **المشرف الوزاري العام** | `superadmin@dse.edu.eg` | `dashboard/admin-overview.html` |

---

## 4. هيكل البيانات في Cloud Firestore (Database Structure)
```
/users/{uid}
    ├── email, role, schoolId, displayName, avatarUrl, status

/schools/{schoolId}
    ├── nameAr, administration, address, phone, academicYear, branding
    ├── classes/{classId} ➔ { name, grade, room }
    ├── subjects/{subjectId} ➔ { name, code, stage }
    ├── students/{studentId} ➔ { name, code, nationalId, grade, docs: [] }
    ├── devices/{deviceId} ➔ { imei, serialNumber, model, status, assignedStudentCode }
    ├── batches/{batchId} ➔ { batchNumber, academicYear, receivedQuantity }
    ├── attendance/{recordId} ➔ { studentCode, date, status }
    ├── assessments/{assessmentId} ➔ { title, subject, maxGrade, deadline }
    ├── grades/{gradeId} ➔ { studentCode, assessmentId, score, feedback }
    ├── cases/{caseId} ➔ { studentName, caseType, description, status, confidential: true }
    ├── dismissals/{dismissalId} ➔ { timestamp, message, authorizedBy }
    ├── notifications/{notificationId} ➔ { title, body, category, targetRole }
    ├── cmsContent/{contentId} ➔ { category, title, summary, status: "published" | "draft" }
    └── auditLogs/{logId} ➔ { timestamp, action, target, details, operatorRole }
```

---

## 5. قواعد الأمان السحابية (Security Rules Deployment)
- لنشر قواعد Firestore:
  ```bash
  firebase deploy --only firestore:rules
  ```
  (باستخدام ملف [`firestore.rules`](firestore.rules)).
- لنشر قواعد Storage:
  ```bash
  firebase deploy --only storage
  ```
  (باستخدام ملف [`storage.rules`](storage.rules)).

---

## 6. النشر على السحابة (Production Cloud Deployment)
المشروع جاهز للنشر الفوري كـ Static Site على أي من المنصات التالية:
- **Vercel:** فقط اربط مستودع GitHub واختر الـ Root Directory؛ سيتم النشر فوراً بدون أي إعدادات Build.
- **Firebase Hosting:**
  ```bash
  firebase deploy --only hosting
  ```

