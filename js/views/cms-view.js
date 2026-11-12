// ==========================================================================
// DIGITAL SCHOOL ECOSYSTEM (VANILLA EDITION)
// SPA View Module: Institutional CMS Hub (Leadership, News, Activities, Calendar)
// Full Editing Capabilities & Photo Upload
// ==========================================================================

import {
  getCmsContent,
  createCmsContent,
  updateCmsContent,
  deleteCmsContent,
} from '../services/cms-service.js';
import { getSchoolProfile, updateSchoolProfile } from '../services/school-service.js';
import { compressMediaImage, uploadMediaImage } from '../services/cloudinary-service.js';
import { showToast, showConfirmModal } from '../components.js';
import { skeletonTable, skeletonForm } from '../utils/skeleton-utils.js';

let isInitialized = false;
const renderedPanes = new Set();

export async function renderCmsView(container) {
  if (!isInitialized) {
    container.innerHTML = `
      <div style="display: flex; flex-direction: column; gap: var(--space-5);">
        <div>
          <h1 style="font-size: var(--text-2xl); font-weight: 800; color: var(--color-primary-950); margin-bottom: var(--space-1);">
            🏛️ مركز إدارة المحتوى والهيكل المدرسي (CMS Hub)
          </h1>
          <p style="font-size: var(--text-sm); color: var(--text-muted); margin: 0;">
            إدارة وتحديث محتوى صفحات الموقع العام الرسمية: القيادة المدرسية، الأخبار والبيانات، الأنشطة، والتقويم السنوي مع إمكانية تعديل البيانات ورفع الصور.
          </p>
        </div>

        <!-- CMS Sub-Tabs Navigation -->
        <div style="display: flex; gap: var(--space-2); flex-wrap: wrap;" id="cms-subtabs-bar">
          <button type="button" class="btn btn-primary btn-sm cms-subtab-btn active" data-target="leadership">
            <span>👥</span> <span>القيادة المدرسية والمكتب الفني</span>
          </button>
          <button type="button" class="btn btn-outline btn-sm cms-subtab-btn" data-target="news">
            <span>📰</span> <span>الأخبار والبيانات الرسمية</span>
          </button>
          <button type="button" class="btn btn-outline btn-sm cms-subtab-btn" data-target="activities">
            <span>🏆</span> <span>الأنشطة والمسابقات</span>
          </button>
          <button type="button" class="btn btn-outline btn-sm cms-subtab-btn" data-target="calendar">
            <span>📅</span> <span>التقويم الدراسي والمواعيد</span>
          </button>
          <button type="button" class="btn btn-outline btn-sm cms-subtab-btn" data-target="profile">
            <span>🏫</span> <span>بيانات وهوية المدرسة</span>
          </button>
        </div>

        <!-- Sub-panel Persistent Tab Containers (Instant Tab Switching, Zero Reload) -->
        <div id="cms-sub-content">
          <div id="cms-pane-leadership"></div>
          <div id="cms-pane-news" style="display: none;"></div>
          <div id="cms-pane-activities" style="display: none;"></div>
          <div id="cms-pane-calendar" style="display: none;"></div>
          <div id="cms-pane-profile" style="display: none;"></div>
        </div>
      </div>
    `;

    // Wire up sub-tabs
    const subTabBtns = container.querySelectorAll('.cms-subtab-btn');
    subTabBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        subTabBtns.forEach(b => {
          b.classList.remove('btn-primary', 'active');
          b.classList.add('btn-outline');
        });
        btn.classList.remove('btn-outline');
        btn.classList.add('btn-primary', 'active');
        loadSubSection(btn.getAttribute('data-target'));
      });
    });

    isInitialized = true;
  }

  await loadSubSection('leadership');
}

async function loadSubSection(sectionKey) {
  const panes = {
    leadership: document.getElementById('cms-pane-leadership'),
    news: document.getElementById('cms-pane-news'),
    activities: document.getElementById('cms-pane-activities'),
    calendar: document.getElementById('cms-pane-calendar'),
    profile: document.getElementById('cms-pane-profile'),
  };

  Object.keys(panes).forEach(k => {
    if (panes[k]) panes[k].style.display = (k === sectionKey) ? 'block' : 'none';
  });

  const activePane = panes[sectionKey];
  if (!activePane) return;

  // If already rendered once, show immediately (0ms lag, no skeleton reload)
  if (!renderedPanes.has(sectionKey)) {
    activePane.innerHTML = `
      <div style="display: flex; flex-direction: column; gap: var(--space-4);">
        ${skeletonForm(3)}
        ${skeletonTable(4, 5)}
      </div>
    `;
    if (sectionKey === 'leadership') await renderLeadershipSub(activePane);
    else if (sectionKey === 'news') await renderNewsSub(activePane);
    else if (sectionKey === 'activities') await renderActivitiesSub(activePane);
    else if (sectionKey === 'calendar') await renderCalendarSub(activePane);
    else if (sectionKey === 'profile') await renderProfileSub(activePane);
    renderedPanes.add(sectionKey);
  }
}

// --------------------------------------------------------------------------
// 1. Leadership Subview (With Photo Upload, Move Up/Down & Rank Validation)
// --------------------------------------------------------------------------
async function renderLeadershipSub(container) {
  const list = (await getCmsContent('leadership', 'all')) || [];
  list.sort((a, b) => (Number(a.sortOrder) || 99) - (Number(b.sortOrder) || 99));

  // Determine next available unique rank
  const existingOrders = list.map(i => Number(i.sortOrder) || 0);
  const maxOrder = existingOrders.length ? Math.max(...existingOrders) : 0;
  const nextOrder = maxOrder + 1;

  let editingLeaderId = null;

  container.innerHTML = `
    <div style="display:flex; flex-direction:column; gap: var(--space-4);">
      <div class="panel" style="border-inline-start: 4px solid var(--color-primary-800);">
        <div class="panel-header" style="display:flex; justify-content:space-between; align-items:center;">
          <h3 class="panel-title" id="ldr-form-title" style="margin:0;">إضافة عضو قيادي جديد لدليل المدرسة</h3>
          <button type="button" class="btn btn-sm" id="ldr-cancel-edit-btn" style="display: none;">✕ إلغاء التعديل</button>
        </div>
        <div class="panel-body">
          <form id="ldr-form">
            <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: var(--space-3); margin-bottom: var(--space-3);">
              <div class="form-group">
                <label class="form-label" for="ldr-name">الاسم واللقب *</label>
                <input type="text" id="ldr-name" class="form-control" required placeholder="مثال: د. طارق محمود المنشاوي">
              </div>
              <div class="form-group">
                <label class="form-label" for="ldr-role">المسمى الوظيفي *</label>
                <input type="text" id="ldr-role" class="form-control" required placeholder="مثال: مدير عام المدرسة">
              </div>
              <div class="form-group">
                <label class="form-label" for="ldr-order">الترتيب في العرض (الرتبة)</label>
                <input type="number" id="ldr-order" class="form-control" value="${nextOrder}" min="1">
                <small style="color: var(--text-muted); font-size: 11px;">(الرقم الأقل يظهر أولاً بالموقع)</small>
              </div>
            </div>

            <!-- Leader Photo Upload Section (with Auto-Compress) -->
            <div class="form-group" style="margin-bottom: var(--space-3);">
              <label class="form-label">صورة عضو القيادة</label>
              <div style="display: flex; align-items: center; gap: var(--space-3); flex-wrap: wrap;">
                <div id="ldr-img-preview-box" style="width: 50px; height: 50px; border-radius: 50%; background: var(--bg-surface-subtle); border: 2px solid var(--border-light); display: flex; align-items: center; justify-content: center; overflow: hidden; flex-shrink: 0;">
                  <span id="ldr-img-placeholder" style="font-size: 1.5rem;">👔</span>
                  <img id="ldr-img-preview" src="" alt="معاينة" style="display: none; width: 100%; height: 100%; object-fit: cover;">
                </div>
                <input type="file" id="ldr-photo-file" accept="image/*" style="display: none;">
                <input type="hidden" id="ldr-photo-val" value="">
                <button type="button" id="ldr-upload-btn" class="btn btn-outline btn-sm">
                  📸 رفع صورة شخصية من جهازك
                </button>
                <small style="color: var(--text-muted); font-size: 11px;">(يتم ضغط الصورة تلقائياً لسرعة التحميل الفورية)</small>
              </div>
            </div>

            <div class="form-group" style="margin-bottom: var(--space-3);">
              <label class="form-label" for="ldr-bio">نبذة مختصرة أو كلمة المسؤول</label>
              <textarea id="ldr-bio" class="form-control" rows="2" placeholder="كلمة ترحيبية أو التخصص الإداري..."></textarea>
            </div>
            <div style="display:flex; justify-content:flex-end;">
              <button type="submit" id="ldr-submit-btn" class="btn btn-primary btn-sm">حفظ وإضافة للموقع</button>
            </div>
          </form>
        </div>
      </div>

      <div class="panel" style="padding:0; overflow:hidden;">
        <div class="panel-header" style="display:flex; justify-content:space-between; align-items:center;">
          <h3 class="panel-title" style="margin:0;">أعضاء القيادة المدرسية المسجلون</h3>
          <span class="badge badge-primary">${list.length} قيادات</span>
        </div>
        <div class="table-wrap" style="border:none;">
          <table class="data-table">
            <thead>
              <tr>
                <th style="width: 85px;">الترتيب</th>
                <th style="width: 55px; text-align: center;">الصورة</th>
                <th>الاسم واللقب</th>
                <th>المسمى الوظيفي</th>
                <th>نبذة</th>
                <th style="width: 90px; text-align: center;">إجراءات</th>
              </tr>
            </thead>
            <tbody>
              ${list.length > 0 ? list.map((item, idx) => `
                <tr>
                  <td style="white-space: nowrap;">
                    <div style="display: flex; align-items: center; gap: 4px;">
                      <span class="badge badge-accent" style="font-weight: 800; font-family: monospace;">#${item.sortOrder || idx + 1}</span>
                      <div style="display: inline-flex; flex-direction: column; gap: 1px;">
                        <button type="button" class="btn btn-sm ldr-move-up" data-id="${item.id}" title="تقديم للأعلى" style="padding: 0 4px; font-size: 8px; line-height: 1.2; ${idx === 0 ? 'opacity: 0.3; pointer-events: none;' : ''}">▲</button>
                        <button type="button" class="btn btn-sm ldr-move-down" data-id="${item.id}" title="تأخير للأسفل" style="padding: 0 4px; font-size: 8px; line-height: 1.2; ${idx === list.length - 1 ? 'opacity: 0.3; pointer-events: none;' : ''}">▼</button>
                      </div>
                    </div>
                  </td>
                  <td style="text-align: center;">
                    <div style="width: 36px; height: 36px; border-radius: 50%; overflow: hidden; background: var(--bg-surface-subtle); display: inline-flex; align-items: center; justify-content: center; border: 1px solid var(--border-light);">
                      ${item.imageUrl ? `<img src="${item.imageUrl}" alt="" style="width: 100%; height: 100%; object-fit: cover;">` : '👔'}
                    </div>
                  </td>
                  <td><strong>${item.title || item.name || '—'}</strong></td>
                  <td><span class="badge badge-primary">${item.summary || item.role || item.subtitle || 'قيادي'}</span></td>
                  <td style="font-size:12px; color:var(--text-muted);">${item.content || item.bio || '—'}</td>
                  <td style="text-align:center;">
                    <div style="display: inline-flex; gap: 4px;">
                      <button type="button" class="btn btn-sm btn-outline edit-ldr-btn" data-id="${item.id}" title="تعديل">✏️</button>
                      <button type="button" class="btn btn-sm btn-outline del-cms-btn" data-id="${item.id}" title="حذف" style="color:var(--color-danger-text);">✕</button>
                    </div>
                  </td>
                </tr>
              `).join('') : '<tr><td colspan="6" style="text-align:center; padding:20px;">لا توجد بيانات قيادة مسجلة بعد</td></tr>'}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `;

  // Image Upload Logic with Instant Auto-Compression
  const fileInput = document.getElementById('ldr-photo-file');
  const uploadBtn = document.getElementById('ldr-upload-btn');
  const photoVal = document.getElementById('ldr-photo-val');
  const previewImg = document.getElementById('ldr-img-preview');
  const placeholder = document.getElementById('ldr-img-placeholder');

  uploadBtn?.addEventListener('click', () => fileInput?.click());

  fileInput?.addEventListener('change', async () => {
    const file = fileInput.files[0];
    if (!file) return;
    const previousUrl = photoVal.value;
    uploadBtn.disabled = true;
    uploadBtn.textContent = 'جارٍ ضغط الصورة...';
    try {
      const compressedFile = await compressMediaImage(file, 700, 0.82);
      const uploaded = await uploadMediaImage(compressedFile, {
        assetType: 'leadership',
        onStatus: (status) => { uploadBtn.textContent = status; },
        onProgress: (progress) => { uploadBtn.textContent = `جارٍ الرفع إلى Cloudinary ${progress}%`; },
      });
      photoVal.value = uploaded.secureUrl;
      previewImg.src = uploaded.secureUrl;
      previewImg.style.display = 'block';
      placeholder.style.display = 'none';
    } catch (error) {
      photoVal.value = previousUrl;
      showToast(error.message, 'error');
    } finally {
      uploadBtn.disabled = false;
      uploadBtn.textContent = photoVal.value ? '✓ تم رفع الصورة' : '📸 رفع صورة شخصية من جهازك';
    }
  });

  // Edit Leader Logic
  const formTitle = document.getElementById('ldr-form-title');
  const submitBtn = document.getElementById('ldr-submit-btn');
  const cancelBtn = document.getElementById('ldr-cancel-edit-btn');

  function resetLeaderForm() {
    editingLeaderId = null;
    document.getElementById('ldr-form').reset();
    formTitle.textContent = 'إضافة عضو قيادي جديد لدليل المدرسة';
    submitBtn.textContent = 'حفظ وإضافة للموقع';
    cancelBtn.style.display = 'none';
    photoVal.value = '';
    previewImg.style.display = 'none';
    placeholder.style.display = 'block';
    const orderInput = document.getElementById('ldr-order');
    if (orderInput) orderInput.value = nextOrder;
  }

  cancelBtn?.addEventListener('click', resetLeaderForm);

  // Wire Edit button
  container.querySelectorAll('.edit-ldr-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.id;
      const item = list.find(l => l.id === id);
      if (!item) return;

      editingLeaderId = id;
      formTitle.textContent = `تعديل بيانات: ${item.title || item.name}`;
      submitBtn.textContent = 'حفظ التعديلات 💾';
      cancelBtn.style.display = 'inline-flex';

      document.getElementById('ldr-name').value = item.title || item.name || '';
      document.getElementById('ldr-role').value = item.summary || item.role || item.subtitle || '';
      document.getElementById('ldr-order').value = item.sortOrder || item.order || 1;
      document.getElementById('ldr-bio').value = item.content || item.bio || '';

      if (item.imageUrl) {
        photoVal.value = item.imageUrl;
        previewImg.src = item.imageUrl;
        previewImg.style.display = 'block';
        placeholder.style.display = 'none';
      } else {
        photoVal.value = '';
        previewImg.style.display = 'none';
        placeholder.style.display = 'block';
      }

      document.getElementById('ldr-form').scrollIntoView({ behavior: 'smooth' });
    });
  });

  // Move Up / Move Down buttons (Instant rank swap)
  container.querySelectorAll('.ldr-move-up').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.id;
      const idx = list.findIndex(l => l.id === id);
      if (idx > 0) {
        const current = list[idx];
        const prev = list[idx - 1];
        const tempOrder = current.sortOrder || (idx + 1);
        const prevOrder = prev.sortOrder || idx;
        await updateCmsContent(current.id, { sortOrder: prevOrder });
        await updateCmsContent(prev.id, { sortOrder: tempOrder === prevOrder ? tempOrder + 1 : tempOrder });
        showToast('✓ تم تقديم الترتيب للأعلى بنجاح');
        await renderLeadershipSub(container);
      }
    });
  });

  container.querySelectorAll('.ldr-move-down').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.id;
      const idx = list.findIndex(l => l.id === id);
      if (idx < list.length - 1) {
        const current = list[idx];
        const next = list[idx + 1];
        const tempOrder = current.sortOrder || (idx + 1);
        const nextOrder = next.sortOrder || (idx + 2);
        await updateCmsContent(current.id, { sortOrder: nextOrder });
        await updateCmsContent(next.id, { sortOrder: tempOrder === nextOrder ? tempOrder - 1 : tempOrder });
        showToast('✓ تم تأخير الترتيب للأسفل بنجاح');
        await renderLeadershipSub(container);
      }
    });
  });

  // Submit Leader Form
  document.getElementById('ldr-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const title = document.getElementById('ldr-name').value.trim();
    const role = document.getElementById('ldr-role').value.trim();
    const sortOrder = Number(document.getElementById('ldr-order').value);
    const content = document.getElementById('ldr-bio').value.trim();
    const imageUrl = photoVal.value;

    if (!Number.isInteger(sortOrder) || sortOrder < 1) {
      showToast('أدخل رقم ترتيب صحيحًا يبدأ من 1.', 'error');
      document.getElementById('ldr-order').focus();
      return;
    }
    if (list.some(item => item.id !== editingLeaderId && Number(item.sortOrder) === sortOrder)) {
      showToast(`الترتيب رقم ${sortOrder} مستخدم بالفعل. اختر رقمًا آخر.`, 'error');
      document.getElementById('ldr-order').focus();
      return;
    }

    submitBtn.disabled = true;
    submitBtn.innerHTML = '<span>⏳</span><span>جارٍ الحفظ والاعتماد...</span>';

    try {
      if (editingLeaderId) {
        await updateCmsContent(editingLeaderId, {
          title,
          summary: role,
          role,
          sortOrder,
          content,
          imageUrl,
        }, { requireRemote: true });
        showToast('✓ تم حفظ تعديلات عضو القيادة بنجاح.');
      } else {
        await createCmsContent({
          category: 'leadership',
          title,
          summary: role,
          role,
          sortOrder,
          content,
          imageUrl,
          status: 'published',
          requireRemote: true,
        });
        showToast('✓ تم إضافة عضو القيادة وترتيبه بالمنظومة.');
      }
      resetLeaderForm();
      await renderLeadershipSub(container);
    } catch (err) {
      showToast('خطأ: ' + err.message, 'error');
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = 'حفظ وإضافة للموقع';
    }
  });

  // Delete Leader Button
  container.querySelectorAll('.del-cms-btn').forEach(b => {
    b.addEventListener('click', async () => {
      const ok = await showConfirmModal({
        title: 'حذف عضو قيادة',
        message: 'هل أنت متأكد من حذف هذا السجل من الموقع العام؟',
        danger: true,
      });
      if (!ok) return;
      try {
        await deleteCmsContent(b.getAttribute('data-id'), 'leadership');
        showToast('تم حذف السجل بنجاح');
        await renderLeadershipSub(container);
      } catch (err) {
        showToast('خطأ: ' + err.message, 'error');
      }
    });
  });
}

// --------------------------------------------------------------------------
// 2. News & Announcements Subview (With Image Upload & Edit)
// --------------------------------------------------------------------------
async function renderNewsSub(container) {
  const list = (await getCmsContent('news', 'all')) || [];
  let editingNewsId = null;

  container.innerHTML = `
    <div style="display:flex; flex-direction:column; gap: var(--space-4);">
      <div class="panel" style="border-inline-start: 4px solid var(--color-primary-800);">
        <div class="panel-header" style="display:flex; justify-content:space-between; align-items:center;">
          <h3 class="panel-title" id="news-form-title" style="margin:0;">نشر خبر أو بيان رسمي للطلاب وأولياء الأمور</h3>
          <button type="button" class="btn btn-sm" id="news-cancel-edit-btn" style="display: none;">✕ إلغاء التعديل</button>
        </div>
        <div class="panel-body">
          <form id="news-form">
            <div style="display:grid; grid-template-columns: 2fr 1fr; gap: var(--space-3); margin-bottom: var(--space-3);">
              <div class="form-group">
                <label class="form-label" for="news-title">عنوان الخبر أو الإعلان *</label>
                <input type="text" id="news-title" class="form-control" required placeholder="مثال: موعد تسليم شريحة التابلت لطلاب الصف الأول الثانوي">
              </div>
              <div class="form-group">
                <label class="form-label" for="news-date">تاريخ النشر</label>
                <input type="date" id="news-date" class="form-control" value="${new Date().toISOString().split('T')[0]}">
              </div>
            </div>

            <!-- News Image Upload -->
            <div class="form-group" style="margin-bottom: var(--space-3);">
              <label class="form-label">صورة الخبر أو البيان (اختياري)</label>
              <div style="display: flex; align-items: center; gap: var(--space-3); flex-wrap: wrap;">
                <div id="news-img-preview-box" style="width: 60px; height: 40px; border-radius: var(--radius-sm); background: var(--bg-surface-subtle); border: 1px solid var(--border-light); display: flex; align-items: center; justify-content: center; overflow: hidden; flex-shrink: 0;">
                  <span id="news-img-placeholder" style="font-size: 1.2rem;">📰</span>
                  <img id="news-img-preview" src="" alt="معاينة" style="display: none; width: 100%; height: 100%; object-fit: cover;">
                </div>
                <input type="file" id="news-photo-file" accept="image/*" style="display: none;">
                <input type="hidden" id="news-photo-val" value="">
                <button type="button" id="news-upload-btn" class="btn btn-outline btn-sm">
                  📸 اختيار صورة الخبر
                </button>
              </div>
            </div>

            <div class="form-group" style="margin-bottom: var(--space-3);">
              <label class="form-label" for="news-body">تفاصيل البيان الرسمي *</label>
              <textarea id="news-body" class="form-control" rows="3" required placeholder="اكتب نص البيان كاملاً..."></textarea>
            </div>
            <div style="display:flex; justify-content:flex-end;">
              <button type="submit" id="news-submit-btn" class="btn btn-primary btn-sm">نشر على الموقع العام فوراً</button>
            </div>
          </form>
        </div>
      </div>

      <div class="panel" style="padding:0; overflow:hidden;">
        <div class="panel-header" style="display:flex; justify-content:space-between; align-items:center;">
          <h3 class="panel-title" style="margin:0;">سجل الأخبار والبيانات المنشورة</h3>
          <span class="badge badge-accent">${list.length} بيانات</span>
        </div>
        <div class="table-wrap" style="border:none;">
          <table class="data-table">
            <thead>
              <tr>
                <th style="width: 50px; text-align: center;">صورة</th>
                <th style="width: 100px;">تاريخ النشر</th>
                <th>العنوان</th>
                <th>المحتوى</th>
                <th style="width: 110px; text-align: center;">إجراءات</th>
              </tr>
            </thead>
            <tbody>
              ${list.length > 0 ? list.map(item => `
                <tr>
                  <td style="text-align: center;">
                    <div style="width: 36px; height: 36px; border-radius: 4px; overflow: hidden; background: var(--bg-surface-subtle); display: inline-flex; align-items: center; justify-content: center; border: 1px solid var(--border-light);">
                      ${item.imageUrl ? `<img src="${item.imageUrl}" alt="" style="width: 100%; height: 100%; object-fit: cover;">` : '📰'}
                    </div>
                  </td>
                  <td style="font-size:11px;">${item.date || '—'}</td>
                  <td><strong>${item.title || '—'}</strong></td>
                  <td style="font-size:12px; color:var(--text-muted);">${item.summary || item.content || '—'}</td>
                  <td style="text-align:center;">
                    <div style="display: inline-flex; gap: 4px;">
                      <button type="button" class="btn btn-sm btn-outline edit-news-btn" data-id="${item.id}" title="تعديل">✏️</button>
                      <button type="button" class="btn btn-sm btn-outline del-news-btn" data-id="${item.id}" title="حذف" style="color:var(--color-danger-text);">✕</button>
                    </div>
                  </td>
                </tr>
              `).join('') : '<tr><td colspan="5" style="text-align:center; padding:20px;">لا توجد أخبار منشورة حالياً</td></tr>'}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `;

  // Image Upload Logic
  const fileInput = document.getElementById('news-photo-file');
  const uploadBtn = document.getElementById('news-upload-btn');
  const photoVal = document.getElementById('news-photo-val');
  const previewImg = document.getElementById('news-img-preview');
  const placeholder = document.getElementById('news-img-placeholder');

  uploadBtn?.addEventListener('click', () => fileInput?.click());
  fileInput?.addEventListener('change', () => {
    const file = fileInput.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      photoVal.value = e.target.result;
      previewImg.src = e.target.result;
      previewImg.style.display = 'block';
      placeholder.style.display = 'none';
    };
    reader.readAsDataURL(file);
  });

  // Edit News Logic
  const formTitle = document.getElementById('news-form-title');
  const submitBtn = document.getElementById('news-submit-btn');
  const cancelBtn = document.getElementById('news-cancel-edit-btn');

  function resetNewsForm() {
    editingNewsId = null;
    document.getElementById('news-form').reset();
    formTitle.textContent = 'نشر خبر أو بيان رسمي للطلاب وأولياء الأمور';
    submitBtn.textContent = 'نشر على الموقع العام فوراً';
    cancelBtn.style.display = 'none';
    photoVal.value = '';
    previewImg.style.display = 'none';
    placeholder.style.display = 'block';
  }

  cancelBtn?.addEventListener('click', resetNewsForm);

  container.querySelectorAll('.edit-news-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.id;
      const item = list.find(n => n.id === id);
      if (!item) return;

      editingNewsId = id;
      formTitle.textContent = `تعديل الخبر: ${item.title}`;
      submitBtn.textContent = 'حفظ التعديلات 💾';
      cancelBtn.style.display = 'inline-flex';

      document.getElementById('news-title').value = item.title || '';
      document.getElementById('news-date').value = item.date || new Date().toISOString().split('T')[0];
      document.getElementById('news-body').value = item.summary || item.content || '';

      if (item.imageUrl) {
        photoVal.value = item.imageUrl;
        previewImg.src = item.imageUrl;
        previewImg.style.display = 'block';
        placeholder.style.display = 'none';
      } else {
        photoVal.value = '';
        previewImg.style.display = 'none';
        placeholder.style.display = 'block';
      }

      document.getElementById('news-form').scrollIntoView({ behavior: 'smooth' });
    });
  });

  document.getElementById('news-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const title = document.getElementById('news-title').value.trim();
    const date = document.getElementById('news-date').value;
    const summary = document.getElementById('news-body').value.trim();
    const imageUrl = photoVal.value;

    try {
      if (editingNewsId) {
        await updateCmsContent(editingNewsId, {
          title,
          summary,
          content: summary,
          date,
          imageUrl,
        });
        showToast('✓ تم حفظ تعديلات الخبر بنجاح.');
      } else {
        await createCmsContent({
          category: 'news',
          title,
          summary,
          content: summary,
          status: 'published',
          date,
          imageUrl,
        });
        showToast('✓ تم نشر البيان بنجاح بالموقع العام.');
      }
      resetNewsForm();
      renderNewsSub(container);
    } catch (err) {
      showToast('خطأ: ' + err.message, 'error');
    }
  });

  container.querySelectorAll('.del-news-btn').forEach(b => {
    b.addEventListener('click', async () => {
      const ok = await showConfirmModal({
        title: 'حذف خبر رسمي',
        message: 'هل أنت متأكد من رغبتك في حذف هذا الخبر من الموقع العام؟',
        danger: true,
      });
      if (!ok) return;
      await deleteCmsContent(b.getAttribute('data-id'), 'news');
      showToast('تم حذف الخبر بنجاح');
      renderNewsSub(container);
    });
  });
}

// --------------------------------------------------------------------------
// 3. Activities Subview (With Image Upload & Edit)
// --------------------------------------------------------------------------
async function renderActivitiesSub(container) {
  const list = (await getCmsContent('activities', 'all')) || [];
  let editingActId = null;

  container.innerHTML = `
    <div style="display:flex; flex-direction:column; gap: var(--space-4);">
      <div class="panel" style="border-inline-start: 4px solid var(--color-primary-800);">
        <div class="panel-header" style="display:flex; justify-content:space-between; align-items:center;">
          <h3 class="panel-title" id="act-form-title" style="margin:0;">إضافة نشاط مدرسي أو معرض</h3>
          <button type="button" class="btn btn-sm" id="act-cancel-edit-btn" style="display: none;">✕ إلغاء التعديل</button>
        </div>
        <div class="panel-body">
          <form id="act-form">
            <div class="form-group" style="margin-bottom: var(--space-3);">
              <label class="form-label" for="act-title">اسم النشاط أو الفعالية *</label>
              <input type="text" id="act-title" class="form-control" required placeholder="مثال: المعرض السنوي للابتكارات العلمية والذكاء الاصطناعي">
            </div>

            <!-- Activity Image Upload -->
            <div class="form-group" style="margin-bottom: var(--space-3);">
              <label class="form-label">صورة النشاط أو التوثيق (اختياري)</label>
              <div style="display: flex; align-items: center; gap: var(--space-3); flex-wrap: wrap;">
                <div id="act-img-preview-box" style="width: 60px; height: 40px; border-radius: var(--radius-sm); background: var(--bg-surface-subtle); border: 1px solid var(--border-light); display: flex; align-items: center; justify-content: center; overflow: hidden; flex-shrink: 0;">
                  <span id="act-img-placeholder" style="font-size: 1.2rem;">🏆</span>
                  <img id="act-img-preview" src="" alt="معاينة" style="display: none; width: 100%; height: 100%; object-fit: cover;">
                </div>
                <input type="file" id="act-photo-file" accept="image/*" style="display: none;">
                <input type="hidden" id="act-photo-val" value="">
                <button type="button" id="act-upload-btn" class="btn btn-outline btn-sm">
                  📸 اختيار صورة النشاط
                </button>
              </div>
            </div>

            <div class="form-group" style="margin-bottom: var(--space-3);">
              <label class="form-label" for="act-desc">وصف الفعالية وأهدافها *</label>
              <textarea id="act-desc" class="form-control" rows="2" required placeholder="تفاصيل النشاط..."></textarea>
            </div>
            <div style="display:flex; justify-content:flex-end;">
              <button type="submit" id="act-submit-btn" class="btn btn-primary btn-sm">إضافة النشاط للموقع</button>
            </div>
          </form>
        </div>
      </div>

      <div class="panel" style="padding:0; overflow:hidden;">
        <div class="panel-header"><h3 class="panel-title" style="margin:0;">قائمة الأنشطة المنشورة</h3></div>
        <div class="table-wrap" style="border:none;">
          <table class="data-table">
            <thead>
              <tr>
                <th style="width: 50px; text-align: center;">صورة</th>
                <th>اسم النشاط</th>
                <th>الوصف</th>
                <th style="width:110px;text-align:center;">إجراءات</th>
              </tr>
            </thead>
            <tbody>
              ${list.length > 0 ? list.map(a => `
                <tr>
                  <td style="text-align: center;">
                    <div style="width: 36px; height: 36px; border-radius: 4px; overflow: hidden; background: var(--bg-surface-subtle); display: inline-flex; align-items: center; justify-content: center; border: 1px solid var(--border-light);">
                      ${a.imageUrl ? `<img src="${a.imageUrl}" alt="" style="width: 100%; height: 100%; object-fit: cover;">` : '🏆'}
                    </div>
                  </td>
                  <td><strong>${a.title}</strong></td>
                  <td style="font-size:12px; color:var(--text-muted);">${a.summary || a.desc || '—'}</td>
                  <td style="text-align:center;">
                    <div style="display: inline-flex; gap: 4px;">
                      <button type="button" class="btn btn-sm btn-outline edit-act-btn" data-id="${a.id}" title="تعديل">✏️</button>
                      <button type="button" class="btn btn-sm btn-outline del-act-btn" data-id="${a.id}" style="color:var(--color-danger-text);">✕</button>
                    </div>
                  </td>
                </tr>
              `).join('') : '<tr><td colspan="4" style="text-align:center; padding:20px;">لا توجد أنشطة مسجلة</td></tr>'}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `;

  // Image upload
  const fileInput = document.getElementById('act-photo-file');
  const uploadBtn = document.getElementById('act-upload-btn');
  const photoVal = document.getElementById('act-photo-val');
  const previewImg = document.getElementById('act-img-preview');
  const placeholder = document.getElementById('act-img-placeholder');

  uploadBtn?.addEventListener('click', () => fileInput?.click());
  fileInput?.addEventListener('change', () => {
    const file = fileInput.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      photoVal.value = e.target.result;
      previewImg.src = e.target.result;
      previewImg.style.display = 'block';
      placeholder.style.display = 'none';
    };
    reader.readAsDataURL(file);
  });

  // Edit logic
  const formTitle = document.getElementById('act-form-title');
  const submitBtn = document.getElementById('act-submit-btn');
  const cancelBtn = document.getElementById('act-cancel-edit-btn');

  function resetActForm() {
    editingActId = null;
    document.getElementById('act-form').reset();
    formTitle.textContent = 'إضافة نشاط مدرسي أو معرض';
    submitBtn.textContent = 'إضافة النشاط للموقع';
    cancelBtn.style.display = 'none';
    photoVal.value = '';
    previewImg.style.display = 'none';
    placeholder.style.display = 'block';
  }

  cancelBtn?.addEventListener('click', resetActForm);

  container.querySelectorAll('.edit-act-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.id;
      const item = list.find(a => a.id === id);
      if (!item) return;

      editingActId = id;
      formTitle.textContent = `تعديل النشاط: ${item.title}`;
      submitBtn.textContent = 'حفظ التعديلات 💾';
      cancelBtn.style.display = 'inline-flex';

      document.getElementById('act-title').value = item.title || '';
      document.getElementById('act-desc').value = item.summary || item.desc || '';

      if (item.imageUrl) {
        photoVal.value = item.imageUrl;
        previewImg.src = item.imageUrl;
        previewImg.style.display = 'block';
        placeholder.style.display = 'none';
      } else {
        photoVal.value = '';
        previewImg.style.display = 'none';
        placeholder.style.display = 'block';
      }

      document.getElementById('act-form').scrollIntoView({ behavior: 'smooth' });
    });
  });

  document.getElementById('act-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const title = document.getElementById('act-title').value.trim();
    const summary = document.getElementById('act-desc').value.trim();
    const imageUrl = photoVal.value;

    try {
      if (editingActId) {
        await updateCmsContent(editingActId, { title, summary, desc: summary, imageUrl });
        showToast('✓ تم حفظ تعديل النشاط بنجاح.');
      } else {
        await createCmsContent({ category: 'activities', title, summary, desc: summary, imageUrl, status: 'published' });
        showToast('✓ تم إضافة النشاط بنجاح.');
      }
      resetActForm();
      renderActivitiesSub(container);
    } catch (err) {
      showToast('خطأ: ' + err.message, 'error');
    }
  });

  container.querySelectorAll('.del-act-btn').forEach(b => {
    b.addEventListener('click', async () => {
      const ok = await showConfirmModal({
        title: 'حذف نشاط مدرسي',
        message: 'هل أنت متأكد من حذف هذا النشاط؟',
        danger: true,
      });
      if (!ok) return;
      await deleteCmsContent(b.getAttribute('data-id'), 'activities');
      showToast('تم حذف النشاط بنجاح');
      renderActivitiesSub(container);
    });
  });
}

// --------------------------------------------------------------------------
// 4. Calendar Subview (With Edit)
// --------------------------------------------------------------------------
async function renderCalendarSub(container) {
  const list = (await getCmsContent('calendar', 'all')) || [];
  let editingCalId = null;

  container.innerHTML = `
    <div style="display:flex; flex-direction:column; gap: var(--space-4);">
      <div class="panel" style="border-inline-start: 4px solid var(--color-primary-800);">
        <div class="panel-header" style="display:flex; justify-content:space-between; align-items:center;">
          <h3 class="panel-title" id="cal-form-title" style="margin:0;">إضافة موعد أو فعالية بالتقويم الدراسي</h3>
          <button type="button" class="btn btn-sm" id="cal-cancel-edit-btn" style="display: none;">✕ إلغاء التعديل</button>
        </div>
        <div class="panel-body">
          <form id="cal-form">
            <div style="display:grid; grid-template-columns: 2fr 1fr; gap: var(--space-3); margin-bottom: var(--space-3);">
              <div class="form-group">
                <label class="form-label" for="cal-title">الحدث أو المناسبة *</label>
                <input type="text" id="cal-title" class="form-control" required placeholder="مثال: امتحانات الفصل الدراسي الأول">
              </div>
              <div class="form-group">
                <label class="form-label" for="cal-date">التاريخ *</label>
                <input type="date" id="cal-date" class="form-control" required>
              </div>
            </div>
            <div style="display:flex; justify-content:flex-end;">
              <button type="submit" id="cal-submit-btn" class="btn btn-primary btn-sm">تثبيت في التقويم المدرسي</button>
            </div>
          </form>
        </div>
      </div>

      <div class="panel" style="padding:0; overflow:hidden;">
        <div class="panel-header"><h3 class="panel-title" style="margin:0;">الخطة الزمنية المعتمدة</h3></div>
        <div class="table-wrap" style="border:none;">
          <table class="data-table">
            <thead><tr><th>التاريخ</th><th>المناسبة / الاستحقاق</th><th style="width:110px;text-align:center;">إجراءات</th></tr></thead>
            <tbody>
              ${list.length > 0 ? list.map(c => `
                <tr>
                  <td><strong>${c.date || '—'}</strong></td>
                  <td>${c.title}</td>
                  <td style="text-align:center;">
                    <div style="display: inline-flex; gap: 4px;">
                      <button type="button" class="btn btn-sm btn-outline edit-cal-btn" data-id="${c.id}" title="تعديل">✏️</button>
                      <button type="button" class="btn btn-sm btn-outline del-cal-btn" data-id="${c.id}" style="color:var(--color-danger-text);">✕</button>
                    </div>
                  </td>
                </tr>
              `).join('') : '<tr><td colspan="3" style="text-align:center; padding:20px;">لا توجد مواعيد مضافة بعد</td></tr>'}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `;

  const formTitle = document.getElementById('cal-form-title');
  const submitBtn = document.getElementById('cal-submit-btn');
  const cancelBtn = document.getElementById('cal-cancel-edit-btn');

  function resetCalForm() {
    editingCalId = null;
    document.getElementById('cal-form').reset();
    formTitle.textContent = 'إضافة موعد أو فعالية بالتقويم الدراسي';
    submitBtn.textContent = 'تثبيت في التقويم المدرسي';
    cancelBtn.style.display = 'none';
  }

  cancelBtn?.addEventListener('click', resetCalForm);

  container.querySelectorAll('.edit-cal-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.id;
      const item = list.find(c => c.id === id);
      if (!item) return;

      editingCalId = id;
      formTitle.textContent = `تعديل موعد: ${item.title}`;
      submitBtn.textContent = 'حفظ التعديلات 💾';
      cancelBtn.style.display = 'inline-flex';

      document.getElementById('cal-title').value = item.title || '';
      document.getElementById('cal-date').value = item.date || '';
      document.getElementById('cal-form').scrollIntoView({ behavior: 'smooth' });
    });
  });

  document.getElementById('cal-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const title = document.getElementById('cal-title').value.trim();
    const date = document.getElementById('cal-date').value;

    try {
      if (editingCalId) {
        await updateCmsContent(editingCalId, { title, date });
        showToast('✓ تم حفظ تعديل الموعد بنجاح.');
      } else {
        await createCmsContent({ category: 'calendar', title, date, status: 'published' });
        showToast('✓ تم إضافة الحدث للتقويم بنجاح.');
      }
      resetCalForm();
      renderCalendarSub(container);
    } catch (err) {
      showToast('خطأ: ' + err.message, 'error');
    }
  });

  container.querySelectorAll('.del-cal-btn').forEach(b => {
    b.addEventListener('click', async () => {
      const ok = await showConfirmModal({
        title: 'حذف موعد من التقويم',
        message: 'هل أنت متأكد من حذف هذا الموعد من التقويم الدراسي؟',
        danger: true,
      });
      if (!ok) return;
      await deleteCmsContent(b.getAttribute('data-id'), 'calendar');
      showToast('تم حذف الموعد بنجاح');
      renderCalendarSub(container);
    });
  });
}

// --------------------------------------------------------------------------
// 5. School Profile Subview
// --------------------------------------------------------------------------
async function renderProfileSub(container) {
  const profile = (await getSchoolProfile()) || {};
  container.innerHTML = `
    <div class="panel">
      <div class="panel-header"><h3 class="panel-title" style="margin:0;">🏫 تكوين هوية وبيانات المدرسة الرسمية</h3></div>
      <div class="panel-body">
        <form id="prof-sub-form">
          <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: var(--space-4); margin-bottom: var(--space-4);">
            <div class="form-group">
              <label class="form-label" for="sub-p-name">اسم المدرسة الرسمي *</label>
              <input type="text" id="sub-p-name" class="form-control" value="${profile.nameAr || ''}" required>
            </div>
            <div class="form-group">
              <label class="form-label" for="sub-p-admin">الإدارة التعليمية *</label>
              <input type="text" id="sub-p-admin" class="form-control" value="${profile.administration || ''}" required>
            </div>
            <div class="form-group">
              <label class="form-label" for="sub-p-phone">رقم الهاتف</label>
              <input type="text" id="sub-p-phone" class="form-control" value="${profile.phone || ''}">
            </div>
          </div>
          <div class="form-group" style="margin-bottom: var(--space-4);">
            <label class="form-label" for="sub-p-story">عن المدرسة ورؤيتها</label>
            <textarea id="sub-p-story" class="form-control" rows="3">${profile.aboutStory || ''}</textarea>
          </div>
          <div style="display:flex; justify-content:flex-end;">
            <button type="submit" class="btn btn-primary btn-md">اعتماد وتحديث هوية المدرسة</button>
          </div>
        </form>
      </div>
    </div>
  `;
  document.getElementById('prof-sub-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const nameAr = document.getElementById('sub-p-name').value.trim();
    const administration = document.getElementById('sub-p-admin').value.trim();
    const phone = document.getElementById('sub-p-phone').value.trim();
    const aboutStory = document.getElementById('sub-p-story').value.trim();
    await updateSchoolProfile({ nameAr, administration, phone, aboutStory });
    showToast('✓ تم حفظ بيانات المدرسة وتحديث الموقع العام بنجاح.');
  });
}
