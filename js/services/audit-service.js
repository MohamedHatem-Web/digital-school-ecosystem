// ==========================================================================
// DIGITAL SCHOOL ECOSYSTEM (VANILLA EDITION)
// Operational Audit Trail Service (Cloud Firestore)
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

const CACHE_AUDIT_KEY = 'dse_audit_logs_';

export async function recordAuditEvent({ action, target, details, operatorRole = 'director', schoolId = DEFAULT_SCHOOL_ID }) {
  const logId = `log_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
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
    operatorRole,
    schoolId,
  };

  try {
    const logRef = doc(db, 'schools', schoolId, 'auditLogs', logId);
    await setDoc(logRef, {
      ...logEntry,
      createdAt: serverTimestamp(),
    });
  } catch (err) {
    console.warn('Firestore recordAuditEvent notice:', err);
  }

  // Update local cache
  const existing = await getAuditLogs(schoolId);
  const updated = [logEntry, ...existing];
  if (updated.length > 100) updated.pop();
  localStorage.setItem(`${CACHE_AUDIT_KEY}${schoolId}`, JSON.stringify(updated));

  return logEntry;
}

export async function getAuditLogs(schoolId = DEFAULT_SCHOOL_ID) {
  try {
    const logsCol = collection(db, 'schools', schoolId, 'auditLogs');
    const snapshot = await getDocs(logsCol);
    const list = [];
    snapshot.forEach((docSnap) => {
      list.push({ id: docSnap.id, ...docSnap.data() });
    });

    // Sort descending by timestamp
    list.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    localStorage.setItem(`${CACHE_AUDIT_KEY}${schoolId}`, JSON.stringify(list));
    return list;
  } catch (err) {
    console.warn('Firestore getAuditLogs notice (cache fallback):', err);
    const cached = localStorage.getItem(`${CACHE_AUDIT_KEY}${schoolId}`);
    return cached ? JSON.parse(cached) : [];
  }
}
