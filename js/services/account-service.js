import { auth, ensureAuthPersistence, onAuthStateChanged } from '../firebase.js';
import { MEDIA_CONFIG } from '../config.js';
import { getTenantSchoolId } from '../tenant-router.js';
import { persistUserSession, readCachedUserSession } from '../session-cache.js';
import {
  EmailAuthProvider,
  reauthenticateWithCredential,
  sendSignInLinkToEmail,
  isSignInWithEmailLink,
  signInWithEmailLink,
  updatePassword,
} from '../firebase.js';

async function waitForFirebaseUser() {
  await ensureAuthPersistence();
  if (typeof auth.authStateReady === 'function') await auth.authStateReady();
  if (auth.currentUser) return Promise.resolve(auth.currentUser);

  return new Promise((resolve, reject) => {
    let unsubscribe = () => {};
    unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      unsubscribe();
      resolve(firebaseUser);
    }, (error) => {
      unsubscribe();
      reject(error);
    });
  });
}

async function postAuthenticated(path, body, forceTokenRefresh = false) {
  const firebaseUser = await waitForFirebaseUser();
  if (!firebaseUser) throw new Error('يجب تسجيل الدخول بحساب مخول قبل متابعة العملية.');
  if (!MEDIA_CONFIG.workerGatewayUrl) throw new Error('خدمة إنشاء الحسابات غير مفعلة؛ عنوان Worker غير مضبوط.');

  const token = await firebaseUser.getIdToken(forceTokenRefresh);
  const response = await fetch(`${MEDIA_CONFIG.workerGatewayUrl.replace(/\/$/, '')}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || 'تعذر إكمال العملية الآمنة.');
  return result;
}

async function postPublic(path, body) {
  if (!MEDIA_CONFIG.workerGatewayUrl) throw new Error('خدمة تفعيل الحسابات غير مفعلة.');
  const response = await fetch(`${MEDIA_CONFIG.workerGatewayUrl.replace(/\/$/, '')}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || 'تعذر إكمال تفعيل الحساب.');
  return result;
}

export async function linkStudentToFamilyAccount({ studentCode, schoolId }) {
  return postAuthenticated('/api/admin/link-student-family', { studentCode, schoolId });
}

export async function completeFirstLoginPasswordChange(newPassword) {
  const result = await postAuthenticated('/api/auth/complete-first-login', { newPassword });
  if (result.success) {
    const updatedProfile = readCachedUserSession();
    if (updatedProfile) {
      updatedProfile.passwordChangeRequired = false;
      persistUserSession(updatedProfile);
    }
  }
  return result;
}

export async function getStudentPortalAttendance(studentCode) {
  const result = await postAuthenticated('/api/portal/student-attendance', { studentCode }, true);
  return Array.isArray(result.records) ? result.records : [];
}

export async function getFamilyStudentRecords() {
  const result = await postAuthenticated('/api/portal/students', {}, true);
  return Array.isArray(result.students) ? result.students : [];
}

export async function sendParentActivationLink(email) {
  await ensureAuthPersistence();
  const normalizedEmail = String(email || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
    throw new Error('أدخل بريدًا إلكترونيًا صحيحًا لولي الأمر.');
  }
  const actionCodeSettings = {
    url: new URL('login.html?flow=parent-activation', window.location.href).href,
    handleCodeInApp: true,
  };
  await sendSignInLinkToEmail(auth, normalizedEmail, actionCodeSettings);
  localStorage.setItem('dse_pending_parent_email', normalizedEmail);
}

export async function completeParentEmailLink(email) {
  if (!isSignInWithEmailLink(auth, window.location.href)) return null;
  await ensureAuthPersistence();
  const normalizedEmail = String(email || localStorage.getItem('dse_pending_parent_email') || '').trim().toLowerCase();
  if (!normalizedEmail) throw new Error('اكتب بريد ولي الأمر الذي استقبل رابط التفعيل.');
  const credential = await signInWithEmailLink(auth, normalizedEmail, window.location.href);
  localStorage.removeItem('dse_pending_parent_email');
  return credential.user;
}

export async function activateParentAccount(firebaseUser = auth.currentUser) {
  if (!firebaseUser || !MEDIA_CONFIG.workerGatewayUrl) {
    throw new Error('تعذر الاتصال بخدمة ربط حساب ولي الأمر.');
  }
  const token = await firebaseUser.getIdToken(true);
  const response = await fetch(`${MEDIA_CONFIG.workerGatewayUrl.replace(/\/$/, '')}/api/family/activate-parent`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || 'تعذر ربط الأبناء بهذا البريد.');
  if (result.profile) {
    persistUserSession(result.profile);
  }
  return result;
}

export async function setParentAccountPassword(password, firebaseUser = auth.currentUser) {
  if (!firebaseUser) throw new Error('جلسة ولي الأمر غير متاحة.');
  await updatePassword(firebaseUser, password);
  await postAuthenticated('/api/family/complete-parent-password', {}, true);
}

export async function requestStudentActivation({ studentCode, nationalId }) {
  return postPublic('/api/family/request-student-activation', { studentCode, nationalId, schoolId: getTenantSchoolId() });
}

export async function getStudentActivationStatus(requestId, activationSecret) {
  return postPublic('/api/family/student-activation-status', { requestId, activationSecret, schoolId: getTenantSchoolId() });
}

export async function completeStudentActivation({ requestId, activationSecret, password }) {
  return postPublic('/api/family/complete-student-activation', { requestId, activationSecret, password, schoolId: getTenantSchoolId() });
}

export async function getStudentActivationRequests() {
  return postAuthenticated('/api/family/activation-requests', {}, true);
}

export async function reviewStudentActivation(requestId, decision) {
  return postAuthenticated('/api/family/review-student-activation', { requestId, decision }, true);
}

export async function changeOwnPassword(currentPassword, newPassword) {
  const firebaseUser = auth.currentUser;
  if (!firebaseUser?.email) throw new Error('تعذر التحقق من الحساب الحالي. سجل الدخول مجددًا.');
  const credential = EmailAuthProvider.credential(firebaseUser.email, currentPassword);
  await reauthenticateWithCredential(firebaseUser, credential);
  await updatePassword(firebaseUser, newPassword);
}

export async function createAccountInvitation(invitation) {
  return postAuthenticated('/api/admin/account-invitations', invitation);
}

export async function migrateSchoolTenant({ sourceSchoolId = 'sch_cairo_sec_01', targetSchoolId = 'zewail-school' } = {}) {
  return postAuthenticated('/api/admin/platform/migrate-school', { sourceSchoolId, targetSchoolId, targetSlug: targetSchoolId });
}

export async function getSchoolApplications() {
  const firebaseUser = await waitForFirebaseUser();
  if (!firebaseUser) throw new Error('يجب تسجيل الدخول كمدير منصة.');
  const token = await firebaseUser.getIdToken(true);
  const response = await fetch(`${MEDIA_CONFIG.workerGatewayUrl.replace(/\/$/, '')}/api/admin/platform/applications`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || 'تعذر تحميل طلبات المدارس.');
  return Array.isArray(result.applications) ? result.applications : [];
}

export async function approveSchoolApplication(applicationId) {
  return postAuthenticated('/api/admin/platform/approve-school', { applicationId });
}

export async function rejectSchoolApplication(applicationId, reason = '') {
  return postAuthenticated('/api/admin/platform/reject-school', { applicationId, reason });
}

export async function getPlatformSuperAdmins() {
  const firebaseUser = await waitForFirebaseUser();
  if (!firebaseUser) throw new Error('يجب تسجيل الدخول كمدير منصة.');
  const token = await firebaseUser.getIdToken(true);
  const response = await fetch(`${MEDIA_CONFIG.workerGatewayUrl.replace(/\/$/, '')}/api/admin/platform/super-admins`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || 'تعذر تحميل مديري المنصة.');
  return Array.isArray(result.superAdmins) ? result.superAdmins : [];
}

export async function invitePlatformSuperAdmin({ email, displayName }) {
  return postAuthenticated('/api/admin/platform/invite-super-admin', { email, displayName });
}

export async function completeAccountInvitationEmailLink(email) {
  if (!isSignInWithEmailLink(auth, window.location.href)) return null;
  const normalizedEmail = String(email || '').trim().toLowerCase();
  if (!normalizedEmail) throw new Error('اكتب البريد الإلكتروني الذي استقبل الدعوة.');
  await ensureAuthPersistence();
  const credential = await signInWithEmailLink(auth, normalizedEmail, window.location.href);
  return credential.user;
}

export async function finishAccountInvitation({ invitationId, password }) {
  const firebaseUser = auth.currentUser;
  if (!firebaseUser?.email) throw new Error('جلسة الدعوة غير متاحة. افتح رابط البريد مرة أخرى.');
  await updatePassword(firebaseUser, password);
  const token = await firebaseUser.getIdToken(true);
  const response = await fetch(`${MEDIA_CONFIG.workerGatewayUrl.replace(/\/$/, '')}/api/auth/complete-account-invitation`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ invitationId }),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || 'تعذر إكمال إعداد الحساب. أعد المحاولة.');
  if (result.profile) {
    persistUserSession(result.profile);
  }
  return result.profile;
}
