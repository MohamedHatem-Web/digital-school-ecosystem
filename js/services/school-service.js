// ==========================================================================
// DIGITAL SCHOOL ECOSYSTEM (VANILLA EDITION)
// Multi-School Central Configuration & Profile Service (Cloud Firestore)
// ==========================================================================

import {
  db,
  doc,
  getDoc,
  setDoc,
  serverTimestamp,
  collection,
  getDocs,
  query,
  where,
} from '../firebase.js';
import { MEDIA_CONFIG } from '../config.js';
import { getCurrentUser } from '../auth.js';
import { recordAuditEvent } from './audit-service.js';
import {
  DEFAULT_SCHOOL_ID as TENANT_DEFAULT_ID,
  getTenantSchoolId,
  getTenantSlug,
} from '../tenant-router.js';

export const DEFAULT_SCHOOL_ID = typeof window === 'undefined'
  ? TENANT_DEFAULT_ID
  : getTenantSchoolId();

export function getActiveSchoolId() {
  if (typeof window !== 'undefined' && ['/', '/index.html'].includes(window.location.pathname)) return null;
  const slug = getTenantSlug();
  if (slug) return slug === 'zewail-school' ? 'zewail-school' : slug;
  const current = getCurrentUser();
  return current?.schoolId || DEFAULT_SCHOOL_ID;
}

export async function listApprovedSchools() {
  const schoolsRef = collection(db, 'schools');
  const snapshot = await getDocs(query(schoolsRef, where('status', '==', 'active')));
  return snapshot.docs
    .map((schoolDoc) => ({ schoolId: schoolDoc.id, ...schoolDoc.data() }))
    .filter((school) => school.publicListing !== false)
    .sort((a, b) => String(a.nameAr || '').localeCompare(String(b.nameAr || ''), 'ar'));
}

export async function submitSchoolApplication(application) {
  const schoolSlug = String(application.schoolSlug || '').trim().toLowerCase();
  const applicantEmail = String(application.applicantEmail || '').trim().toLowerCase();
  const counterpartEmail = String(application.counterpartEmail || '').trim().toLowerCase();
  const applicantRole = String(application.applicantRole || '').trim();
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(schoolSlug)) {
    throw new Error('استخدم اسمًا لاتينيًا صغيرًا للحروف والأرقام والشرطات فقط.');
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(applicantEmail) || applicantEmail.length > 254) {
    throw new Error('أدخل بريدًا إلكترونيًا صحيحًا لمقدم الطلب.');
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(counterpartEmail) || counterpartEmail.length > 254 ||
    counterpartEmail === applicantEmail) {
    throw new Error('أدخل بريدًا صحيحًا ومختلفًا للطرف الثاني.');
  }
  if (!['director', 'tech_specialist'].includes(applicantRole)) {
    throw new Error('اختر دورك في المدرسة.');
  }
  if (!application.acceptedTerms || !application.schoolNameAr || !application.applicantName ||
    !application.counterpartName) {
    throw new Error('أكمل بيانات المدرسة والطرفين والموافقة على الشروط.');
  }
  if (!MEDIA_CONFIG.workerGatewayUrl) {
    throw new Error('خدمة تسجيل المدارس غير مفعلة في بيئة المحاكاة المحلية.');
  }

  const response = await fetch(`${MEDIA_CONFIG.workerGatewayUrl.replace(/\/$/, '')}/api/public/school-applications`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      schoolSlug,
      schoolNameAr: String(application.schoolNameAr).trim(),
      schoolNameEn: String(application.schoolNameEn || '').trim(),
      applicantRole,
      applicantEmail,
      applicantName: String(application.applicantName).trim(),
      counterpartRole: applicantRole === 'director' ? 'tech_specialist' : 'director',
      counterpartEmail,
      counterpartName: String(application.counterpartName).trim(),
      phone: String(application.phone || '').trim(),
      faxNumber: String(application.faxNumber || '').trim(),
      acceptedTerms: application.acceptedTerms === 'true' || application.acceptedTerms === true,
    }),
  });
  const result = await response.json().catch(() => ({}));
  if (response.status === 404) {
    throw new Error('مسار طلبات المدارس غير موجود في Worker المنشور. انشر النسخة المحدّثة من مجلد cloudflare-worker ثم أعد المحاولة.');
  }
  if (!response.ok) throw new Error(result.error || 'تعذر إرسال طلب المدرسة.');
  return { id: result.id, schoolSlug: result.schoolSlug };
}

// Initial state - strictly empty per Real-Data policy
const INITIAL_SCHOOL_STATE = {
  schoolId: DEFAULT_SCHOOL_ID,
  nameAr: '',
  nameEn: '',
  administration: '',
  directorate: '',
  address: '',
  phone: '',
  email: '',
  academicYear: '2026/2027',
  branding: {
    primaryColor: '#0f172a',
    accentColor: '#d97706',
    logoUrl: '',
  },
  isConfigured: false,
};

/**
 * Fetch school profile from Cloud Firestore (with local cache fallback)
 */
export async function getSchoolProfile(schoolId = getActiveSchoolId()) {
  if (!schoolId) return { ...INITIAL_SCHOOL_STATE, schoolId: '' };
  try {
    const schoolRef = doc(db, 'schools', schoolId);
    const snapshot = await getDoc(schoolRef);

    if (snapshot.exists()) {
      const data = snapshot.data();
      localStorage.setItem(`dse_school_${schoolId}`, JSON.stringify(data));
      applySchoolBranding(data);
      return data;
    }
  } catch (err) {
    console.warn('Firestore fetch notice (using cache if available):', err);
  }

  // Fallback to cached profile if offline
  const cached = localStorage.getItem(`dse_school_${schoolId}`);
  if (cached) {
    try {
      const parsed = JSON.parse(cached);
      applySchoolBranding(parsed);
      return parsed;
    } catch (e) {
      // ignore
    }
  }

  return { ...INITIAL_SCHOOL_STATE, schoolId };
}


/**
 * Save school profile to Cloud Firestore and update cache
 */
export async function saveSchoolProfile(data, schoolId = getActiveSchoolId()) {
  const current = await getSchoolProfile(schoolId);
  const updated = {
    ...current,
    ...data,
    schoolId,
    isConfigured: true,
    updatedAt: new Date().toISOString(),
  };

  try {
    const schoolRef = doc(db, 'schools', schoolId);
    await setDoc(schoolRef, {
      ...updated,
      serverUpdatedAt: serverTimestamp(),
    }, { merge: true });
  } catch (err) {
    throw new Error(`تعذر حفظ هوية المدرسة على الخادم: ${err.message || 'تحقق من الاتصال والصلاحيات.'}`);
  }

  localStorage.setItem(`dse_school_${schoolId}`, JSON.stringify(updated));
  applySchoolBranding(updated);

  try {
    const currentUser = getCurrentUser();
    await recordAuditEvent({
      action: 'اعتماد وتحديث هوية وبيانات المدرسة الرسمية',
      target: updated.nameAr || 'هوية وبيانات المدرسة',
      details: `تم تحديث بيانات المؤسسة التعليمية: ${[
        updated.nameAr ? `الاسم: ${updated.nameAr}` : '',
        updated.administration ? `الإدارة: ${updated.administration}` : '',
        updated.phone ? `الهاتف: ${updated.phone}` : '',
        updated.branding?.logoUrl ? 'تم تحديث الشعار الرسمي' : '',
      ].filter(Boolean).join(' | ')}`,
      category: 'profile',
      operatorRole: currentUser?.role || 'director',
      schoolId,
    });
  } catch (auditErr) {
    console.warn('Audit record school profile notice:', auditErr);
  }

  return updated;
}

export const updateSchoolProfile = saveSchoolProfile;

/**
 * Apply dynamic school branding (colors, titles) to document DOM
 */
export function applySchoolBranding(profile) {
  if (!profile) return;

  if (profile.branding && profile.branding.accentColor) {
    document.documentElement.style.setProperty('--brand-accent-color', profile.branding.accentColor);
  }

  const schoolName = profile.nameAr || 'المدرسة الثانوية الرسمية الرقمية';
  const adminName = profile.administration || profile.adminDeptAr || 'إدارة القاهرة الجديدة التعليمية';
  const logoUrl = profile.branding && profile.branding.logoUrl ? profile.branding.logoUrl.trim() : '';

  // Update School Names across DOM
  document.querySelectorAll('#brand-school-name, .school-name-text, .brand-app-name, .topbar-school-name').forEach((el) => {
    if (el.closest('.drawer-header')) return;
    el.textContent = schoolName;
  });

  // Update Administration Names across DOM
  document.querySelectorAll('#brand-admin-name, .school-dept-sub, .school-admin-text, .brand-gov-tag').forEach((el) => {
    el.textContent = adminName;
  });

  // Default SVG Crests
  const defaultCrestSvg = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1-2.5-2.5Z"></path><path d="M6 6h10"></path><path d="M6 10h10"></path></svg>`;
  const defaultSidebarSvg = `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1-2.5-2.5Z"></path></svg>`;

  // Update Public & Header Brand Crests
  document.querySelectorAll('.brand-crest').forEach((el) => {
    if (logoUrl) {
      el.innerHTML = `<img src="${logoUrl}" alt="${schoolName}" class="brand-crest-img">`;
      el.classList.add('has-custom-logo');
    } else {
      el.innerHTML = defaultCrestSvg;
      el.classList.remove('has-custom-logo');
    }
  });

  // Update Dashboard Sidebar Crests
  document.querySelectorAll('.sidebar-crest').forEach((el) => {
    if (logoUrl) {
      el.innerHTML = `<img src="${logoUrl}" alt="${schoolName}" class="brand-crest-img">`;
      el.classList.add('has-custom-logo');
    } else {
      el.innerHTML = defaultSidebarSvg;
      el.classList.remove('has-custom-logo');
    }
  });

  // Update Hero Section Logo Badge
  const heroEmblem = document.getElementById('hero-school-logo');
  if (heroEmblem) {
    if (logoUrl) {
      heroEmblem.innerHTML = `<img src="${logoUrl}" alt="${schoolName}" class="hero-logo-img">`;
      heroEmblem.style.display = 'inline-flex';
    } else {
      heroEmblem.style.display = 'none';
    }
  }

  // Update Footer Crests
  document.querySelectorAll('.footer-brand-crest').forEach((el) => {
    if (logoUrl) {
      el.innerHTML = `<img src="${logoUrl}" alt="${schoolName}" class="brand-crest-img">`;
      el.style.display = 'inline-flex';
    } else {
      el.style.display = 'none';
    }
  });
}

