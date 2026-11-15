// ==========================================================================
// DIGITAL SCHOOL ECOSYSTEM (VANILLA EDITION)
// Unified Notification & School Dismissal Service (Cloud Firestore)
// ==========================================================================

import {
  db,
  collection,
  doc,
  query,
  where,
  onSnapshot,
  runTransaction,
  getDocs,
  setDoc,
  serverTimestamp,
} from '../firebase.js';
import { DEFAULT_SCHOOL_ID } from './school-service.js';
import { recordAuditEvent } from './audit-service.js';
import { getCurrentUser } from '../auth.js';

const CACHE_NOTIFS_KEY = 'dse_notifications_';
const CACHE_DISMISSALS_KEY = 'dse_dismissals_';

/**
 * Trigger an official School Dismissal Event.
 * Records the dismissal event and notifies parents in real time.
 */
export async function triggerSchoolDismissal({ message, authorizedBy }, schoolId = DEFAULT_SCHOOL_ID) {
  const dismissalId = `dsm_${Date.now()}`;
  const now = new Date();
  const timeFormatted = new Intl.DateTimeFormat('ar-EG', { timeStyle: 'short', dateStyle: 'medium' }).format(now);

  const dismissalData = {
    id: dismissalId,
    timestamp: now.toISOString(),
    formattedTime: timeFormatted,
    message: message || 'تم إعلان انتهاء اليوم الدراسي رسميًا وبدء خروج الطلاب.',
    authorizedBy: authorizedBy || 'إدارة المدرسة',
    status: 'completed',
    schoolId,
  };

  try {
    const docRef = doc(db, 'schools', schoolId, 'dismissals', dismissalId);
    await setDoc(docRef, { ...dismissalData, serverTimestamp: serverTimestamp() });
  } catch (e) {
    console.warn('Firestore triggerSchoolDismissal notice:', e);
  }

  // Create corresponding in-app notification for parents
  await createNotification({
    title: 'إشعار انصراف رسمي — انتهاء اليوم الدراسي',
    body: `${dismissalData.message} (${timeFormatted})`,
    category: 'dismissal',
    targetRole: 'parent',
  }, schoolId);

  const existing = await getSchoolDismissals(schoolId);
  const updated = [dismissalData, ...existing];
  localStorage.setItem(`${CACHE_DISMISSALS_KEY}${schoolId}`, JSON.stringify(updated));

  await recordAuditEvent({
    action: 'اعتماد وإطلاق إشعار انصراف اليوم الدراسي',
    target: 'كافة الفصول والصفوف',
    details: `التوقيت: ${timeFormatted}`,
    operatorRole: 'director',
    schoolId,
  });

  return dismissalData;
}

export const DEFAULT_DISMISSALS = [];

/**
 * Fetch school dismissal events
 */
export async function getSchoolDismissals(schoolId = DEFAULT_SCHOOL_ID) {
  const cacheKey = `${CACHE_DISMISSALS_KEY}${schoolId}`;
  const cached = localStorage.getItem(cacheKey);
  if (cached) {
    try {
      const parsed = JSON.parse(cached);
      if (Array.isArray(parsed)) {
        const realDismissals = parsed.filter((dismissal) => dismissal.id !== 'dsm_default_today');
        if (realDismissals.length > 0) return realDismissals;
        localStorage.removeItem(cacheKey);
      }
    } catch (e) {}
  }

  try {
    const col = collection(db, 'schools', schoolId, 'dismissals');
    const snap = await getDocs(col);
    if (!snap.empty) {
      const list = [];
      snap.forEach((d) => list.push({ id: d.id, ...d.data() }));
      list.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
      localStorage.setItem(cacheKey, JSON.stringify(list));
      return list;
    }
  } catch (e) {
    console.warn('Firestore getSchoolDismissals notice:', e);
  }

  localStorage.setItem(cacheKey, JSON.stringify([]));
  return [];
}

/**
 * Create an in-app notification
 */
export async function createNotification({
  title,
  body,
  category = 'general',
  targetRole = 'all',
  targetStudentCode = '',
  notificationId = '',
  alertType = '',
  academicYear = '',
  attendanceStage = '',
  attendanceStatus = '',
  isResolved = false,
  absenceDays = null,
  consecutiveDays = null,
  deduplicate = false,
  requirePersistence = false,
}, schoolId = DEFAULT_SCHOOL_ID) {
  const notifId = notificationId || `ntf_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const notifData = {
    id: notifId,
    title,
    body,
    category, // dismissal | attendance | grade | warning | announcement
    targetRole,
    targetStudentCode: String(targetStudentCode || ''),
    alertType,
    academicYear,
    attendanceStage,
    attendanceStatus,
    isResolved,
    absenceDays,
    consecutiveDays,
    date: new Date().toISOString(),
    isRead: false,
    schoolId,
  };

  const docRef = doc(db, 'schools', schoolId, 'notifications', notifId);
  try {
    if (deduplicate) {
      const created = await runTransaction(db, async (transaction) => {
        const existing = await transaction.get(docRef);
        if (existing.exists()) return false;
        transaction.set(docRef, { ...notifData, serverCreatedAt: serverTimestamp() });
        return true;
      });
      if (!created) return notifData;
    } else {
      await setDoc(docRef, { ...notifData, serverCreatedAt: serverTimestamp() });
    }
  } catch (error) {
    if (requirePersistence) {
      throw new Error(`تعذر حفظ الإشعار على خادم المدرسة: ${error.message || 'تحقق من الاتصال والصلاحيات.'}`);
    }
    console.warn('Firestore createNotification notice:', error);
  }

  const existing = await getNotifications(targetRole, schoolId);
  const updated = [notifData, ...existing];
  localStorage.setItem(`${CACHE_NOTIFS_KEY}${schoolId}`, JSON.stringify(updated));
  return notifData;
}

/**
 * Get in-app notifications
 */
export async function getNotifications(targetRole = 'all', schoolId = DEFAULT_SCHOOL_ID, targetStudentCodes = []) {
  const user = getCurrentUser();
  if (user?.role === 'teacher') {
    if (!user.classId) return [];
    try {
      const roster = await getDocs(query(
        collection(db, 'schools', schoolId, 'students'),
        where('classId', '==', user.classId)
      ));
      const codes = roster.docs.map((studentDoc) => String(studentDoc.data().code || '').trim()).filter(Boolean);
      const notificationsCol = collection(db, 'schools', schoolId, 'notifications');
      const snapshots = await Promise.all(codes.map((code) => getDocs(query(
        notificationsCol,
        where('targetStudentCode', '==', code)
      ))));
      return snapshots.flatMap((snapshot) => snapshot.docs.map((noticeDoc) => ({ id: noticeDoc.id, ...noticeDoc.data() })))
        .sort((a, b) => new Date(b.date) - new Date(a.date));
    } catch (error) {
      console.warn('Teacher notifications load failed:', error);
      return [];
    }
  }
  if (user?.role === 'parent') {
    const linkedCodes = [...new Set(targetStudentCodes.map((code) => String(code || '').trim()).filter(Boolean))];
    if (!linkedCodes.length) return [];
    try {
      const notificationsCol = collection(db, 'schools', schoolId, 'notifications');
      const chunks = [];
      for (let index = 0; index < linkedCodes.length; index += 30) {
        chunks.push(linkedCodes.slice(index, index + 30));
      }

      const snapshots = await Promise.all(chunks.map((codes) => getDocs(query(
        notificationsCol,
        where('targetRole', '==', 'parent'),
        where('targetStudentCode', 'in', codes),
      ))));
      const list = snapshots.flatMap((snapshot) => snapshot.docs.map((noticeDoc) => ({ id: noticeDoc.id, ...noticeDoc.data() })));
      return list.sort((a, b) => new Date(b.date) - new Date(a.date));
    } catch (error) {
      console.warn('Parent notifications load failed:', error);
      throw new Error(`تعذر تحميل إشعارات الأبناء: ${error.message || 'تحقق من الاتصال والصلاحيات.'}`);
    }
  }

  try {
    const col = collection(db, 'schools', schoolId, 'notifications');
    const snap = await getDocs(col);
    const list = [];
    snap.forEach((d) => list.push({ id: d.id, ...d.data() }));
    list.sort((a, b) => new Date(b.date) - new Date(a.date));
    localStorage.setItem(`${CACHE_NOTIFS_KEY}${schoolId}`, JSON.stringify(list));

    if (targetRole === 'all') return list;
    return list.filter((n) => n.targetRole === 'all' || n.targetRole === targetRole);
  } catch (e) {
    console.warn('Firestore getNotifications notice:', e);
    const cached = localStorage.getItem(`${CACHE_NOTIFS_KEY}${schoolId}`);
    return cached ? JSON.parse(cached) : [];
  }
}

export function subscribeToParentNotifications(targetStudentCodes, onNotifications, onError, schoolId = DEFAULT_SCHOOL_ID) {
  const linkedCodes = [...new Set((targetStudentCodes || []).map((code) => String(code || '').trim()).filter(Boolean))];
  if (!linkedCodes.length) {
    onNotifications([]);
    return () => {};
  }

  const notificationsCol = collection(db, 'schools', schoolId, 'notifications');
  const noticesById = new Map();
  const chunks = [];
  for (let index = 0; index < linkedCodes.length; index += 30) {
    chunks.push(linkedCodes.slice(index, index + 30));
  }
  const unsubscribeAll = [];
  try {
    chunks.forEach((codes) => {
      const notificationsQuery = query(
        notificationsCol,
        where('targetRole', '==', 'parent'),
        where('targetStudentCode', 'in', codes),
      );
      const unsubscribe = onSnapshot(notificationsQuery, (snapshot) => {
        for (const [noticeId, notice] of noticesById) {
          if (codes.includes(String(notice.targetStudentCode))) noticesById.delete(noticeId);
        }
        snapshot.forEach((noticeDoc) => noticesById.set(noticeDoc.id, { id: noticeDoc.id, ...noticeDoc.data() }));
        onNotifications([...noticesById.values()].sort((a, b) => new Date(b.date) - new Date(a.date)));
      }, onError);
      unsubscribeAll.push(unsubscribe);
    });
  } catch (error) {
    unsubscribeAll.forEach((unsubscribe) => unsubscribe());
    throw new Error(`تعذر متابعة إشعارات الأبناء مباشرة: ${error.message || 'تحقق من الاتصال والصلاحيات.'}`);
  }

  return () => unsubscribeAll.forEach((unsubscribe) => unsubscribe());
}
