// ==========================================================================
// DIGITAL SCHOOL ECOSYSTEM (VANILLA EDITION)
// Firebase Authentication & Authorization Service
// ==========================================================================

import {
  auth,
  db,
  signInWithEmailAndPassword,
  signOut,
  sendPasswordResetEmail,
  onAuthStateChanged,
  doc,
  getDoc,
  setDoc,
  serverTimestamp,
} from './firebase.js';
import { recordAuditEvent } from './services/audit-service.js';

export const ROLE_DASHBOARDS = {
  super_admin: 'dashboard/admin-overview.html',
  director: 'dashboard/admin-overview.html',
  tech_specialist: 'dashboard/tech-devices.html',
  student_affairs: 'dashboard/student-affairs.html',
  teacher: 'dashboard/teacher-portal.html',
  student: 'dashboard/student-portal.html',
  parent: 'dashboard/parent-portal.html',
  social_affairs: 'dashboard/social-affairs.html',
};

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
    case 'auth/network-request-failed':
      return 'تعذر الاتصال بالخادم، يرجى فحص الاتصال بالإنترنت.';
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
export async function loginWithEmailPassword(emailOrCode, password) {
  let email = emailOrCode.trim();
  
  // If user entered a numeric student code (e.g. 2026101), map to their unified educational email
  if (/^\d+$/.test(email)) {
    if (email === '2026101') {
      email = 'student@dse.edu.eg';
    } else {
      email = `${email}@dse.edu.eg`;
    }
  }

  const credential = await signInWithEmailAndPassword(auth, email, password);
  const firebaseUser = credential.user;

  // Fetch role and schoolId from Firestore users collection
  const userDocRef = doc(db, 'users', firebaseUser.uid);
  const userSnapshot = await getDoc(userDocRef);

  let profile = {
    uid: firebaseUser.uid,
    email: firebaseUser.email,
    displayName: firebaseUser.displayName || 'مستخدم المنظومة',
    role: 'director', // safe fallback
    schoolId: 'sch_cairo_sec_01',
    status: 'active',
  };

  if (userSnapshot.exists()) {
    profile = { ...profile, ...userSnapshot.data(), schoolId: 'sch_cairo_sec_01' };
  } else {
    // If user document is not yet in Firestore, provision default record
    await setDoc(userDocRef, {
      ...profile,
      createdAt: serverTimestamp(),
      lastLogin: serverTimestamp(),
    }, { merge: true });
  }

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
    try {
      await setDoc(userDocRef, { displayName: profile.displayName }, { merge: true });
    } catch (e) {
      // ignore
    }
  } else if (!profile.displayName || profile.displayName === 'طالب' || profile.displayName === 'ولي أمر' || profile.displayName.includes('[تجريبي]') || profile.displayName === 'مستخدم المنظومة') {
    const meta = ROLES_METADATA[profile.role];
    if (meta) {
      profile.displayName = meta.titleAr;
    }
  }

  // Store active profile in persistent local cache so session survives navigation & refreshes
  localStorage.setItem('dse_user_session', JSON.stringify(profile));
  sessionStorage.setItem('dse_user_session', JSON.stringify(profile));

  // Store in persistent browser cookies (30 days) to keep user session alive across tabs and restarts
  try {
    const maxAge = 60 * 60 * 24 * 30; // 30 days
    document.cookie = `dse_user_session=${encodeURIComponent(JSON.stringify(profile))}; path=/; max-age=${maxAge}; SameSite=Lax`;
    document.cookie = `dse_role=${encodeURIComponent(profile.role)}; path=/; max-age=${maxAge}; SameSite=Lax`;
    document.cookie = `dse_user_name=${encodeURIComponent(profile.displayName || '')}; path=/; max-age=${maxAge}; SameSite=Lax`;
  } catch (e) {
    // ignore
  }

  // Record Audit Trail
  recordAuditEvent({
    action: 'تسجيل دخول ناجح إلى المنظومة',
    target: 'بوابة الخدمات الإلكترونية',
    details: `تم توثيق الدخول بنجاح لحساب (${profile.displayName})`,
    category: 'auth',
    operatorName: profile.displayName,
    operatorRole: profile.role,
    operatorEmail: profile.email,
    schoolId: profile.schoolId || 'sch_cairo_sec_01',
  }).catch(() => {});

  return profile;
}

/**
 * Get current session profile from storage cache (checks localStorage first, then cookies)
 */
export function getCurrentUser() {
  let sessionStr = localStorage.getItem('dse_user_session') || sessionStorage.getItem('dse_user_session');

  // Fallback: recover session from cookie if storage was cleared or in a new browser tab/window
  if (!sessionStr && typeof document !== 'undefined' && document.cookie) {
    const matchCookie = document.cookie.match(/dse_user_session=([^;]+)/);
    if (matchCookie && matchCookie[1]) {
      try {
        sessionStr = decodeURIComponent(matchCookie[1]);
        localStorage.setItem('dse_user_session', sessionStr);
      } catch (err) {}
    }
  }

  if (!sessionStr) return null;
  try {
    const user = JSON.parse(sessionStr);
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
        localStorage.setItem('dse_user_session', JSON.stringify(user));
        sessionStorage.setItem('dse_user_session', JSON.stringify(user));
      }
    }

    // Check if a cookie override exists for family role (Student vs. Parent)
    if (typeof document !== 'undefined' && document.cookie) {
      const matchRole = document.cookie.match(/dse_role=([^;]+)/);
      if (matchRole && matchRole[1] && (user.role === 'student' || user.role === 'parent' || user.email === 'student@dse.edu.eg' || user.email === 'parent@dse.edu.eg')) {
        user.role = matchRole[1].trim();
        user.displayName = user.role === 'parent' ? 'أ. أحمد المنشاوي' : 'يوسف أحمد المنشاوي';
      }
    }

    return user;
  } catch (e) {
    return null;
  }
}

/**
 * Switch active role and identity for family accounts (Student vs. Parent)
 * Stores preference in localStorage and browser cookies
 */
export function setFamilySessionRole(targetRole = 'student') {
  const sessionStr = localStorage.getItem('dse_user_session') || sessionStorage.getItem('dse_user_session');
  if (!sessionStr) return null;
  try {
    const user = JSON.parse(sessionStr);
    user.role = targetRole;
    if (targetRole === 'parent') {
      user.displayName = 'أ. أحمد المنشاوي';
    } else {
      user.displayName = 'يوسف أحمد المنشاوي';
    }
    localStorage.setItem('dse_user_session', JSON.stringify(user));
    sessionStorage.setItem('dse_user_session', JSON.stringify(user));

    const maxAge = 60 * 60 * 24 * 30; // 30 days
    document.cookie = `dse_role=${targetRole}; path=/; max-age=${maxAge}; SameSite=Lax`;
    document.cookie = `dse_user_name=${encodeURIComponent(user.displayName)}; path=/; max-age=${maxAge}; SameSite=Lax`;
    return user;
  } catch (e) {
    return null;
  }
}

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
      schoolId: user.schoolId || 'sch_cairo_sec_01',
    }).catch(() => {});
  }

  try {
    await signOut(auth);
  } catch (err) {
    console.warn('Sign out warning:', err);
  } finally {
    localStorage.removeItem('dse_user_session');
    sessionStorage.removeItem('dse_user_session');
    // Clear all session cookies
    try {
      document.cookie.split(';').forEach((c) => {
        document.cookie = c.replace(/^ +/, '').replace(/=.*/, '=;expires=' + new Date(0).toUTCString() + ';path=/');
      });
    } catch (e) {
      // ignore
    }
    const isInsideDashboard = window.location.pathname.includes('/dashboard/');
    window.location.replace(isInsideDashboard ? '../login.html' : 'login.html');
  }
}

/**
 * Send password reset email via Firebase Authentication
 */
export async function requestPasswordReset(email) {
  return await sendPasswordResetEmail(auth, email.trim());
}

/**
 * Determine redirect destination after successful login
 */
export function getRoleDashboardUrl(role) {
  return ROLE_DASHBOARDS[role] || 'dashboard/admin-overview.html';
}

/**
 * Reactive listener for Firebase Auth State changes
 */
export function observeAuthState(callback) {
  return onAuthStateChanged(auth, async (firebaseUser) => {
    if (!firebaseUser) {
      sessionStorage.removeItem('dse_user_session');
      callback(null);
      return;
    }

    try {
      const userDocRef = doc(db, 'users', firebaseUser.uid);
      const userSnapshot = await getDoc(userDocRef);
      let profile = {
        uid: firebaseUser.uid,
        email: firebaseUser.email,
        displayName: firebaseUser.displayName || 'مستخدم المنظومة',
        role: 'director',
        schoolId: 'sch_cairo_sec_01',
        status: 'active',
      };
      if (userSnapshot.exists()) {
        profile = { ...profile, ...userSnapshot.data(), schoolId: 'sch_cairo_sec_01' };
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

      if (knownStaffNames[profile.email]) {
        profile.displayName = knownStaffNames[profile.email];
      } else if (!profile.displayName || profile.displayName === 'طالب' || profile.displayName === 'ولي أمر' || profile.displayName.includes('[تجريبي]') || profile.displayName === 'مستخدم المنظومة') {
        const meta = ROLES_METADATA[profile.role];
        if (meta) {
          profile.displayName = meta.titleAr;
        }
      }

      localStorage.setItem('dse_user_session', JSON.stringify(profile));
      sessionStorage.setItem('dse_user_session', JSON.stringify(profile));
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

  const userDocRef = doc(db, 'users', currentUser.uid);
  const updated = {
    ...currentUser,
    ...updates,
    updatedAt: new Date().toISOString()
  };

  try {
    await setDoc(userDocRef, updates, { merge: true });
  } catch (err) {
    console.warn('Could not update Firestore user doc:', err);
  }

  localStorage.setItem('dse_user_session', JSON.stringify(updated));
  sessionStorage.setItem('dse_user_session', JSON.stringify(updated));
  return updated;
}
