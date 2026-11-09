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

/**
 * Fetch CMS items for a category
 * @param {string} category 'news' | 'activities' | 'leadership' | 'announcements' | 'all'
 * @param {string} status 'published' | 'draft' | 'all'
 */
export async function getCmsItems(category = 'all', status = 'published', schoolId = DEFAULT_SCHOOL_ID) {
  try {
    const col = collection(db, 'schools', schoolId, 'cmsContent');
    const snap = await getDocs(col);
    const list = [];
    snap.forEach((d) => list.push({ id: d.id, ...d.data() }));

    // Sort descending by date
    list.sort((a, b) => new Date(b.date || b.createdAt) - new Date(a.date || a.createdAt));
    localStorage.setItem(`${CACHE_CMS_KEY}${schoolId}`, JSON.stringify(list));

    let filtered = list;
    if (category !== 'all') filtered = filtered.filter((i) => i.category === category);
    if (status !== 'all') filtered = filtered.filter((i) => i.status === status);

    return filtered;
  } catch (e) {
    console.warn('Firestore getCmsItems notice:', e);
    const cached = localStorage.getItem(`${CACHE_CMS_KEY}${schoolId}`);
    const list = cached ? JSON.parse(cached) : [];
    let filtered = list;
    if (category !== 'all') filtered = filtered.filter((i) => i.category === category);
    if (status !== 'all') filtered = filtered.filter((i) => i.status === status);
    return filtered;
  }
}

/**
 * Create a new CMS item (News, activity, leadership, or announcement)
 */
export async function createCmsItem({ category, title, summary, content, imageUrl, status = 'published', authorName }, schoolId = DEFAULT_SCHOOL_ID) {
  const cleanTitle = String(title).trim();
  if (!cleanTitle) throw new Error('يرجى كتابة عنوان للمحتوى.');

  const itemId = `cms_${Date.now()}`;
  const now = new Date();

  const itemData = {
    id: itemId,
    category: category || 'news',
    title: cleanTitle,
    summary: summary || '',
    content: content || '',
    imageUrl: imageUrl || '',
    status, // published | draft
    authorName: authorName || 'إدارة المدرسة',
    date: now.toISOString().split('T')[0],
    formattedDate: new Intl.DateTimeFormat('ar-EG', { dateStyle: 'long' }).format(now),
    schoolId,
    createdAt: now.toISOString(),
  };

  try {
    const docRef = doc(db, 'schools', schoolId, 'cmsContent', itemId);
    await setDoc(docRef, { ...itemData, serverCreatedAt: serverTimestamp() });
  } catch (e) {
    console.warn('Firestore createCmsItem notice:', e);
  }

  const existing = await getCmsItems('all', 'all', schoolId);
  const updated = [itemData, ...existing];
  localStorage.setItem(`${CACHE_CMS_KEY}${schoolId}`, JSON.stringify(updated));

  await recordAuditEvent({
    action: status === 'published' ? 'نشر محتوى جديد على الموقع العام' : 'حفظ مسودة محتوى للموقع العام',
    target: `[${category}] ${cleanTitle}`,
    details: `الحالة: ${status}`,
    operatorRole: 'tech_specialist',
    schoolId,
  });

  return itemData;
}

/**
 * Delete a CMS item
 */
export async function deleteCmsItem(itemId, schoolId = DEFAULT_SCHOOL_ID) {
  try {
    const docRef = doc(db, 'schools', schoolId, 'cmsContent', itemId);
    await deleteDoc(docRef);
  } catch (e) {
    console.warn('Firestore deleteCmsItem notice:', e);
  }

  const existing = await getCmsItems('all', 'all', schoolId);
  const updated = existing.filter((i) => i.id !== itemId);
  localStorage.setItem(`${CACHE_CMS_KEY}${schoolId}`, JSON.stringify(updated));

  await recordAuditEvent({
    action: 'حذف محتوى من الموقع العام',
    target: itemId,
    details: 'تم الحذف من قاعدة بيانات الـ CMS',
    operatorRole: 'tech_specialist',
    schoolId,
  });
}
