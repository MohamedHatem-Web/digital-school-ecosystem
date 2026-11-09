// ==========================================================================
// DIGITAL SCHOOL ECOSYSTEM (VANILLA EDITION)
// Unified Notification & School Dismissal Service (Cloud Firestore)
// ==========================================================================

import {
  db,
  collection,
  doc,
  getDocs,
  setDoc,
  serverTimestamp,
} from '../firebase.js';
import { DEFAULT_SCHOOL_ID } from './school-service.js';
import { recordAuditEvent } from './audit-service.js';

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

export const DEFAULT_DISMISSALS = [
  {
    id: 'dsm_default_today',
    timestamp: new Date().toISOString(),
    formattedTime: 'اليوم — 02:00 م',
    message: 'تم إعلان انتهاء اليوم الدراسي رسميًا ومغادرة الطلاب عبر البوابات الرئيسية تحت إشراف مسؤولي الأمن وشؤون الطلاب.',
    authorizedBy: 'د. طارق محمود المنشاوي (مدير المدرسة)',
    status: 'completed',
    schoolId: DEFAULT_SCHOOL_ID,
  }
];

/**
 * Fetch school dismissal events
 */
export async function getSchoolDismissals(schoolId = DEFAULT_SCHOOL_ID) {
  const cacheKey = `${CACHE_DISMISSALS_KEY}${schoolId}`;
  const cached = localStorage.getItem(cacheKey);
  if (cached) {
    try {
      const parsed = JSON.parse(cached);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
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

  const initial = DEFAULT_DISMISSALS.map(d => ({ ...d, schoolId }));
  localStorage.setItem(cacheKey, JSON.stringify(initial));
  return initial;
}

/**
 * Create an in-app notification
 */
export async function createNotification({ title, body, category = 'general', targetRole = 'all' }, schoolId = DEFAULT_SCHOOL_ID) {
  const notifId = `ntf_${Date.now()}`;
  const notifData = {
    id: notifId,
    title,
    body,
    category, // dismissal | attendance | grade | warning | announcement
    targetRole,
    date: new Date().toISOString(),
    isRead: false,
    schoolId,
  };

  try {
    const docRef = doc(db, 'schools', schoolId, 'notifications', notifId);
    await setDoc(docRef, { ...notifData, serverCreatedAt: serverTimestamp() });
  } catch (e) {
    console.warn('Firestore createNotification notice:', e);
  }

  const existing = await getNotifications(targetRole, schoolId);
  const updated = [notifData, ...existing];
  localStorage.setItem(`${CACHE_NOTIFS_KEY}${schoolId}`, JSON.stringify(updated));
  return notifData;
}

/**
 * Get in-app notifications
 */
export async function getNotifications(targetRole = 'all', schoolId = DEFAULT_SCHOOL_ID) {
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
