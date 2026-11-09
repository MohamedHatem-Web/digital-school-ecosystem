// ==========================================================================
// DIGITAL SCHOOL ECOSYSTEM (VANILLA EDITION)
// Academic Structure Service (Stages, Classes, Subjects)
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

const CACHE_CLASSES_KEY = 'dse_academic_classes_';
const CACHE_SUBJECTS_KEY = 'dse_academic_subjects_';

// Initial default classes for Egyptian Secondary School
const DEFAULT_INITIAL_CLASSES = [
  { id: 'cls_sec_1_1', name: 'الصف الأول الثانوي — فصل 1/1', grade: 'الصف الأول الثانوي', room: 'قاعة 101' },
  { id: 'cls_sec_1_2', name: 'الصف الأول الثانوي — فصل 1/2', grade: 'الصف الأول الثانوي', room: 'قاعة 102' },
  { id: 'cls_sec_2_sci', name: 'الصف الثاني الثانوي — علمي', grade: 'الصف الثاني الثانوي', room: 'قاعة 201' },
  { id: 'cls_sec_2_lit', name: 'الصف الثاني الثانوي — أدبي', grade: 'الصف الثاني الثانوي', room: 'قاعة 202' },
  { id: 'cls_sec_3_sci_bio', name: 'الصف الثالث الثانوي — علمي علوم', grade: 'الصف الثالث الثانوي', room: 'قاعة 301' },
  { id: 'cls_sec_3_sci_math', name: 'الصف الثالث الثانوي — علمي رياضة', grade: 'الصف الثالث الثانوي', room: 'قاعة 302' },
];

const DEFAULT_INITIAL_SUBJECTS = [
  { id: 'sub_arabic', name: 'اللغة العربية والخط', code: 'ARB-101', stage: 'المرحلة الثانوية' },
  { id: 'sub_english', name: 'اللغة الإنجليزية الأولى', code: 'ENG-101', stage: 'المرحلة الثانوية' },
  { id: 'sub_math', name: 'الرياضيات البحتة والتطبيقية', code: 'MTH-101', stage: 'المرحلة الثانوية' },
  { id: 'sub_physics', name: 'الفيزياء', code: 'PHY-101', stage: 'المرحلة الثانوية' },
  { id: 'sub_chemistry', name: 'الكيمياء', code: 'CHM-101', stage: 'المرحلة الثانوية' },
  { id: 'sub_biology', name: 'الأحياء والجيولوجيا', code: 'BIO-101', stage: 'المرحلة الثانوية' },
];

/**
 * Fetch all classes for a school
 */
export async function getSchoolClasses(schoolId = DEFAULT_SCHOOL_ID) {
  try {
    const classesCol = collection(db, 'schools', schoolId, 'classes');
    const snapshot = await getDocs(classesCol);
    if (!snapshot.empty) {
      const list = [];
      snapshot.forEach((d) => list.push({ id: d.id, ...d.data() }));
      localStorage.setItem(`${CACHE_CLASSES_KEY}${schoolId}`, JSON.stringify(list));
      return list;
    }
  } catch (err) {
    console.warn('Firestore getSchoolClasses notice:', err);
  }

  // Fallback to cache or initial defaults
  const cached = localStorage.getItem(`${CACHE_CLASSES_KEY}${schoolId}`);
  if (cached) return JSON.parse(cached);

  localStorage.setItem(`${CACHE_CLASSES_KEY}${schoolId}`, JSON.stringify(DEFAULT_INITIAL_CLASSES));
  return DEFAULT_INITIAL_CLASSES;
}

/**
 * Create a new class / section
 */
export async function createSchoolClass({ name, grade, room }, schoolId = DEFAULT_SCHOOL_ID) {
  const cleanName = String(name).trim();
  if (!cleanName) throw new Error('يرجى تحديد مسمى الفصل.');

  const classId = `cls_${Date.now()}`;
  const classData = {
    id: classId,
    name: cleanName,
    grade: grade || 'الصف الأول الثانوي',
    room: room || 'قاعة دراسية',
    schoolId,
    createdAt: new Date().toISOString(),
  };

  try {
    const docRef = doc(db, 'schools', schoolId, 'classes', classId);
    await setDoc(docRef, { ...classData, serverCreatedAt: serverTimestamp() });
  } catch (e) {
    console.warn('Firestore createSchoolClass notice:', e);
  }

  const existing = await getSchoolClasses(schoolId);
  const updated = [classData, ...existing];
  localStorage.setItem(`${CACHE_CLASSES_KEY}${schoolId}`, JSON.stringify(updated));

  await recordAuditEvent({
    action: 'إضافة فصل دراسي جديد',
    target: cleanName,
    details: `المرحلة: ${classData.grade}`,
    operatorRole: 'director',
    schoolId,
  });

  return classData;
}

/**
 * Fetch all academic subjects for a school
 */
export async function getSchoolSubjects(schoolId = DEFAULT_SCHOOL_ID) {
  try {
    const col = collection(db, 'schools', schoolId, 'subjects');
    const snap = await getDocs(col);
    if (!snap.empty) {
      const list = [];
      snap.forEach((d) => list.push({ id: d.id, ...d.data() }));
      localStorage.setItem(`${CACHE_SUBJECTS_KEY}${schoolId}`, JSON.stringify(list));
      return list;
    }
  } catch (err) {
    console.warn('Firestore getSchoolSubjects notice:', err);
  }

  const cached = localStorage.getItem(`${CACHE_SUBJECTS_KEY}${schoolId}`);
  if (cached) return JSON.parse(cached);

  localStorage.setItem(`${CACHE_SUBJECTS_KEY}${schoolId}`, JSON.stringify(DEFAULT_INITIAL_SUBJECTS));
  return DEFAULT_INITIAL_SUBJECTS;
}
