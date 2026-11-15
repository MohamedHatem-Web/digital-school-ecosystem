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

export const DEFAULT_DISCIPLINARY_ACTIONS = [];

export const DEFAULT_PARENT_MEETINGS = [];

/**
 * Alias helpers for social view backwards compatibility
 */
export const getDisciplinaryCases = getDisciplinaryActions;
export const issueDisciplinaryWarning = createDisciplinaryAction;
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
    if (cached) {
      try {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed)) return parsed;
      } catch (cacheError) {
        console.warn('Social discipline cache read notice:', cacheError);
      }
    }
    throw new Error(`تعذر تحميل سجل الإنذارات: ${e.message || 'تحقق من الاتصال والصلاحيات.'}`);
  }

  const initial = [];
  localStorage.setItem(cacheKey, JSON.stringify(initial));
  return initial;
}

/**
 * Record and issue a formal disciplinary action (Warning, Suspension, Pledge)
 * Persists the formal action and sends an in-app notification to the parent
 */
export async function createDisciplinaryAction({
  studentCode,
  studentName,
  grade,
  actionType,
  actionTaken,
  severityLevel,
  reason,
  durationDays = null,
  parentName = '',
  parentPhone = '',
  specialistName = 'الأخصائي الاجتماعي',
  specialistRole = 'social_affairs',
  academicYear = '2026/2027',
  className = '',
}, schoolId = DEFAULT_SCHOOL_ID) {
  const cleanName = String(studentName).trim();
  if (!cleanName) throw new Error('يرجى تحديد الطالب المعني بالإجراء.');

  const actionId = `disc_${Date.now()}`;
  const normalizedAction = actionType || actionTaken || 'warning_first';
  const normalizedActionLabel = actionTaken || normalizedAction;
  const normalizedSeverity = severityLevel || 'level_1';
  const actionData = {
    id: actionId,
    studentCode: studentCode || '—',
    studentName: cleanName,
    grade: grade || 'المرحلة الثانوية',
    actionType: normalizedAction,
    actionTaken: normalizedActionLabel,
    severityLevel: normalizedSeverity,
    level: normalizedSeverity,
    reason: reason || 'مخالفة لائحة الانضباط المدرسي المعتمدة',
    durationDays: durationDays ? Number(durationDays) : null,
    date: new Date().toISOString().split('T')[0],
    academicYear,
    className,
    status: 'issued',
    parentName: parentName || 'ولي الأمر',
    parentPhone: parentPhone || '—',
    specialistName,
    schoolId,
    createdAt: new Date().toISOString(),
  };

  const docRef = doc(db, 'schools', schoolId, 'disciplinaryActions', actionId);
  try {
    await setDoc(docRef, { ...actionData, serverCreatedAt: serverTimestamp() });
  } catch (error) {
    throw new Error(`تعذر حفظ الإنذار على خادم المدرسة: ${error.message || 'تحقق من الاتصال والصلاحيات.'}`);
  }

  // Notify the linked parent account in the school portal.
  try {
    await createNotification({
      title: `⚠️ إشعار رسمي من المدرسة: ${actionData.actionTaken}`,
      body: `بشأن الطالب: ${actionData.studentName} — ${actionData.reason}`,
      category: 'warning',
      targetRole: 'parent',
      targetStudentCode: actionData.studentCode,
      requirePersistence: true,
    }, schoolId);
  } catch (error) {
    throw new Error(`تم حفظ الإنذار، لكن تعذر إرسال إشعار ولي الأمر: ${error.message}`);
  }

  const existing = await getDisciplinaryActions(schoolId);
  const updated = [actionData, ...existing.filter(x => x.id !== actionId)];
  localStorage.setItem(`${CACHE_DISCIPLINE_KEY}${schoolId}`, JSON.stringify(updated));

  await recordAuditEvent({
    action: `إصدار قرار أو إنذار انضباطي (${actionData.actionType})`,
    target: `طالب: ${cleanName} (كود: ${actionData.studentCode})`,
    details: `السبب: ${actionData.reason} | ولي الأمر: ${actionData.parentName}`,
    operatorName: specialistName,
    operatorRole: specialistRole,
    schoolId,
  });

  return actionData;
}

export async function getSocialIncidents(schoolId = DEFAULT_SCHOOL_ID) {
  try {
    const snapshot = await getDocs(collection(db, 'schools', schoolId, 'socialIncidents'));
    return snapshot.docs
      .map((incidentDoc) => ({ id: incidentDoc.id, ...incidentDoc.data() }))
      .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
  } catch (error) {
    throw new Error(`تعذر تحميل سجل المواقف اليومية: ${error.message || 'تحقق من الاتصال والصلاحيات.'}`);
  }
}

export async function createSocialIncident({
  studentCode,
  studentName,
  grade = '',
  className = '',
  incidentType,
  date = new Date().toISOString().slice(0, 10),
  description,
  regulation = '',
  academicYear = '2026/2027',
  recordedBy = 'الأخصائي الاجتماعي',
  recordedByRole = 'social_affairs',
}, schoolId = DEFAULT_SCHOOL_ID) {
  if (!String(studentCode || '').trim() || !String(studentName || '').trim()) {
    throw new Error('يرجى اختيار طالب من السجل الرسمي.');
  }
  if (!String(description || '').trim()) throw new Error('يرجى كتابة تفاصيل الموقف.');
  if (!String(incidentType || '').trim()) throw new Error('يرجى تحديد نوع الموقف.');

  const incidentId = `incident_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const incident = {
    id: incidentId,
    studentCode: String(studentCode).trim(),
    studentName: String(studentName).trim(),
    grade,
    className,
    incidentType,
    date,
    description: String(description).trim(),
    regulation,
    academicYear,
    recordedBy,
    recordedByRole,
    schoolId,
    createdAt: new Date().toISOString(),
  };
  try {
    await setDoc(doc(db, 'schools', schoolId, 'socialIncidents', incidentId), {
      ...incident,
      serverCreatedAt: serverTimestamp(),
    });
  } catch (error) {
    throw new Error(`تعذر حفظ الموقف على خادم المدرسة: ${error.message || 'تحقق من الاتصال والصلاحيات.'}`);
  }

  await recordAuditEvent({
    action: 'تسجيل موقف يومي في سجل الخدمة الاجتماعية',
    target: `${incident.studentName} (${incident.studentCode})`,
    details: `${incident.incidentType} — ${incident.regulation || 'دون تصنيف لائحي'} — ${incident.description}`,
    operatorName: recordedBy,
    operatorRole: recordedByRole,
    category: 'social',
    schoolId,
  });
  return incident;
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

  const initial = [];
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
