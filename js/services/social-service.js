// ==========================================================================
// DIGITAL SCHOOL ECOSYSTEM (VANILLA EDITION)
// Social Affairs & Confidential Student Cases Service (Cloud Firestore)
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
import { createNotification } from './notification-service.js';

const CACHE_CASES_KEY = 'dse_social_cases_';
const CACHE_MEETINGS_KEY = 'dse_parent_meetings_';
const CACHE_DISCIPLINE_KEY = 'dse_social_discipline_';

export const DEFAULT_DISCIPLINARY_ACTIONS = [
  {
    id: 'disc_2026_01',
    studentCode: '2026103',
    studentName: 'زياد محمود عبد الرحمن',
    grade: 'الصف الأول الثانوي — فصل 1/1',
    actionType: 'إنذار غياب أول (5 أيام)',
    reason: 'انقطاع عن الحضور لمدة 5 أيام متتالية دون تقديم عذر طبي مقبول لإدارة المدرسة',
    date: '2026-10-25',
    status: 'delivered', // delivered | pending | resolved
    parentName: 'أ. محمود عبد الرحمن سالم',
    parentPhone: '01234567890',
    smsSent: true,
    specialistName: 'أ. نادية مصطفى الشريف',
    schoolId: DEFAULT_SCHOOL_ID,
  }
];

export const DEFAULT_PARENT_MEETINGS = [
  {
    id: 'meet_2026_01',
    studentCode: '2026103',
    studentName: 'زياد محمود عبد الرحمن',
    parentName: 'أ. محمود عبد الرحمن سالم',
    parentPhone: '01234567890',
    reason: 'مناقشة انضباط الطالب ونسبة الحضور الصفي ولائحة الانضباط المدرسي',
    appointmentDate: '2026-11-12',
    status: 'scheduled',
    schoolId: DEFAULT_SCHOOL_ID,
    createdAt: '2026-11-05',
  }
];

/**
 * Fetch official disciplinary actions & warnings
 */
export async function getDisciplinaryActions(schoolId = DEFAULT_SCHOOL_ID) {
  const cacheKey = `${CACHE_DISCIPLINE_KEY}${schoolId}`;
  const cached = localStorage.getItem(cacheKey);
  if (cached) {
    try {
      const parsed = JSON.parse(cached);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    } catch (e) {}
  }

  try {
    const col = collection(db, 'schools', schoolId, 'disciplinaryActions');
    const snap = await getDocs(col);
    if (!snap.empty) {
      const list = [];
      snap.forEach((d) => list.push({ id: d.id, ...d.data() }));
      localStorage.setItem(cacheKey, JSON.stringify(list));
      return list;
    }
  } catch (e) {
    console.warn('Firestore getDisciplinaryActions notice:', e);
  }

  const initial = DEFAULT_DISCIPLINARY_ACTIONS.map(d => ({ ...d, schoolId }));
  localStorage.setItem(cacheKey, JSON.stringify(initial));
  return initial;
}

/**
 * Record and issue a formal disciplinary action (Warning, Suspension, Pledge)
 * Dispatches live notification and simulated SMS alert to the parent
 */
export async function createDisciplinaryAction({
  studentCode,
  studentName,
  grade,
  actionType,
  reason,
  durationDays = null,
  parentName = '',
  parentPhone = '',
  specialistName = 'الأخصائي الاجتماعي',
}, schoolId = DEFAULT_SCHOOL_ID) {
  const cleanName = String(studentName).trim();
  if (!cleanName) throw new Error('يرجى تحديد الطالب المعني بالإجراء.');

  const actionId = `disc_${Date.now()}`;
  const actionData = {
    id: actionId,
    studentCode: studentCode || '—',
    studentName: cleanName,
    grade: grade || 'المرحلة الثانوية',
    actionType: actionType || 'إنذار رسمي',
    reason: reason || 'مخالفة لائحة الانضباط المدرسي المعتمدة',
    durationDays: durationDays ? Number(durationDays) : null,
    date: new Date().toISOString().split('T')[0],
    status: 'delivered',
    parentName: parentName || 'ولي الأمر',
    parentPhone: parentPhone || '—',
    smsSent: true,
    specialistName,
    schoolId,
    createdAt: new Date().toISOString(),
  };

  try {
    const docRef = doc(db, 'schools', schoolId, 'disciplinaryActions', actionId);
    await setDoc(docRef, { ...actionData, serverCreatedAt: serverTimestamp() });
  } catch (e) {
    console.warn('Firestore createDisciplinaryAction notice:', e);
  }

  // Create notifications for parent and student
  try {
    await createNotification({
      title: `⚠️ إشعار رسمي من الأخصائي الاجتماعي: ${actionData.actionType}`,
      body: `بشأن الطالب: ${actionData.studentName} — ${actionData.reason}`,
      category: 'warning',
      targetRole: 'parent',
    }, schoolId);
  } catch (e) {}

  const existing = await getDisciplinaryActions(schoolId);
  const updated = [actionData, ...existing.filter(x => x.id !== actionId)];
  localStorage.setItem(`${CACHE_DISCIPLINE_KEY}${schoolId}`, JSON.stringify(updated));

  await recordAuditEvent({
    action: `إصدار قرار أو إنذار انضباطي (${actionData.actionType})`,
    target: `طالب: ${cleanName} (كود: ${actionData.studentCode})`,
    details: `السبب: ${actionData.reason} | ولي الأمر: ${actionData.parentName}`,
    operatorRole: 'social_affairs',
    schoolId,
  });

  return actionData;
}

/**
 * Fetch parent meeting summon requests
 */
export async function getParentMeetings(schoolId = DEFAULT_SCHOOL_ID) {
  const cacheKey = `${CACHE_MEETINGS_KEY}${schoolId}`;
  const cached = localStorage.getItem(cacheKey);
  if (cached) {
    try {
      const parsed = JSON.parse(cached);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    } catch (e) {}
  }

  try {
    const col = collection(db, 'schools', schoolId, 'parentMeetings');
    const snap = await getDocs(col);
    if (!snap.empty) {
      const list = [];
      snap.forEach((d) => list.push({ id: d.id, ...d.data() }));
      localStorage.setItem(cacheKey, JSON.stringify(list));
      return list;
    }
  } catch (e) {
    console.warn('Firestore getParentMeetings notice:', e);
  }

  const initial = DEFAULT_PARENT_MEETINGS.map(m => ({ ...m, schoolId }));
  localStorage.setItem(cacheKey, JSON.stringify(initial));
  return initial;
}

/**
 * Fetch confidential student cases (Restricted to Social Affairs & Director)
 */
export async function getStudentCases(schoolId = DEFAULT_SCHOOL_ID) {
  try {
    const col = collection(db, 'schools', schoolId, 'cases');
    const snap = await getDocs(col);
    const list = [];
    snap.forEach((d) => list.push({ id: d.id, ...d.data() }));
    localStorage.setItem(`${CACHE_CASES_KEY}${schoolId}`, JSON.stringify(list));
    return list;
  } catch (e) {
    console.warn('Firestore getStudentCases notice:', e);
    const cached = localStorage.getItem(`${CACHE_CASES_KEY}${schoolId}`);
    return cached ? JSON.parse(cached) : [];
  }
}

/**
 * Create a confidential student behavioral/social case
 */
export async function createStudentCase({ studentName, studentCode, grade, caseType, description, actionTaken, specialistName }, schoolId = DEFAULT_SCHOOL_ID) {
  const cleanName = String(studentName).trim();
  if (!cleanName) throw new Error('يرجى تحديد اسم الطالب المعني.');

  const caseId = `case_${Date.now()}`;
  const caseData = {
    id: caseId,
    studentName: cleanName,
    studentCode: studentCode || '—',
    grade: grade || 'المرحلة الثانوية',
    caseType: caseType || 'متابعة غياب متكرر', // behavioral | attendance | social | medical
    description: description || '',
    actionTaken: actionTaken || 'جلسة إرشاد فردي واستدعاء ولي الأمر',
    specialistName: specialistName || 'الأخصائي الاجتماعي',
    status: 'open', // open | in_progress | resolved
    date: new Date().toISOString().split('T')[0],
    schoolId,
    confidential: true,
  };

  try {
    const docRef = doc(db, 'schools', schoolId, 'cases', caseId);
    await setDoc(docRef, { ...caseData, serverCreatedAt: serverTimestamp() });
  } catch (e) {
    console.warn('Firestore createStudentCase notice:', e);
  }

  const existing = await getStudentCases(schoolId);
  const updated = [caseData, ...existing];
  localStorage.setItem(`${CACHE_CASES_KEY}${schoolId}`, JSON.stringify(updated));

  await recordAuditEvent({
    action: 'فتح ملف متابعة اجتماعية وسلوكية سرية',
    target: `طالب: ${cleanName}`,
    details: `النوع: ${caseData.caseType}`,
    operatorRole: 'social_affairs',
    schoolId,
  });

  return caseData;
}

/**
 * Create an official Parent Meeting Request
 */
export async function createParentMeeting({ studentName, parentName, reason, appointmentDate }, schoolId = DEFAULT_SCHOOL_ID) {
  const meetingId = `meet_${Date.now()}`;
  const meetingData = {
    id: meetingId,
    studentName: String(studentName).trim(),
    parentName: parentName || 'ولي أمر الطالب',
    reason: reason || 'مناقشة المستوى الدراسي والغياب',
    appointmentDate: appointmentDate || new Date().toISOString().split('T')[0],
    status: 'scheduled',
    schoolId,
    createdAt: new Date().toISOString(),
  };

  try {
    const docRef = doc(db, 'schools', schoolId, 'parentMeetings', meetingId);
    await setDoc(docRef, { ...meetingData, serverCreatedAt: serverTimestamp() });
  } catch (e) {
    console.warn('Firestore createParentMeeting notice:', e);
  }

  try {
    await createNotification({
      title: '📞 استدعاء رسمي لمقابلة الأخصائي الاجتماعي',
      body: `بشأن الطالب: ${meetingData.studentName} — الموعد: ${meetingData.appointmentDate} (${meetingData.reason})`,
      category: 'warning',
      targetRole: 'parent',
    }, schoolId);
  } catch (e) {}

  const existing = await getParentMeetings(schoolId);
  const updated = [meetingData, ...existing.filter(m => m.id !== meetingId)];
  localStorage.setItem(`${CACHE_MEETINGS_KEY}${schoolId}`, JSON.stringify(updated));

  await recordAuditEvent({
    action: 'إصدار إخطار استدعاء ولي أمر رسمي',
    target: `طالب: ${studentName}`,
    details: `الموعد: ${meetingData.appointmentDate} — ${meetingData.reason}`,
    operatorRole: 'social_affairs',
    schoolId,
  });

  return meetingData;
}
