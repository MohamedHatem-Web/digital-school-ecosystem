// ==========================================================================
// DIGITAL SCHOOL ECOSYSTEM (VANILLA EDITION)
// Comprehensive Activity & Operational Audit Trail Service (Cloud Firestore)
// ==========================================================================

import {
  db,
  collection,
  doc,
  getDocs,
  setDoc,
  serverTimestamp,
  isFirebaseAvailable,
} from '../firebase.js';
import { DEFAULT_SCHOOL_ID } from './school-service.js';

const CACHE_AUDIT_KEY = 'dse_audit_logs_';

export const AUDIT_ROLES_MAP = {
  director: 'مدير المدرسة',
  social_affairs: 'الأخصائي الاجتماعي',
  tech_specialist: 'أخصائي التطوير التكنولوجي',
  student_affairs: 'شؤون الطلاب والقيد',
  teacher: 'معلم',
  student: 'طالب',
  parent: 'ولي أمر',
  system: 'النظام الآلي',
  super_admin: 'الإدارة المركزية',
};

export const AUDIT_CATEGORIES_MAP = {
  all: 'كافة التصنيفات',
  auth: 'أمان وتسجيل دخول',
  attendance: 'حضور وغياب وانصراف',
  tablet: 'منظومة التابلت والعهد',
  gate_pass: 'أذونات وبوابات إلكترونية',
  grades: 'رصد درجات وتقييمات',
  social: 'إنذارات ومتابعة اجتماعية',
  messaging: 'مراسلات وبريد داخلي',
  cms: 'إدارة المحتوى والهوية',
  profile: 'بيانات المدرسة والإعدادات',
  general: 'عمليات تشغيلية عامة',
};

/**
 * Helper to get currently logged-in user from storage as default fallback
 */
function getActiveSessionUser() {
  try {
    const raw = sessionStorage.getItem('dse_session') || localStorage.getItem('dse_current_user');
    if (raw) {
      const u = JSON.parse(raw);
      return {
        name: u.name || u.displayName || 'مستخدم المنظومة',
        role: u.role || 'system',
        email: u.email || '',
      };
    }
  } catch (e) {
    // fallback
  }
  return { name: 'النظام الآلي', role: 'system', email: '' };
}

/**
 * Record a comprehensive audit event across any user role or system operation
 */
export async function recordAuditEvent({
  action,
  target,
  details = '',
  category = 'general',
  operatorName,
  operatorRole,
  operatorEmail,
  schoolId = DEFAULT_SCHOOL_ID,
  metadata = null,
}) {
  const sessionUser = getActiveSessionUser();
  const finalOperatorName = operatorName || sessionUser.name;
  const finalOperatorRole = operatorRole || sessionUser.role;
  const finalOperatorEmail = operatorEmail || sessionUser.email;

  const logId = `log_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const now = new Date();

  const logEntry = {
    id: logId,
    timestamp: now.toISOString(),
    formattedDate: new Intl.DateTimeFormat('ar-EG', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(now),
    action: action || 'عملية تشغيلية',
    target: target || 'عام',
    details: details || '',
    category: category || 'general',
    operatorName: finalOperatorName,
    operatorRole: finalOperatorRole,
    operatorEmail: finalOperatorEmail,
    roleTitleAr: AUDIT_ROLES_MAP[finalOperatorRole] || finalOperatorRole,
    categoryTitleAr: AUDIT_CATEGORIES_MAP[category] || category,
    schoolId,
    metadata: metadata || {},
  };

  if (isFirebaseAvailable()) {
    try {
      const logRef = doc(db, 'schools', schoolId, 'auditLogs', logId);
      await setDoc(logRef, {
        ...logEntry,
        createdAt: serverTimestamp(),
      });
    } catch (err) {
      console.warn('Firestore recordAuditEvent notice:', err);
    }
  }

  // Update local cache
  try {
    const existing = await getAuditLogs(schoolId, false);
    const updated = [logEntry, ...existing];
    // Keep last 300 logs in local storage
    if (updated.length > 300) updated.pop();
    localStorage.setItem(`${CACHE_AUDIT_KEY}${schoolId}`, JSON.stringify(updated));
  } catch (e) {
    console.warn('Cache update audit notice:', e);
  }

  return logEntry;
}

/**
 * Retrieve audit logs (from Firestore or cache)
 */
export async function getAuditLogs(schoolId = DEFAULT_SCHOOL_ID, fetchRemote = true) {
  if (fetchRemote && isFirebaseAvailable()) {
    try {
      const logsCol = collection(db, 'schools', schoolId, 'auditLogs');
      const snapshot = await getDocs(logsCol);
      const list = [];
      snapshot.forEach((docSnap) => {
        list.push({ id: docSnap.id, ...docSnap.data() });
      });

      if (list.length > 0) {
        list.sort((a, b) => new Date(b.timestamp || b.createdAt) - new Date(a.timestamp || a.createdAt));
        localStorage.setItem(`${CACHE_AUDIT_KEY}${schoolId}`, JSON.stringify(list));
        return list;
      }
    } catch (err) {
      console.warn('Firestore getAuditLogs notice (cache fallback):', err);
    }
  }

  const cached = localStorage.getItem(`${CACHE_AUDIT_KEY}${schoolId}`);
  if (cached) {
    try {
      return JSON.parse(cached);
    } catch (e) {
      return [];
    }
  }
  return [];
}

/**
 * Filter audit logs by query, role, category, and date range
 */
export function filterAuditLogs(logs = [], { query = '', role = 'all', category = 'all', startDate = '', endDate = '' } = {}) {
  const q = String(query).trim().toLowerCase();

  return logs.filter((log) => {
    // Role filter
    if (role && role !== 'all' && log.operatorRole !== role) {
      return false;
    }

    // Category filter
    if (category && category !== 'all' && log.category !== category) {
      return false;
    }

    // Date range filter
    if (startDate) {
      const logDate = new Date(log.timestamp).toISOString().split('T')[0];
      if (logDate < startDate) return false;
    }
    if (endDate) {
      const logDate = new Date(log.timestamp).toISOString().split('T')[0];
      if (logDate > endDate) return false;
    }

    // Text search query
    if (q) {
      const haystack = [
        log.action,
        log.target,
        log.details,
        log.operatorName,
        log.operatorEmail,
        log.roleTitleAr,
        log.categoryTitleAr,
      ].filter(Boolean).join(' ').toLowerCase();

      if (!haystack.includes(q)) return false;
    }

    return true;
  });
}

/**
 * Export logs to CSV with UTF-8 BOM for flawless Excel Arabic display
 */
export function exportAuditLogsToCsv(logs = [], filename = `سجل_نشاطات_المدرسة_${Date.now()}.csv`) {
  const headers = ['المعرف', 'التاريخ والوقت', 'المنفذ', 'الصفة الرسمية', 'البريد', 'التصنيف', 'العملية', 'الهدف / المستهدف', 'التفاصيل'];
  
  const escapeCsv = (str) => {
    if (str === null || str === undefined) return '""';
    const s = String(str).replace(/"/g, '""');
    return `"${s}"`;
  };

  const rows = logs.map((log) => [
    escapeCsv(log.id),
    escapeCsv(log.formattedDate || log.timestamp),
    escapeCsv(log.operatorName || 'النظام'),
    escapeCsv(log.roleTitleAr || log.operatorRole || ''),
    escapeCsv(log.operatorEmail || ''),
    escapeCsv(log.categoryTitleAr || log.category || ''),
    escapeCsv(log.action || ''),
    escapeCsv(log.target || ''),
    escapeCsv(log.details || ''),
  ].join(','));

  const csvContent = '\uFEFF' + [headers.map(escapeCsv).join(','), ...rows].join('\r\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
