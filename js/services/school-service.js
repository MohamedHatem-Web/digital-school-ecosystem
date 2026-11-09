// ==========================================================================
// DIGITAL SCHOOL ECOSYSTEM (VANILLA EDITION)
// Multi-School Central Configuration & Profile Service (Cloud Firestore)
// ==========================================================================

import { db, doc, getDoc, setDoc, serverTimestamp } from '../firebase.js';

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
  return updated;
}

/**
 * Apply dynamic school branding (colors, titles) to document DOM
 */
export function applySchoolBranding(profile) {
  if (!profile) return;

  if (profile.branding && profile.branding.primaryColor) {
    document.documentElement.style.setProperty('--color-primary-950', profile.branding.primaryColor);
  }

  if (profile.nameAr) {
    document.querySelectorAll('.school-name-text').forEach((el) => {
      el.textContent = profile.nameAr;
    });
  }

  if (profile.administration) {
    document.querySelectorAll('.school-admin-text').forEach((el) => {
      el.textContent = profile.administration;
    });
  }
}
