// ==========================================================================
// DIGITAL SCHOOL ECOSYSTEM (VANILLA EDITION)
// Gate Pass Service — Early Exit Permits & Security Gate Management
// ==========================================================================

import {
  db,
  collection,
  doc,
  getDocs,
  setDoc,
  updateDoc,
  onSnapshot,
  serverTimestamp,
} from '../firebase.js';
import { DEFAULT_SCHOOL_ID } from './school-service.js';
import { recordAuditEvent } from './audit-service.js';
import { createNotification } from './notification-service.js';
import { generateVerificationToken, getVerifiedDocument, registerVerifiedDocument, updateVerifiedDocumentStatus } from './qr-service.js';

const CACHE_KEY_PREFIX = 'dse_gate_passes_';
const CACHE_VERSION = 'v2';
const getCacheKey = (schoolId) => `${CACHE_KEY_PREFIX}${CACHE_VERSION}_${schoolId}`;

// Gate pass statuses
export const GATE_PASS_STATUS = {
  PENDING: 'pending',
  APPROVED: 'approved',
  USED: 'used',
  REJECTED: 'rejected',
  EXPIRED: 'expired',
};

// Exit reason categories
export const EXIT_REASONS = [
  { id: 'medical', label: 'حالة مرضية / إسعاف طبي', icon: '🏥' },
  { id: 'family_emergency', label: 'ظرف عائلي طارئ', icon: '👨‍👩‍👦' },
  { id: 'official_appointment', label: 'موعد رسمي (جهة حكومية / سفارة)', icon: '🏛️' },
  { id: 'parent_request', label: 'طلب ولي الأمر (تواصل هاتفي)', icon: '📞' },
  { id: 'exam_finished', label: 'انتهاء امتحان مبكر', icon: '📝' },
  { id: 'other', label: 'سبب آخر (يُذكر)', icon: '📋' },
];

/**
 * Generate a unique QR token for a gate pass
 */
/**
 * Retrieve all gate passes for the school
 */
export async function getGatePasses(schoolId = DEFAULT_SCHOOL_ID) {
  const cacheKey = getCacheKey(schoolId);
  try {
    const snap = await getDocs(collection(db, 'schools', schoolId, 'gate_passes'));
    const passes = snap.docs.map((passDoc) => ({ ...passDoc.data(), id: passDoc.id }));
    passes.sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
    localStorage.setItem(cacheKey, JSON.stringify(passes));
    return passes;
  } catch (e) {
    console.warn('Gate pass Firestore read failed:', e);
    throw new Error('تعذر تحميل تصاريح الخروج من خادم المدرسة. تحقق من الاتصال والصلاحيات ثم أعد المحاولة.');
  }
}

export function subscribeToGatePasses(onUpdate, onError = () => {}, schoolId = DEFAULT_SCHOOL_ID) {
  const cacheKey = getCacheKey(schoolId);
  return onSnapshot(collection(db, 'schools', schoolId, 'gate_passes'), (snapshot) => {
    const passes = snapshot.docs.map((passDoc) => ({ ...passDoc.data(), id: passDoc.id }));
    passes.sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
    localStorage.setItem(cacheKey, JSON.stringify(passes));
    onUpdate(passes);
  }, (error) => {
    console.warn('Gate pass live updates failed:', error);
    onError(error);
  });
}

/**
 * Create a new gate pass request
 */
export async function createGatePass(passData, schoolId = DEFAULT_SCHOOL_ID) {
  const id = `gp_${Date.now()}`;
  const qrToken = generateVerificationToken('GP', passData.studentCode);
  const record = {
    id,
    ...passData,
    status: GATE_PASS_STATUS.PENDING,
    qrToken,
    schoolId,
    securityConfirmedExit: false,
    securityExitTime: null,
    createdAt: new Date().toISOString(),
  };

  try {
    await setDoc(doc(db, 'schools', schoolId, 'gate_passes', id), {
      ...record,
      updatedAt: serverTimestamp(),
    });
  } catch (e) {
    console.warn('Gate pass Firestore write failed:', e);
    throw new Error('تعذر حفظ تصريح الخروج على خادم المدرسة؛ لم يتم إصدار التصريح.');
  }

  await registerVerifiedDocument({
    token: qrToken,
    documentType: 'gate_pass',
    studentName: passData.studentName,
    studentCode: passData.studentCode,
    grade: passData.grade,
    className: passData.studentClass || passData.className,
    academicYear: passData.academicYear || '',
    status: GATE_PASS_STATUS.PENDING,
  }, schoolId);

  const passes = JSON.parse(localStorage.getItem(getCacheKey(schoolId)) || '[]');
  localStorage.setItem(getCacheKey(schoolId), JSON.stringify([record, ...passes.filter((pass) => pass.id !== id)]));

  await recordAuditEvent({
    action: 'gate_pass_created',
    entityType: 'gate_pass',
    entityId: id,
    details: `تصريح خروج مبكر للطالب ${passData.studentName} — السبب: ${passData.reasonLabel}`,
  }, schoolId);

  return record;
}

/**
 * Approve a gate pass
 */
export async function approveGatePass(passId, approverName, schoolId = DEFAULT_SCHOOL_ID) {
  const now = new Date().toISOString();
  const update = {
    status: GATE_PASS_STATUS.APPROVED,
    approvedBy: approverName,
    approvedAt: now,
  };

  try {
    await updateDoc(doc(db, 'schools', schoolId, 'gate_passes', passId), { ...update, updatedAt: serverTimestamp() });
  } catch (e) {
    console.warn('Gate pass approve Firestore failed:', e);
    throw new Error('تعذر اعتماد التصريح على خادم المدرسة؛ لم يتغير وضعه.');
  }

  const passes = await getGatePasses(schoolId);
  const idx = passes.findIndex((p) => p.id === passId);
  if (idx !== -1) {
    Object.assign(passes[idx], update);
    localStorage.setItem(getCacheKey(schoolId), JSON.stringify(passes));
    await ensureGatePassVerification(passes[idx], schoolId, GATE_PASS_STATUS.APPROVED, { approvedAt: now });

    // Send notification to parent
    await createNotification({
      title: '🚪 تصريح خروج مبكر معتمد',
      body: `تم اعتماد تصريح خروج مبكر للطالب/ة ${passes[idx].studentName} بواسطة ${approverName}. السبب: ${passes[idx].reasonLabel}`,
      category: 'gate_pass',
      targetRole: 'parent',
    }, schoolId);
  }

  await recordAuditEvent({
    action: 'gate_pass_approved',
    entityType: 'gate_pass',
    entityId: passId,
    details: `اعتماد التصريح بواسطة ${approverName}`,
  }, schoolId);

  return passes[idx] || update;
}

/**
 * Reject a gate pass
 */
export async function rejectGatePass(passId, rejectorName, rejectionReason, schoolId = DEFAULT_SCHOOL_ID) {
  const update = {
    status: GATE_PASS_STATUS.REJECTED,
    rejectedBy: rejectorName,
    rejectedAt: new Date().toISOString(),
    rejectionReason,
  };

  try {
    await updateDoc(doc(db, 'schools', schoolId, 'gate_passes', passId), { ...update, updatedAt: serverTimestamp() });
  } catch (e) {
    console.warn('Gate pass reject Firestore failed:', e);
    throw new Error('تعذر رفض التصريح على خادم المدرسة؛ لم يتغير وضعه.');
  }

  const passes = await getGatePasses(schoolId);
  const idx = passes.findIndex((p) => p.id === passId);
  if (idx !== -1) {
    Object.assign(passes[idx], update);
    localStorage.setItem(getCacheKey(schoolId), JSON.stringify(passes));
    await ensureGatePassVerification(passes[idx], schoolId, GATE_PASS_STATUS.REJECTED, { revokedAt: update.rejectedAt });
  }

  await recordAuditEvent({
    action: 'gate_pass_rejected',
    entityType: 'gate_pass',
    entityId: passId,
    details: `رفض التصريح بواسطة ${rejectorName} — السبب: ${rejectionReason}`,
  }, schoolId);
}

/**
 * Alias helpers for gate-pass-view backwards compatibility
 */
export const useGatePass = confirmSecurityExit;
export async function confirmSecurityExit(passId, schoolId = DEFAULT_SCHOOL_ID) {
  const now = new Date().toISOString();
  const update = {
    status: GATE_PASS_STATUS.USED,
    securityConfirmedExit: true,
    securityExitTime: now,
    exitTime: now,
  };

  try {
    await updateDoc(doc(db, 'schools', schoolId, 'gate_passes', passId), { ...update, updatedAt: serverTimestamp() });
  } catch (e) {
    console.warn('Gate pass security confirm Firestore failed:', e);
    throw new Error('تعذر تأكيد الخروج على خادم المدرسة؛ لم يتم إغلاق التصريح.');
  }

  const passes = await getGatePasses(schoolId);
  const idx = passes.findIndex((p) => p.id === passId);
  if (idx !== -1) {
    Object.assign(passes[idx], update);
    localStorage.setItem(getCacheKey(schoolId), JSON.stringify(passes));
    await ensureGatePassVerification(passes[idx], schoolId, GATE_PASS_STATUS.USED, { usedAt: now });

    // Notify parent of actual exit
    await createNotification({
      title: '🚶 خروج الطالب من المدرسة',
      body: `غادر الطالب/ة ${passes[idx].studentName} بوابة المدرسة في تمام الساعة ${new Date(now).toLocaleTimeString('ar-EG')}. رمز التحقق: ${passes[idx].qrToken}`,
      category: 'gate_pass',
      targetRole: 'parent',
    }, schoolId);
  }

  await recordAuditEvent({
    action: 'gate_pass_exit_confirmed',
    entityType: 'gate_pass',
    entityId: passId,
    details: `تأكيد خروج الطالب من البوابة — ${now}`,
  }, schoolId);
}

/**
 * Verify a gate pass by QR token (used by security/public verification page)
 */
export async function verifyGatePassByToken(qrToken, schoolId = DEFAULT_SCHOOL_ID) {
  const record = await getVerifiedDocument(qrToken);
  if (!record || record.documentType !== 'gate_pass' || record.schoolId !== schoolId) {
    return { valid: false, message: 'رمز التصريح غير موجود في سجل التحقق.' };
  }
  if (record.status === 'used') return { valid: true, used: true, message: 'تم استخدام هذا التصريح مسبقًا.', pass: record };
  if (record.status === 'valid') return { valid: true, used: false, message: 'تصريح معتمد وجاهز للاستخدام.', pass: record };
  if (record.status === 'revoked') return { valid: false, message: 'هذا التصريح مرفوض.', pass: record };
  return { valid: false, message: 'التصريح في انتظار الموافقة.', pass: record };
}

async function ensureGatePassVerification(pass, schoolId, status, timestamps = {}) {
  if (!pass?.qrToken) return;
  const verificationStatus = {
    [GATE_PASS_STATUS.PENDING]: 'pending',
    [GATE_PASS_STATUS.APPROVED]: 'valid',
    [GATE_PASS_STATUS.REJECTED]: 'revoked',
    [GATE_PASS_STATUS.USED]: 'used',
  }[status];
  if (!verificationStatus) return;
  const existing = await getVerifiedDocument(pass.qrToken);
  if (existing) {
    await updateVerifiedDocumentStatus(pass.qrToken, verificationStatus, timestamps);
    return;
  }
  const initialStatus = verificationStatus === 'pending' ? 'pending' : 'valid';
  await registerVerifiedDocument({
    token: pass.qrToken,
    documentType: 'gate_pass',
    studentName: pass.studentName,
    studentCode: pass.studentCode,
    grade: pass.grade,
    className: pass.studentClass || pass.className,
    academicYear: pass.academicYear || '',
    status: initialStatus,
  }, schoolId);
  if (initialStatus !== verificationStatus) await updateVerifiedDocumentStatus(pass.qrToken, verificationStatus, timestamps);
}

