// ==========================================================================
// DIGITAL SCHOOL ECOSYSTEM — CLOUDINARY CLIENT SERVICE
// Signed Cloudinary Uploads & Transformation Delivery
// ==========================================================================

import { MEDIA_CONFIG } from '../config.js';
import { auth } from '../firebase.js';
import { getCurrentUser } from '../auth.js';

/**
 * Validates file type and size before any upload attempt.
 */
export function validateMediaFile(file) {
  if (!file) {
    return { valid: false, error: 'لم يتم تحديد أي ملف.' };
  }

  if (!MEDIA_CONFIG.allowedMimeTypes.includes(file.type)) {
    return {
      valid: false,
      error: `نوع الملف غير مدعوم (${file.type}). الأنواع المسموحة: JPEG, PNG, WEBP, GIF.`
    };
  }

  if (file.size > MEDIA_CONFIG.maxFileSize) {
    const sizeMb = (file.size / (1024 * 1024)).toFixed(1);
    return {
      valid: false,
      error: `حجم الملف (${sizeMb} ميجابايت) يتجاوز الحد الأقصى المسموح به (10 ميجابايت).`
    };
  }

  return { valid: true };
}

export async function compressMediaImage(file, maxDimension = 1000, quality = 0.82) {
  if (!file || !file.type.startsWith('image/')) return file;

  const image = await createImageBitmap(file);
  const scale = Math.min(1, maxDimension / Math.max(image.width, image.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(image.width * scale));
  canvas.height = Math.max(1, Math.round(image.height * scale));
  const context = canvas.getContext('2d');
  if (!context) throw new Error('تعذر تجهيز الصورة للرفع.');
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  image.close();

  const blob = await new Promise((resolve, reject) => {
    canvas.toBlob((result) => result ? resolve(result) : reject(new Error('تعذر ضغط الصورة.')), 'image/jpeg', quality);
  });
  return new File([blob], file.name.replace(/\.[^.]+$/, '') + '.jpg', { type: 'image/jpeg' });
}

function uploadToCloudinary(uploadUrl, formData, onProgress) {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open('POST', uploadUrl);
    request.timeout = 60000;
    request.upload.onprogress = (event) => {
      if (event.lengthComputable && typeof onProgress === 'function') {
        onProgress(Math.round((event.loaded / event.total) * 100));
      }
    };
    request.onload = () => {
      let payload;
      try {
        payload = JSON.parse(request.responseText);
      } catch {
        reject(new Error('استجابة Cloudinary غير مفهومة.'));
        return;
      }
      if (request.status >= 200 && request.status < 300) resolve(payload);
      else reject(new Error(payload.error?.message || 'فشل رفع الصورة إلى Cloudinary.'));
    };
    request.onerror = () => reject(new Error('تعذر الاتصال بخدمة رفع الصور.'));
    request.ontimeout = () => reject(new Error('انتهت مهلة رفع الصورة. تحقق من الاتصال ثم أعد المحاولة.'));
    request.send(formData);
  });
}

/**
 * Uploads an image using Cloudflare Worker signed payload directly to Cloudinary.
 * @param {File} file - The image file to upload.
 * @param {Object} options - { schoolId, albumId, assetType, onProgress }
 * @returns {Promise<Object>} Metadata of the uploaded image.
 */
export async function uploadMediaImage(file, options = {}) {
  const validation = validateMediaFile(file);
  if (!validation.valid) {
    throw new Error(validation.error);
  }

  const currentUser = getCurrentUser();
  if (!currentUser) {
    throw new Error('يجب تسجيل الدخول أولاً لإجراء هذه العملية.');
  }

  // Strict role check
  const allowedRoles = ['director', 'super_admin', 'tech_specialist'];
  if (!allowedRoles.includes(currentUser.role)) {
    throw new Error('غير مصرح لك برفع الوسائط. هذه الصلاحية مقتصرة على الإدارة ومسؤول التطوير التكنولوجي.');
  }

  const workerUrl = MEDIA_CONFIG.workerGatewayUrl;
  if (!workerUrl) {
    throw new Error('رفع الصور متوقف مؤقتًا حتى نشر بوابة الرفع الآمنة وتدوير بيانات Cloudinary.');
  }

  const schoolId = options.schoolId || currentUser.schoolId || 'sch_cairo_sec_01';
  const albumId = options.albumId || 'general';
  const assetType = options.assetType || 'album';

  if (!auth?.currentUser) {
    throw new Error('تعذر التحقق من جلسة Firebase. سجل الدخول مرة أخرى ثم أعد المحاولة.');
  }

  options.onStatus?.('جارٍ التحقق من الصلاحية...');
  const idToken = await auth.currentUser.getIdToken(false);
  options.onStatus?.('جارٍ تجهيز طلب الرفع الآمن...');
  const signResponse = await fetch(`${workerUrl.replace(/\/$/, '')}/api/media/sign-upload`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${idToken}`
    },
    body: JSON.stringify({
      schoolId,
      albumId,
      assetType,
      fileName: file.name,
      fileType: file.type,
      fileSize: file.size
    })
  });
  const signData = await signResponse.json().catch(() => ({}));
  if (!signResponse.ok) {
    throw new Error(signData.error || 'تعذر بدء الرفع الآمن.');
  }

  options.onStatus?.('جارٍ الرفع إلى Cloudinary...');
  const formData = new FormData();
  formData.append('file', file);
  formData.append('api_key', signData.apiKey);
  formData.append('timestamp', signData.timestamp);
  formData.append('signature', signData.signature);
  formData.append('folder', signData.folder);
  const resultData = await uploadToCloudinary(signData.uploadUrl, formData, options.onProgress);
  options.onStatus?.('اكتمل رفع الصورة.');

  // Return standardized media metadata object
  return {
    publicId: resultData.public_id,
    secureUrl: resultData.secure_url,
    width: resultData.width,
    height: resultData.height,
    format: resultData.format,
    fileSize: resultData.bytes || file.size,
    originalName: file.name,
    albumId,
    schoolId,
    uploadedBy: currentUser.uid,
    uploadedByName: currentUser.displayName || currentUser.name || 'مسؤول التكنولوجيا',
    createdAt: new Date().toISOString(),
    status: 'active'
  };
}

/**
 * Securely deletes an image via the Cloudflare Worker protected endpoint.
 */
export async function deleteMediaImage(publicId, schoolId) {
  const currentUser = getCurrentUser();
  if (!currentUser) throw new Error('Unauthenticated');

  const allowedRoles = ['director', 'super_admin', 'tech_specialist'];
  if (!allowedRoles.includes(currentUser.role)) {
    throw new Error('Unauthorized');
  }

  if (!MEDIA_CONFIG.workerGatewayUrl) throw new Error('حذف الصور متوقف حتى نشر بوابة الرفع الآمنة.');
  if (!auth?.currentUser) throw new Error('تعذر التحقق من جلسة Firebase.');

  const idToken = await auth.currentUser.getIdToken(false);
  const res = await fetch(`${MEDIA_CONFIG.workerGatewayUrl.replace(/\/$/, '')}/api/media/delete`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${idToken}`
    },
    body: JSON.stringify({ publicId, schoolId: schoolId || currentUser.schoolId })
  });
  const result = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(result.error || 'فشل حذف الصورة من Cloudinary.');
  return result.success === true;
}

/**
 * Builds an optimized Cloudinary delivery URL with transformations.
 * (Automatic format f_auto, quality q_auto, responsive sizing)
 */
export function getOptimizedImageUrl(publicIdOrUrl, transformation = 'card') {
  if (!publicIdOrUrl) return '';

  // If already a Data URL or external blob, return directly
  if (publicIdOrUrl.startsWith('data:') || publicIdOrUrl.startsWith('blob:')) {
    return publicIdOrUrl;
  }

  // If already a Cloudinary URL
  if (publicIdOrUrl.includes('res.cloudinary.com')) {
    const trans = MEDIA_CONFIG.transformations[transformation] || transformation;
    return publicIdOrUrl.replace('/upload/', `/upload/${trans}/`);
  }

  // Construct Cloudinary URL from publicId
  const cloudName = MEDIA_CONFIG.cloudinaryCloudName;
  const trans = MEDIA_CONFIG.transformations[transformation] || MEDIA_CONFIG.transformations.card;
  return `https://res.cloudinary.com/${cloudName}/image/upload/${trans}/${publicIdOrUrl}`;
}

