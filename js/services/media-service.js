// ==========================================================================
// DIGITAL SCHOOL ECOSYSTEM — MEDIA & GALLERY MANAGEMENT SERVICE
// Albums, Images Metadata, Categories & School Branding Media
// ==========================================================================

import {
  db,
  isFirebaseAvailable,
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
} from '../firebase.js';
import { getCurrentUser } from '../auth.js';
import { recordAuditEvent } from './audit-service.js';
import { deleteMediaImage } from './cloudinary-service.js';

const ALBUMS_KEY = 'dse_media_albums';
const MEDIA_ITEMS_KEY = 'dse_media_items';
const BRANDING_MEDIA_KEY = 'dse_branding_media';

// Configurable Album Categories
export const MEDIA_CATEGORIES = [
  { id: 'activities', nameAr: 'الأنشطة المدرسية', nameEn: 'School Activities', icon: 'activity' },
  { id: 'competitions', nameAr: 'المسابقات والجوائز', nameEn: 'Competitions', icon: 'award' },
  { id: 'tech', nameAr: 'العلوم والتكنولوجيا والابتكار', nameEn: 'Science & Technology', icon: 'cpu' },
  { id: 'trips', nameAr: 'الرحلات والزيارات الميدانية', nameEn: 'School Trips', icon: 'map-pin' },
  { id: 'events', nameAr: 'الاحتفالات والفعاليات الرسمية', nameEn: 'Events & Celebrations', icon: 'calendar' },
  { id: 'projects', nameAr: 'مشاريع ومعارض الطلاب', nameEn: 'Student Projects', icon: 'briefcase' },
  { id: 'sports', nameAr: 'الأنشطة الرياضية والدوريات', nameEn: 'Sports', icon: 'flag' },
  { id: 'news', nameAr: 'التغطيات الإعلامية والأخبار', nameEn: 'School News', icon: 'file-text' },
  { id: 'other', nameAr: 'أخرى', nameEn: 'Other', icon: 'folder' }
];

/**
 * Checks if the current user has permission to manage media and albums.
 * ONLY Administrator (director, super_admin) and Technology Specialist (tech_specialist).
 */
export function canManageMedia() {
  const user = getCurrentUser();
  if (!user) return false;
  return ['director', 'super_admin', 'tech_specialist'].includes(user.role);
}

// --------------------------------------------------------------------------
// 1. Album Management (CRUD)
// --------------------------------------------------------------------------

/**
 * Creates a new media album.
 */
export async function createAlbum(albumData) {
  if (!canManageMedia()) {
    throw new Error('غير مصرح لك بإنشاء ألبومات. الصلاحية مقتصرة على الإدارة ومسؤول التطوير التكنولوجي.');
  }

  const user = getCurrentUser();
  const schoolId = user.schoolId || 'sch_cairo_sec_01';
  const albumId = albumData.id || `alb_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;

  const newAlbum = {
    id: albumId,
    schoolId,
    titleAr: albumData.titleAr || 'ألبوم جديد',
    titleEn: albumData.titleEn || albumData.titleAr || 'New Album',
    descriptionAr: albumData.descriptionAr || '',
    descriptionEn: albumData.descriptionEn || '',
    categoryId: albumData.categoryId || 'activities',
    activityDate: albumData.activityDate || new Date().toISOString().split('T')[0],
    coverUrl: albumData.coverUrl || '',
    coverPublicId: albumData.coverPublicId || '',
    status: albumData.status || 'published', // 'published' | 'draft' | 'archived'
    isPublic: albumData.status === 'published',
    privacyCompliant: albumData.privacyCompliant !== false, // minor privacy consent verified
    photoCount: 0,
    createdBy: user.uid,
    createdByName: user.displayName || user.name || 'مسؤول التكنولوجيا',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  // 1. Save to Firestore
  if (isFirebaseAvailable()) {
    try {
      const albumRef = doc(db, 'schools', schoolId, 'albums', albumId);
      await setDoc(albumRef, newAlbum);
    } catch (err) {
      console.warn('Firestore album create failed, falling back to local', err);
    }
  }

  // 2. Save to local storage
  const albums = getStoredAlbums();
  albums.unshift(newAlbum);
  localStorage.setItem(ALBUMS_KEY, JSON.stringify(albums));

  recordAuditEvent({
    action: 'CREATE_ALBUM',
    module: 'MEDIA_GALLERY',
    details: `تم إنشاء ألبوم: ${newAlbum.titleAr} (${albumId})`,
    performedBy: user.email || user.uid,
    role: user.role
  });

  return newAlbum;
}

/**
 * Retrieves albums for a school, with optional filtering.
 * @param {Object} filter - { schoolId, categoryId, status, onlyPublic }
 */
export async function getAlbums(filter = {}) {
  const schoolId = filter.schoolId || (getCurrentUser() ? getCurrentUser().schoolId : 'sch_cairo_sec_01');
  let albums = [];

  if (isFirebaseAvailable()) {
    try {
      const albumsRef = collection(db, 'schools', schoolId, 'albums');
      const q = filter.onlyPublic
        ? query(albumsRef, where('status', '==', 'published'))
        : albumsRef;
      const snapshot = await getDocs(q);
      snapshot.forEach(docSnap => {
        albums.push(docSnap.data());
      });
    } catch (err) {
      console.warn('Firestore fetch albums failed, using local storage', err);
    }
  }

  if (albums.length === 0) {
    albums = getStoredAlbums().filter(a => !a.schoolId || a.schoolId === schoolId);
  }

  // Filter by category if requested
  if (filter.categoryId && filter.categoryId !== 'all') {
    albums = albums.filter(a => a.categoryId === filter.categoryId);
  }

  // Filter public only
  if (filter.onlyPublic) {
    albums = albums.filter(a => a.status === 'published');
  }

  // Sort descending by date
  return albums.sort((a, b) => new Date(b.activityDate || b.createdAt) - new Date(a.activityDate || a.createdAt));
}

/**
 * Get album details by ID.
 */
export async function getAlbumById(albumId, schoolId = 'sch_cairo_sec_01') {
  if (isFirebaseAvailable()) {
    try {
      const docRef = doc(db, 'schools', schoolId, 'albums', albumId);
      const snap = await getDoc(docRef);
      if (snap.exists()) return snap.data();
    } catch (err) {
      console.warn('Firestore getAlbumById failed', err);
    }
  }

  const local = getStoredAlbums();
  return local.find(a => a.id === albumId) || null;
}

/**
 * Updates an existing album.
 */
export async function updateAlbum(albumId, updates) {
  if (!canManageMedia()) throw new Error('Unauthorized');

  const user = getCurrentUser();
  const schoolId = user.schoolId || 'sch_cairo_sec_01';
  updates.updatedAt = new Date().toISOString();

  if (updates.status) {
    updates.isPublic = updates.status === 'published';
  }

  if (isFirebaseAvailable()) {
    try {
      const albumRef = doc(db, 'schools', schoolId, 'albums', albumId);
      await updateDoc(albumRef, updates);
    } catch (err) {
      console.warn('Firestore update album failed', err);
    }
  }

  const albums = getStoredAlbums();
  const idx = albums.findIndex(a => a.id === albumId);
  if (idx !== -1) {
    albums[idx] = { ...albums[idx], ...updates };
    localStorage.setItem(ALBUMS_KEY, JSON.stringify(albums));
  }

  recordAuditEvent({
    action: 'UPDATE_ALBUM',
    module: 'MEDIA_GALLERY',
    details: `تم تحديث ألبوم: ${albumId}`,
    performedBy: user.email || user.uid,
    role: user.role
  });

  return albums[idx];
}

/**
 * Deletes an album and its associated images.
 */
export async function deleteAlbum(albumId) {
  if (!canManageMedia()) throw new Error('Unauthorized');

  const user = getCurrentUser();
  const schoolId = user.schoolId || 'sch_cairo_sec_01';

  // 1. Delete Firestore record
  if (isFirebaseAvailable()) {
    try {
      const albumRef = doc(db, 'schools', schoolId, 'albums', albumId);
      await deleteDoc(albumRef);
    } catch (err) {
      console.warn('Firestore delete album failed', err);
    }
  }

  // 2. Delete local records
  let albums = getStoredAlbums();
  albums = albums.filter(a => a.id !== albumId);
  localStorage.setItem(ALBUMS_KEY, JSON.stringify(albums));

  let media = getStoredMedia();
  media = media.filter(m => m.albumId !== albumId);
  localStorage.setItem(MEDIA_ITEMS_KEY, JSON.stringify(media));

  recordAuditEvent({
    action: 'DELETE_ALBUM',
    module: 'MEDIA_GALLERY',
    details: `تم حذف الألبوم: ${albumId}`,
    performedBy: user.email || user.uid,
    role: user.role
  });

  return true;
}

// --------------------------------------------------------------------------
// 2. Media Items in Albums
// --------------------------------------------------------------------------

/**
 * Adds uploaded image metadata into an album.
 */
export async function addMediaToAlbum(albumId, mediaData) {
  if (!canManageMedia()) throw new Error('Unauthorized');

  const user = getCurrentUser();
  const schoolId = user.schoolId || 'sch_cairo_sec_01';
  const mediaId = mediaData.id || `med_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;

  const item = {
    id: mediaId,
    albumId,
    schoolId,
    publicId: mediaData.publicId,
    secureUrl: mediaData.secureUrl,
    width: mediaData.width || 1200,
    height: mediaData.height || 800,
    format: mediaData.format || 'jpg',
    captionAr: mediaData.captionAr || '',
    captionEn: mediaData.captionEn || '',
    displayOrder: mediaData.displayOrder || 0,
    uploadedBy: user.uid,
    createdAt: new Date().toISOString()
  };

  // 1. Save to Firestore subcollection
  if (isFirebaseAvailable()) {
    try {
      const mediaRef = doc(db, 'schools', schoolId, 'albums', albumId, 'images', mediaId);
      await setDoc(mediaRef, item);
    } catch (err) {
      console.warn('Firestore add image to album failed', err);
    }
  }

  // 2. Save locally
  const media = getStoredMedia();
  media.push(item);
  localStorage.setItem(MEDIA_ITEMS_KEY, JSON.stringify(media));

  // Update photo count and cover if needed
  const albums = getStoredAlbums();
  const alb = albums.find(a => a.id === albumId);
  if (alb) {
    alb.photoCount = (alb.photoCount || 0) + 1;
    if (!alb.coverUrl) {
      alb.coverUrl = item.secureUrl;
      alb.coverPublicId = item.publicId;
    }
    updateAlbum(albumId, { photoCount: alb.photoCount, coverUrl: alb.coverUrl, coverPublicId: alb.coverPublicId });
  }

  return item;
}

/**
 * Retrieves all images inside an album.
 */
export async function getAlbumImages(albumId, schoolId = 'sch_cairo_sec_01') {
  let images = [];

  if (isFirebaseAvailable()) {
    try {
      const colRef = collection(db, 'schools', schoolId, 'albums', albumId, 'images');
      const snap = await getDocs(colRef);
      snap.forEach(d => images.push(d.data()));
    } catch (err) {
      console.warn('Firestore fetch album images failed', err);
    }
  }

  if (images.length === 0) {
    images = getStoredMedia().filter(m => m.albumId === albumId);
  }

  return images.sort((a, b) => (a.displayOrder || 0) - (b.displayOrder || 0));
}

/**
 * Removes an image from an album.
 */
export async function deleteAlbumImage(albumId, imageId, publicId) {
  if (!canManageMedia()) throw new Error('Unauthorized');

  const user = getCurrentUser();
  const schoolId = user.schoolId || 'sch_cairo_sec_01';

  // Request Cloudflare Worker to delete from Cloudinary
  if (publicId) {
    await deleteMediaImage(publicId, schoolId);
  }

  // Firestore delete
  if (isFirebaseAvailable()) {
    try {
      const docRef = doc(db, 'schools', schoolId, 'albums', albumId, 'images', imageId);
      await deleteDoc(docRef);
    } catch (err) {
      console.warn('Firestore image delete failed', err);
    }
  }

  // Local delete
  let media = getStoredMedia();
  media = media.filter(m => m.id !== imageId);
  localStorage.setItem(MEDIA_ITEMS_KEY, JSON.stringify(media));

  // Decrement album photo count
  const albums = getStoredAlbums();
  const alb = albums.find(a => a.id === albumId);
  if (alb && alb.photoCount > 0) {
    alb.photoCount -= 1;
    updateAlbum(albumId, { photoCount: alb.photoCount });
  }

  return true;
}

// --------------------------------------------------------------------------
// 3. School Branding Assets (Logo, Banners, Leadership)
// --------------------------------------------------------------------------

export function getSchoolBrandingAssets() {
  try {
    const raw = localStorage.getItem(BRANDING_MEDIA_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch (err) {
    return {};
  }
}

export function saveSchoolBrandingAsset(assetType, assetData) {
  if (!canManageMedia()) throw new Error('Unauthorized');
  const assets = getSchoolBrandingAssets();
  assets[assetType] = {
    ...assetData,
    updatedAt: new Date().toISOString()
  };
  localStorage.setItem(BRANDING_MEDIA_KEY, JSON.stringify(assets));
  return assets;
}

// --------------------------------------------------------------------------
// Local Storage Helpers
// --------------------------------------------------------------------------
function getStoredAlbums() {
  try {
    const raw = localStorage.getItem(ALBUMS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (err) {
    return [];
  }
}

function getStoredMedia() {
  try {
    const raw = localStorage.getItem(MEDIA_ITEMS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (err) {
    return [];
  }
}

