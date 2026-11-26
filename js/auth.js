// ==========================================================================
// DIGITAL SCHOOL ECOSYSTEM (VANILLA EDITION)
// Firebase Authentication & Authorization Service
// ==========================================================================

import {
  auth,
  ensureAuthPersistence,
  db,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  doc,
  getDoc,
  setDoc,
} from './firebase.js';
import { recordAuditEvent } from './services/audit-service.js';
import {
  clearCachedUserSession as clearStoredUserSession,
  persistUserSession,
  readCachedUserSession,
} from './session-cache.js';
import { getTenantSchoolSlug } from './tenant-router.js';

export { ROLE_DASHBOARDS, getRoleDashboardUrl } from './dashboard-routing.js';

export const ROLES_METADATA = {
  super_admin: { titleAr: 'مدير النظام العام', titleEn: 'Super Admin', badgeClass: 'badge-accent' },
  director: { titleAr: 'مدير المدرسة', titleEn: 'School Principal', badgeClass: 'badge-primary' },
  tech_specialist: { titleAr: 'مسؤول التطوير التكنولوجي والتابلت', titleEn: 'Technology Specialist', badgeClass: 'badge-accent' },
  student_affairs: { titleAr: 'مسؤول شؤون الطلاب والقيد', titleEn: 'Student Affairs', badgeClass: 'badge-primary' },
  teacher: { titleAr: 'معلم معتمد', titleEn: 'Teacher', badgeClass: 'badge-primary' },
  student: { titleAr: 'طالب', titleEn: 'Student', badgeClass: 'badge-accent' },
  parent: { titleAr: 'ولي أمر', titleEn: 'Parent', badgeClass: 'badge-accent' },
  social_affairs: { titleAr: 'أخصائي اجتماعي', titleEn: 'Social Worker', badgeClass: 'badge-warning' },
};

/**
 * Translate Firebase error codes into friendly Arabic messages
 */
export function translateAuthError(errorCode) {
  switch (errorCode) {
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
      return 'بيانات الدخول غير صحيحة، يرجى التحقق من البريد وكلمة المرور.';
    case 'auth/invalid-email':
      return 'صيغة البريد الإلكتروني غير صالحة.';
    case 'auth/user-disabled':
      return 'تم إيقاف هذا الحساب رسميًا من قِبل إدارة المدرسة.';
    case 'auth/too-many-requests':
      return 'تم تقييد المحاولات مؤقتًا لكثرة المحاولات الخاطئة. انتظر قليلاً ثم أعد المحاولة.';
    case 'auth/profile-not-provisioned':
      return 'الحساب غير مفعّل في سجل الصلاحيات. تواصل مع مسؤول النظام لتفعيله.';
    case 'auth/network-request-failed':
      return 'تعذر الاتصال بالخادم، يرجى فحص الاتصال بالإنترنت.';
    case 'auth/persistence-failed':
      return 'تعذر تفعيل الحفظ المستمر لجلسة الدخول في هذا المتصفح. فعّل تخزين الموقع ثم أعد المحاولة.';
    case 'auth/missing-password':
      return 'يرجى إدخال كلمة المرور.';
    default:
      return 'حدث خطأ أثناء المصادقة، يرجى المحاولة مرة أخرى.';
  }
}

/**
 * Authenticate user with Firebase Authentication and retrieve their authorized profile
 * Supports logging in with Email OR Student Code (e.g. 2026101 -> student@dse.edu.eg)
 */
export async function loginWithEmailPassword(emailOrCode, password, { expectedSchoolSlug = null } = {}) {
  await ensureAuthPersistence();
  let email = String(emailOrCode || '').trim();

  // If user entered a numeric student code, map it to the official school-education email format.
  if (/^\d+$/.test(email)) {
    email = `${email}@cairo7.moe.edu.eg`;
  } else if (email.includes('@') && !/cairo7\.moe\.edu\.eg$/.test(email.toLowerCase())) {
    // Preserve direct staff logins while allowing ministry student emails to login with the same identity pattern.
    const normalized = email.toLowerCase();
    if (/^\d+@/.test(normalized)) {
      email = normalized.replace(/@.*$/, '@cairo7.moe.edu.eg');
    }
  }

  const credential = await signInWithEmailAndPassword(auth, email, password);
  const firebaseUser = credential.user;

  // Fetch role and schoolId from Firestore users collection
  const userDocRef = doc(db, 'users', firebaseUser.uid);
  const userSnapshot = await getDoc(userDocRef);
  if (!userSnapshot.exists()) {
    clearCachedUserSession();
    await signOut(auth);
    const error = new Error('الحساب غير مفعّل في سجل الصلاحيات.');
    error.code = 'auth/profile-not-provisioned';
    throw error;
  }

  const userData = userSnapshot.data();
  if (!ROLES_METADATA[userData.role] ||
    (userData.role !== 'super_admin' && !userData.schoolId) ||
    (userData.status && userData.status !== 'active')) {
    clearCachedUserSession();
    await signOut(auth);
    const error = new Error('ملف الصلاحيات غير صالح أو غير نشط.');
    error.code = 'auth/profile-not-provisioned';
    throw error;
  }

  if (expectedSchoolSlug && userData.role !== 'super_admin' &&
    getTenantSchoolSlug(userData.schoolId) !== expectedSchoolSlug) {
    const error = new Error('هذا الحساب تابع لمدرسة أخرى.');
    error.code = 'auth/wrong-school';
    error.schoolId = userData.schoolId;
    error.schoolSlug = getTenantSchoolSlug(userData.schoolId);
    try {
      const schoolSnapshot = await getDoc(doc(db, 'schools', userData.schoolId));
      error.schoolName = schoolSnapshot.exists()
        ? (schoolSnapshot.data().nameAr || userData.schoolId)
        : userData.schoolId;
    } catch (schoolLookupError) {
      console.warn('تعذر تحميل بيانات المدرسة المرتبطة بالحساب:', schoolLookupError);
      error.schoolName = userData.schoolId;
    }
    clearCachedUserSession();
    await signOut(auth);
    const mismatch = new Error(error.message);
    Object.assign(mismatch, error);
    throw mismatch;
  }
  const profile = {
    uid: firebaseUser.uid,
    email: firebaseUser.email,
    displayName: firebaseUser.displayName || 'مستخدم المنظومة',
    ...userData,
    schoolId: userData.schoolId,
  };

  // Authoritative Staff & User Identity Map
  const knownStaffNames = {
    'director@dse.edu.eg': 'د. طارق محمود المنشاوي',
    'tech@dse.edu.eg': 'م. حسام الدين عبد العزيز',
    'affairs@dse.edu.eg': 'أ. محمود عبد الرحمن سالم',
    'teacher@dse.edu.eg': 'أ. إبراهيم فؤاد القاضي',
    'student@dse.edu.eg': 'يوسف أحمد المنشاوي',
    'parent@dse.edu.eg': 'أ. أحمد المنشاوي',
    'social@dse.edu.eg': 'أ. نادية مصطفى الشريف',
    'superadmin@dse.edu.eg': 'د. خالد السعيد عبد الحميد',
  };

  // Always enforce realistic full name for recognized accounts
  if (knownStaffNames[profile.email]) {
    profile.displayName = knownStaffNames[profile.email];
  } else if (!profile.displayName || profile.displayName === 'طالب' || profile.displayName === 'ولي أمر' || profile.displayName.includes('[تجريبي]') || profile.displayName === 'مستخدم المنظومة') {
    const meta = ROLES_METADATA[profile.role];
    if (meta) {
      profile.displayName = meta.titleAr;
    }
  }

  // Store active profile in persistent local cache so session survives navigation & refreshes
  persistUserSession(profile);

  // Record Audit Trail
  recordAuditEvent({
    action: 'تسجيل دخول ناجح إلى المنظومة',
    target: 'بوابة الخدمات الإلكترونية',
    details: `تم توثيق الدخول بنجاح لحساب (${profile.displayName})`,
    category: 'auth',
    operatorName: profile.displayName,
    operatorRole: profile.role,
    operatorEmail: profile.email,
    schoolId: profile.schoolId || 'zewail-school',
  }).catch(() => {});

  return profile;
}

/**
 * Get current session profile from storage cache (checks localStorage first, then cookies)
 */
export function getCurrentUser() {
  const user = readCachedUserSession();
  if (!user) return null;
  try {
    if (/^\d+@cairo7\.moe\.edu\.eg$/i.test(user?.email || '')) {
      user.role = 'student';
    }
    const knownStaffNames = {
      'director@dse.edu.eg': 'د. طارق محمود المنشاوي',
      'tech@dse.edu.eg': 'م. حسام الدين عبد العزيز',
      'affairs@dse.edu.eg': 'أ. محمود عبد الرحمن سالم',
      'teacher@dse.edu.eg': 'أ. إبراهيم فؤاد القاضي',
      'student@dse.edu.eg': 'يوسف أحمد المنشاوي',
      'parent@dse.edu.eg': 'أ. أحمد المنشاوي',
      'social@dse.edu.eg': 'أ. نادية مصطفى الشريف',
      'superadmin@dse.edu.eg': 'د. خالد السعيد عبد الحميد',
    };
    if (user && user.email && knownStaffNames[user.email]) {
      if (!user.displayName || user.displayName === 'طالب' || user.displayName === 'ولي أمر' || user.displayName === 'مستخدم المنظومة' || user.displayName.includes('[تجريبي]')) {
        user.displayName = knownStaffNames[user.email];
        persistUserSession(user);
      }
    }

    return user;
  } catch (e) {
    console.warn('Could not read or normalize the cached user profile:', e);
    return null;
  }
}

function clearCachedUserSession() {
  clearStoredUserSession();
}

/**
 * Switch active role and identity for family accounts (Student vs. Parent)
 * Stores preference in localStorage and browser cookies
 */
/**
 * Get current user role
 */
export function getCurrentRole() {
  const user = getCurrentUser();
  return user ? user.role : null;
}

/**
 * Log out from Firebase and clear browser session
 */
export async function logout() {
  const user = getCurrentUser();
  if (user) {
    recordAuditEvent({
      action: 'تسجيل خروج آمن من المنظومة',
      target: 'بوابة تسجيل الخروج',
      details: `إنهاء الجلسة الرسمية للحساب (${user.displayName || user.email})`,
      category: 'auth',
      operatorName: user.displayName,
      operatorRole: user.role,
      operatorEmail: user.email,
      schoolId: user.schoolId || 'zewail-school',
    }).catch(() => {});
  }

  try {
    await signOut(auth);
  } catch (err) {
    console.error('Sign out failed; the saved session was preserved:', err);
    window.alert('تعذر إنهاء جلسة Firebase. لم تُمسح بيانات الجلسة؛ تحقق من الاتصال ثم أعد تسجيل الخروج.');
    return;
  }

  clearCachedUserSession();
  try {
    const storage = globalThis.localStorage;
    for (const prefix of [
      'dse_students_',
      'dse_grades_',
      'dse_attendance_',
      'dse_tablet_devices_',
      'dse_tablet_batches_',
      'dse_notifications_',
      'dse_dismissals_',
    ]) {
      for (let index = storage.length - 1; index >= 0; index -= 1) {
        const key = storage.key(index);
        if (key?.startsWith(prefix)) storage.removeItem(key);
      }
    }
    storage.removeItem('dse_parent_children_codes');
    storage.removeItem('dse_active_student_code');
    storage.removeItem('dse_parent_active_child_code');
  } catch (error) {
    console.warn('Could not clear cached school data during logout:', error);
  }
  const isInsideDashboard = window.location.pathname.includes('/dashboard/');
  if (window.location.pathname.startsWith('/platform-admin/')) {
    window.location.replace('/platform-admin/');
  } else {
    window.location.replace(isInsideDashboard ? '../login.html' : 'login.html');
  }
}

/**
 * Reactive listener for Firebase Auth State changes
 */
export function observeAuthState(callback) {
  return onAuthStateChanged(auth, async (firebaseUser) => {
    if (!firebaseUser) {
      callback(null);
      return;
    }

    try {
      const userDocRef = doc(db, 'users', firebaseUser.uid);
      const userSnapshot = await getDoc(userDocRef);
      const userData = userSnapshot.exists() ? userSnapshot.data() : null;
      if (!userData || !ROLES_METADATA[userData.role] ||
        (userData.role !== 'super_admin' && !userData.schoolId) ||
        (userData.status && userData.status !== 'active')) {
        clearCachedUserSession();
        callback(null);
        return;
      }
      const profile = {
        uid: firebaseUser.uid,
        email: firebaseUser.email,
        displayName: firebaseUser.displayName || 'مستخدم المنظومة',
        ...userData,
        schoolId: userData.schoolId,
      };
      
      const knownStaffNames = {
        'director@dse.edu.eg': 'د. طارق محمود المنشاوي',
        'tech@dse.edu.eg': 'م. حسام الدين عبد العزيز',
        'affairs@dse.edu.eg': 'أ. محمود عبد الرحمن سالم',
        'teacher@dse.edu.eg': 'أ. إبراهيم فؤاد القاضي',
        'student@dse.edu.eg': 'يوسف أحمد المنشاوي',
        'parent@dse.edu.eg': 'أ. أحمد المنشاوي',
        'social@dse.edu.eg': 'أ. نادية مصطفى الشريف',
        'superadmin@dse.edu.eg': 'د. خالد السعيد عبد الحميد',
      };

      if (knownStaffNames[profile.email]) {
        profile.displayName = knownStaffNames[profile.email];
      } else if (!profile.displayName || profile.displayName === 'طالب' || profile.displayName === 'ولي أمر' || profile.displayName.includes('[تجريبي]') || profile.displayName === 'مستخدم المنظومة') {
        const meta = ROLES_METADATA[profile.role];
        if (meta) {
          profile.displayName = meta.titleAr;
        }
      }

      persistUserSession(profile);
      callback(profile);
    } catch (err) {
      console.error('Error fetching user profile doc:', err);
      callback(null);
    }
  });
}

/**
 * Update authenticated user personal profile
 */
export async function updateUserProfile(updates = {}) {
  const currentUser = getCurrentUser();
  if (!currentUser) throw new Error('Unauthenticated');
  if (Object.keys(updates).some((key) => key !== 'phone') || typeof updates.phone !== 'string') {
    throw new Error('يمكن تعديل رقم الهاتف فقط من الملف الشخصي.');
  }

  const phone = updates.phone.trim();
  if (phone.length > 32) throw new Error('رقم الهاتف طويل أكثر من اللازم.');
  if (phone && !/^\+?[\d\s()-]{6,32}$/.test(phone)) {
    throw new Error('أدخل رقم هاتف صحيحًا.');
  }

  const userDocRef = doc(db, 'users', currentUser.uid);
  const updated = {
    ...currentUser,
    phone,
    updatedAt: new Date().toISOString()
  };

  await setDoc(userDocRef, { phone, updatedAt: updated.updatedAt }, { merge: true });

  persistUserSession(updated);
  return updated;
}
