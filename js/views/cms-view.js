// ==========================================================================
// DIGITAL SCHOOL ECOSYSTEM (VANILLA EDITION)
// SPA View Module: Institutional CMS Hub (Leadership, News, Activities, Calendar)
// ==========================================================================

import {
  getCmsContent,
  createCmsContent,
  updateCmsContent,
  deleteCmsContent,
} from '../services/cms-service.js';
import { getSchoolProfile, updateSchoolProfile } from '../services/school-service.js';
import { recordAuditEvent } from '../services/audit-service.js';

let isInitialized = false;

export async function renderCmsView(container) {
  if (!isInitialized) {
    container.innerHTML = `
      <div style="display: flex; flex-direction: column; gap: var(--space-5);">
        <div>
          <h1 style="font-size: var(--text-2xl); font-weight: 800; color: var(--color-primary-950); margin-bottom: var(--space-1);">
            🏛️ مركز إدارة المحتوى والهيكل المدرسي (CMS Hub)
          </h1>
          <p style="font-size: var(--text-sm); color: var(--text-muted); margin: 0;">
            إدارة وتحديث محتوى صفحات الموقع العام الرسمية: القيادة المدرسية، الأخبار والبيانات، الأنشطة، والتقويم السنوي.
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

        <!-- Sub-panel Container -->
        <div id="cms-sub-content">
          <p style="text-align: center; padding: 20px; color: var(--text-muted);">جارٍ تحميل محتوى القسم...</p>
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
  const container = document.getElementById('cms-sub-content');
  if (!container) return;

  container.innerHTML = '<p style="text-align: center; padding: 20px; color: var(--text-muted);">جارٍ التحميل...</p>';

  if (sectionKey === 'leadership') {
    await renderLeadershipSub(container);
  } else if (sectionKey === 'news') {
    await renderNewsSub(container);
  } else if (sectionKey === 'activities') {
    await renderActivitiesSub(container);
  } else if (sectionKey === 'calendar') {
    await renderCalendarSub(container);
  } else if (sectionKey === 'profile') {
    await renderProfileSub(container);
  }
}

async function renderLeadershipSub(container) {
  const list = (await getCmsContent('leadership')) || [];
  container.innerHTML = `
    <div style="display:flex; flex-direction:column; gap: var(--space-4);">
      <div class="panel">
        <div class="panel-header" style="display:flex; justify-content:space-between; align-items:center;">
          <h3 class="panel-title" style="margin:0;">إضافة عضو قيادي جديد لدليل المدرسة</h3>
        </div>
        <div class="panel-body">
          <form id="ldr-form">
            <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: var(--space-3); margin-bottom: var(--space-3);">
              <div class="form-group">
                <label class="form-label" for="ldr-name">الاسم واللقب *</label>
                <input type="text" id="ldr-name" class="form-control" required placeholder="مثال: د. طارق المنشاوي">
              </div>
              <div class="form-group">
                <label class="form-label" for="ldr-role">المسمى الوظيفي *</label>
                <input type="text" id="ldr-role" class="form-control" required placeholder="مثال: مدير عام المدرسة">
              </div>
              <div class="form-group">
                <label class="form-label" for="ldr-order">الترتيب في العرض</label>
                <input type="number" id="ldr-order" class="form-control" value="1" min="1">
              </div>
            </div>
            <div class="form-group" style="margin-bottom: var(--space-3);">
              <label class="form-label" for="ldr-bio">نبذة مختصرة أو كلمة المسؤول</label>
              <textarea id="ldr-bio" class="form-control" rows="2" placeholder="كلمة ترحيبية أو التخصص الإداري..."></textarea>
            </div>
            <div style="display:flex; justify-content:flex-end;">
              <button type="submit" class="btn btn-primary btn-sm">حفظ وإضافة للموقع</button>
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
                <th>الترتيب</th>
                <th>الاسم</th>
                <th>المسمى الوظيفي</th>
                <th>نبذة</th>
                <th style="width: 80px; text-align: center;">إجراء</th>
              </tr>
            </thead>
            <tbody>
              ${list.length > 0 ? list.map(item => `
                <tr>
                  <td><strong>#${item.order || 1}</strong></td>
                  <td><strong>${item.title || item.name || '—'}</strong></td>
                  <td><span class="badge badge-accent">${item.role || item.subtitle || 'قيادي'}</span></td>
                  <td style="font-size:12px; color:var(--text-muted);">${item.summary || item.bio || '—'}</td>
                  <td style="text-align:center;">
                    <button type="button" class="btn btn-sm btn-outline del-cms-btn" data-id="${item.id}" style="color:var(--color-danger-text);">✕</button>
                  </td>
                </tr>
              `).join('') : '<tr><td colspan="5" style="text-align:center; padding:20px;">لا توجد بيانات قيادة مسجلة بعد</td></tr>'}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `;

  document.getElementById('ldr-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const title = document.getElementById('ldr-name').value.trim();
    const role = document.getElementById('ldr-role').value.trim();
    const order = parseInt(document.getElementById('ldr-order').value, 10) || 1;
    const summary = document.getElementById('ldr-bio').value.trim();

    try {
      await createCmsContent({
        category: 'leadership',
        title,
        role,
        order,
        summary,
        status: 'published',
      });
      alert('✓ تم إضافة عضو القيادة بنجاح للموقع العام.');
      renderLeadershipSub(container);
    } catch (err) {
      alert('خطأ: ' + err.message);
    }
  });

  container.querySelectorAll('.del-cms-btn').forEach(b => {
    b.addEventListener('click', async () => {
      if (!confirm('هل أنت متأكد من حذف هذا السجل من الموقع العام؟')) return;
      try {
        await deleteCmsContent(b.getAttribute('data-id'), 'leadership');
        renderLeadershipSub(container);
      } catch (err) {
        alert('خطأ: ' + err.message);
      }
    });
  });
}

async function renderNewsSub(container) {
  const list = (await getCmsContent('news')) || [];
  container.innerHTML = `
    <div style="display:flex; flex-direction:column; gap: var(--space-4);">
      <div class="panel">
        <div class="panel-header">
          <h3 class="panel-title" style="margin:0;">نشر خبر أو بيان رسمي للطلاب وأولياء الأمور</h3>
        </div>
        <div class="panel-body">
          <form id="news-form">
            <div class="form-group" style="margin-bottom: var(--space-3);">
              <label class="form-label" for="news-title">عنوان الخبر أو الإعلان *</label>
              <input type="text" id="news-title" class="form-control" required placeholder="مثال: موعد تسليم شريحة التابلت لطلاب الصف الأول الثانوي">
            </div>
            <div class="form-group" style="margin-bottom: var(--space-3);">
              <label class="form-label" for="news-body">تفاصيل البيان الرسمي *</label>
              <textarea id="news-body" class="form-control" rows="3" required placeholder="اكتب نص البيان كاملاً..."></textarea>
            </div>
            <div style="display:flex; justify-content:flex-end;">
              <button type="submit" class="btn btn-primary btn-sm">نشر على الموقع العام فوراً</button>
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
                <th>تاريخ النشر</th>
                <th>العنوان</th>
                <th>المحتوى</th>
                <th style="width: 80px; text-align: center;">إجراء</th>
              </tr>
            </thead>
            <tbody>
              ${list.length > 0 ? list.map(item => `
                <tr>
                  <td style="font-size:11px;">${item.date || new Date().toISOString().split('T')[0]}</td>
                  <td><strong>${item.title || '—'}</strong></td>
                  <td style="font-size:12px; color:var(--text-muted);">${item.summary || item.body || '—'}</td>
                  <td style="text-align:center;">
                    <button type="button" class="btn btn-sm btn-outline del-news-btn" data-id="${item.id}" style="color:var(--color-danger-text);">✕</button>
                  </td>
                </tr>
              `).join('') : '<tr><td colspan="4" style="text-align:center; padding:20px;">لا توجد أخبار منشورة حالياً</td></tr>'}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `;

  document.getElementById('news-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const title = document.getElementById('news-title').value.trim();
    const summary = document.getElementById('news-body').value.trim();
    try {
      await createCmsContent({ category: 'news', title, summary, status: 'published', date: new Date().toISOString().split('T')[0] });
      alert('✓ تم نشر البيان بنجاح بالموقع العام.');
      renderNewsSub(container);
    } catch (err) {
      alert('خطأ: ' + err.message);
    }
  });

  container.querySelectorAll('.del-news-btn').forEach(b => {
    b.addEventListener('click', async () => {
      if (!confirm('حذف هذا الخبر؟')) return;
      await deleteCmsContent(b.getAttribute('data-id'), 'news');
      renderNewsSub(container);
    });
  });
}

async function renderActivitiesSub(container) {
  const list = (await getCmsContent('activities')) || [];
  container.innerHTML = `
    <div style="display:flex; flex-direction:column; gap: var(--space-4);">
      <div class="panel">
        <div class="panel-header"><h3 class="panel-title" style="margin:0;">إضافة نشاط مدرسي أو معرض</h3></div>
        <div class="panel-body">
          <form id="act-form">
            <div class="form-group" style="margin-bottom: var(--space-3);">
              <label class="form-label" for="act-title">اسم النشاط أو الفعالية *</label>
              <input type="text" id="act-title" class="form-control" required placeholder="مثال: المعرض السنوي للابتكارات العلمية والذكاء الاصطناعي">
            </div>
            <div class="form-group" style="margin-bottom: var(--space-3);">
              <label class="form-label" for="act-desc">وصف الفعالية وأهدافها *</label>
              <textarea id="act-desc" class="form-control" rows="2" required placeholder="تفاصيل النشاط..."></textarea>
            </div>
            <div style="display:flex; justify-content:flex-end;">
              <button type="submit" class="btn btn-primary btn-sm">إضافة النشاط للموقع</button>
            </div>
          </form>
        </div>
      </div>
      <div class="panel" style="padding:0; overflow:hidden;">
        <div class="panel-header"><h3 class="panel-title" style="margin:0;">قائمة الأنشطة المنشورة</h3></div>
        <div class="table-wrap" style="border:none;">
          <table class="data-table">
            <thead><tr><th>اسم النشاط</th><th>الوصف</th><th style="width:80px;text-align:center;">إجراء</th></tr></thead>
            <tbody>
              ${list.length > 0 ? list.map(a => `
                <tr>
                  <td><strong>${a.title}</strong></td>
                  <td style="font-size:12px; color:var(--text-muted);">${a.summary || a.desc || '—'}</td>
                  <td style="text-align:center;"><button type="button" class="btn btn-sm btn-outline del-act-btn" data-id="${a.id}" style="color:var(--color-danger-text);">✕</button></td>
                </tr>
              `).join('') : '<tr><td colspan="3" style="text-align:center; padding:20px;">لا توجد أنشطة مسجلة</td></tr>'}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `;
  document.getElementById('act-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const title = document.getElementById('act-title').value.trim();
    const summary = document.getElementById('act-desc').value.trim();
    await createCmsContent({ category: 'activities', title, summary, status: 'published' });
    alert('✓ تم إضافة النشاط بنجاح.');
    renderActivitiesSub(container);
  });
  container.querySelectorAll('.del-act-btn').forEach(b => {
    b.addEventListener('click', async () => {
      if (!confirm('حذف هذا النشاط؟')) return;
      await deleteCmsContent(b.getAttribute('data-id'), 'activities');
      renderActivitiesSub(container);
    });
  });
}

async function renderCalendarSub(container) {
  const list = (await getCmsContent('calendar')) || [];
  container.innerHTML = `
    <div style="display:flex; flex-direction:column; gap: var(--space-4);">
      <div class="panel">
        <div class="panel-header"><h3 class="panel-title" style="margin:0;">إضافة موعد أو فعالية بالتقويم الدراسي</h3></div>
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
              <button type="submit" class="btn btn-primary btn-sm">تثبيت في التقويم المدرسي</button>
            </div>
          </form>
        </div>
      </div>
      <div class="panel" style="padding:0; overflow:hidden;">
        <div class="panel-header"><h3 class="panel-title" style="margin:0;">الخطة الزمنية المعتمدة</h3></div>
        <div class="table-wrap" style="border:none;">
          <table class="data-table">
            <thead><tr><th>التاريخ</th><th>المناسبة / الاستحقاق</th><th style="width:80px;text-align:center;">إجراء</th></tr></thead>
            <tbody>
              ${list.length > 0 ? list.map(c => `
                <tr>
                  <td><strong>${c.date || '—'}</strong></td>
                  <td>${c.title}</td>
                  <td style="text-align:center;"><button type="button" class="btn btn-sm btn-outline del-cal-btn" data-id="${c.id}" style="color:var(--color-danger-text);">✕</button></td>
                </tr>
              `).join('') : '<tr><td colspan="3" style="text-align:center; padding:20px;">لا توجد مواعيد مضافة بعد</td></tr>'}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `;
  document.getElementById('cal-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const title = document.getElementById('cal-title').value.trim();
    const date = document.getElementById('cal-date').value;
    await createCmsContent({ category: 'calendar', title, date, status: 'published' });
    alert('✓ تم إضافة الحدث للتقويم.');
    renderCalendarSub(container);
  });
  container.querySelectorAll('.del-cal-btn').forEach(b => {
    b.addEventListener('click', async () => {
      if (!confirm('حذف هذا الموعد؟')) return;
      await deleteCmsContent(b.getAttribute('data-id'), 'calendar');
      renderCalendarSub(container);
    });
  });
}

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
    alert('✓ تم حفظ بيانات المدرسة وتحديث الموقع العام بنجاح.');
  });
}

