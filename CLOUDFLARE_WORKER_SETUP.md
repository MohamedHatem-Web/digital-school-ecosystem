# دليل إعداد وتشغيل بوابة Cloudflare Worker
## Digital School Ecosystem — Cloudflare Worker Backend Gateway

تعمل بوابة **Cloudflare Worker** كوسيط أمني خفيف وخالٍ من الخوادم (Serverless) لتأمين عمليات الرفع والحذف عبر Cloudinary والتأكد من مطابقة صلاحيات مستخدمي Firebase Authentication قبل منح توقيع الرفع.

> **إجراء أمني عاجل:** سبق كشف Cloudinary API Secret في ملفات المشروع. عطّل النسخة المنشورة القديمة أو أوقف مفاتيح Cloudinary السابقة فورًا، وأنشئ API Secret جديدًا قبل نشر الكود الحالي. لا تستخدم السر القديم مرة أخرى.

---

### 1. موقع الكود وملفات التكوين
- كود البوابة: [cloudflare-worker/worker.js](cloudflare-worker/worker.js)
- ملف الإعدادات: [cloudflare-worker/wrangler.toml](cloudflare-worker/wrangler.toml)

---

### 2. خطوات النشر والتشغيل عبر Wrangler CLI

#### الخطوة الأولى: تثبيت أداة Wrangler
```bash
npm install -g wrangler
# أو تشغيلها عبر npx
npx wrangler login
```

#### الخطوة الثانية: إضافة الأسرار الجديدة
بعد تدوير مفاتيح Cloudinary، أدخل القيم الجديدة مباشرة في الطرفية. لا تضعها في ملفات المشروع أو المحادثات:
```bash
npx wrangler secret put CLOUDINARY_API_KEY
npx wrangler secret put CLOUDINARY_API_SECRET
npx wrangler secret put FIREBASE_ADMIN_SERVICE_ACCOUNT
```

اسم Cloudinary ومعرّف Firebase غير سريين وموجودان في `wrangler.toml`. اضبط `CORS_ORIGIN` على أصل الموقع الفعلي بدل `*` قبل النشر.

`FIREBASE_ADMIN_SERVICE_ACCOUNT` هو JSON key لحساب خدمة مخصص. أنشئ الحساب في Google Cloud، وامنحه صلاحيات Identity Platform اللازمة لـ`firebaseauth.users.get` و`firebaseauth.users.update` وصلاحيات Firestore اللازمة لقراءة ملف المستخدم وكتابة سجل التدقيق فقط. أدخل ملف JSON مباشرة في موجه `wrangler secret put`؛ لا تحفظه في المستودع أو ترسله في المحادثات.

#### الخطوة الثالثة: نشر البوابة للإنتاج
```bash
cd cloudflare-worker
npx wrangler deploy
```

---

### 3. نشر الإصدار الآمن

```bash
cd cloudflare-worker
npx wrangler deploy
```

الـWorker يتحقق من توقيع Firebase ومطالبات المشروع، ثم يقرأ دور المستخدم ومدرسته من مستند `users/{uid}` في Firestore. لا يقبل الدور المرسل من المتصفح. لا تفعّل رابط البوابة في الواجهة قبل نجاح النشر والتحقق.

بعد النشر، عيّن عنوان البوابة في `js/config.js` أو في `localStorage` بالمفتاح `dse_worker_gateway_url`. عنوان البوابة الافتراضي متوقف عمدًا إلى أن تُنجز هذه الخطوات.

### 4. نقاط الاتصال المتاحة (API Endpoints)

| المسار | الطريقة | الوصف | الصلاحيات المطلوبة |
| :--- | :--- | :--- | :--- |
| `/api/media/sign-upload` | `POST` | توليد توقيع SHA-1 مصادق عليه لرفع الصور | `director`, `tech_specialist`, `super_admin` |
| `/api/media/delete` | `POST` | حذف صورة من Cloudinary بواسطة الـ `public_id` | `director`, `tech_specialist`, `super_admin` |
| `/api/admin/change-password` | `POST` | تغيير كلمة مرور حساب من نفس المدرسة وإبطال جلساته | `tech_specialist` فقط؛ حسابات الطلاب وأولياء الأمور والمعلمين والشؤون فقط |
| `/api/health` | `GET` | فحص جاهزية البوابة وحالتها التشغيلية | عام (Public) |

تغيير كلمة المرور لا يعمل حتى يكون Secret حساب الخدمة مضبوطًا. لا تُرسل كلمة المرور إلى السجلات؛ يسجل Worker هوية منفذ العملية والحساب المستهدف فقط.

---

### 5. حالة النشر

لا يمكن التحقق من إعداد أسرار حساب Cloudflare أو تدويرها من ملفات المشروع. اعتبر أي نسخة منشورة قبل تدوير السر وإعادة نشر الـWorker غير آمنة، ولا تعِد تفعيل الرفع حتى إتمام الخطوات أعلاه.

