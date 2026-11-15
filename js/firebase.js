// ==========================================================================
// DIGITAL SCHOOL ECOSYSTEM (VANILLA EDITION)
// Official Firebase Modular SDK Bridge (CDN ESM)
// ==========================================================================

import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js';
import {
  getAuth,
  signInWithEmailAndPassword,
  EmailAuthProvider,
  reauthenticateWithCredential,
  sendSignInLinkToEmail,
  isSignInWithEmailLink,
  signInWithEmailLink,
  createUserWithEmailAndPassword,
  updatePassword,
  signOut,
  onAuthStateChanged,
  updateProfile,
  setPersistence,
  browserLocalPersistence,
  connectAuthEmulator,
  signInAnonymously,
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';
import {
  getFirestore,
  arrayUnion,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  collection,
  query,
  where,
  getDocs,
  onSnapshot,
  addDoc,
  serverTimestamp,
  orderBy,
  limit,
  runTransaction,
  writeBatch,
  connectFirestoreEmulator,
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';
import { FIREBASE_CONFIG, USE_LOCAL_FIREBASE_EMULATORS } from './config.js';

// Initialize core Firebase app singletons
export const firebaseApp = initializeApp(FIREBASE_CONFIG);
export const auth = getAuth(firebaseApp);
export const db = getFirestore(firebaseApp);

if (USE_LOCAL_FIREBASE_EMULATORS) {
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  connectFirestoreEmulator(db, '127.0.0.1', 8080);
}

// Resolve persistence before protected routes inspect the restored auth state.
export const authPersistenceReady = (() => {
  try {
    return setPersistence(auth, browserLocalPersistence).catch((error) => {
      console.warn('Firebase persistence warning:', error);
    });
  } catch (error) {
    console.warn('Firebase persistence setup notice:', error);
    return Promise.resolve();
  }
})();

// Helper to check if Firebase is available
export function isFirebaseAvailable() {
  return Boolean(db && firebaseApp);
}

// Re-export Modular Auth utilities
export {
  signInWithEmailAndPassword,
  EmailAuthProvider,
  reauthenticateWithCredential,
  sendSignInLinkToEmail,
  isSignInWithEmailLink,
  signInWithEmailLink,
  createUserWithEmailAndPassword,
  updatePassword,
  signOut,
  onAuthStateChanged,
  updateProfile,
  signInAnonymously,
};

// Re-export Modular Firestore utilities
export {
  arrayUnion,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  collection,
  query,
  where,
  getDocs,
  onSnapshot,
  addDoc,
  serverTimestamp,
  orderBy,
  limit,
  runTransaction,
  writeBatch,
};

