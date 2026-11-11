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
  serverTimestamp,
} from '../firebase.js';
import { DEFAULT_SCHOOL_ID } from './school-service.js';
import { recordAuditEvent } from './audit-service.js';
import { createNotification } from './notification-service.js';

const CACHE_KEY_PREFIX = 'dse_gate_passes_';
const CACHE_VERSION = 'v1';
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

// Default demo gate passes
const DEFAULT_GATE_PASSES = [
  {
    id: 'gp_001',
    studentCode: '2026101',
    studentName: 'يوسف أحمد المنشاوي',
    studentClass: 'الصف الأول الثانوي — فصل 1/1',
    reasonId: 'medical',
    reasonLabel: 'حالة مرضية / إسعاف طبي',
    reasonDetails: 'صداع شديد ودوخة — تم إبلاغ ولي الأمر هاتفياً',
    exitTime: '2026-11-03T10:30:00',
    status: 'used',
    approvedBy: 'أ. محمود عبد الرحمن سالم',
    approvedAt: '2026-11-03T10:25:00',
    parentNotified: true,
    parentName: 'أ. أحمد المنشاوي',
    parentPhone: '01012345678',
    securityConfirmedExit: true,
    securityExitTime: '2026-11-03T10:32:00',
    qrToken: 'GP-2026-001-YAM',
    createdAt: '2026-11-03T10:20:00',
  },
  {
    id: 'gp_002',
    studentCode: '2026103',
    studentName: 'زياد محمود عبد الرحمن',
    studentClass: 'الصف الأول الثانوي — فصل 1/1',
    reasonId: 'parent_request',
    reasonLabel: 'طلب ولي الأمر (تواصل هاتفي)',
    reasonDetails: 'اتصل ولي الأمر لاصطحاب الطالب لموعد طبي',
    exitTime: '2026-11-05T11:00:00',
    status: 'used',
    approvedBy: 'أ. محمود عبد الرحمن سالم',
    approvedAt: '2026-11-05T10:55:00',
    parentNotified: true,
    parentName: 'أ. محمود عبد الرحمن',
    parentPhone: '01098765432',
    securityConfirmedExit: true,
    securityExitTime: '2026-11-05T11:05:00',
    qrToken: 'GP-2026-002-ZMR',
    createdAt: '2026-11-05T10:50:00',
  },
  {
    id: 'gp_003',
    studentCode: '2026102',
    studentName: 'مريم أحمد المنشاوي',
    studentClass: 'الصف الأول الثانوي — فصل 1/2',
    reasonId: 'official_appointment',
    reasonLabel: 'موعد رسمي (جهة حكومية / سفارة)',
    reasonDetails: 'موعد استخراج جواز سفر — مصلحة الجوازات',
    exitTime: null,
    status: 'pending',
    approvedBy: null,
    approvedAt: null,
    parentNotified: false,
    parentName: 'أ. أحمد المنشاوي',
    parentPhone: '01012345678',
    securityConfirmedExit: false,
    securityExitTime: null,
    qrToken: 'GP-2026-003-MAM',
    createdAt: new Date().toISOString(),
  },
];

/**
 * Generate a unique QR token for a gate pass
 */
function generateQRToken(studentCode) {
  const ts = Date.now().toString(36).toUpperCase();
  const initials = studentCode.slice(-3);
  return `GP-${new Date().getFullYear()}-${ts}-${initials}`;
}

/**
 * Retrieve all gate passes for the school
 */
export async function getGatePasses(schoolId = DEFAULT_SCHOOL_ID) {
  const cacheKey = getCacheKey(schoolId);

  // Try cache first
  try {
    const cached = localStorage.getItem(cacheKey);
    if (cached) {
      const parsed = JSON.parse(cached);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch (e) {
    console.warn('Gate pass cache read error:', e);
  }

  // Try Firestore
  try {
    const snap = await getDocs(collection(db, 'schools', schoolId, 'gate_passes'));
    if (!snap.empty) {
      const passes = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      localStorage.setItem(cacheKey, JSON.stringify(passes));
      return passes;
    }
  } catch (e) {
    console.warn('Gate pass Firestore read error:', e);
  }

  // Fallback to defaults
  localStorage.setItem(cacheKey, JSON.stringify(DEFAULT_GATE_PASSES));
  return [...DEFAULT_GATE_PASSES];
}

/**
 * Create a new gate pass request
 */
export async function createGatePass(passData, schoolId = DEFAULT_SCHOOL_ID) {
  const id = `gp_${Date.now()}`;
  const qrToken = generateQRToken(passData.studentCode);
  const record = {
    id,
    ...passData,
    status: GATE_PASS_STATUS.PENDING,
    qrToken,
    securityConfirmedExit: false,
    securityExitTime: null,
    createdAt: new Date().toISOString(),
  };

  try {
    await setDoc(doc(db, 'schools', schoolId, 'gate_passes', id), {
      ...record,
      updatedAt: serverTimestamp(),
    }, { merge: true });
  } catch (e) {
    console.warn('Gate pass Firestore write error:', e);
  }

  // Update cache
  const passes = await getGatePasses(schoolId);
  passes.unshift(record);
  localStorage.setItem(getCacheKey(schoolId), JSON.stringify(passes));

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
    await updateDoc(doc(db, 'schools', schoolId, 'gate_passes', passId), {
      ...update,
      updatedAt: serverTimestamp(),
    });
  } catch (e) {
    console.warn('Gate pass approve Firestore error:', e);
  }

  // Update cache
  const passes = await getGatePasses(schoolId);
  const idx = passes.findIndex((p) => p.id === passId);
  if (idx !== -1) {
    Object.assign(passes[idx], update);
    localStorage.setItem(getCacheKey(schoolId), JSON.stringify(passes));

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
    await updateDoc(doc(db, 'schools', schoolId, 'gate_passes', passId), {
      ...update,
      updatedAt: serverTimestamp(),
    });
  } catch (e) {
    console.warn('Gate pass reject Firestore error:', e);
  }

  const passes = await getGatePasses(schoolId);
  const idx = passes.findIndex((p) => p.id === passId);
  if (idx !== -1) {
    Object.assign(passes[idx], update);
    localStorage.setItem(getCacheKey(schoolId), JSON.stringify(passes));
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
    await updateDoc(doc(db, 'schools', schoolId, 'gate_passes', passId), {
      ...update,
      updatedAt: serverTimestamp(),
    });
  } catch (e) {
    console.warn('Gate pass security confirm Firestore error:', e);
  }

  const passes = await getGatePasses(schoolId);
  const idx = passes.findIndex((p) => p.id === passId);
  if (idx !== -1) {
    Object.assign(passes[idx], update);
    localStorage.setItem(getCacheKey(schoolId), JSON.stringify(passes));

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
  const passes = await getGatePasses(schoolId);
  const pass = passes.find((p) => p.qrToken === qrToken);
  if (!pass) return { valid: false, message: 'رمز التصريح غير موجود في قاعدة البيانات' };

  if (pass.status === GATE_PASS_STATUS.REJECTED) {
    return { valid: false, message: 'هذا التصريح مرفوض', pass };
  }
  if (pass.status === GATE_PASS_STATUS.USED) {
    return { valid: true, used: true, message: 'تم استخدام هذا التصريح مسبقاً', pass };
  }
  if (pass.status === GATE_PASS_STATUS.APPROVED) {
    return { valid: true, used: false, message: 'تصريح معتمد وجاهز للاستخدام', pass };
  }
  return { valid: false, message: 'التصريح في انتظار الموافقة', pass };
}

