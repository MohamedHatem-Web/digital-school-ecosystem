// ==========================================================================
// DIGITAL SCHOOL ECOSYSTEM (VANILLA EDITION)
// Internal Institutional Messaging Service
// Role-based, multi-tenant secure internal communications
// ==========================================================================

import {
  db,
  collection,
  doc,
  getDocs,
  addDoc,
  setDoc,
  isFirebaseAvailable
} from '../firebase.js';
import { DEFAULT_SCHOOL_ID } from './school-service.js';
import { recordAuditEvent } from './audit-service.js';

const STORAGE_KEY_PREFIX = 'dse_messages_v2_';

/**
 * Helper to fetch messages for user (backwards compatibility)
 */
export async function getMessagesForUser(userEmail, schoolId = DEFAULT_SCHOOL_ID) {
  return getMessages({ userEmail }, schoolId);
}
export const OFFICIAL_STAFF_RECIPIENTS = [
  { id: 'director', role: 'director', name: 'د. طارق محمود المنشاوي (مدير عام المدرسة)', category: 'admin' },
  { id: 'social_affairs', role: 'social_affairs', name: 'أ. نادية مصطفى الشريف (الأخصائي الاجتماعي)', category: 'admin' },
  { id: 'tech_specialist', role: 'tech_specialist', name: 'م. حسام الدين عبد العزيز (مسؤول التطوير التكنولوجي)', category: 'admin' },
  { id: 'student_affairs', role: 'student_affairs', name: 'أ. محمود عبد الرحمن سالم (شؤون الطلاب والقيد)', category: 'admin' },
  { id: 'all_staff', role: 'staff', name: '📢 كافة هيئة التدريس والإدارة المدرسية', category: 'broadcast' },
  { id: 'teachers', role: 'teacher', name: '👨‍🏫 السادة معلمي المواد الدراسية', category: 'broadcast' },
];

/**
 * Class subject teachers catalog (Secondary 1/1)
 */
export const CLASS_1_1_TEACHERS = [
  { id: 'teacher_arabic', role: 'teacher', name: 'أ. إبراهيم فؤاد القاضي (معلم اللغة العربية)', subject: 'اللغة العربية', classRoom: 'فصل 1/1' },
  { id: 'teacher_english', role: 'teacher', name: 'أ. طه عبد الله (معلم اللغة الإنجليزية)', subject: 'اللغة الإنجليزية', classRoom: 'فصل 1/1' },
  { id: 'teacher_math', role: 'teacher', name: 'أ. مجدي فهمي (معلم الرياضيات)', subject: 'الرياضيات', classRoom: 'فصل 1/1' },
  { id: 'teacher_physics', role: 'teacher', name: 'أ. عصام الشامي (معلم الفيزياء)', subject: 'الفيزياء', classRoom: 'فصل 1/1' },
  { id: 'teacher_chemistry', role: 'teacher', name: 'أ. عادل النجار (معلم الكيمياء)', subject: 'الكيمياء', classRoom: 'فصل 1/1' },
  { id: 'teacher_biology', role: 'teacher', name: 'د. شيرين عزت (معلمة الأحياء)', subject: 'الأحياء', classRoom: 'فصل 1/1' },
];

/**
 * Class 1/1 students and parents catalog
 */
export const CLASS_1_1_STUDENTS = [
  { id: 'student_01', email: 'student@dse.edu.eg', role: 'student', name: 'يوسف أحمد المنشاوي (طالب فصل 1/1 - كود 2026101)' },
  { id: 'class_1_1', role: 'student', name: '📢 كافة طلاب فصل 1/1 (بث جماعي)' },
];

export const CLASS_1_1_PARENTS = [
  { id: 'parent_01', email: 'parent@dse.edu.eg', role: 'parent', name: 'أ. أحمد المنشاوي (ولي أمر الطالب يوسف - 1/1)' },
  { id: 'parents_1_1', role: 'parent', name: '📢 كافة أولياء أمور طلاب فصل 1/1' },
];

/**
 * Get strictly allowed recipients based on user's authorized role
 */
export function getAllowedRecipients(user) {
  if (!user) return [];
  const role = user.role;

  // Student can ONLY message teachers of their class + Social Specialist
  if (role === 'student') {
    return [
      ...CLASS_1_1_TEACHERS,
      { id: 'social_affairs', role: 'social_affairs', name: 'أ. نادية مصطفى الشريف (الأخصائي الاجتماعي)' },
    ];
  }

  // Parent can ONLY message teachers of their children's class + School Administration
  if (role === 'parent') {
    return [
      ...CLASS_1_1_TEACHERS,
      { id: 'director', role: 'director', name: 'د. طارق محمود المنشاوي (مدير عام المدرسة)' },
      { id: 'social_affairs', role: 'social_affairs', name: 'أ. نادية مصطفى الشريف (الأخصائي الاجتماعي)' },
      { id: 'student_affairs', role: 'student_affairs', name: 'قسم شؤون الطلاب والقيد' },
    ];
  }

  // Teacher can message students, parents, fellow teachers, and school admin
  if (role === 'teacher') {
    return [
      ...CLASS_1_1_STUDENTS,
      ...CLASS_1_1_PARENTS,
      { id: 'director', role: 'director', name: 'د. طارق محمود المنشاري (مدير عام المدرسة)' },
      { id: 'social_affairs', role: 'social_affairs', name: 'أ. نادية مصطفى الشريف (الأخصائي الاجتماعي)' },
      { id: 'student_affairs', role: 'student_affairs', name: 'أ. محمود عبد الرحمن سالم (شؤون الطلاب)' },
      { id: 'tech_specialist', role: 'tech_specialist', name: 'م. حسام الدين عبد العزيز (التطوير التكنولوجي)' },
      { id: 'teachers', role: 'teacher', name: '👨‍🏫 كافة الزملاء المعلمين' },
    ];
  }

  // Director, Social Affairs, Tech Specialist, Student Affairs, Super Admin have broad access
  return [
    ...OFFICIAL_STAFF_RECIPIENTS,
    ...CLASS_1_1_TEACHERS,
    ...CLASS_1_1_PARENTS,
    ...CLASS_1_1_STUDENTS,
  ];
}

/**
 * Initial seed messages for realistic immediate inbox experience
 */
const SEED_MESSAGES = [
  {
    id: 'msg_seed_01',
    schoolId: 'sch_cairo_sec_01',
    senderId: 'director_01',
    senderEmail: 'director@dse.edu.eg',
    senderName: 'د. طارق محمود المنشاوي',
    senderRole: 'director',
    recipientId: 'all_staff',
    recipientRole: 'staff',
    recipientName: 'كافة هيئة التدريس والإدارة',
    subject: 'تعليمات اختبارات شهر نوفمبر والتسليم الإلكتروني للدرجات',
    body: 'السادة الزملاء الأفاضل، يرجى التكرم ببدء إعداد نماذج الاختبارات الشهرية ومراجعة رصد أعمال السنة عبر البوابة الرقمية في موعد أقصاه الخميس القادم.',
    priority: 'high',
    createdAt: new Date(Date.now() - 3600000 * 4).toISOString(),
    formattedDate: 'اليوم، 10:30 ص',
    readBy: ['affairs_01', 'teacher_01'],
  },
  {
    id: 'msg_seed_02',
    schoolId: 'sch_cairo_sec_01',
    senderId: 'teacher_arabic',
    senderEmail: 'teacher@dse.edu.eg',
    senderName: 'أ. إبراهيم فؤاد القاضي',
    senderRole: 'teacher',
    recipientId: 'parent_01',
    recipientRole: 'parent',
    recipientName: 'أ. أحمد المنشاوي (ولي أمر)',
    subject: 'إشادة بتفوق وتميز الطالب يوسف في حصص اللغة العربية',
    body: 'تحية طيبة، يسعدني إبلاغكم بالمستوى المتميز والمشاركة الفعالة للطالب يوسف في القراءة والنحو خلال هذا الأسبوع، خالص التقدير لاهتمامكم المستمر.',
    priority: 'normal',
    createdAt: new Date(Date.now() - 3600000 * 24).toISOString(),
    formattedDate: 'أمس، 02:15 م',
    readBy: [],
  },
  {
    id: 'msg_seed_03',
    schoolId: 'sch_cairo_sec_01',
    senderId: 'social_01',
    senderEmail: 'social@dse.edu.eg',
    senderName: 'أ. نادية مصطفى الشريف',
    senderRole: 'social_affairs',
    recipientId: 'affairs_01',
    recipientRole: 'student_affairs',
    recipientName: 'قسم شؤون الطلاب',
    subject: 'تحديث بيانات إعفاءات الطلاب من المصروفات المدرسية',
    body: 'تم استلام وتدقيق الأوراق والبحوث الاجتماعية لـ 15 حالة جديدة ومطابقتها وفق القواعد الوزارية المعتمدة، برجاء مراجعة الاعتماد.',
    priority: 'normal',
    createdAt: new Date(Date.now() - 3600000 * 48).toISOString(),
    formattedDate: 'منذ يومين',
    readBy: ['affairs_01'],
  }
];

function getLocalMessages(schoolId) {
  try {
    const raw = localStorage.getItem(`${STORAGE_KEY_PREFIX}${schoolId}`);
    return raw ? JSON.parse(raw) : [...SEED_MESSAGES];
  } catch (e) {
    return [...SEED_MESSAGES];
  }
}

function setLocalMessages(schoolId, messages) {
  try {
    localStorage.setItem(`${STORAGE_KEY_PREFIX}${schoolId}`, JSON.stringify(messages));
  } catch (e) {
    console.warn('LocalStorage quota error saving messages:', e);
  }
}

/**
 * Send an internal message with audit trail
 */
export async function sendMessage(msgData, schoolId = DEFAULT_SCHOOL_ID) {
  const newMsg = {
    schoolId,
    senderId: msgData.senderId || 'user',
    senderEmail: msgData.senderEmail || '',
    senderName: msgData.senderName || 'مستخدم المنظومة',
    senderRole: msgData.senderRole || 'user',
    recipientId: msgData.recipientId || 'all',
    recipientRole: msgData.recipientRole || 'all',
    recipientName: msgData.recipientName || 'المستلم',
    subject: msgData.subject || 'رسالة داخلية جديدة',
    body: msgData.body || '',
    priority: msgData.priority || 'normal', // normal, high, urgent
    createdAt: new Date().toISOString(),
    formattedDate: new Intl.DateTimeFormat('ar-EG', { dateStyle: 'short', timeStyle: 'short' }).format(new Date()),
    readBy: [],
  };

  if (isFirebaseAvailable()) {
    try {
      const colRef = collection(db, 'schools', schoolId, 'messages');
      const docRef = await addDoc(colRef, newMsg);
      newMsg.id = docRef.id;
    } catch (err) {
      console.warn('Firestore sendMessage failed, using local:', err);
      newMsg.id = 'msg_' + Date.now();
    }
  } else {
    newMsg.id = 'msg_' + Date.now();
  }

  // Update local storage cache
  const localList = getLocalMessages(schoolId);
  localList.unshift(newMsg);
  setLocalMessages(schoolId, localList);

  // Record Audit Trail
  await recordAuditEvent({
    action: 'إرسال رسالة داخلية جديدة',
    target: newMsg.recipientName,
    details: `الموضوع: ${newMsg.subject} (الأهمية: ${newMsg.priority})`,
    category: 'messaging',
    operatorName: newMsg.senderName,
    operatorRole: newMsg.senderRole,
    operatorEmail: newMsg.senderEmail,
    schoolId,
  }).catch(() => {});

  return newMsg;
}

/**
 * Fetch messages strictly filtered for a specific user and role
 */
export async function getMessages({ userId = '', userEmail = '', userRole = '', filter = 'inbox' } = {}, schoolId = DEFAULT_SCHOOL_ID) {
  let all = [];

  if (isFirebaseAvailable()) {
    try {
      const colRef = collection(db, 'schools', schoolId, 'messages');
      const snap = await getDocs(colRef);
      if (!snap.empty) {
        all = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      }
    } catch (err) {
      console.warn('Firestore getMessages failed, falling back to local:', err);
    }
  }

  if (all.length === 0) {
    all = getLocalMessages(schoolId);
  }

  // Sort newest first
  all.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  const isUserSender = (m) => {
    if (userId && m.senderId === userId) return true;
    if (userEmail && m.senderEmail && m.senderEmail === userEmail) return true;
    return false;
  };

  if (filter === 'sent') {
    return all.filter(m => isUserSender(m) || (m.senderRole === userRole && (!m.senderId || m.senderId === 'user')));
  }

  // Inbox filter: user matches recipientId OR user's role matches recipientRole
  return all.filter(m => {
    if (isUserSender(m)) return false; // Don't show sent messages in inbox

    // Targeted direct message to this user ID or email
    if (userId && m.recipientId === userId) return true;
    if (userEmail && (m.recipientId === userEmail || m.recipientEmail === userEmail)) return true;

    // Student specific routing
    if (userRole === 'student') {
      return m.recipientId === 'student_01' || m.recipientId === 'class_1_1' || m.recipientRole === 'student';
    }

    // Parent specific routing
    if (userRole === 'parent') {
      return m.recipientId === 'parent_01' || m.recipientId === 'parents_1_1' || m.recipientRole === 'parent';
    }

    // Teacher specific routing
    if (userRole === 'teacher') {
      return m.recipientId === 'teacher_01' || m.recipientId === 'teacher_arabic' || m.recipientRole === 'teacher' || m.recipientId === 'teachers' || m.recipientId === 'all_staff';
    }

    // Role-level match
    if (m.recipientRole === userRole) return true;
    if (m.recipientId === userRole) return true;

    // Staff broadcast
    const staffRoles = ['director', 'social_affairs', 'tech_specialist', 'student_affairs', 'teacher', 'super_admin'];
    if (staffRoles.includes(userRole) && (m.recipientId === 'all' || m.recipientId === 'all_staff')) {
      return true;
    }

    // Director & Social Affairs oversight on administrative mail
    if (userRole === 'director' || userRole === 'super_admin' || userRole === 'social_affairs') {
      if (m.recipientRole === 'staff' || m.recipientId === 'director' || m.recipientId === 'social_affairs') return true;
    }

    return false;
  });
}

/**
 * Mark message as read by user
 */
export async function markMessageAsRead(messageId, userId, schoolId = DEFAULT_SCHOOL_ID) {
  if (!messageId || !userId) return;

  const localList = getLocalMessages(schoolId);
  const msg = localList.find(m => m.id === messageId);
  if (msg) {
    if (!msg.readBy) msg.readBy = [];
    if (!msg.readBy.includes(userId)) {
      msg.readBy.push(userId);
      setLocalMessages(schoolId, localList);
    }
  }

  if (isFirebaseAvailable()) {
    try {
      const docRef = doc(db, 'schools', schoolId, 'messages', messageId);
      await setDoc(docRef, {
        readBy: msg?.readBy || [userId]
      }, { merge: true });
    } catch (err) {
      console.warn('Firestore markMessageAsRead notice:', err?.message || err);
    }
  }
}

/**
 * Get count of unread messages for badge display
 */
export async function getUnreadCount(userId, userRole, schoolId = DEFAULT_SCHOOL_ID) {
  const inbox = await getMessages({ userId, userRole, filter: 'inbox' }, schoolId);
  return inbox.filter(m => !(m.readBy || []).includes(userId)).length;
}
