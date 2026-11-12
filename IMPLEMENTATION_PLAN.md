# الخطة التنفيذية وخارطة إنجاز وتطوير المنظومة (IMPLEMENTATION PLAN)
**مشروع: منظومة المدرسة الرقمية — Digital School Ecosystem**  
**تاريخ الخطة:** 7 نوفمبر 2026 | **الهدف:** اكتمال وجاهزية كافة الوظائف والأنظمة الفرعية

---

## المراحل التنفيذية المتسلسلة (Phased Roadmap)

### المرحلة 1: التدقيق المعماري والتوثيق (Audit & Architecture) — [منجز]
- فحص كامل للملفات، استبعاد التكرارات، وتوثيق مصفوفة الحالة الفنية والأمنية.
- إنتاج وثائق: `PROJECT_AUDIT.md`, `FEATURE_STATUS.md`, `IMPLEMENTATION_PLAN.md`, `SECURITY_AUDIT.md`.

### المرحلة 2: قواعد Firestore والوسائط (Firestore & Media Security)
1. قصر تخزين البيانات المنظمة والصلاحيات على Firestore عبر [`firestore.rules`](firestore.rules).
2. رفع صور الموقع حصريًا إلى Cloudinary عبر Cloudflare Worker.
3. مستندات PDF غير مفعلة حاليًا ولا تُحفظ كـData URL أو تخزين محلي.

### المرحلة 3: الهيكل الأكاديمي وسجلات الطلاب الموحدة (School Academic Structure)
1. بناء خدمة سحابية [`js/services/academic-service.js`](js/services/academic-service.js) لإدارة:
   - المراحل التعليمية (الصفوف الأولى، الثانية، الثالثة الثانوية).
   - الشعب والفصول الدراسية (1/1، 1/2، إلخ).
   - المواد الدراسية وإسناد المعلمين للفصول.
2. ترقية خدمة شؤون الطلاب [`js/services/student-service.js`](js/services/student-service.js) لتشمل:
   - إدارة بيانات القيد وربط الطالب بولي أمره الرسمي؛ رفع PDF غير متاح حاليًا.
   - التحقق من ربط الطالب بولي أمره الرسمي عبر بطاقة الرقم القومي.

### المرحلة 4: بوابة المعلم والتقييمات الأكاديمية (Teacher Portal & Assessments)
1. إنشاء خدمة رصد الدرجات والتقييمات [`js/services/grade-service.js`](js/services/grade-service.js).
2. تحديث [`dashboard/teacher-portal.html`](dashboard/teacher-portal.html):
   - واجهة رصد التقييمات الشهرية والواجبات.
   - إضافة الملاحظات التربوية والسلوكية لكل طالب.
   - مراجعة نسب الحضور والغياب المعتمدة للفصل.

### المرحلة 5: نظام إدارة المحتوى المدرسي للموقع العام (Public School CMS)
1. بناء خدمة إدارة المحتوى [`js/services/cms-service.js`](js/services/cms-service.js):
   - نشر الأخبار والبيانات الرسمية.
   - إدارة أعضاء القيادة المدرسية والرسالة والرؤية.
   - ألبومات الأنشطة والفعاليات.
2. تزويد لوحة المدير ولوحة مسؤول التطوير بتبويب "إدارة محتوى الموقع العام" لتحرير ونشر الأخبار وتحديث الأقسام فوراً دون تعديل الكود.
3. ربط صفحات الموقع العام (`news.html`, `leadership.html`, `about.html`, `activities.html`) للقراءة التلقائية من Firestore.

### المرحلة 6: منظومة الحالات الاجتماعية والإنذارات السرية (Social Affairs System)
1. ترقية [`dashboard/social-affairs.html`](dashboard/social-affairs.html):
   - فتح سجل حالات سرية لكل طالب ومتابعة الإجراءات.
   - إنشاء طلبات مقابلة أولياء الأمور الرسمية.
   - توثيق محاضر لجان الانضباط المدرسي الوزارية.
2. عزل هذه السجلات أمنياً لمنع وصول المعلمين أو الطلاب العاديين إليها.

### المرحلة 7: منظومة إشعارات الانصراف والتقارير الأسبوعية (Dismissal & Weekly Reports)
1. بناء خدمة الإشعارات [`js/services/notification-service.js`](js/services/notification-service.js):
   - دعم التنبيهات الفورية (In-App Notifications) في شريط اللوحات العلوي.
   - زر توثيق انصراف المدرسة اليومي (Dismissal Confirmation) من قبل الإدارة، وتوليد إشعار فوري في لوحة ولي الأمر مع التوقيت المعتمد.
2. توليد التقرير الأسبوعي التراكمي لولي الأمر (Weekly Progress Summary) في [`dashboard/parent-portal.html`](dashboard/parent-portal.html).

### المرحلة 8: رفع صور الملفات الشخصية وتكامل الوسائط (Avatars & Media)
1. إضافة مكون رفع الصورة الشخصية (Profile Avatar Uploader) في الواجهة العلوية لجميع الأدوار مع معاينة فورية للصورة قبل الحفظ.
2. إمكانية مراجعة الصور واعتمادها أو إزالتها من قِبل مدير المدرسة.

### المرحلة 9: الاختبار الشامل والتحقق من الجاهزية (Comprehensive QA Testing)
1. إنشاء وتشغيل اختبارات آلية لمسارات القراءة والكتابة وعزل المدارس في Firestore وCloudflare Worker.
2. إعداد وثيقتي: `TEST_REPORT.md` و `SETUP_GUIDE.md`.
