// ==========================================================================
// DIGITAL SCHOOL ECOSYSTEM (VANILLA EDITION)
// Multi-School Central Configuration & Profile Service (Cloud Firestore)
// ==========================================================================

import { db, doc, getDoc, setDoc, serverTimestamp } from '../firebase.js';
import { recordAuditEvent } from './audit-service.js';

export const DEFAULT_SCHOOL_ID = 'sch_cairo_sec_01';

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
export async function getSchoolProfile(schoolId = DEFAULT_SCHOOL_ID) {
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

export const updateSchoolProfile = saveSchoolProfile;

/**
 * Save school profile to Cloud Firestore and update cache
 */
export async function saveSchoolProfile(data, schoolId = DEFAULT_SCHOOL_ID) {
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
    console.error('Firestore save school error:', err);
  }

  localStorage.setItem(`dse_school_${schoolId}`, JSON.stringify(updated));
  applySchoolBranding(updated);

  try {
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
      operatorRole: 'director',
      schoolId,
    });
  } catch (auditErr) {
    console.warn('Audit record school profile notice:', auditErr);
  }

  return updated;
}

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

/**
 * Purge all demo/mock records from localStorage and cache, leaving system fresh for real production entry.
 */
export async function purgeDemoData(schoolId = DEFAULT_SCHOOL_ID) {
  // Purge all operational caches
  for (let i = localStorage.length - 1; i >= 0; i--) {
    const k = localStorage.key(i);
    if (k && (
      k.startsWith('dse_students_') ||
      k.startsWith('dse_devices_') ||
      k.startsWith('dse_batches_') ||
      k.startsWith('dse_grades_') ||
      k.startsWith('dse_assessments_') ||
      k.startsWith('dse_attendance_') ||
      k.startsWith('dse_cms_') ||
      k.startsWith('dse_gate_passes_') ||
      k.startsWith('dse_social_') ||
      k.startsWith('dse_messages_')
    )) {
      localStorage.removeItem(k);
    }
  }

  // Set clean mode so services return empty sets and do not auto-inject mocks
  localStorage.setItem(`dse_clean_mode_${schoolId}`, 'true');

  await recordAuditEvent({
    action: 'تهيئة وتصفير السجلات والبيانات التجريبية',
    target: 'قاعدة بيانات المنظومة المركزية',
    details: 'تم تفريغ كافة السجلات التجريبية استعداداً لبدء العمل الحقيقي للمدرسة',
    operatorRole: 'director',
    schoolId,
  });

  return true;
}

/**
 * Restore seed demo records for presentation/testing
 */
export async function restoreDemoData(schoolId = DEFAULT_SCHOOL_ID) {
  localStorage.removeItem(`dse_clean_mode_${schoolId}`);

  // Purge caches to trigger fresh seeding
  for (let i = localStorage.length - 1; i >= 0; i--) {
    const k = localStorage.key(i);
    if (k && k.startsWith('dse_')) {
      if (!k.includes('user_session') && !k.includes('school_')) {
        localStorage.removeItem(k);
      }
    }
  }

  await recordAuditEvent({
    action: 'استعادة السجلات والبيانات التجريبية (Demo Seed)',
    target: 'قاعدة بيانات المنظومة المركزية',
    details: 'تمت استعادة حزمة البيانات التجريبية لغايات العرض والتدريب',
    operatorRole: 'director',
    schoolId,
  });

  return true;
}
