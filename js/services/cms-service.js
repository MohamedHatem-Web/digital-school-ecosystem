// ==========================================================================
// DIGITAL SCHOOL ECOSYSTEM (VANILLA EDITION)
// Content Management System (CMS) for Public Website (Cloud Firestore)
// ==========================================================================

import {
  db,
  collection,
  doc,
  getDocs,
  setDoc,
  deleteDoc,
  serverTimestamp,
} from '../firebase.js';
import { DEFAULT_SCHOOL_ID } from './school-service.js';
import { recordAuditEvent } from './audit-service.js';

const CACHE_CMS_KEY = 'dse_cms_content_';

export const getCmsContent = getCmsItems;
export const createCmsContent = createCmsItem;
export const updateCmsContent = updateCmsItem;
export const deleteCmsContent = deleteCmsItem;

/**
 * Fast Firestore Promise with timeout helper
 */
function withTimeout(promise, ms = 2500) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error('Network timeout - synced locally')), ms))
  ]);
}

/**
 * Fetch CMS items for a category
 * Cache-first for lightning fast UI, then syncs from Firestore in background
 * @param {string} category 'news' | 'activities' | 'leadership' | 'announcements' | 'all'
 * @param {string} status 'published' | 'draft' | 'all'
 */
export async function getCmsItems(category = 'all', status = 'published', schoolId = DEFAULT_SCHOOL_ID) {
  let list = [];

  // 1. Read immediate local cache
  const cached = localStorage.getItem(`${CACHE_CMS_KEY}${schoolId}`);
  if (cached) {
    try {
      list = JSON.parse(cached);
    } catch (e) {
      list = [];
    }
  }

  // 2. Fetch from Cloud Firestore if list is empty or online
  if (list.length === 0) {
    try {
      const col = collection(db, 'schools', schoolId, 'cmsContent');
      const snap = await withTimeout(getDocs(col), 2000);
      const remoteList = [];
      snap.forEach((d) => remoteList.push({ id: d.id, ...d.data() }));

      if (remoteList.length > 0) {
        list = remoteList;
        localStorage.setItem(`${CACHE_CMS_KEY}${schoolId}`, JSON.stringify(list));
      }
    } catch (e) {
      // Offline or network timeout - fallback to cache safely
    }
  } else {
    // Background sync without blocking the caller
    (async () => {
      try {
        const col = collection(db, 'schools', schoolId, 'cmsContent');
        const snap = await withTimeout(getDocs(col), 3000);
        const remoteList = [];
        snap.forEach((d) => remoteList.push({ id: d.id, ...d.data() }));
        if (remoteList.length > 0) {
          localStorage.setItem(`${CACHE_CMS_KEY}${schoolId}`, JSON.stringify(remoteList));
        }
      } catch (err) {
        // silent background sync catch
      }
    })();
  }

  let filtered = [...list];
  if (category !== 'all') filtered = filtered.filter((i) => i.category === category);
  if (status !== 'all') filtered = filtered.filter((i) => i.status === status);

  // Sorting: leadership is sorted by sortOrder (ascending: 1, 2, 3...)
  if (category === 'leadership') {
    filtered.sort((a, b) => (Number(a.sortOrder) || 99) - (Number(b.sortOrder) || 99));
  } else {
    filtered.sort((a, b) => new Date(b.date || b.createdAt || 0) - new Date(a.date || a.createdAt || 0));
  }

  return filtered;
}

/**
 * Create a new CMS item (News, activity, leadership, or announcement)
 * Instant local cache write + background Firestore persistence
 */
export async function createCmsItem({ category, title, summary, role, content, imageUrl, status = 'published', authorName, sortOrder = 99, date, requireRemote = false }, schoolId = DEFAULT_SCHOOL_ID) {
  const cleanTitle = String(title).trim();
  if (!cleanTitle) throw new Error('يرجى كتابة عنوان للمحتوى.');

  const itemId = `cms_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const now = new Date();

  const itemData = {
    id: itemId,
    category: category || 'news',
    title: cleanTitle,
    summary: summary || role || '',
    role: role || summary || '',
    content: content || '',
    imageUrl: imageUrl || '',
    status, // published | draft
    authorName: authorName || 'إدارة المدرسة',
    sortOrder: Number(sortOrder) || 1,
    date: date || now.toISOString().split('T')[0],
    formattedDate: new Intl.DateTimeFormat('ar-EG', { dateStyle: 'long' }).format(now),
    schoolId,
    createdAt: now.toISOString(),
  };

  const docRef = doc(db, 'schools', schoolId, 'cmsContent', itemId);
  const remoteWrite = setDoc(docRef, { ...itemData, serverCreatedAt: serverTimestamp() });
  if (requireRemote) {
    try {
      await withTimeout(remoteWrite, 15000);
    } catch (error) {
      throw new Error(`تعذر تأكيد حفظ البيانات على الخادم: ${error.message}`);
    }
  }

  // 1. Update the local cache after the required server write succeeds.
  let existing = [];
  try {
    const raw = localStorage.getItem(`${CACHE_CMS_KEY}${schoolId}`);
    if (raw) existing = JSON.parse(raw);
  } catch (e) {
    existing = [];
  }
  const updated = [itemData, ...existing.filter(i => i.id !== itemId)];
  localStorage.setItem(`${CACHE_CMS_KEY}${schoolId}`, JSON.stringify(updated));

  // 2. Keep non-leadership publishing behavior non-blocking.
  if (!requireRemote) {
    withTimeout(remoteWrite, 3000).catch((e) => {
      console.warn('Background Firestore save notice:', e.message);
    });
  }

  // 3. Audit log (Non-blocking)
  recordAuditEvent({
    action: status === 'published' ? 'نشر محتوى جديد على الموقع العام' : 'حفظ مسودة محتوى للموقع العام',
    target: `[${category}] ${cleanTitle}`,
    details: `الترتيب: #${itemData.sortOrder} | الحالة: ${status}`,
    category: 'cms',
    schoolId,
  }).catch(() => {});

  return itemData;
}

/**
 * Update an existing CMS item
 * Instant local cache write + background Firestore persistence
 */
export async function updateCmsItem(itemId, updateData, options = DEFAULT_SCHOOL_ID) {
  if (!itemId) throw new Error('معرف العنصر مطلوب للتعديل.');
  const requireRemote = typeof options === 'object' && options.requireRemote === true;
  const schoolId = typeof options === 'string' ? options : DEFAULT_SCHOOL_ID;

  let existing = [];
  try {
    const raw = localStorage.getItem(`${CACHE_CMS_KEY}${schoolId}`);
    if (raw) existing = JSON.parse(raw);
  } catch (e) {
    existing = [];
  }

  const index = existing.findIndex(i => i.id === itemId);
  if (index === -1) throw new Error('العنصر المطلوب غير موجود.');

  const updatedItem = {
    ...existing[index],
    ...updateData,
    updatedAt: new Date().toISOString(),
  };

  const docRef = doc(db, 'schools', schoolId, 'cmsContent', itemId);
  const remoteWrite = setDoc(docRef, { ...updatedItem, serverUpdatedAt: serverTimestamp() }, { merge: true });
  if (requireRemote) {
    try {
      await withTimeout(remoteWrite, 15000);
    } catch (error) {
      throw new Error(`تعذر تأكيد حفظ التعديلات على الخادم: ${error.message}`);
    }
  }

  // 1. Update the local cache after the required server write succeeds.
  existing[index] = updatedItem;
  localStorage.setItem(`${CACHE_CMS_KEY}${schoolId}`, JSON.stringify(existing));

  // 2. Keep non-leadership updates non-blocking.
  if (!requireRemote) {
    withTimeout(remoteWrite, 3000).catch((e) => {
      console.warn('Background Firestore update notice:', e.message);
    });
  }

  // 3. Audit log (Non-blocking)
  recordAuditEvent({
    action: 'تعديل محتوى معتمد على الموقع العام',
    target: `[${updatedItem.category}] ${updatedItem.title}`,
    details: `الترتيب: #${updatedItem.sortOrder || '—'} | تم تحديث البيانات بنجاح`,
    category: 'cms',
    schoolId,
  }).catch(() => {});

  return updatedItem;
}

/**
 * Delete a CMS item
 * Instant local cache write + background Firestore persistence
 */
export async function deleteCmsItem(itemId, schoolId = DEFAULT_SCHOOL_ID) {
  let existing = [];
  try {
    const raw = localStorage.getItem(`${CACHE_CMS_KEY}${schoolId}`);
    if (raw) existing = JSON.parse(raw);
  } catch (e) {
    existing = [];
  }

  const item = existing.find(i => i.id === itemId);
  const updated = existing.filter((i) => i.id !== itemId);
  localStorage.setItem(`${CACHE_CMS_KEY}${schoolId}`, JSON.stringify(updated));

  withTimeout((async () => {
    const docRef = doc(db, 'schools', schoolId, 'cmsContent', itemId);
    await deleteDoc(docRef);
  })(), 3000).catch((e) => {
    console.warn('Background Firestore delete notice:', e.message);
  });

  recordAuditEvent({
    action: 'حذف محتوى من الموقع العام',
    target: item ? `[${item.category}] ${item.title}` : itemId,
    details: 'تم الحذف من قاعدة بيانات الـ CMS',
    category: 'cms',
    schoolId,
  }).catch(() => {});
}
