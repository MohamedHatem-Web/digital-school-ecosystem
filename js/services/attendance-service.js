// ==========================================================================
// DIGITAL SCHOOL ECOSYSTEM (VANILLA EDITION)
// Official School Daily Attendance & Absences Service (Cloud Firestore)
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

const CACHE_ATTENDANCE_KEY = 'dse_attendance_';

export const DEFAULT_ATTENDANCE_RECORDS = [
  {
    studentCode: '2026101',
    studentName: 'يوسف أحمد المنشاوي',
    grade: 'الصف الأول الثانوي',
    classId: 'فصل 1/1',
    status: 'present', // present | absent | late | excused
    morningAssembly: '07:44 ص',
    uniformCompliant: true,
    date: '2026-11-08',
  },
  {
    studentCode: '2026103',
    studentName: 'زياد محمود عبد الرحمن',
    grade: 'الصف الأول الثانوي',
    classId: 'فصل 1/1',
    status: 'absent',
    morningAssembly: 'لم يحضر',
    uniformCompliant: false,
    date: '2026-11-08',
  },
  {
    studentCode: '2026102',
    studentName: 'مريم أحمد المنشاوي',
    grade: 'الصف الأول الثانوي',
    classId: 'فصل 1/2',
    status: 'present',
    morningAssembly: '07:40 ص',
    uniformCompliant: true,
    date: '2026-11-08',
  }
];

/**
 * Get attendance records for a specific date and class
 */
export async function getClassAttendance(classId, date = new Date().toISOString().split('T')[0], schoolId = DEFAULT_SCHOOL_ID) {
  const cacheKey = `${CACHE_ATTENDANCE_KEY}${schoolId}_${date}_${classId.replace(/\s+/g, '_')}`;
  const cached = localStorage.getItem(cacheKey);
  if (cached) {
    try {
      const parsed = JSON.parse(cached);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    } catch (e) {}
  }

  try {
    const col = collection(db, 'schools', schoolId, 'attendance');
    const snap = await getDocs(col);
    if (!snap.empty) {
      const list = [];
      snap.forEach((d) => {
        const data = d.data();
        if (data.classId === classId && data.date === date) {
          list.push({ id: d.id, ...data });
        }
      });
      if (list.length > 0) {
        localStorage.setItem(cacheKey, JSON.stringify(list));
        return list;
      }
    }
  } catch (e) {
    console.warn('Firestore getClassAttendance notice:', e);
  }

  // Fallback to defaults matching class
  const matches = DEFAULT_ATTENDANCE_RECORDS.filter(r => r.classId === classId);
  return matches.map(m => ({ ...m, date, schoolId }));
}

/**
 * Save and certify class daily attendance
 */
export async function saveClassAttendance({
  grade,
  classId,
  date = new Date().toISOString().split('T')[0],
  records = [],
  recordedBy = 'مسؤول شؤون الطلاب (أ. محمود سالم)'
}, schoolId = DEFAULT_SCHOOL_ID) {
  if (!records || records.length === 0) {
    throw new Error('لا توجد سجلات طلاب لحفظها.');
  }

  const attendanceBatchId = `att_${date}_${classId.replace(/[\/\s]+/g, '_')}`;
  const cacheKey = `${CACHE_ATTENDANCE_KEY}${schoolId}_${date}_${classId.replace(/\s+/g, '_')}`;

  const payload = {
    id: attendanceBatchId,
    grade,
    classId,
    date,
    records,
    recordedBy,
    schoolId,
    timestamp: new Date().toISOString(),
  };

  try {
    const docRef = doc(db, 'schools', schoolId, 'attendance', attendanceBatchId);
    await setDoc(docRef, { ...payload, serverCreatedAt: serverTimestamp() });
  } catch (e) {
    console.warn('Firestore saveClassAttendance notice:', e);
  }

  localStorage.setItem(cacheKey, JSON.stringify(records));

  // If any students were marked absent, automatically issue absence alert for their parents
  const absentStudents = records.filter(r => r.status === 'absent');
  for (const absent of absentStudents) {
    try {
      await createNotification({
        title: `⚠️ إشعار غياب مدرسي رسمي — ${absent.studentName}`,
        body: `تفيد إدارة المدرسة بتغيب الطالب (${absent.studentName} — كود: ${absent.studentCode}) عن الحضور ليوم ${date}. يرجى توضيح سبب الغياب أو التواصل مع شؤون الطلاب.`,
        category: 'attendance',
        targetRole: 'parent',
      }, schoolId);
    } catch (e) {}
  }

  await recordAuditEvent({
    action: `اعتماد ورصد سجل الحضور اليومي لفصل (${classId})`,
    target: `${grade} — ${classId}`,
    details: `إجمالي الطلاب: ${records.length} | الحاضرون: ${records.filter(r => r.status === 'present').length} | الغائبون: ${absentStudents.length}`,
    operatorRole: 'student_affairs',
    schoolId,
  });

  return payload;
}

