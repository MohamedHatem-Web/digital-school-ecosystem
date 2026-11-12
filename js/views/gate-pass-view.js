// ==========================================================================
// DIGITAL SCHOOL ECOSYSTEM (VANILLA EDITION)
// SPA View Module: Gate Pass Management & Electronic Checkpoints
// ==========================================================================

import {
  getGatePasses,
  createGatePass,
  approveGatePass,
  useGatePass,
} from '../services/gate-pass-service.js';
import { getStudents } from '../services/student-service.js';
import { showToast } from '../components.js';

let isInitialized = false;
let passesList = [];
let allStudents = [];

export async function renderGatePassView(container) {
  if (!isInitialized) {
    container.innerHTML = `
      <div style="display: flex; flex-direction: column; gap: var(--space-5);">
        <!-- Page Title & Actions -->
        <div style="display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: var(--space-4);">
          <div>
            <h1 style="font-size: var(--text-2xl); font-weight: 800; color: var(--color-primary-950); margin-bottom: 2px;">
              🚪 أذونات وبوابات الخروج المبكر المؤمنة
            </h1>
            <p style="font-size: var(--text-sm); color: var(--text-muted); margin: 0;">
              إصدار تصاريح الخروج الاستثنائية للطلاب، الاعتماد الإداري، والتحقق الأمني بالبوابة.
            </p>
          </div>
          <div>
            <button type="button" id="gp-open-create-btn" class="btn btn-primary btn-md" style="font-weight: 700;">
              + إصدار تصريح خروج جديد
            </button>
          </div>
        </div>

        <!-- Issue Gate Pass Panel (Collapsible) -->
        <div class="panel" id="gp-create-panel" style="display: none; border-inline-start: 4px solid var(--color-primary-800);">
          <div class="panel-header" style="display: flex; justify-content: space-between; align-items: center;">
            <h3 class="panel-title" style="margin: 0;">طلب إصدار تصريح خروج مبكر</h3>
            <button type="button" class="btn btn-sm" id="gp-close-create-btn">✕ إغلاق</button>
          </div>
          <div class="panel-body">
            <form id="gp-new-pass-form">
              <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: var(--space-4); margin-bottom: var(--space-4);">
                <div class="form-group">
                  <label class="form-label" for="gp-stu-select">الطالب المصرح له *</label>
                  <select id="gp-stu-select" class="form-control" required></select>
                </div>
                <div class="form-group">
                  <label class="form-label" for="gp-reason">سبب الخروج المبكر *</label>
                  <select id="gp-reason" class="form-control" required>
                    <option value="ظرف صحي طارئ بعيادة المدرسة">ظرف صحي طارئ بعيادة المدرسة 🏥</option>
                    <option value="استدعاء ولي الأمر للحضور والمرافقة">استدعاء ولي الأمر للحضور والمرافقة 👨‍👦</option>
                    <option value="مهمة رسمية أو مسابقة مدرسية معتمدة">مهمة رسمية أو مسابقة مدرسية معتمدة 🏆</option>
                    <option value="إذن إداري استثنائي بموافقة المدير">إذن إداري استثنائي بموافقة المدير 👑</option>
                  </select>
                </div>
                <div class="form-group">
                  <label class="form-label" for="gp-companion">المرافق أثناء الخروج *</label>
                  <input type="text" id="gp-companion" class="form-control" required placeholder="مثال: ولي الأمر شخصياً، مشرف النشاط...">
                </div>
              </div>

              <div style="display: flex; justify-content: flex-end;">
                <button type="submit" class="btn btn-primary btn-md">
                  اعتماد وإصدار التصريح فورياً
                </button>
              </div>
            </form>
          </div>
        </div>

        <!-- Passes Table Panel -->
        <div class="panel" style="padding: 0; overflow: hidden;">
          <div class="panel-header" style="display: flex; justify-content: space-between; align-items: center;">
            <h3 class="panel-title" style="margin: 0;">سجل تصاريح الخروج لليوم</h3>
            <span id="gp-count-badge" class="badge badge-accent">0 تصاريح</span>
          </div>
          <div class="table-wrap" style="border: none;">
            <table class="data-table">
              <thead>
                <tr>
                  <th style="width: 140px;">رقم التصريح</th>
                  <th>اسم الطالب</th>
                  <th>السبب</th>
                  <th>المرافق</th>
                  <th>الحالة</th>
                  <th style="text-align: center; width: 140px;">إجراءات البوابة</th>
                </tr>
              </thead>
              <tbody id="gp-passes-tbody"></tbody>
            </table>
          </div>
          <div id="gp-empty-state" class="empty-state" style="display: none; padding: var(--space-8);">
            <div class="empty-state-icon">🚪</div>
            <h4 class="empty-state-title">لا توجد تصاريح خروج مسجلة لليوم</h4>
            <p class="empty-state-desc">جميع الطلاب متواجدون داخل الفصول وفق الجدول المدرسي الطبيعي.</p>
          </div>
        </div>
      </div>
    `;

    bindGatePassEvents(container);
    isInitialized = true;
  }

  await loadGatePassData();
}

async function loadGatePassData() {
  passesList = (await getGatePasses()) || [];
  allStudents = (await getStudents()) || [];

  const badge = document.getElementById('gp-count-badge');
  if (badge) badge.textContent = `${passesList.length} تصاريح`;

  const stuSelect = document.getElementById('gp-stu-select');
  if (stuSelect) {
    stuSelect.innerHTML = allStudents.map(s => `
      <option value="${s.code}" data-name="${s.name}" data-parent="${s.parentInfo?.parentName || ''}">
        ${s.name} (${s.code} - ${s.grade || 'أولى ثانوي'})
      </option>
    `).join('');
  }

  renderPassesTable();
}

function renderPassesTable() {
  const tbody = document.getElementById('gp-passes-tbody');
  const emptyState = document.getElementById('gp-empty-state');
  if (!tbody) return;

  if (passesList.length === 0) {
    tbody.innerHTML = '';
    emptyState.style.display = 'flex';
    return;
  }

  emptyState.style.display = 'none';
  tbody.innerHTML = passesList.map((p) => {
    let statusBadge = '<span class="badge badge-warning">قيد المراجعة</span>';
    if (p.status === 'approved') statusBadge = '<span class="badge badge-success">معتمد للخروج ✓</span>';
    if (p.status === 'used') statusBadge = '<span class="badge badge-default">تم الخروج من البوابة</span>';
    if (p.status === 'rejected') statusBadge = '<span class="badge badge-danger">مرفوض ✗</span>';

    return `
      <tr>
        <td style="font-family: var(--font-mono); font-weight: 700; font-size: 11px;">
          ${p.passNumber || p.id}
        </td>
        <td>
          <strong style="font-size: var(--text-xs); color: var(--color-primary-950);">${p.studentName}</strong>
          <div style="font-size: 11px; color: var(--text-muted);">كود: <code>${p.studentCode}</code></div>
        </td>
        <td style="font-size: var(--text-xs); color: var(--text-secondary);">${p.reason}</td>
        <td style="font-size: var(--text-xs);">${p.companionName || 'ولي الأمر'}</td>
        <td>${statusBadge}</td>
        <td style="text-align: center;">
          ${p.status === 'approved' ? `
            <button type="button" class="btn btn-outline btn-sm use-pass-btn" data-id="${p.id}" style="padding: 2px 8px; font-size: 11px; color: var(--color-success-solid);">
              🚶 إتمام الخروج
            </button>
          ` : (p.status === 'pending' ? `
            <button type="button" class="btn btn-primary btn-sm approve-pass-btn" data-id="${p.id}" style="padding: 2px 8px; font-size: 11px;">
              ✓ اعتماد
            </button>
          ` : `<span style="font-size: 11px; color: var(--text-muted);">مغلق</span>`)}
        </td>
      </tr>
    `;
  }).join('');

  tbody.querySelectorAll('.approve-pass-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      await approveGatePass(btn.dataset.id, 'مدير المدرسة');
      await loadGatePassData();
    });
  });

  tbody.querySelectorAll('.use-pass-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      await useGatePass(btn.dataset.id);
      await loadGatePassData();
    });
  });
}

function bindGatePassEvents(container) {
  const openBtn = document.getElementById('gp-open-create-btn');
  const panel = document.getElementById('gp-create-panel');
  const closeBtn = document.getElementById('gp-close-create-btn');
  const form = document.getElementById('gp-new-pass-form');

  openBtn.addEventListener('click', () => {
    panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
  });
  closeBtn.addEventListener('click', () => { panel.style.display = 'none'; });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const stuSelect = document.getElementById('gp-stu-select');
    const opt = stuSelect.options[stuSelect.selectedIndex];

    try {
      await createGatePass({
        studentCode: stuSelect.value,
        studentName: opt.dataset.name,
        reason: document.getElementById('gp-reason').value,
        companionName: document.getElementById('gp-companion').value.trim(),
        destination: 'منزل الطالب',
        expectedReturnTime: '',
      });
      form.reset();
      panel.style.display = 'none';
      showToast('✓ تم إصدار تصريح الخروج وتوثيقه بنجاح.');
      await loadGatePassData();
    } catch (err) {
      showToast(err.message || 'حدث خطأ أثناء إصدار التصريح.', 'error');
    }
  });
}

