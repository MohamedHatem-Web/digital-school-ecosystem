// ==========================================================================
// DIGITAL SCHOOL ECOSYSTEM (VANILLA EDITION)
// Synthetic Demo Environment & Automated QA Seeding
// ==========================================================================

import {
  auth,
  db,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  doc,
  setDoc,
  serverTimestamp,
} from './firebase.js';
import { ROLES_METADATA } from './auth.js';

export const DEMO_SCHOOL_ID = 'sch_cairo_sec_01';

export const DEMO_ACCOUNTS = [
  {
    role: 'super_admin',
    email: 'superadmin@dse.edu.eg',
    password: 'Password@2026',
    displayName: 'د. خالد السعيد عبد الحميد',
  },
  {
    role: 'director',
    email: 'director@dse.edu.eg',
    password: 'Password@2026',
    displayName: 'د. طارق محمود المنشاوي',
  },
  {
    role: 'tech_specialist',
    email: 'tech@dse.edu.eg',
    password: 'Password@2026',
    displayName: 'م. حسام الدين عبد العزيز',
  },
  {
    role: 'student_affairs',
    email: 'affairs@dse.edu.eg',
    password: 'Password@2026',
    displayName: 'أ. محمود عبد الرحمن سالم',
  },
  {
    role: 'teacher',
    email: 'teacher@dse.edu.eg',
    password: 'Password@2026',
    displayName: 'أ. إبراهيم فؤاد القاضي',
  },
  {
    role: 'student',
    email: 'student@dse.edu.eg',
    password: 'Password@2026',
    displayName: 'يوسف أحمد المنشاوي',
  },
  {
    role: 'parent',
    email: 'parent@dse.edu.eg',
    password: 'Password@2026',
    displayName: 'أ. أحمد المنشاوي',
  },
  {
    role: 'social_affairs',
    email: 'social@dse.edu.eg',
    password: 'Password@2026',
    displayName: 'أ. نادية مصطفى الشريف',
  },
];

/**
 * Authenticates or provisions a verified Firebase Auth test account.
 * This performs REAL Firebase Authentication and sets up the Firestore role doc.
 */
export async function authenticateDemoAccount(roleKey) {
  const account = DEMO_ACCOUNTS.find((a) => a.role === roleKey);
  if (!account) throw new Error(`Role ${roleKey} not found in demo accounts`);

  let firebaseUser = null;

  try {
    // Attempt standard sign in
    const cred = await signInWithEmailAndPassword(auth, account.email, account.password);
    firebaseUser = cred.user;
  } catch (err) {
    if (err.code === 'auth/user-not-found' || err.code === 'auth/invalid-credential') {
      // User doesn't exist yet in Firebase project -> create user automatically
      try {
        const createCred = await createUserWithEmailAndPassword(auth, account.email, account.password);
        firebaseUser = createCred.user;
      } catch (createErr) {
        // If password policy or other error, fallback to login attempt
        console.warn('Create demo account notice:', createErr);
        throw createErr;
      }
    } else {
      throw err;
    }
  }

  // Ensure authoritative Firestore user document exists
  const userProfile = {
    uid: firebaseUser.uid,
    email: account.email,
    displayName: account.displayName,
    role: account.role,
    schoolId: DEMO_SCHOOL_ID,
    isDemoAccount: true,
    status: 'active',
    updatedAt: new Date().toISOString(),
  };

  try {
    await setDoc(doc(db, 'users', firebaseUser.uid), {
      ...userProfile,
      serverUpdatedAt: serverTimestamp(),
    }, { merge: true });
  } catch (err) {
    console.warn('Firestore doc write notice:', err);
  }

  sessionStorage.setItem('dse_user_session', JSON.stringify(userProfile));
  return userProfile;
}

