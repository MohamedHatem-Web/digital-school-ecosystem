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
  query,
  where,
  addDoc,
  updateDoc,
  arrayUnion,
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
const SEED_MESSAGES = [];

function getLocalMessages(schoolId) {
  try {
    const raw = localStorage.getItem(`${STORAGE_KEY_PREFIX}${schoolId}`);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    return [];
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

  if (!isFirebaseAvailable()) {
    throw new Error('لا يمكن إرسال الرسالة دون اتصال بخادم المدرسة. لم يتم إرسالها.');
  }
  try {
    const colRef = collection(db, 'schools', schoolId, 'messages');
    const docRef = await addDoc(colRef, newMsg);
    newMsg.id = docRef.id;
  } catch (err) {
    console.warn('Firestore sendMessage failed:', err);
    throw new Error(`لم يتم إرسال الرسالة إلى خادم المدرسة: ${err.message || 'تحقق من الاتصال والصلاحيات.'}`);
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
function normalizeString(value) {
  return String(value || '').trim().toLowerCase();
}

export async function getMessages({ userId = '', userEmail = '', userRole = '', filter = 'inbox' } = {}, schoolId = DEFAULT_SCHOOL_ID) {
  let all = [];

  if (isFirebaseAvailable()) {
    const constraints = new Map();
    const addConstraint = (field, value) => {
      if (value) constraints.set(`${field}:${value}`, where(field, '==', value));
    };

    if (filter === 'sent') {
      addConstraint('senderId', userId);
      addConstraint('senderEmail', userEmail);
    } else {
      addConstraint('recipientId', userId);
      addConstraint('recipientEmail', userEmail);
      addConstraint('recipientId', userRole);
      addConstraint('recipientRole', userRole);
      if (['director', 'social_affairs', 'tech_specialist', 'student_affairs', 'teacher'].includes(userRole)) {
        addConstraint('recipientId', 'all_staff');
      }
      if (userRole === 'teacher') addConstraint('recipientId', 'teachers');
    }

    try {
      const colRef = collection(db, 'schools', schoolId, 'messages');
      const snapshots = await Promise.all([...constraints.values()].map((constraint) =>
        getDocs(query(colRef, constraint)).catch((error) => {
          console.warn('Firestore getMessages scoped query notice:', error);
          return null;
        })
      ));
      const remoteMessages = new Map();
      snapshots.filter(Boolean).forEach((snapshot) => snapshot.forEach((messageDoc) => {
        remoteMessages.set(messageDoc.id, { id: messageDoc.id, ...messageDoc.data() });
      }));
      all = [...remoteMessages.values()];
    } catch (err) {
      console.warn('Firestore getMessages failed, falling back to local:', err);
    }
  }

  const localMessages = getLocalMessages(schoolId);
  const mergedMessages = new Map(localMessages.map((message) => [message.id, message]));
  all.forEach((message) => mergedMessages.set(message.id, message));
  all = [...mergedMessages.values()];

  // Sort newest first
  all.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  const isUserSender = (m) => {
    if (userId && m.senderId === userId) return true;
    if (userEmail && m.senderEmail && normalizeString(m.senderEmail) === normalizeString(userEmail)) return true;
    return false;
  };

  const matchesRecipient = (m) => {
    if (userId && m.recipientId === userId) return true;
    if (userEmail && normalizeString(m.recipientId) === normalizeString(userEmail)) return true;
    if (userEmail && normalizeString(m.recipientEmail) === normalizeString(userEmail)) return true;
    if (m.recipientRole === userRole) return true;
    if (m.recipientId === userRole) return true;
    const staffRoles = ['director', 'social_affairs', 'tech_specialist', 'student_affairs', 'teacher'];
    if (userRole && staffRoles.includes(userRole) && (m.recipientRole === 'staff' || m.recipientId === 'all_staff')) return true;
    if (userRole === 'teacher' && m.recipientId === 'teachers') return true;
    if (userRole === 'student' && (m.recipientRole === 'student' || m.recipientId === 'student')) return true;
    if (userRole === 'parent' && (m.recipientRole === 'parent' || m.recipientId === 'parent')) return true;
    if (userRole === 'teacher' && (m.recipientRole === 'teacher' || m.recipientId === 'teachers')) return true;
    return false;
  };

  if (filter === 'sent') {
    return all.filter(m => isUserSender(m) || (m.senderRole === userRole && (!m.senderId || m.senderId === 'user')));
  }

  return all.filter(m => {
    if (isUserSender(m)) return false;
    return matchesRecipient(m);
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
      await updateDoc(docRef, { readBy: arrayUnion(userId) });
    } catch (err) {
      console.warn('Firestore markMessageAsRead notice:', err?.message || err);
    }
  }
}

/**
 * Get count of unread messages for badge display
 */
export async function getUnreadCount(userId, userRole, schoolId = DEFAULT_SCHOOL_ID, userEmail = '') {
  const inbox = await getMessages({ userId, userEmail, userRole, filter: 'inbox' }, schoolId);
  return inbox.filter(m => !(m.readBy || []).includes(userId)).length;
}
