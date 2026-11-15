// ==========================================================================
// DIGITAL SCHOOL ECOSYSTEM (VANILLA EDITION)
// Multi-School Student Affairs Service (Cloud Firestore)
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
  deleteDoc,
  updateDoc,
  serverTimestamp,
  writeBatch,
} from '../firebase.js';
import { getCurrentUser } from '../auth.js';
import { DEFAULT_SCHOOL_ID } from './school-service.js';
import { recordAuditEvent } from './audit-service.js';
import { getFamilyStudentRecords, linkStudentToFamilyAccount } from './account-service.js';
import { getSchoolClasses } from './academic-service.js';

const CACHE_KEY_PREFIX = 'dse_students_';
const CACHE_VERSION = 'v8';
const ALLOWED_SECOND_LANGUAGES = new Set(['فرنساوي', 'ألماني', 'إيطالي']);
const getCacheKey = (schoolId, user = getCurrentUser()) => {
  const identity = user?.role === 'teacher'
    ? `teacher_${user.uid || user.email || 'unknown'}_${user.classId || 'unassigned'}`
    : user && ['student', 'parent'].includes(user.role)
      ? `${user.role}_${user.uid || user.email || 'unknown'}`
      : user?.role || 'public';
  return `${CACHE_KEY_PREFIX}${CACHE_VERSION}_${schoolId}_${identity}`;
};

async function fetchStudentRecords(schoolId, user) {
  const studentsRef = collection(db, 'schools', schoolId, 'students');
  if (user?.role === 'teacher' && !user.classId) return [];
  const snapshots = user?.role === 'teacher'
    ? await getDocs(query(studentsRef, where('classId', '==', user.classId)))
    : await getDocs(studentsRef);

  const records = new Map();
  snapshots.forEach((studentDoc) => {
    records.set(studentDoc.id, sanitizeStudentRecord({ id: studentDoc.id, ...studentDoc.data() }, schoolId));
  });
  return [...records.values()];
}

/**
 * Authoritative record sanitizer to prevent stale Firestore records or old caches from overwriting correct sibling identities
 */
export function generateOfficialStudentEmail(code, domain = 'cairo7.moe.edu.eg') {
  const cleanCode = String(code || '').trim().replace(/[^0-9]/g, '');
  if (!cleanCode) return '';
  return `${cleanCode}@${domain}`;
}

export function sanitizeStudentRecord(student, schoolId = DEFAULT_SCHOOL_ID) {
  if (!student) return student;

  student.id = student.id || `stu_${String(student.code || '').trim()}`;
  student.code = String(student.code || '').trim() || (student.id ? student.id.replace(/\D/g, '') : '');
  student.name = String(student.name || '').trim() || 'طالب غير مسجل';
  student.grade = student.grade || 'غير محدد';
  student.email = student.email || generateOfficialStudentEmail(student.code) || (student.code ? `${student.code}@dse.edu.eg` : '');
  student.status = student.status || 'enrolled';
  student.nationalId = student.nationalId || '';
  student.secondLanguage = student.secondLanguage || '';
  student.parentInfo = student.parentInfo || {
    parentName: '',
    parentPhone: '',
    parentEmail: '',
  };
  student.parentInfo.parentName = student.parentInfo.parentName || 'غير مسجل';
  student.parentInfo.parentPhone = student.parentInfo.parentPhone || student.parentInfo.phone || '';
  student.parentInfo.parentEmail = String(student.parentInfo.parentEmail || '').trim().toLowerCase();

  if (!student.code && student.id) {
    const numPart = student.id.replace(/\D/g, '');
    if (numPart) student.code = numPart;
  }

  return student;
}

export const DEFAULT_STUDENTS = [];


/**
 * Fetch all students enrolled in a specific school
 */
export async function getStudents(schoolId = DEFAULT_SCHOOL_ID) {
  const currentUser = getCurrentUser();
  const cacheKey = getCacheKey(schoolId, currentUser);

  if (['student', 'parent'].includes(currentUser?.role)) {
    try {
      const familyRecords = await getFamilyStudentRecords();
      return familyRecords.map((student) => sanitizeStudentRecord(student, schoolId));
    } catch (error) {
      console.warn('Family student records request failed:', error);
      return [];
    }
  }

  let cachedList = null;
  const cachedStr = localStorage.getItem(cacheKey);
  if (cachedStr) {
    try {
      const parsed = JSON.parse(cachedStr);
      if (Array.isArray(parsed) && parsed.length > 0) {
        cachedList = parsed.map(s => sanitizeStudentRecord(s, schoolId));
        localStorage.setItem(cacheKey, JSON.stringify(cachedList));
      }
    } catch (e) { /* ignore */ }
  }

  // Cache-first: return immediately for 0ms render, refresh Firestore in background
  if (cachedList && !['student', 'parent'].includes(currentUser?.role)) {
    try {
      fetchStudentRecords(schoolId, currentUser)
        .then((list) => {
          localStorage.setItem(cacheKey, JSON.stringify(list));
        })
        .catch((error) => console.warn('Firestore student cache refresh notice:', error));
    } catch (e) { /* ignore */ }
    return cachedList;
  }

  // Clean mode disables demo seeding; it must not hide real Firestore records.
  let initialList = [];
  if (currentUser?.role === 'student') {
    initialList = initialList.filter(Boolean);
  } else if (currentUser?.role === 'parent') {
    initialList = initialList.filter(Boolean);
  }
  localStorage.setItem(cacheKey, JSON.stringify(initialList));

  try {
    const remoteList = await Promise.race([
      fetchStudentRecords(schoolId, currentUser),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Student records timed out')), 2500)),
    ]);
    localStorage.setItem(cacheKey, JSON.stringify(remoteList));
    return remoteList;
  } catch (error) {
    console.warn('Firestore getStudents notice:', error);
    return initialList;
  }
}

/**
 * Update an existing student record (Exclusively permitted by Student Affairs & Principal)
 */
export async function updateStudent(updatePayload, schoolId = DEFAULT_SCHOOL_ID) {
  const cleanCode = String(updatePayload.code || '').trim();
  const cleanName = String(updatePayload.name || '').trim();
  if (!cleanCode || !cleanName) {
    throw new Error('يرجى استيفاء اسم الطالب وكود القيد.');
  }

  const existing = await getStudents(schoolId);
  const targetIndex = existing.findIndex((s) => s.code === cleanCode);
  if (targetIndex === -1) {
    throw new Error('ملف الطالب غير مسجل بالسجلات.');
  }

  const current = existing[targetIndex];
  const secondLanguage = String(updatePayload.secondLanguage ?? current.secondLanguage ?? '').trim();
  if (!ALLOWED_SECOND_LANGUAGES.has(secondLanguage)) {
    throw new Error('اختر اللغة الأجنبية الثانية: فرنساوي أو ألماني أو إيطالي.');
  }
  const nidCalc = updatePayload.nationalId ? extractStudentDetailsFromNID(updatePayload.nationalId) : null;

  const updatedStudent = {
    ...current,
    name: cleanName,
    email: generateOfficialStudentEmail(cleanCode),
    nationalId: updatePayload.nationalId !== undefined ? String(updatePayload.nationalId).trim() : current.nationalId,
    birthDate: updatePayload.birthDate !== undefined ? updatePayload.birthDate : (nidCalc ? nidCalc.birthDate : current.birthDate),
    ageOct1: updatePayload.ageOct1 !== undefined ? updatePayload.ageOct1 : (nidCalc ? nidCalc.ageOct1 : current.ageOct1),
    gender: updatePayload.gender !== undefined ? updatePayload.gender : (nidCalc ? nidCalc.gender : current.gender),
    religion: updatePayload.religion !== undefined ? updatePayload.religion : current.religion,
    secondLanguage,
    nationality: updatePayload.nationality !== undefined ? updatePayload.nationality : current.nationality,
    address: updatePayload.address !== undefined ? updatePayload.address : current.address,
    studentPhone: updatePayload.studentPhone !== undefined ? updatePayload.studentPhone : current.studentPhone,
    registeredDate: updatePayload.registeredDate !== undefined ? updatePayload.registeredDate : current.registeredDate,
    academicYear: updatePayload.academicYear !== undefined ? updatePayload.academicYear : current.academicYear,
    admissionType: updatePayload.admissionType !== undefined ? updatePayload.admissionType : current.admissionType,
    previousSchool: updatePayload.previousSchool !== undefined ? updatePayload.previousSchool : current.previousSchool,
    transferDestinationSchool: updatePayload.transferDestinationSchool !== undefined ? updatePayload.transferDestinationSchool : current.transferDestinationSchool,
    transferDate: updatePayload.transferDate !== undefined ? updatePayload.transferDate : current.transferDate,
    tuitionStatus: updatePayload.tuitionStatus !== undefined ? updatePayload.tuitionStatus : current.tuitionStatus,
    tuitionAmount: updatePayload.tuitionAmount !== undefined ? updatePayload.tuitionAmount : current.tuitionAmount,
    tuitionReceiptNumber: updatePayload.tuitionReceiptNumber !== undefined ? updatePayload.tuitionReceiptNumber : current.tuitionReceiptNumber,
    grade: updatePayload.grade || current.grade,
    status: updatePayload.status || current.status,
    notes: updatePayload.notes !== undefined ? updatePayload.notes : current.notes,
    parentInfo: updatePayload.parentInfo ? { ...current.parentInfo, ...updatePayload.parentInfo } : current.parentInfo,
    updatedAt: new Date().toISOString(),
  };

  try {
    const docRef = doc(db, 'schools', schoolId, 'students', updatedStudent.id || `stu_${cleanCode}`);
    await setDoc(docRef, { ...updatedStudent, updatedAt: serverTimestamp() }, { merge: true });
  } catch (err) {
    throw new Error(`تعذر حفظ تعديل بيانات الطالب على خادم المدرسة: ${err.message || 'تحقق من الاتصال والصلاحيات.'}`);
  }

  existing[targetIndex] = updatedStudent;
  localStorage.setItem(getCacheKey(schoolId), JSON.stringify(existing));

  await recordAuditEvent({
    action: 'تعديل بيانات ملف قيد رسمي لطالب',
    target: `${cleanName} (كود: ${cleanCode})`,
    details: `المرحلة: ${updatedStudent.grade}`,
    operatorRole: 'student_affairs',
    schoolId,
  });

  return updatedStudent;
}

export const createStudent = registerStudent;

export async function deleteStudent(studentId, schoolId = DEFAULT_SCHOOL_ID) {
  const existing = await getStudents(schoolId);
  const target = existing.find(s => s.id === studentId || s.code === studentId);
  if (!target) throw new Error('ملف الطالب غير موجود في سجل المدرسة الحالي.');
  try {
    await deleteDoc(doc(db, 'schools', schoolId, 'students', target.id || `stu_${target.code}`));
  } catch (err) {
    throw new Error(`تعذر حذف ملف الطالب من خادم المدرسة: ${err.message || 'تحقق من الاتصال والصلاحيات.'}`);
  }
  const updated = existing.filter(s => s.id !== target.id && s.code !== target.code);
  localStorage.setItem(getCacheKey(schoolId), JSON.stringify(updated));

  await recordAuditEvent({
    action: 'شطب أو أرشفة ملف قيد طالب',
    target: `${target.name} (كود: ${target.code})`,
    details: 'تم الحذف بعد تأكيد الكتابة على خادم المدرسة',
    operatorRole: 'student_affairs',
    schoolId,
  });
  return true;
}

/**
 * Helper: Extract Birth Date, Gender, and Age in 1 October from Egyptian 14-digit National ID
 */
export function extractStudentDetailsFromNID(nid) {
  const cleanNid = String(nid || '').trim();
  if (cleanNid.length !== 14 || !/^\d{14}$/.test(cleanNid)) {
    return null;
  }

  const century = cleanNid[0] === '3' ? 2000 : 1900;
  const year = century + parseInt(cleanNid.substr(1, 2), 10);
  const month = parseInt(cleanNid.substr(3, 2), 10);
  const day = parseInt(cleanNid.substr(5, 2), 10);
  const birthDateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

  // Gender: digit 13 (odd = male, even = female)
  const genderDigit = parseInt(cleanNid[12], 10);
  const gender = genderDigit % 2 !== 0 ? 'ذكر' : 'أنثى';

  // Calculate age on 1 October of current school year (2026)
  const oct1Year = 2026;
  let ageYears = oct1Year - year;
  let ageMonths = 10 - month;
  let ageDays = 1 - day;

  if (ageDays < 0) {
    ageMonths -= 1;
    ageDays += 30;
  }
  if (ageMonths < 0) {
    ageYears -= 1;
    ageMonths += 12;
  }

  const ageOct1 = `${ageYears} سنة و ${ageMonths} شهر و ${ageDays} يوم`;

  return {
    birthDate: birthDateStr,
    gender,
    ageOct1,
  };
}

/**
 * Register a new student into the school records
 */
export async function registerStudent(studentPayload, schoolId = DEFAULT_SCHOOL_ID) {
  const cleanCode = String(studentPayload.code || '').trim();
  const cleanNid = String(studentPayload.nationalId || '').trim();
  const cleanName = String(studentPayload.name || '').trim();

  if (!cleanCode || !cleanName) {
    throw new Error('يرجى استيفاء اسم الطالب وكود القيد بوزارة التربية والتعليم.');
  }
  if (!String(studentPayload.grade || '').trim()) {
    throw new Error('يرجى اختيار صف وفصل معتمدين من الهيكل المدرسي.');
  }
  if (!ALLOWED_SECOND_LANGUAGES.has(String(studentPayload.secondLanguage || '').trim())) {
    throw new Error('اختر اللغة الأجنبية الثانية: فرنساوي أو ألماني أو إيطالي.');
  }

  const studentId = `stu_${cleanCode}`;
  let existingStudentSnapshot;
  try {
    existingStudentSnapshot = await getDoc(doc(db, 'schools', schoolId, 'students', studentId));
  } catch (error) {
    throw new Error(`تعذر التحقق من عدم تكرار كود الطالب على خادم المدرسة: ${error.message || 'تحقق من الاتصال والصلاحيات.'}`);
  }
  if (existingStudentSnapshot.exists()) {
    throw new Error(`كود الطالب (${cleanCode}) مسجل بالفعل مسبقاً في هذه المدرسة.`);
  }

  // Cache is supplementary; the authoritative duplicate check is the server read above.
  const existing = await getStudents(schoolId);
  if (existing.some((s) => s.code === cleanCode)) {
    throw new Error(`كود الطالب (${cleanCode}) مسجل بالفعل مسبقاً في هذه المدرسة.`);
  }

  let resolvedFamilyId = studentPayload.familyId || `fam_${cleanCode}`;
  let resolvedParentInfo = studentPayload.parentInfo || null;
  let siblingCodesList = [];

  // Check if sibling linking is requested
  if (studentPayload.siblingCode) {
    const sibling = existing.find((s) => s.code === String(studentPayload.siblingCode).trim());
    if (sibling) {
      resolvedFamilyId = sibling.familyId || `fam_${sibling.code}`;
      if (!resolvedParentInfo && sibling.parentInfo) {
        resolvedParentInfo = { ...sibling.parentInfo };
      }
      siblingCodesList = Array.from(new Set([...(sibling.siblingCodes || []), sibling.code]));

      // Update sibling's siblingCodes & familyId
      sibling.familyId = resolvedFamilyId;
      sibling.siblingCodes = Array.from(new Set([...(sibling.siblingCodes || []), cleanCode]));

      try {
        const sibRef = doc(db, 'schools', schoolId, 'students', sibling.id || `stu_${sibling.code}`);
        setDoc(sibRef, {
          familyId: resolvedFamilyId,
          siblingCodes: sibling.siblingCodes,
        }, { merge: true }).catch(() => {});
      } catch (e) {}
    }
  }

  // Auto calculate details if nationalId provided and fields missing
  const nidCalc = cleanNid ? extractStudentDetailsFromNID(cleanNid) : null;
  const birthDate = studentPayload.birthDate || (nidCalc ? nidCalc.birthDate : '');
  const gender = studentPayload.gender || (nidCalc ? nidCalc.gender : 'ذكر');
  const ageOct1 = studentPayload.ageOct1 || (nidCalc ? nidCalc.ageOct1 : '');

  const studentData = {
    id: studentId,
    name: cleanName,
    code: cleanCode,
    nationalId: cleanNid,
    birthDate,
    ageOct1,
    gender,
    religion: studentPayload.religion || 'مسلم',
    secondLanguage: studentPayload.secondLanguage || '',
    nationality: studentPayload.nationality || 'مصري',
    address: studentPayload.address || 'القاهرة الجديدة',
    studentPhone: studentPayload.studentPhone || '',
    grade: String(studentPayload.grade).trim(),
    status: studentPayload.status || 'enrolled',
    admissionType: studentPayload.admissionType || (studentPayload.status === 'transferred' ? 'transfer_in' : studentPayload.status === 'transferred_out' ? 'transfer_out' : 'new'),
    academicYear: studentPayload.academicYear || '2026/2027',
    previousSchool: studentPayload.previousSchool || '',
    transferDestinationSchool: studentPayload.transferDestinationSchool || '',
    transferDate: studentPayload.transferDate || '',
    tuitionStatus: studentPayload.tuitionStatus || 'unrecorded',
    tuitionAmount: Number(studentPayload.tuitionAmount) || 0,
    tuitionReceiptNumber: studentPayload.tuitionReceiptNumber || '',
    schoolId,
    email: studentPayload.email || generateOfficialStudentEmail(cleanCode),
    registeredDate: studentPayload.registeredDate || new Date().toISOString().split('T')[0],
    notes: studentPayload.notes || '',
    docs: [],
    familyId: resolvedFamilyId,
    siblingCodes: siblingCodesList,
    parentInfo: resolvedParentInfo,
    accountStatus: 'pending_activation',
    registeredDate: studentPayload.registeredDate || new Date().toISOString().split('T')[0],
  };

  const studentDocRef = doc(db, 'schools', schoolId, 'students', studentId);
  try {
    await setDoc(studentDocRef, {
      ...studentData,
      createdAt: serverTimestamp(),
    });
  } catch (err) {
    throw new Error(`تعذر اعتماد القيد على خادم المدرسة، ولم يُسجل الطالب رسمياً: ${err.message || 'تحقق من الاتصال والصلاحيات.'}`);
  }

  let familyLinkPending = false;
  try {
    await linkStudentToFamilyAccount({ studentCode: cleanCode, schoolId });
  } catch (error) {
    familyLinkPending = true;
    console.warn('Parent family link will need a retry:', error.message);
  }

  const registeredStudent = { ...studentData };

  // Update local cache
  const updatedList = [registeredStudent, ...existing.filter((s) => s.code !== cleanCode)];
  localStorage.setItem(getCacheKey(schoolId), JSON.stringify(updatedList));

  await recordAuditEvent({
    action: 'تسجيل وقيد ملف طالب رسمي بوزارة التربية والتعليم',
    target: `${cleanName} (كود: ${cleanCode})`,
    details: `المرحلة: ${studentData.grade} | تم حفظ ملف القيد، وحساب الطالب ينتظر موافقة ولي الأمر وتفعيله${studentPayload.siblingCode ? ` | ارتباط شقيق: ${studentPayload.siblingCode}` : ''}`,
    operatorRole: 'student_affairs',
    schoolId,
  });

  return {
    ...registeredStudent,
    accountEmail: studentData.email,
    familyLinkPending,
  };
}

/**
 * Bulk import multiple student records (from Excel / CSV upload)
 */
export async function bulkImportStudents(studentsList = [], schoolId = DEFAULT_SCHOOL_ID) {
  if (!Array.isArray(studentsList) || studentsList.length === 0) {
    throw new Error('قائمة الطلاب المراد استيرادها فارغة.');
  }

  const existing = await getStudents(schoolId);
  const existingCodes = new Set(existing.map((s) => s.code));
  const newStudents = [];
  const errors = [];

  for (let i = 0; i < studentsList.length; i++) {
    const s = studentsList[i];
    const code = String(s.code || '').trim();
    const name = String(s.name || '').trim();
    const grade = String(s.grade || '').trim();
    const secondLanguage = String(s.secondLanguage || '').trim();

    if (!code || !name || !grade || !secondLanguage) {
      errors.push(`السطر ${i + 1}: الاسم وكود الطالب والصف واللغة الثانية مطلوبة.`);
      continue;
    }
    if (!ALLOWED_SECOND_LANGUAGES.has(secondLanguage)) {
      errors.push(`السطر ${i + 1}: اللغة الثانية يجب أن تكون فرنساوي أو ألماني أو إيطالي.`);
      continue;
    }
    if (existingCodes.has(code)) {
      errors.push(`كود الطالب (${code}) مسجل بالفعل بالسجلات مسبقاً.`);
      continue;
    }

    existingCodes.add(code);
    const nidCalc = s.nationalId ? extractStudentDetailsFromNID(s.nationalId) : null;
    const studentId = `stu_${code}`;

    const studentRecord = {
      id: studentId,
      name,
      code,
      nationalId: String(s.nationalId || '').trim(),
      birthDate: s.birthDate || (nidCalc ? nidCalc.birthDate : ''),
      ageOct1: s.ageOct1 || (nidCalc ? nidCalc.ageOct1 : ''),
      gender: s.gender || (nidCalc ? nidCalc.gender : 'ذكر'),
      religion: s.religion || 'مسلم',
      secondLanguage,
      nationality: s.nationality || 'مصري',
      address: s.address || 'القاهرة الجديدة',
      studentPhone: s.studentPhone || '',
      grade,
      status: s.status || 'enrolled',
      admissionType: s.admissionType || (s.status === 'transferred' ? 'transfer_in' : s.status === 'transferred_out' ? 'transfer_out' : 'new'),
      academicYear: s.academicYear || '2026/2027',
      previousSchool: s.previousSchool || '',
      transferDestinationSchool: s.transferDestinationSchool || '',
      transferDate: s.transferDate || '',
      tuitionStatus: s.tuitionStatus || 'unrecorded',
      tuitionAmount: Number(s.tuitionAmount) || 0,
      tuitionReceiptNumber: s.tuitionReceiptNumber || '',
      schoolId,
      email: s.email || generateOfficialStudentEmail(code),
      registeredDate: new Date().toISOString().split('T')[0],
      notes: s.notes || 'تم القيد عبر استيراد كشف رسمي مجمع',
      docs: [],
      familyId: `fam_${code}`,
      siblingCodes: [],
      parentInfo: {
        parentName: s.parentName || s.parentInfo?.parentName || 'ولي الأمر',
        parentPhone: s.parentPhone || s.parentInfo?.parentPhone || s.parentInfo?.phone || '',
        parentNationalId: s.parentNationalId || s.parentInfo?.parentNationalId || '',
        parentRelation: s.parentRelation || 'أب',
        parentJob: s.parentJob || '',
        parentAddress: s.parentAddress || '',
      },
    };

    try {
      const docRef = doc(db, 'schools', schoolId, 'students', studentId);
      await setDoc(docRef, { ...studentRecord, createdAt: serverTimestamp() });
      newStudents.push(studentRecord);
    } catch (e) {
      errors.push(`السطر ${i + 1}: تعذر الحفظ على خادم المدرسة (${e.message || 'خطأ صلاحيات أو اتصال'}).`);
    }
  }

  if (newStudents.length > 0) {
    const updatedList = [...newStudents, ...existing];
    localStorage.setItem(getCacheKey(schoolId), JSON.stringify(updatedList));

    await recordAuditEvent({
      action: 'استيراد مجمع لكشف قيد طلاب من ملف رسمي (Bulk Import)',
      target: `عدد ${newStudents.length} طالب`,
      details: `تم الاستيراد بنجاح إلى سجلات القيد المركزية`,
      operatorRole: 'student_affairs',
      schoolId,
    });
  }

  return {
    importedCount: newStudents.length,
    totalAttempted: studentsList.length,
    errors,
  };
}

export async function saveClassAllocation(allocation, currentStudents = [], schoolId = DEFAULT_SCHOOL_ID) {
  if (!allocation?.classes?.length || !allocation.assignments?.length) {
    throw new Error('لا يوجد توزيع صالح للحفظ. راجع بيانات الطلاب أولاً.');
  }

  const classes = await getSchoolClasses(schoolId);
  const previousClasses = classes.filter((item) =>
    item.allocationManaged &&
    item.grade === allocation.grade &&
    item.academicYear === allocation.academicYear);
  const previousClassIds = new Set(previousClasses.map((item) => item.id));
  const nextClassIds = new Set(allocation.classes.map((item) => item.id));
  const assignmentsByCode = new Map(allocation.assignments.map((item) => [String(item.code), item]));
  const assignedCodes = new Set(assignmentsByCode.keys());
  const studentsToClear = currentStudents.filter((student) =>
    previousClassIds.has(student.classId) && !assignedCodes.has(String(student.code || student.studentCode || '')));

  if (assignmentsByCode.size !== allocation.assignments.length) {
    throw new Error('توجد أكواد طلاب مكررة داخل خطة التوزيع؛ لم يتم حفظ أي تغيير.');
  }
  if (allocation.classes.length + allocation.assignments.length + studentsToClear.length > 450) {
    throw new Error('عدد الطلاب أكبر من الحد الآمن للحفظ في عملية واحدة. نفّذ التوزيع على صف أصغر.');
  }

  const batch = writeBatch(db);
  const now = serverTimestamp();
  allocation.classes.forEach((classRecord) => {
    batch.set(doc(db, 'schools', schoolId, 'classes', classRecord.id), {
      ...classRecord,
      schoolId,
      updatedAt: now,
    });
  });
  allocation.assignments.forEach((assignment) => {
    batch.update(doc(db, 'schools', schoolId, 'students', `stu_${assignment.code}`), {
      classId: assignment.classId,
      className: assignment.className,
      grade: assignment.grade,
      gradeName: assignment.gradeName,
      secondLanguage: assignment.secondLanguage,
      religion: assignment.religion,
      academicYear: assignment.academicYear,
      updatedAt: now,
    });
  });
  studentsToClear.forEach((student) => {
    const gradeName = student.gradeName || String(student.grade || '').split(/\s*[—–-]\s*/)[0].trim();
    batch.update(doc(db, 'schools', schoolId, 'students', student.id || `stu_${student.code}`), {
      classId: '',
      className: '',
      grade: gradeName,
      gradeName,
      updatedAt: now,
    });
  });
  previousClasses.filter((item) => !nextClassIds.has(item.id)).forEach((item) => {
    batch.delete(doc(db, 'schools', schoolId, 'classes', item.id));
  });

  try {
    await batch.commit();
  } catch (error) {
    throw new Error(`تعذر حفظ توزيع الفصول؛ لم يتم اعتماد التغييرات: ${error.message || 'تحقق من الصلاحيات والاتصال.'}`);
  }

  const updatedStudents = currentStudents.map((student) => {
    const code = String(student.code || student.studentCode || '');
    const assignment = assignmentsByCode.get(code);
    if (assignment) return { ...student, ...assignment };
    if (previousClassIds.has(student.classId)) {
      const gradeName = student.gradeName || String(student.grade || '').split(/\s*[—–-]\s*/)[0].trim();
      return { ...student, grade: gradeName, gradeName, classId: '', className: '' };
    }
    return student;
  });
  const retainedClasses = classes.filter((item) => !previousClassIds.has(item.id));
  localStorage.setItem(`${CACHE_KEY_PREFIX}${CACHE_VERSION}_${schoolId}_${getCurrentUser()?.role || 'public'}`, JSON.stringify(updatedStudents));
  localStorage.setItem(`dse_academic_classes_${schoolId}`, JSON.stringify([...allocation.classes, ...retainedClasses]));

  await recordAuditEvent({
    action: 'توزيع الطلاب على الفصول حسب اللغة والديانة والنوع',
    target: `${allocation.grade} — ${allocation.academicYear}`,
    details: `${allocation.eligibleCount} طالبًا في ${allocation.classes.length} فصلًا، بحد أقصى 25 طالبًا من كل نوع.`,
    operatorRole: 'student_affairs',
    schoolId,
  });
  return { ...allocation, clearedCount: studentsToClear.length };
}

/**
 * Attach verified document metadata (PDF) to student digital record
 */
export async function addStudentDocument(studentCode, docMetadata, schoolId = DEFAULT_SCHOOL_ID) {
  const existing = await getStudents(schoolId);
  const student = existing.find((s) => s.code === String(studentCode).trim());
  if (!student) throw new Error('الطالب غير مسجل في سجلات المدرسة.');

  const updatedDocs = [...(student.docs || []), docMetadata];
  student.docs = updatedDocs;

  try {
    const docRef = doc(db, 'schools', schoolId, 'students', student.id || `stu_${studentCode}`);
    await updateDoc(docRef, {
      docs: updatedDocs,
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    console.warn('Firestore addStudentDocument notice:', err);
  }

  const updatedList = existing.map((s) => (s.code === studentCode ? student : s));
  localStorage.setItem(getCacheKey(schoolId), JSON.stringify(updatedList));

  return student;
}

/**
 * Link verified parent to student
 */
export async function linkParentToStudent(studentCode, { parentName, parentNationalId, parentPhone }, schoolId = DEFAULT_SCHOOL_ID) {
  const existing = await getStudents(schoolId);
  const student = existing.find((s) => s.code === String(studentCode).trim());
  if (!student) throw new Error('الطالب غير مسجل.');

  const parentInfo = {
    parentName: parentName || 'ولي الأمر',
    parentNationalId: parentNationalId || '—',
    parentPhone: parentPhone || '—',
    verifiedAt: new Date().toISOString(),
  };

  student.parentInfo = parentInfo;

  try {
    const docRef = doc(db, 'schools', schoolId, 'students', student.id || `stu_${studentCode}`);
    await updateDoc(docRef, {
      parentInfo,
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    console.warn('Firestore linkParentToStudent notice:', err);
  }

  const updatedList = existing.map((s) => (s.code === studentCode ? student : s));
  localStorage.setItem(getCacheKey(schoolId), JSON.stringify(updatedList));

  await recordAuditEvent({
    action: 'ربط واعتماد ملف ولي أمر بطالب',
    target: `${student.name} (كود: ${studentCode})`,
    details: `ولي الأمر: ${parentInfo.parentName}`,
    operatorRole: 'student_affairs',
    schoolId,
  });

  return student;
}
