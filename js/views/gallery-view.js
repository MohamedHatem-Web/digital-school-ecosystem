// ==========================================================================
// DIGITAL SCHOOL ECOSYSTEM (VANILLA EDITION)
// SPA View Module: Media Gallery & Albums (Cloudinary)
// ==========================================================================

import {
  getAlbums,
  createAlbum,
  deleteAlbum,
  getAlbumImages,
  addMediaToAlbum,
  MEDIA_CATEGORIES,
} from '../services/media-service.js';
import { showToast, showConfirmModal } from '../components.js';

let isInitialized = false;
let currentAlbums = [];

export async function renderGalleryView(container) {
  if (!isInitialized) {
    container.innerHTML = `
      <div style="display: flex; flex-direction: column; gap: var(--space-5);">
        <!-- Page Header -->
        <div style="display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: var(--space-4);">
          <div>
            <h1 style="font-size: var(--text-2xl); font-weight: 800; color: var(--color-primary-950); margin-bottom: 2px;">
              📸 معرض الصور والوسائط المدرسية (Cloudinary)
            </h1>
            <p style="font-size: var(--text-sm); color: var(--text-muted); margin: 0;">
              توثيق الأنشطة والفعاليات الرسمية والرفع المعتمد للألبومات على الموقع العام.
            </p>
          </div>
          <div>
            <button class="btn btn-primary btn-md" id="gallery-open-create-btn" style="font-weight: 700;">
              <span>+ إنشاء ألبوم جديد</span>
            </button>
          </div>
        </div>

        <!-- Institutional Notice -->
        <div style="background-color: var(--bg-surface-subtle); border: 1px solid var(--border-subtle); border-radius: var(--radius-sm); padding: var(--space-3) var(--space-4); display: flex; align-items: center; gap: var(--space-3); font-size: var(--text-xs); color: var(--text-primary);">
          <span style="font-size: 1.25rem;">🔒</span>
          <div>
            <strong>الأمان والخصوصية:</strong> يتم توثيق كافة وسائط المدرسة رسمياً وحمايتها مع التحقق من موافقات أولياء الأمور قبل النشر العام.
          </div>
        </div>

        <!-- Filter & Search Bar -->
        <div class="panel" style="padding: var(--space-3) var(--space-4);">
          <div style="display: flex; gap: var(--space-3); flex-wrap: wrap; align-items: center; justify-content: space-between;">
            <div style="display: flex; gap: var(--space-2); flex: 1; min-width: 280px; flex-wrap: wrap;">
              <input type="text" id="gallery-search-input" class="form-control" placeholder="بحث باسم الألبوم أو النشاط..." style="max-width: 320px; font-size: var(--text-xs);">
              <select id="gallery-cat-filter" class="form-control" style="max-width: 200px; font-size: var(--text-xs);">
                <option value="all">جميع التصنيفات</option>
                <option value="activities">الأنشطة المدرسية</option>
                <option value="competitions">المسابقات والجوائز</option>
                <option value="tech">العلوم والتكنولوجيا</option>
                <option value="trips">الرحلات الميدانية</option>
                <option value="events">الاحتفالات الرسمية</option>
                <option value="sports">الأنشطة الرياضية</option>
                <option value="news">التغطيات الإعلامية</option>
              </select>
            </div>
            <div>
              <span id="gallery-album-count" class="badge badge-accent">0 ألبومات</span>
            </div>
          </div>
        </div>

        <!-- Albums Grid -->
        <div id="gallery-albums-grid" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: var(--space-5);">
          <!-- Populated dynamically -->
        </div>

        <!-- Empty State -->
        <div id="gallery-empty-state" class="empty-state" style="display: none; padding: var(--space-10);">
          <div class="empty-state-icon">📸</div>
          <h3 class="empty-state-title">لا توجد ألبومات صور مطابقة</h3>
          <p class="empty-state-desc">اضغط على زر "إنشاء ألبوم جديد" لإضافة أول ألبوم توثيقي للأنشطة.</p>
        </div>
      </div>

      <!-- Create Album Modal -->
      <div class="modal-backdrop" id="gallery-create-modal" style="display: none; position: fixed; inset: 0; background: rgba(0,0,0,0.6); z-index: 1000; align-items: center; justify-content: center; padding: var(--space-4);">
        <div class="panel" style="max-width: 520px; width: 100%; box-shadow: var(--shadow-xl);">
          <div class="panel-header" style="display: flex; justify-content: space-between; align-items: center;">
            <h3 class="panel-title" style="margin: 0;">📸 إنشاء ألبوم وسائط رسمي جديد</h3>
            <button type="button" class="btn btn-sm" id="gallery-close-modal-btn">✕</button>
          </div>
          <div class="panel-body">
            <form id="gallery-new-album-form">
              <div class="form-group" style="margin-bottom: var(--space-3);">
                <label class="form-label" for="alb-title">عنوان الألبوم *</label>
                <input type="text" id="alb-title" class="form-control" required placeholder="مثال: المعرض السنوي للابتكارات العلمية 2026">
              </div>

              <div style="display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-3); margin-bottom: var(--space-3);">
                <div class="form-group">
                  <label class="form-label" for="alb-cat">تصنيف الفعالية *</label>
                  <select id="alb-cat" class="form-control" required>
                    <option value="activities">الأنشطة المدرسية</option>
                    <option value="competitions">المسابقات والجوائز</option>
                    <option value="tech">العلوم والتكنولوجيا</option>
                    <option value="trips">الرحلات الميدانية</option>
                    <option value="events">الاحتفالات الرسمية</option>
                    <option value="sports">الأنشطة الرياضية</option>
                    <option value="news">التغطيات الإعلامية</option>
                  </select>
                </div>
                <div class="form-group">
                  <label class="form-label" for="alb-date">تاريخ الفعالية *</label>
                  <input type="date" id="alb-date" class="form-control" required>
                </div>
              </div>

              <div class="form-group" style="margin-bottom: var(--space-3);">
                <label class="form-label" for="alb-desc">نبذة عن الفعالية</label>
                <textarea id="alb-desc" class="form-control" rows="2" placeholder="وصف موجز للمشاركين والفعالية..."></textarea>
              </div>

              <div style="display: flex; justify-content: flex-end; gap: var(--space-2); margin-top: var(--space-4);">
                <button type="button" class="btn btn-outline" id="gallery-cancel-modal-btn">إلغاء</button>
                <button type="submit" class="btn btn-primary">حفظ واعتماد الألبوم</button>
              </div>
            </form>
          </div>
        </div>
      </div>
    `;

    bindGalleryEvents(container);
    isInitialized = true;
  }

  await loadAlbums();
}

async function loadAlbums() {
  const grid = document.getElementById('gallery-albums-grid');
  const emptyState = document.getElementById('gallery-empty-state');
  const countBadge = document.getElementById('gallery-album-count');
  if (!grid) return;

  currentAlbums = await getAlbums('sch_cairo_sec_01');
  if (countBadge) countBadge.textContent = `${currentAlbums.length} ألبومات`;

  renderAlbumsGrid();
}

function renderAlbumsGrid() {
  const grid = document.getElementById('gallery-albums-grid');
  const emptyState = document.getElementById('gallery-empty-state');
  const q = (document.getElementById('gallery-search-input')?.value || '').toLowerCase().trim();
  const cat = document.getElementById('gallery-cat-filter')?.value || 'all';

  const filtered = currentAlbums.filter((a) => {
    if (cat !== 'all' && a.category !== cat) return false;
    if (q && !(a.titleAr || '').toLowerCase().includes(q) && !(a.descriptionAr || '').toLowerCase().includes(q)) return false;
    return true;
  });

  if (filtered.length === 0) {
    grid.innerHTML = '';
    emptyState.style.display = 'flex';
    return;
  }

  emptyState.style.display = 'none';
  grid.innerHTML = filtered.map((alb) => `
    <article class="panel" style="overflow: hidden; display: flex; flex-direction: column;">
      <div style="height: 160px; background: var(--bg-surface-subtle); display: flex; align-items: center; justify-content: center; position: relative; overflow: hidden;">
        ${alb.coverImageUrl ? `<img src="${alb.coverImageUrl}" alt="${alb.titleAr}" style="width: 100%; height: 100%; object-fit: cover;">` : `<span style="font-size: 3rem;">📸</span>`}
        <span class="badge badge-primary" style="position: absolute; top: 10px; right: 10px; box-shadow: var(--shadow-sm);">${alb.categoryTitle || alb.category}</span>
      </div>
      <div class="panel-body" style="flex: 1; display: flex; flex-direction: column; justify-content: space-between;">
        <div>
          <h3 style="font-size: var(--text-base); font-weight: 800; color: var(--color-primary-950); margin-bottom: var(--space-1);">${alb.titleAr}</h3>
          <p style="font-size: var(--text-xs); color: var(--text-secondary); line-height: var(--leading-relaxed); margin: 0 0 var(--space-3);">
            ${alb.descriptionAr || 'توثيق رسمي للأنشطة والفعاليات المدرسية المعتمدة.'}
          </p>
        </div>
        <div style="display: flex; justify-content: space-between; align-items: center; border-top: 1px solid var(--border-subtle); padding-top: var(--space-3);">
          <span style="font-size: 11px; color: var(--text-muted); font-weight: 600;">📅 ${alb.date || '2026'}</span>
          <button type="button" class="btn btn-outline btn-sm delete-album-btn" data-id="${alb.id}" style="color: var(--color-danger-text); padding: 2px 8px; font-size: 11px;">
            🗑️ حذف
          </button>
        </div>
      </div>
    </article>
  `).join('');

  grid.querySelectorAll('.delete-album-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const ok = await showConfirmModal({
        title: 'حذف ألبوم الصور',
        message: 'هل أنت متأكد من حذف هذا الألبوم بكافة وسائطه؟',
        danger: true,
      });
      if (ok) {
        await deleteAlbum(btn.dataset.id);
        showToast('تم حذف الألبوم بنجاح');
        await loadAlbums();
      }
    });
  });
}

function bindGalleryEvents(container) {
  const openModalBtn = document.getElementById('gallery-open-create-btn');
  const modal = document.getElementById('gallery-create-modal');
  const closeModalBtn = document.getElementById('gallery-close-modal-btn');
  const cancelModalBtn = document.getElementById('gallery-cancel-modal-btn');
  const form = document.getElementById('gallery-new-album-form');

  const hideModal = () => { modal.style.display = 'none'; };
  openModalBtn.addEventListener('click', () => {
    document.getElementById('alb-date').value = new Date().toISOString().split('T')[0];
    modal.style.display = 'flex';
  });
  closeModalBtn.addEventListener('click', hideModal);
  cancelModalBtn.addEventListener('click', hideModal);

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    await createAlbum({
      titleAr: document.getElementById('alb-title').value.trim(),
      category: document.getElementById('alb-cat').value,
      date: document.getElementById('alb-date').value,
      descriptionAr: document.getElementById('alb-desc').value.trim(),
      status: 'published',
    });
    form.reset();
    hideModal();
    await loadAlbums();
  });

  document.getElementById('gallery-search-input')?.addEventListener('input', renderAlbumsGrid);
  document.getElementById('gallery-cat-filter')?.addEventListener('change', renderAlbumsGrid);
}

