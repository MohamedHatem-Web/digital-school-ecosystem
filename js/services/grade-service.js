// ==========================================================================
// DIGITAL SCHOOL ECOSYSTEM (VANILLA EDITION)
// Grades & Assessments Service (Cloud Firestore)
// ==========================================================================

import {
  db,
  collection,
  doc,
  getDocs,
  query,
  where,
  setDoc,
  serverTimestamp,
} from '../firebase.js';
import { getCurrentUser } from '../auth.js';
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
  const currentUser = getCurrentUser();
  const demoGradeIds = new Set(DEFAULT_GRADES.map((grade) => grade.id));
  const keepRecordedGrades = (grades) => grades.filter((grade) => !demoGradeIds.has(grade.id));
  if (['student', 'parent'].includes(currentUser?.role)) {
    const cleanCode = String(studentCode || '').trim();
    if (!cleanCode) return [];
    try {
      const gradesQuery = query(
        collection(db, 'schools', schoolId, 'grades'),
        where('studentCode', '==', cleanCode)
      );
      const snapshot = await getDocs(gradesQuery);
      return keepRecordedGrades(snapshot.docs.map((gradeDoc) => ({ id: gradeDoc.id, ...gradeDoc.data() })));
    } catch (error) {
      console.warn('Firestore getStudentGrades scoped read notice:', error);
      return [];
    }
  }

  if (currentUser?.role === 'teacher') {
    if (studentCode) {
      try {
        const gradesQuery = query(
          collection(db, 'schools', schoolId, 'grades'),
          where('studentCode', '==', String(studentCode).trim())
        );
        const snapshot = await getDocs(gradesQuery);
        return keepRecordedGrades(snapshot.docs.map((gradeDoc) => ({ id: gradeDoc.id, ...gradeDoc.data() })));
      } catch (error) {
        console.warn('Firestore getStudentGrades teacher-scoped read notice:', error);
        return [];
      }
    }

    if (!currentUser.classId) return [];
    try {
      const rosterQuery = query(
        collection(db, 'schools', schoolId, 'students'),
        where('classId', '==', currentUser.classId)
      );
      const rosterSnapshot = await getDocs(rosterQuery);
      const gradeSnapshots = await Promise.all(rosterSnapshot.docs.map((studentDoc) => {
        const code = String(studentDoc.data().code || '').trim();
        if (!code) return Promise.resolve(null);
        return getDocs(query(
          collection(db, 'schools', schoolId, 'grades'),
          where('studentCode', '==', code)
        ));
      }));
      const grades = gradeSnapshots.flatMap((snapshot) => snapshot?.docs || [])
        .map((gradeDoc) => ({ id: gradeDoc.id, ...gradeDoc.data() }));
      return keepRecordedGrades(grades);
    } catch (error) {
      console.warn('Firestore getStudentGrades teacher-scoped read notice:', error);
      return [];
    }
  }

  const cacheKey = `${CACHE_GRADES_KEY}${schoolId}`;
  try {
    const snapshot = await getDocs(collection(db, 'schools', schoolId, 'grades'));
    const recordedGrades = keepRecordedGrades(snapshot.docs.map((gradeDoc) => ({ id: gradeDoc.id, ...gradeDoc.data() })));
    localStorage.setItem(cacheKey, JSON.stringify(recordedGrades));
    return studentCode
      ? recordedGrades.filter((grade) => String(grade.studentCode) === String(studentCode).trim())
      : recordedGrades;
  } catch (error) {
    console.warn('Firestore getStudentGrades notice:', error);
  }

  try {
    const cachedGrades = JSON.parse(localStorage.getItem(cacheKey) || '[]');
    const recordedGrades = Array.isArray(cachedGrades) ? keepRecordedGrades(cachedGrades) : [];
    return studentCode
      ? recordedGrades.filter((grade) => String(grade.studentCode) === String(studentCode).trim())
      : recordedGrades;
  } catch (error) {
    return [];
  }
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

/**
 * Calculate real average performance across subjects from recorded student grades
 */
export async function getSubjectPerformanceAverages(schoolId = DEFAULT_SCHOOL_ID) {
  const grades = (await getStudentGrades(null, schoolId)) || [];
  if (grades.length === 0) return [];

  const subjectMap = {};
  grades.forEach((g) => {
    const subj = g.subject || 'عام';
    if (!subjectMap[subj]) {
      subjectMap[subj] = { subject: subj, totalScore: 0, totalMax: 0, count: 0 };
    }
    subjectMap[subj].totalScore += Number(g.score) || 0;
    subjectMap[subj].totalMax += Number(g.maxScore) || 20;
    subjectMap[subj].count += 1;
  });

  return Object.values(subjectMap).map((item) => {
    const pct = item.totalMax > 0 ? Math.round((item.totalScore / item.totalMax) * 1000) / 10 : 0;
    let color = '#2563eb';
    if (pct >= 90) color = '#10b981';
    else if (pct >= 75) color = '#3b82f6';
    else if (pct >= 60) color = '#f59e0b';
    else color = '#ef4444';

    return {
      subject: item.subject,
      percentage: pct,
      studentCount: item.count,
      color,
    };
  });
}
