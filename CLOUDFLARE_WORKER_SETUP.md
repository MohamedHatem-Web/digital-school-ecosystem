# دليل إعداد وتشغيل بوابة Cloudflare Worker
## Digital School Ecosystem — Cloudflare Worker Backend Gateway

تعمل بوابة **Cloudflare Worker** كوسيط أمني خفيف وخالٍ من الخوادم (Serverless) لتأمين عمليات الرفع والحذف عبر Cloudinary والتأكد من مطابقة صلاحيات مستخدمي Firebase Authentication قبل منح توقيع الرفع.

---

### 1. موقع الكود وملفات التكوين
- كود البوابة: [`cloudflare-worker/worker.js`](file:///c:/Users/600g5/OneDrive/Desktop/digital-school-ecosystem/cloudflare-worker/worker.js)
- ملف الإعدادات: [`cloudflare-worker/wrangler.toml`](file:///c:/Users/600g5/OneDrive/Desktop/digital-school-ecosystem/cloudflare-worker/wrangler.toml)

---

### 2. خطوات النشر والتشغيل عبر Wrangler CLI

#### الخطوة الأولى: تثبيت أداة Wrangler
```bash
npm install -g wrangler
# أو تشغيلها عبر npx
npx wrangler login
```

#### الخطوة الثانية: إضافة المتغيرات السرية المشفرة (Secrets)
قم بتنفيذ الأوامر التالية لإدخال المفاتيح بأمان داخل بيئة الـ Worker:
```bash
npx wrangler secret put CLOUDINARY_CLOUD_NAME
# أدخل اسم السحابة الخاصة بك

npx wrangler secret put CLOUDINARY_API_KEY
# أدخل مفتاح الـ API Key

npx wrangler secret put CLOUDINARY_API_SECRET
# أدخل المفتاح السري المعتمد

npx wrangler secret put FIREBASE_PROJECT_ID
# أدخل معرّف مشروع فايربيس: digital-school-ecosystem-4050a
```

#### الخطوة الثالثة: نشر البوابة للإنتاج
```bash
cd cloudflare-worker
npx wrangler deploy
```

---

### 3. نقاط الاتصال المتاحة (API Endpoints)

| المسار | الطريقة | الوصف | الصلاحيات المطلوبة |
| :--- | :--- | :--- | :--- |
| `/api/media/sign-upload` | `POST` | توليد توقيع SHA-1 مصادق عليه لرفع الصور | `director`, `tech_specialist`, `super_admin` |
| `/api/media/delete` | `POST` | حذف صورة من Cloudinary بواسطة الـ `public_id` | `director`, `tech_specialist`, `super_admin` |
| `/api/health` | `GET` | فحص جاهزية البوابة وحالتها التشغيلية | عام (Public) |

---

### 4. رابط البوابة الحية المنشورة (Production URL)
الوركر منشور ويعمل حالياً بنجاح ومربوط بالمنظومة على الرابط السحابي:
`https://dse-cloudinary-gateway.hatmm462.workers.dev`

- تم ضبط المتغيرات السرية المعتمدة (`CLOUDINARY_API_KEY` و `CLOUDINARY_API_SECRET`).
- تم تحديث رابط البوابة في [`js/config.js`](file:///c:/Users/600g5/OneDrive/Desktop/digital-school-ecosystem/js/config.js).

