// ==========================================================================
// DIGITAL SCHOOL ECOSYSTEM (VANILLA EDITION)
// Grades & Assessments Service (Cloud Firestore)
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

const CACHE_ASSESSMENTS_KEY = 'dse_assessments_';
const CACHE_GRADES_KEY = 'dse_grades_v5_';

/**
 * Fetch all assessments / exams for a school
 */
export async function getAssessments(schoolId = DEFAULT_SCHOOL_ID) {
  try {
    const col = collection(db, 'schools', schoolId, 'assessments');
    const snap = await getDocs(col);
    const list = [];
    snap.forEach((d) => list.push({ id: d.id, ...d.data() }));
    localStorage.setItem(`${CACHE_ASSESSMENTS_KEY}${schoolId}`, JSON.stringify(list));
    return list;
  } catch (e) {
    console.warn('Firestore getAssessments notice:', e);
    const cached = localStorage.getItem(`${CACHE_ASSESSMENTS_KEY}${schoolId}`);
    return cached ? JSON.parse(cached) : [];
  }
}

/**
 * Create a new assessment / exam
 */
export async function createAssessment({ title, subject, maxGrade, term, deadline, teacherName }, schoolId = DEFAULT_SCHOOL_ID) {
  const cleanTitle = String(title).trim();
  if (!cleanTitle) throw new Error('يرجى تحديد عنوان التقييم أو الاختبار.');

  const assessmentId = `asm_${Date.now()}`;
  const asmData = {
    id: assessmentId,
    title: cleanTitle,
    subject: subject || 'اللغة العربية',
    maxGrade: Number(maxGrade) || 100,
    term: term || 'الفصل الدراسي الأول',
    deadline: deadline || new Date().toISOString().split('T')[0],
    teacherName: teacherName || 'معلم معتمد',
    schoolId,
    createdAt: new Date().toISOString(),
  };

  try {
    const docRef = doc(db, 'schools', schoolId, 'assessments', assessmentId);
    await setDoc(docRef, { ...asmData, serverCreatedAt: serverTimestamp() });
  } catch (e) {
    console.warn('Firestore createAssessment notice:', e);
  }

  const existing = await getAssessments(schoolId);
  const updated = [asmData, ...existing];
  localStorage.setItem(`${CACHE_ASSESSMENTS_KEY}${schoolId}`, JSON.stringify(updated));

  await recordAuditEvent({
    action: 'إنشاء اختبار أو تقييم شهري جديد',
    target: cleanTitle,
    details: `المادة: ${asmData.subject} (الدرجة العظمى: ${asmData.maxGrade})`,
    operatorRole: 'teacher',
    schoolId,
  });

  return asmData;
}

export const DEFAULT_GRADES = [
  {
    id: 'grd_2026101_asm_01',
    studentCode: '2026101',
    studentName: 'يوسف أحمد المنشاوي',
    assessmentId: 'asm_01',
    assessmentTitle: 'تقييم الشهر الأول — قراءة ونصوص وبلاغة',
    subject: 'اللغة العربية',
    score: 20,
    maxScore: 20,
    feedback: 'ممتاز ومتفوق في الإعراب والتعبير الإنشائي، استيعاب متكامل للمنهج.',
    teacherName: 'أ. إبراهيم فؤاد القاضي',
    recordedDate: '2026-10-28',
    schoolId: DEFAULT_SCHOOL_ID,
  },
  {
    id: 'grd_2026101_asm_02',
    studentCode: '2026101',
    studentName: 'يوسف أحمد المنشاوي',
    assessmentId: 'asm_02',
    assessmentTitle: 'اختبار الهندسة التحليلية والجبر',
    subject: 'الرياضيات',
    score: 19,
    maxScore: 20,
    feedback: 'دقة ممتازة في حل المسائل التطبيقية وخطوات البرهان الرياضي.',
    teacherName: 'أ. إبراهيم فؤاد القاضي',
    recordedDate: '2026-10-30',
    schoolId: DEFAULT_SCHOOL_ID,
  },
  {
    id: 'grd_2026101_asm_03',
    studentCode: '2026101',
    studentName: 'يوسف أحمد المنشاوي',
    assessmentId: 'asm_03',
    assessmentTitle: 'التجارب المعملية الشهرية',
    subject: 'الفيزياء',
    score: 10,
    maxScore: 10,
    feedback: 'التزام كامل بقواعد السلامة المعملية وكفاءة في تدوين الملاحظات العلمية.',
    teacherName: 'معلم الفيزياء المعتمد',
    recordedDate: '2026-11-02',
    schoolId: DEFAULT_SCHOOL_ID,
  },
  {
    id: 'grd_2026102_asm_01',
    studentCode: '2026102',
    studentName: 'مريم أحمد المنشاوي',
    assessmentId: 'asm_01',
    assessmentTitle: 'تقييم الشهر الأول — قراءة ونصوص وبلاغة',
    subject: 'اللغة العربية',
    score: 20,
    maxScore: 20,
    feedback: 'مستوى استثنائي وتفوق ملحوظ في القواعد النحوية والإملاء والتعبير الإبداعي.',
    teacherName: 'أ. إبراهيم فؤاد القاضي',
    recordedDate: '2026-10-28',
    schoolId: DEFAULT_SCHOOL_ID,
  },
  {
    id: 'grd_2026102_asm_02',
    studentCode: '2026102',
    studentName: 'مريم أحمد المنشاوي',
    assessmentId: 'asm_02',
    assessmentTitle: 'اختبار اللغة الإنجليزية — مهارات الاستماع والمفردات',
    subject: 'اللغة الإنجليزية',
    score: 20,
    maxScore: 20,
    feedback: 'إتقان تام لحصيلة الكلمات والقواعد وإجابات نموذجية متكاملة.',
    teacherName: 'معلم اللغة الإنجليزية المعتمد',
    recordedDate: '2026-10-31',
    schoolId: DEFAULT_SCHOOL_ID,
  },
  {
    id: 'grd_2026102_asm_03',
    studentCode: '2026102',
    studentName: 'مريم أحمد المنشاوي',
    assessmentId: 'asm_03',
    assessmentTitle: 'التجارب المعملية والأحياء',
    subject: 'الأحياء',
    score: 20,
    maxScore: 20,
    feedback: 'دقة فائقة في الملاحظة المجهرية ورسم العينات النباتية والحيوانية.',
    teacherName: 'معلمة الأحياء المعتمدة',
    recordedDate: '2026-11-03',
    schoolId: DEFAULT_SCHOOL_ID,
  },
  {
    id: 'grd_2026102_asm_04',
    studentCode: '2026102',
    studentName: 'مريم أحمد المنشاوي',
    assessmentId: 'asm_04',
    assessmentTitle: 'اختبار الكيمياء الشهري — الروابط والتفاعلات',
    subject: 'الكيمياء',
    score: 19,
    maxScore: 20,
    feedback: 'فهم ممتاز للمعادلات الكيميائية وتفسير منطقي للنواتج.',
    teacherName: 'د. شيرين عزت',
    recordedDate: '2026-11-05',
    schoolId: DEFAULT_SCHOOL_ID,
  }
];

/**
 * Fetch grades for students or specific student
 */
export async function getStudentGrades(studentCode = null, schoolId = DEFAULT_SCHOOL_ID) {
  const cacheKey = `${CACHE_GRADES_KEY}${schoolId}`;
  const cachedStr = localStorage.getItem(cacheKey);
  
  if (cachedStr) {
    try {
      const list = JSON.parse(cachedStr);
      if (Array.isArray(list) && list.length > 0) {
        // Background sync
        try {
          getDocs(collection(db, 'schools', schoolId, 'grades')).then((snap) => {
            if (!snap.empty) {
              const freshList = [];
              snap.forEach((d) => freshList.push({ id: d.id, ...d.data() }));
              localStorage.setItem(cacheKey, JSON.stringify(freshList));
            }
          }).catch(() => {});
        } catch (e) {}

        if (studentCode) {
          return list.filter((g) => g.studentCode === String(studentCode).trim());
        }
        return list;
      }
    } catch (e) {
      // ignore
    }
  }

  const initialGrades = DEFAULT_GRADES.map(g => ({ ...g, schoolId }));
  localStorage.setItem(cacheKey, JSON.stringify(initialGrades));

  try {
    for (const grd of initialGrades) {
      const docRef = doc(db, 'schools', schoolId, 'grades', grd.id);
      setDoc(docRef, { ...grd, serverCreatedAt: serverTimestamp() }, { merge: true }).catch(() => {});
    }
  } catch (e) {
    // ignore
  }

  if (studentCode) {
    return initialGrades.filter((g) => g.studentCode === String(studentCode).trim());
  }
  return initialGrades;
}

/**
 * Record or update a student's grade
 */
export async function recordStudentGrade({ studentCode, studentName, assessmentId, assessmentTitle, subject, score, maxScore, feedback, teacherName }, schoolId = DEFAULT_SCHOOL_ID) {
  const gradeId = `grd_${studentCode}_${assessmentId}`;
  const gradeData = {
    id: gradeId,
    studentCode: String(studentCode).trim(),
    studentName: studentName || 'طالب',
    assessmentId,
    assessmentTitle: assessmentTitle || 'تقييم شهري',
    subject: subject || 'عام',
    score: Number(score) || 0,
    maxScore: Number(maxScore) || 100,
    feedback: feedback || '',
    teacherName: teacherName || 'معلم معتمد',
    recordedDate: new Date().toISOString().split('T')[0],
    schoolId,
  };

  try {
    const docRef = doc(db, 'schools', schoolId, 'grades', gradeId);
    await setDoc(docRef, { ...gradeData, serverUpdatedAt: serverTimestamp() });
  } catch (e) {
    console.warn('Firestore recordStudentGrade notice:', e);
  }

  const existing = await getStudentGrades(null, schoolId);
  const updated = [gradeData, ...existing.filter((g) => g.id !== gradeId)];
  localStorage.setItem(`${CACHE_GRADES_KEY}${schoolId}`, JSON.stringify(updated));

  await recordAuditEvent({
    action: 'رصد واعتماد درجة تقييم لطالب',
    target: `${studentName} (${studentCode})`,
    details: `${gradeData.assessmentTitle}: ${gradeData.score} / ${gradeData.maxScore}`,
    operatorRole: 'teacher',
    schoolId,
  });

  return gradeData;
}
