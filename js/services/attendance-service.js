// ==========================================================================
// DIGITAL SCHOOL ECOSYSTEM (VANILLA EDITION)
// Official School Daily Attendance & Absences Service (Cloud Firestore)
// ==========================================================================

import {
  db,
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  setDoc,
  updateDoc,
  serverTimestamp,
} from '../firebase.js';
import { DEFAULT_SCHOOL_ID } from './school-service.js';
import { recordAuditEvent } from './audit-service.js';
import { createNotification } from './notification-service.js';
import { getCurrentUser } from '../auth.js';
import { getStudentPortalAttendance } from './account-service.js';
import { applyEscapeAttendanceDecision, reconcileLessonAttendance } from '../utils/attendance-reconciliation.js';
import {
  applyAbsenceExcuses,
  calculateAbsenceRisk,
  getAcademicYearDateRange,
} from '../utils/attendance-warning-policy.js';

const CACHE_ATTENDANCE_KEY = 'dse_attendance_';

export const DEFAULT_ATTENDANCE_RECORDS = [];

const ABSENT_STATUSES = new Set(['absent', 'absent_unexcused', 'absent_excused']);

function getAttendanceReadQuery(schoolId, requestedClassId = '') {
  const attendance = collection(db, 'schools', schoolId, 'attendance');
  const user = getCurrentUser();
  if (user?.role !== 'teacher') return attendance;
  if (!user.classId || (requestedClassId && requestedClassId !== user.classId)) return null;
  return query(attendance, where('classId', '==', user.classId));
}

function getAttendanceCacheKey(schoolId, date, phase, classId, lessonId = '') {
  const safeClassId = String(classId).replace(/[\\/\s]+/g, '_');
  const lessonPart = phase === 'lesson' ? `_${String(lessonId || '1').replace(/[^a-zA-Z0-9_-]/g, '_')}` : '';
  return `${CACHE_ATTENDANCE_KEY}${schoolId}_${date}_${phase}${lessonPart}_${safeClassId}`;
}

/**
 * Get attendance records for a specific date and class
 */
export async function getClassAttendance(classId, date = new Date().toISOString().split('T')[0], schoolId = DEFAULT_SCHOOL_ID, phase = 'lesson', lessonId = '1') {
  const cacheKey = getAttendanceCacheKey(schoolId, date, phase, classId, lessonId);
  let cachedRecords = [];
  try {
    const cached = localStorage.getItem(cacheKey);
    const parsed = cached ? JSON.parse(cached) : [];
    if (Array.isArray(parsed)) cachedRecords = parsed;
  } catch (e) {}

  try {
    const col = getAttendanceReadQuery(schoolId, classId);
    if (!col) return [];
    const snap = await getDocs(col);
    if (!snap.empty) {
      const list = [];
      snap.forEach((d) => {
        const data = d.data();
        const storedPhase = data.phase || 'class';
        const phaseMatches = phase === 'lesson'
          ? (storedPhase === 'lesson' && String(data.lessonId || '1') === String(lessonId || '1')) || (storedPhase === 'class' && String(lessonId || '1') === '1')
          : storedPhase === phase;
        if (data.classId === classId && data.date === date && phaseMatches) {
          const records = Array.isArray(data.records) ? data.records : (data.studentCode ? [data] : []);
          list.push(...records.map((record) => ({
            ...record,
            date: record.date || data.date,
            classId: record.classId || data.classId,
          })));
        }
      });
      if (list.length > 0) {
        localStorage.setItem(cacheKey, JSON.stringify(list));
        return list;
      }
      localStorage.removeItem(cacheKey);
      return [];
    }
    localStorage.removeItem(cacheKey);
    return [];
  } catch (e) {
    console.warn('Firestore getClassAttendance notice:', e);
  }

  return cachedRecords.length ? cachedRecords : DEFAULT_ATTENDANCE_RECORDS.filter((record) => record.classId === classId).map((record) => ({ ...record, date, schoolId }));
}

export async function getAttendanceExcuses(schoolId = DEFAULT_SCHOOL_ID, academicYear = '') {
  try {
    const snapshot = await getDocs(collection(db, 'schools', schoolId, 'attendanceExcuses'));
    const excuses = snapshot.docs
      .map((excuseDoc) => ({ id: excuseDoc.id, ...excuseDoc.data() }))
      .filter((excuse) => !academicYear || excuse.academicYear === academicYear)
      .sort((a, b) => String(b.startDate || '').localeCompare(String(a.startDate || '')));
    return excuses;
  } catch (error) {
    console.warn('Firestore getAttendanceExcuses notice:', error);
    throw new Error(`تعذر تحميل فترات الأعذار المعتمدة: ${error.message || 'تحقق من الاتصال والصلاحيات.'}`);
  }
}

export async function createAttendanceExcuse({
  studentCode,
  studentName,
  grade = '',
  classId = '',
  startDate,
  endDate,
  reason,
  academicYear,
  approvedBy,
}, schoolId = DEFAULT_SCHOOL_ID) {
  if (!String(studentCode || '').trim() || !String(studentName || '').trim()) {
    throw new Error('يرجى اختيار طالب من السجل الرسمي.');
  }
  if (!startDate || !endDate || startDate > endDate) {
    throw new Error('تحقق من تاريخ بداية العذر ونهايته.');
  }
  if (!String(reason || '').trim()) throw new Error('يرجى تسجيل سبب العذر.');
  if (!academicYear) throw new Error('يرجى تحديد السنة الدراسية.');
  const { startDate: yearStart, endDate: yearEnd } = getAcademicYearDateRange(academicYear);
  if (startDate < yearStart || endDate > yearEnd) {
    throw new Error('يجب أن تقع فترة العذر داخل السنة الدراسية المحددة.');
  }

  const excuseId = `excuse_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const excuse = {
    id: excuseId,
    studentCode: String(studentCode).trim(),
    studentName: String(studentName).trim(),
    grade,
    classId,
    startDate,
    endDate,
    reason: String(reason).trim(),
    academicYear,
    approved: true,
    approvedBy: approvedBy || 'شؤون الطلاب',
    createdAt: new Date().toISOString(),
    schoolId,
  };
  try {
    await setDoc(doc(db, 'schools', schoolId, 'attendanceExcuses', excuseId), {
      ...excuse,
      serverCreatedAt: serverTimestamp(),
    });
  } catch (error) {
    throw new Error(`تعذر حفظ فترة العذر على خادم المدرسة: ${error.message || 'تحقق من الاتصال والصلاحيات.'}`);
  }

  await recordAuditEvent({
    action: 'تسجيل فترة عذر غياب معتمدة',
    target: `${excuse.studentName} (${excuse.studentCode})`,
    details: `${startDate} إلى ${endDate} — ${excuse.reason}`,
    operatorName: excuse.approvedBy,
    operatorRole: getCurrentUser()?.role || 'student_affairs',
    category: 'attendance',
    schoolId,
  });
  try {
    await applySavedAttendanceExcuse(excuse, schoolId);
    await syncAttendanceWarningNotifications(schoolId, academicYear);
  } catch (error) {
    throw new Error(`تم حفظ فترة العذر، لكن تعذر تحديث سجلات الغياب والتنبيهات: ${error.message || 'تحقق من الاتصال والصلاحيات.'}`);
  }
  return excuse;
}

async function applySavedAttendanceExcuse(excuse, schoolId) {
  const snapshot = await getDocs(collection(db, 'schools', schoolId, 'attendance'));
  for (const attendanceDoc of snapshot.docs) {
    const batch = attendanceDoc.data();
    if ((batch.phase || 'class') !== 'arrival' || !Array.isArray(batch.records)) continue;
    if (batch.date < excuse.startDate || batch.date > excuse.endDate) continue;
    if (batch.academicYear && batch.academicYear !== excuse.academicYear) continue;

    let changed = false;
    const records = batch.records.map((record) => {
      if (String(record.studentCode) !== excuse.studentCode ||
        !ABSENT_STATUSES.has(record.status) ||
        record.status === 'absent_excused') return record;
      changed = true;
      return { ...record, status: 'absent_excused', academicYear: record.academicYear || excuse.academicYear };
    });
    if (!changed) continue;

    await updateDoc(attendanceDoc.ref, { records, updatedAt: serverTimestamp() });
    localStorage.setItem(
      getAttendanceCacheKey(schoolId, batch.date, 'arrival', batch.classId),
      JSON.stringify(records),
    );
  }
}

/**
 * Save and certify class daily attendance
 */
export async function saveClassAttendance({
  grade,
  classId,
  academicYear = '2026/2027',
  phase = 'lesson',
  lessonId = '1',
  date = new Date().toISOString().split('T')[0],
  records = [],
  recordedBy = 'مسؤول شؤون الطلاب (أ. محمود سالم)',
  recordedByRole = 'student_affairs',
}, schoolId = DEFAULT_SCHOOL_ID) {
  if (!records || records.length === 0) {
    throw new Error('لا توجد سجلات طلاب لحفظها.');
  }

  let finalRecords = records.map((record) => ({ ...record, phase, lessonId: phase === 'lesson' ? String(lessonId) : '', date, classId, academicYear }));
  if (phase === 'arrival' && finalRecords.some((record) => ABSENT_STATUSES.has(record.status))) {
    const excuses = await getAttendanceExcuses(schoolId, academicYear);
    finalRecords = applyAbsenceExcuses(finalRecords, excuses, date, academicYear);
  }
  const attendanceBatchId = `att_${phase}_${date}${phase === 'lesson' ? `_lesson_${String(lessonId).replace(/[^a-zA-Z0-9_-]/g, '_')}` : ''}_${String(classId).replace(/[\/\s]+/g, '_')}`;
  const docRef = doc(db, 'schools', schoolId, 'attendance', attendanceBatchId);
  let previousBatch = null;
  try {
    const previousSnapshot = await getDoc(docRef);
    if (previousSnapshot.exists()) previousBatch = previousSnapshot.data();
  } catch (error) {
    console.warn('Firestore read-before-save attendance notice:', error);
  }
  const previousRecords = Array.isArray(previousBatch?.records) ? previousBatch.records : [];
  const previousByCode = new Map(previousRecords.map((record) => [String(record.studentCode), record]));
  if (phase === 'lesson') {
    finalRecords = finalRecords.map((record) => {
      const previous = previousByCode.get(String(record.studentCode));
      return previous ? { ...record, classStatus: previous.classStatus, escapeReview: previous.escapeReview } : record;
    });
  }
  if (phase === 'lesson') {
    const gateRecords = await getClassAttendance(classId, date, schoolId, 'arrival');
    finalRecords = reconcileLessonAttendance(finalRecords, gateRecords || []);
  }

  const cacheKey = getAttendanceCacheKey(schoolId, date, phase, classId, lessonId);

  const payload = {
    id: attendanceBatchId,
    grade,
    classId,
    academicYear,
    phase,
    lessonId: phase === 'lesson' ? String(lessonId) : '',
    date,
    records: finalRecords,
    recordedBy,
    editedBy: recordedBy,
    schoolId,
    timestamp: new Date().toISOString(),
    revisions: Array.isArray(previousBatch?.revisions) ? previousBatch.revisions : [],
  };
  let warningSyncError = '';

  const changedStatuses = finalRecords.flatMap((record) => {
    const previous = previousByCode.get(String(record.studentCode));
    return previous && previous.status !== record.status
      ? [{ studentCode: record.studentCode, studentName: record.studentName, from: previous.status, to: record.status }]
      : [];
  });
  if (changedStatuses.length) {
    payload.revisions = [
      ...payload.revisions,
      { editedBy: recordedBy, editedByRole: recordedByRole, editedAt: new Date().toISOString(), changes: changedStatuses },
    ].slice(-30);
  }

  let persistedRemotely = false;
  let persistenceError = '';
  try {
    await setDoc(docRef, { ...payload, serverCreatedAt: serverTimestamp(), updatedAt: serverTimestamp() });
    persistedRemotely = true;
  } catch (e) {
    console.warn('Firestore saveClassAttendance notice:', e);
    persistenceError = e?.message || 'تعذر الاتصال بخادم الحضور.';
  }

  localStorage.setItem(cacheKey, JSON.stringify(finalRecords));

  // Notifications only follow a confirmed cloud save, and only the first absence phase alerts parents.
  const escapedStudents = finalRecords.filter((record) => record.escapeReview === 'pending');
  const absentStudents = finalRecords.filter((record) => ABSENT_STATUSES.has(record.status) || record.status === 'escaped');
  const alertableStudents = persistedRemotely
    ? phase === 'arrival'
      ? absentStudents.filter((record) => previousByCode.get(String(record.studentCode))?.status !== record.status)
      : escapedStudents.filter((record) => previousByCode.get(String(record.studentCode))?.escapeReview !== 'pending')
    : [];
  for (const absent of alertableStudents) {
    try {
      const notification = {
        title: absent.escapeReview === 'pending' ? `مراجعة غياب محتمل — ${absent.studentName}` : `إشعار غياب مدرسي رسمي — ${absent.studentName}`,
        body: absent.escapeReview === 'pending'
          ? `الطالب مسجل حاضرًا عند البوابة وغائبًا عن الحصة ${lessonId} بتاريخ ${date}. راجعوا رصد البوابة والحصة قبل اعتماد حالة الهروب.`
          : `تفيد إدارة المدرسة بتغيب الطالب (${absent.studentName} — كود: ${absent.studentCode}) عن الحضور يوم ${date}. يرجى متابعة الحالة.`,
        category: 'attendance',
        targetStudentCode: absent.studentCode,
        relatedRecordId: attendanceBatchId,
        escapeReview: absent.escapeReview || '',
      };
      const targets = absent.escapeReview === 'pending' ? ['teacher', 'student_affairs'] : ['parent'];
      for (const targetRole of targets) {
        await createNotification({
          ...notification,
          targetRole,
        }, schoolId);
      }
    } catch (e) {}
  }

  await recordAuditEvent({
    action: previousBatch ? `تعديل سجل الحضور المعتمد لفصل (${classId})` : `اعتماد سجل الحضور لفصل (${classId})`,
    target: `${grade} — ${classId}`,
    details: `مرحلة الرصد: ${phase}${phase === 'lesson' ? ` | الحصة: ${lessonId}` : ''} | إجمالي الطلاب: ${finalRecords.length} | الحاضرون: ${finalRecords.filter(r => r.status === 'present').length} | الغياب: ${absentStudents.length}${changedStatuses.length ? ` | تعديلات: ${changedStatuses.map((item) => `${item.studentName}: ${item.from} ← ${item.to}`).join('، ')}` : ''}`,
    operatorRole: recordedByRole,
    schoolId,
  });

  if (persistedRemotely && phase === 'arrival') {
    await reconcileSavedLessonsWithArrival({ schoolId, classId, date, arrivalRecords: finalRecords, recordedBy, recordedByRole });
    try {
      await syncAttendanceWarningNotifications(schoolId, academicYear);
    } catch (error) {
      warningSyncError = error.message || 'تعذر تحديث تنبيهات الغياب للأخصائي الاجتماعي.';
      console.error('Attendance warning notification sync failed:', error);
    }
  }

  return { ...payload, records: finalRecords, persistedRemotely, persistenceError, warningSyncError };
}

export async function syncAttendanceWarningNotifications(schoolId = DEFAULT_SCHOOL_ID, academicYear = '2026/2027') {
  const { startDate, endDate } = getAcademicYearDateRange(academicYear);
  const snapshot = await getDocs(collection(db, 'schools', schoolId, 'attendance'));
  const records = [];
  snapshot.forEach((batchDoc) => {
    const batch = batchDoc.data();
    if ((batch.phase || 'class') !== 'arrival' || !Array.isArray(batch.records)) return;
    if (batch.date < startDate || batch.date > endDate) return;
    if (batch.academicYear && batch.academicYear !== academicYear) return;
    records.push(...batch.records.map((record) => ({
      ...record,
      date: record.date || batch.date,
      academicYear: record.academicYear || batch.academicYear || academicYear,
    })));
  });

  const risks = calculateAbsenceRisk(records, academicYear);
  for (const risk of risks) {
    const studentRecords = records.filter((record) => String(record.studentCode) === risk.studentCode);
    const studentName = studentRecords.find((record) => record.studentName)?.studentName || 'طالب غير محدد';
    for (const event of risk.events) {
      const eventLabel = event.status === 'approaching' ? 'اقتراب من حد الغياب' : 'بلوغ حد الغياب';
      const actionLabel = event.status === 'approaching' ? 'يرجى مراجعة الحالة والاستعداد لاتخاذ الإجراء.' : `بلغ الطالب الحد المحدد لـ${event.label}. يرجى مراجعة السجل واتخاذ الإجراء المعتمد.`;
      const safeCode = risk.studentCode.replace(/[^a-zA-Z0-9_-]/g, '_');
      await createNotification({
        notificationId: `att_risk_${academicYear.replace('/', '_')}_${safeCode}_${event.stage}_${event.status}`,
        title: `${eventLabel} — ${studentName}`,
        body: `${actionLabel} الغياب دون عذر: ${risk.absenceDays} يومًا، وأطول تتابع: ${risk.longestConsecutiveDays} يومًا. السنة الدراسية ${academicYear}.`,
        category: 'attendance',
        targetRole: 'social_affairs',
        targetStudentCode: risk.studentCode,
        alertType: 'attendance_warning',
        academicYear,
        attendanceStage: event.stage,
        attendanceStatus: event.status,
        absenceDays: risk.absenceDays,
        consecutiveDays: risk.longestConsecutiveDays,
        deduplicate: true,
        requirePersistence: true,
      }, schoolId);
    }
  }

  const currentEvents = new Set(risks.flatMap((risk) =>
    risk.events.map((event) => `${risk.studentCode}|${event.stage}|${event.status}`)));
  const notificationSnapshot = await getDocs(collection(db, 'schools', schoolId, 'notifications'));
  for (const notificationDoc of notificationSnapshot.docs) {
    const notification = notificationDoc.data();
    if (notification.alertType !== 'attendance_warning' || notification.academicYear !== academicYear) continue;
    const isActive = currentEvents.has(`${notification.targetStudentCode}|${notification.attendanceStage}|${notification.attendanceStatus}`);
    if (Boolean(notification.isResolved) === !isActive) continue;
    await updateDoc(notificationDoc.ref, { isResolved: !isActive, updatedAt: serverTimestamp() });
  }
}

async function reconcileSavedLessonsWithArrival({ schoolId, classId, date, arrivalRecords, recordedBy, recordedByRole }) {
  try {
    const attendanceQuery = getAttendanceReadQuery(schoolId, classId);
    if (!attendanceQuery) return;
    const snapshot = await getDocs(attendanceQuery);
    for (const lessonDoc of snapshot.docs) {
      const batch = lessonDoc.data();
      if (batch.phase !== 'lesson' || batch.classId !== classId || batch.date !== date || !Array.isArray(batch.records)) continue;
      const nextRecords = reconcileLessonAttendance(batch.records, arrivalRecords);
      const retracted = nextRecords.filter((record, index) => batch.records[index]?.status === 'escaped' && record.status !== 'escaped');
      await updateDoc(lessonDoc.ref, { records: nextRecords, updatedAt: serverTimestamp() });
      localStorage.setItem(getAttendanceCacheKey(schoolId, date, 'lesson', classId, batch.lessonId), JSON.stringify(nextRecords));
      for (const record of retracted) {
        await createNotification({
          title: `تصحيح مراجعة هروب — ${record.studentName}`,
          body: `تم تعديل سجل حضور البوابة للطالب ${record.studentName}، وأُعيدت حالة الحصة ${batch.lessonId || '1'} إلى غياب عادي بتاريخ ${date}.`,
          category: 'attendance',
          targetRole: 'parent',
          targetStudentCode: record.studentCode,
        }, schoolId);
      }
      await recordAuditEvent({
        action: 'إعادة مطابقة حصص الفصل بعد تعديل سجل البوابة',
        target: `${batch.grade || ''} — ${classId}`,
        details: `تحديث مراجعة الحصة ${batch.lessonId || '1'} بتاريخ ${date} بواسطة ${recordedBy}.`,
        category: 'attendance',
        operatorRole: recordedByRole,
        schoolId,
      });
    }
  } catch (error) {
    console.warn('Attendance lesson reconciliation notice:', error);
  }
}

export async function getEscapeAttendanceCases(schoolId = DEFAULT_SCHOOL_ID) {
  const cases = [];
  try {
    const snapshot = await getDocs(collection(db, 'schools', schoolId, 'attendance'));
    const arrivalOperators = new Map();
    snapshot.forEach((batchDoc) => {
      const batch = batchDoc.data();
      if ((batch.phase || 'class') === 'arrival') {
        arrivalOperators.set(`${batch.date}|${batch.classId}`, batch.recordedBy || 'غير محدد');
      }
    });
    snapshot.forEach((batchDoc) => {
      const batch = batchDoc.data();
      if (batch.phase !== 'lesson' || !Array.isArray(batch.records)) return;
      batch.records.forEach((record) => {
        const escapeReview = record.escapeReview || (record.status === 'escaped' ? 'pending' : '');
        if (escapeReview === 'pending') {
          cases.push({
            ...record,
            escapeReview,
            batchId: batchDoc.id,
            grade: record.grade || batch.grade || '',
            classId: record.classId || batch.classId || '',
            lessonId: record.lessonId || batch.lessonId || '1',
            date: record.date || batch.date || '',
            recordedBy: batch.recordedBy || '',
            arrivalRecordedBy: arrivalOperators.get(`${batch.date}|${batch.classId}`) || 'غير محدد',
          });
        }
      });
    });
  } catch (error) {
    console.warn('Firestore getEscapeAttendanceCases notice:', error);
    throw error;
  }
  return cases.sort((a, b) => String(b.date).localeCompare(String(a.date)));
}

export async function reviewEscapeAttendance({ batchId, studentCode, decision, reviewedBy, reviewedByRole, note = '' }, schoolId = DEFAULT_SCHOOL_ID) {
  if (!['confirm', 'correct'].includes(decision)) throw new Error('إجراء المراجعة غير صالح.');
  const docRef = doc(db, 'schools', schoolId, 'attendance', batchId);
  const snapshot = await getDoc(docRef);
  if (!snapshot.exists()) throw new Error('سجل الحصة غير موجود أو تم تحديثه.');
  const batch = snapshot.data();
  const records = Array.isArray(batch.records) ? batch.records : [];
  const index = records.findIndex((record) => String(record.studentCode) === String(studentCode));
  if (index < 0 || (records[index].escapeReview !== 'pending' && !(records[index].status === 'escaped' && !records[index].escapeReview))) {
    throw new Error('تمت مراجعة هذه الحالة بالفعل. حدّث القائمة.');
  }
  const previous = records[index];
  records[index] = applyEscapeAttendanceDecision(previous, decision, {
    reviewedBy,
    reviewedByRole,
    note,
  });
  await updateDoc(docRef, { records, updatedAt: serverTimestamp() });
  localStorage.setItem(getAttendanceCacheKey(schoolId, batch.date, 'lesson', batch.classId, batch.lessonId), JSON.stringify(records));

  const confirmed = decision === 'confirm';
  await recordAuditEvent({
    action: confirmed ? 'تأكيد حالة هروب بعد المراجعة' : 'تصحيح حالة هروب محتملة إلى غياب عادي',
    target: `${previous.studentName} (${studentCode})`,
    details: `الفصل ${batch.classId} — الحصة ${batch.lessonId || '1'} — ${batch.date}${note ? ` | ملاحظة: ${note}` : ''}`,
    category: 'attendance',
    operatorName: reviewedBy,
    operatorRole: reviewedByRole,
    schoolId,
  });

  if (confirmed) {
    await createNotification({
      title: `تأكيد هروب مدرسي — ${previous.studentName}`,
      body: `بعد المراجعة، تم تأكيد حضور الطالب عند البوابة وغيابه عن الحصة ${batch.lessonId || '1'} بتاريخ ${batch.date}. يرجى متابعة الحالة مع المدرسة.`,
      category: 'attendance',
      targetRole: 'parent',
      targetStudentCode: studentCode,
    }, schoolId);
  }
  return records[index];
}

export async function getDailyAttendanceRegister(startDate, endDate, schoolId = DEFAULT_SCHOOL_ID) {
  const attendanceQuery = getAttendanceReadQuery(schoolId);
  if (!attendanceQuery) return [];
  try {
    const snapshot = await getDocs(attendanceQuery);
    return snapshot.docs.flatMap((batchDoc) => {
      const batch = batchDoc.data();
      if ((batch.phase || 'class') !== 'arrival' || !Array.isArray(batch.records) || batch.date < startDate || batch.date > endDate) return [];
      return batch.records.map((record) => ({ ...record, date: record.date || batch.date, classId: record.classId || batch.classId, grade: record.grade || batch.grade, academicYear: record.academicYear || batch.academicYear }));
    });
  } catch (error) {
    console.warn('Firestore getDailyAttendanceRegister notice:', error);
    const cachedRecords = [];
    const user = getCurrentUser();
    const teacherClassKey = user?.role === 'teacher'
      ? `_${String(user.classId || '').replace(/[\\/\s]+/g, '_')}`
      : '';
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index);
      if (!key?.startsWith(`${CACHE_ATTENDANCE_KEY}${schoolId}_`) || !key.includes('_arrival_')) continue;
      if (teacherClassKey && !key.endsWith(teacherClassKey)) continue;
      try {
        const records = JSON.parse(localStorage.getItem(key) || '[]');
        if (Array.isArray(records)) cachedRecords.push(...records.filter((record) => record.date >= startDate && record.date <= endDate));
      } catch (cacheError) {}
    }
    return cachedRecords;
  }
}

export function buildAbsenceThresholdReport(records, students, { absencePercent = 10, minimumDays = 1, frequency = 'scattered' } = {}) {
  const enrolledByCode = new Map(students.map((student) => [String(student.code), student]));
  const classDays = new Map();
  const studentDays = new Map();
  for (const record of records) {
    const code = String(record.studentCode || '');
    if (!enrolledByCode.has(code)) continue;
    const classKey = `${record.grade || ''}|${record.classId || ''}`;
    if (!classDays.has(classKey)) classDays.set(classKey, new Set());
    classDays.get(classKey).add(record.date);
    if (!studentDays.has(code)) studentDays.set(code, new Map());
    studentDays.get(code).set(record.date, record.status);
  }

  const report = [];
  studentDays.forEach((attendanceByDate, code) => {
    const student = enrolledByCode.get(code);
    const placement = [...records].find((record) => String(record.studentCode) === code) || {};
    const key = `${placement.grade || ''}|${placement.classId || ''}`;
    const schoolDates = [...(classDays.get(key) || [])].sort();
    const absentDates = schoolDates.filter((date) => ABSENT_STATUSES.has(attendanceByDate.get(date) || ''));
    const absenceDays = absentDates.length;
    const absenceRate = schoolDates.length ? Math.round((absenceDays / schoolDates.length) * 1000) / 10 : 0;
    let longestStreak = 0;
    let currentStreak = 0;
    schoolDates.forEach((date) => {
      if (ABSENT_STATUSES.has(attendanceByDate.get(date) || '')) {
        currentStreak += 1;
        longestStreak = Math.max(longestStreak, currentStreak);
      } else {
        currentStreak = 0;
      }
    });
    const daysCriterion = frequency === 'consecutive' ? longestStreak >= minimumDays : absenceDays >= minimumDays;
    if (absenceRate < absencePercent || !daysCriterion) return;
    report.push({
      name: student.name,
      code: student.code,
      grade: placement.grade || student.grade || '',
      classId: placement.classId || student.className || '',
      absenceDays,
      longestStreak,
      recordedDays: schoolDates.length,
      absenceRate,
      dates: absentDates,
    });
  });
  const gradeOrder = (value) => /الثالث|ثالث/.test(value) ? 3 : /الثاني|ثاني/.test(value) ? 2 : /الأول|اول|أولى|اولى/.test(value) ? 1 : 99;
  return report.sort((a, b) => gradeOrder(a.grade) - gradeOrder(b.grade) || a.grade.localeCompare(b.grade, 'ar') || a.classId.localeCompare(b.classId, 'ar', { numeric: true }) || a.name.localeCompare(b.name, 'ar'));
}

export async function getStudentAttendanceHistory(studentCode, schoolId = DEFAULT_SCHOOL_ID) {
  const cleanCode = String(studentCode || '').trim();
  if (!cleanCode) return [];

  if (['student', 'parent'].includes(getCurrentUser()?.role)) {
    try {
      return await getStudentPortalAttendance(cleanCode);
    } catch (error) {
      console.warn('Family attendance request failed:', error);
      return [];
    }
  }

  const records = [];
  try {
    const attendanceCol = getAttendanceReadQuery(schoolId);
    if (!attendanceCol) return [];
    const snapshot = await getDocs(attendanceCol);
    snapshot.forEach((attendanceDoc) => {
      const batch = attendanceDoc.data();
      const batchRecords = Array.isArray(batch.records) ? batch.records : (batch.studentCode ? [batch] : []);
      batchRecords.forEach((record) => {
        if (String(record.studentCode) === cleanCode) {
          records.push({ ...record, date: record.date || batch.date, classId: record.classId || batch.classId, phase: record.phase || batch.phase || 'class', lessonId: record.lessonId || batch.lessonId || '' });
        }
      });
    });
  } catch (error) {
    console.warn('Firestore getStudentAttendanceHistory notice:', error);
  }

  if (records.length === 0) {
    try {
      const currentUser = getCurrentUser();
      const teacherClassKey = currentUser?.role === 'teacher'
        ? `_${String(currentUser.classId || '').replace(/[\\/\s]+/g, '_')}`
        : '';
      for (let index = 0; index < localStorage.length; index += 1) {
        const key = localStorage.key(index);
        if (!key?.startsWith(`${CACHE_ATTENDANCE_KEY}${schoolId}_`)) continue;
        if (teacherClassKey && !key.endsWith(teacherClassKey)) continue;
        const cached = JSON.parse(localStorage.getItem(key) || '[]');
        if (Array.isArray(cached)) records.push(...cached.filter((record) => String(record.studentCode) === cleanCode));
      }
    } catch (error) {
      console.warn('Attendance history cache read notice:', error);
    }
  }

  return records.sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
}

/**
 * Fetch and calculate real weekly attendance metrics for school days (Sun - Thu)
 */
export async function getWeeklyAttendanceTrends(schoolId = DEFAULT_SCHOOL_ID) {
  const daysOfWeek = [
    { key: 0, name: 'الأحد' },
    { key: 1, name: 'الاثنين' },
    { key: 2, name: 'الثلاثاء' },
    { key: 3, name: 'الأربعاء' },
    { key: 4, name: 'الخميس' },
  ];

  // Try fetching all attendance from Firestore
  let allRecords = [];
  try {
    const col = getAttendanceReadQuery(schoolId);
    if (!col) return { days: [], averageRate: 0, hasRealData: false, totalRecords: 0 };
    const snap = await getDocs(col);
    if (!snap.empty) {
      snap.forEach((d) => {
        const data = d.data();
        if (data.phase !== 'lesson' && Array.isArray(data.records) && data.records.length > 0) {
          allRecords.push(...data.records.map(r => ({ ...r, date: data.date })));
        }
      });
    }
  } catch (err) {
    console.warn('Firestore getWeeklyAttendanceTrends notice:', err);
  }

  // Scan localStorage for attendance batches as fallback/offline
  if (allRecords.length === 0) {
    try {
      const currentUser = getCurrentUser();
      const teacherClassKey = currentUser?.role === 'teacher'
        ? `_${String(currentUser.classId || '').replace(/[\\/\s]+/g, '_')}`
        : '';
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith(`${CACHE_ATTENDANCE_KEY}${schoolId}`)) {
          if (teacherClassKey && !k.endsWith(teacherClassKey)) continue;
          const raw = localStorage.getItem(k);
          if (raw) {
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed)) allRecords.push(...parsed);
          }
        }
      }
    } catch (e) {}
  }

  // If still empty, keep the attendance summary real and empty instead of fabricating data
  if (allRecords.length === 0) {
    allRecords = [];
  }

  // Group by date or day of week
  const dayStats = daysOfWeek.map((day) => {
    // Find records for this specific weekday if dated
    const matching = allRecords.filter((r) => {
      if (!r.date) return false;
      const d = new Date(r.date);
      return !isNaN(d.getTime()) && d.getDay() === day.key;
    });

    if (matching.length === 0) {
      // If records don't match specific weekday, calculate overall sample
      const presentCount = allRecords.filter(r => r.status === 'present').length;
      const rate = allRecords.length > 0 ? Math.round((presentCount / allRecords.length) * 1000) / 10 : 0;
      return { day: day.name, rate, total: allRecords.length, present: presentCount, hasData: allRecords.length > 0 };
    }

    const presentCount = matching.filter(r => r.status === 'present').length;
    const rate = Math.round((presentCount / matching.length) * 1000) / 10;
    return { day: day.name, rate, total: matching.length, present: presentCount, hasData: true };
  });

  const validDays = dayStats.filter(d => d.hasData);
  const avgRate = validDays.length > 0
    ? Math.round((validDays.reduce((acc, d) => acc + d.rate, 0) / validDays.length) * 10) / 10
    : 0;

  return {
    days: dayStats,
    averageRate: avgRate,
    hasRealData: validDays.length > 0,
    totalRecords: allRecords.length,
  };
}

