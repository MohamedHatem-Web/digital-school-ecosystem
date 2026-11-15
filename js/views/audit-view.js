// ==========================================================================
// DIGITAL SCHOOL ECOSYSTEM (VANILLA EDITION)
// SPA View Module: Comprehensive Audit Logs & Security Activity
// ==========================================================================

import {
  AUDIT_CATEGORIES_MAP,
  AUDIT_ROLES_MAP,
  exportAuditLogsToCsv,
  filterAuditLogs,
  getAuditLogs,
} from '../services/audit-service.js';

let isInitialized = false;
let logsList = [];

export async function renderAuditView(container) {
  if (!isInitialized) {
    container.innerHTML = `
      <div style="display:flex;flex-direction:column;gap:var(--space-5);">
        <div style="display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: var(--space-3);">
          <div>
            <h1 style="font-size: var(--text-2xl); font-weight: 800; color: var(--color-primary-950); margin-bottom: var(--space-1);">
              🛡️ سجل النشاطات الشامل والتوثيق الأمني
            </h1>
            <p style="font-size: var(--text-sm); color: var(--text-muted); margin: 0;">
              توثيق فوري ومؤرخ لكافة الإجراءات والعمليات المنفذة من قِبل المدير، الأخصائيين، المعلمين، الطلاب، وأولياء الأمور.
            </p>
          </div>
          <div style="display: flex; gap: var(--space-2); align-items: center; flex-wrap: wrap;">
            <button type="button" class="btn btn-outline btn-sm" id="view-audit-refresh-btn">
              <span>🔄</span> <span>تحديث السجل</span>
            </button>
            <button type="button" class="btn btn-primary btn-sm" id="view-audit-export-btn">
              <span>📥</span> <span>تصدير السجل الرسمي (CSV / Excel)</span>
            </button>
          </div>
        </div>

        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:var(--space-4);">
          <div class="audit-kpi-card">
            <span style="font-size:var(--text-xs);color:var(--text-muted);font-weight:600;">إجمالي العمليات الموثقة</span>
            <span id="view-audit-stat-total" style="font-size:var(--text-2xl);font-weight:800;color:var(--color-primary-950);">0</span>
            <span style="font-size:11px;color:var(--text-muted);">سجل عمليات سحابي</span>
          </div>
          <div class="audit-kpi-card">
            <span style="font-size:var(--text-xs);color:var(--text-muted);font-weight:600;">عمليات اليوم</span>
            <span id="view-audit-stat-today" style="font-size:var(--text-2xl);font-weight:800;color:var(--color-accent-700);">0</span>
            <span style="font-size:11px;color:var(--text-muted);">نشاط خلال الـ 24 ساعة الماضية</span>
          </div>
          <div class="audit-kpi-card">
            <span style="font-size:var(--text-xs);color:var(--text-muted);font-weight:600;">عمليات الإدارة والأخصائيين</span>
            <span id="view-audit-stat-admin" style="font-size:var(--text-2xl);font-weight:800;color:var(--color-success-solid);">0</span>
            <span style="font-size:11px;color:var(--text-muted);">إجراءات إشرافية وتنظيمية</span>
          </div>
          <div class="audit-kpi-card">
            <span style="font-size:var(--text-xs);color:var(--text-muted);font-weight:600;">عمليات المعلمين والطلاب</span>
            <span id="view-audit-stat-staff" style="font-size:var(--text-2xl);font-weight:800;color:#3b82f6;">0</span>
            <span style="font-size:11px;color:var(--text-muted);">حضور، درجات، وتواصل</span>
          </div>
        </div>

        <div class="audit-filter-bar">
          <input type="text" id="view-audit-search" class="form-control" placeholder="بحث بالاسم، نوع العملية، الهدف، أو التفاصيل..." style="height:38px;border-radius:var(--radius-full);font-size:var(--text-xs);min-width:240px;flex:1 1 280px;">
          <div style="display:flex;gap:var(--space-2);flex-wrap:wrap;align-items:center;">
            <select id="view-audit-role-filter" class="form-control" style="height:38px;font-size:var(--text-xs);min-width:140px;border-radius:var(--radius-full);">
              <option value="all">كافة الأدوار 👥</option>
              ${Object.entries(AUDIT_ROLES_MAP).map(([role, label]) => `<option value="${role}">${label}</option>`).join('')}
            </select>
            <select id="view-audit-category-filter" class="form-control" style="height:38px;font-size:var(--text-xs);min-width:150px;border-radius:var(--radius-full);">
              <option value="all">كافة التصنيفات 📁</option>
              ${Object.entries(AUDIT_CATEGORIES_MAP).filter(([category]) => category !== 'all').map(([category, label]) => `<option value="${category}">${label}</option>`).join('')}
            </select>
            <input type="date" id="view-audit-date-from" class="form-control" style="height:38px;font-size:var(--text-xs);width:145px;border-radius:var(--radius-full);" title="من تاريخ" aria-label="من تاريخ">
            <input type="date" id="view-audit-date-to" class="form-control" style="height:38px;font-size:var(--text-xs);width:145px;border-radius:var(--radius-full);" title="إلى تاريخ" aria-label="إلى تاريخ">
          </div>
        </div>

        <div class="audit-glass-panel">
          <div class="table-wrap" id="view-audit-table-wrap" style="border:none;">
            <table class="data-table" id="view-audit-table">
              <thead>
                <tr>
                  <th style="width:170px;">التاريخ والوقت</th>
                  <th>المنفذ والصفة الرسمية</th>
                  <th>التصنيف</th>
                  <th>العملية المنفذة</th>
                  <th>الهدف / المستهدف</th>
                  <th style="text-align:center;width:90px;">التفاصيل</th>
                </tr>
              </thead>
              <tbody id="view-audit-tbody">
              </tbody>
            </table>
          </div>
          <div id="view-audit-empty" class="empty-state" style="display:none;padding:var(--space-10);">
            <div class="empty-state-icon">🛡️</div>
            <h3 class="empty-state-title">لا توجد سجلات مطابقة للبحث</h3>
            <p class="empty-state-desc">جرب تعديل الفلاتر أو شروط البحث لعرض النشاطات الأخرى.</p>
          </div>
        </div>

        <div id="view-audit-detail-modal" class="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="view-audit-modal-title" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:10000;align-items:center;justify-content:center;padding:var(--space-4);">
          <section class="panel" style="width:min(640px,100%);max-height:85vh;overflow:auto;">
            <header class="panel-header" style="display:flex;justify-content:space-between;align-items:center;">
              <h2 id="view-audit-modal-title" class="panel-title">تفاصيل العملية الموثقة</h2>
              <button type="button" id="view-audit-modal-close" class="btn btn-outline btn-sm" aria-label="إغلاق التفاصيل">إغلاق</button>
            </header>
            <div class="panel-body" style="display:grid;gap:var(--space-3);font-size:var(--text-sm);">
              <div><strong>المعرف الرقمي:</strong> <code id="view-audit-modal-id"></code></div>
              <div><strong>التاريخ والتوقيت:</strong> <span id="view-audit-modal-date"></span></div>
              <div><strong>المنفذ:</strong> <span id="view-audit-modal-operator"></span></div>
              <div><strong>الصفة الرسمية:</strong> <span id="view-audit-modal-role"></span></div>
              <div><strong>التصنيف:</strong> <span id="view-audit-modal-category"></span></div>
              <div><strong>العملية:</strong> <span id="view-audit-modal-action"></span></div>
              <div><strong>المستهدف:</strong> <span id="view-audit-modal-target"></span></div>
              <div id="view-audit-modal-details" style="background:var(--bg-surface-subtle);padding:var(--space-3);border-radius:var(--radius-sm);border:1px solid var(--border-subtle);white-space:pre-wrap;"></div>
            </div>
          </section>
        </div>
      </div>
    `;

    container.querySelector('#view-audit-refresh-btn')?.addEventListener('click', () => loadLogsTable());
    container.querySelector('#view-audit-search')?.addEventListener('input', filterAndRenderLogs);
    ['#view-audit-role-filter', '#view-audit-category-filter', '#view-audit-date-from', '#view-audit-date-to']
      .forEach((selector) => container.querySelector(selector)?.addEventListener('change', filterAndRenderLogs));
    container.querySelector('#view-audit-export-btn')?.addEventListener('click', exportLogs);
    container.querySelector('#view-audit-tbody')?.addEventListener('click', (event) => {
      const button = event.target.closest('.view-audit-detail-btn');
      if (button) showAuditDetail(button.dataset.logId);
    });
    container.querySelector('#view-audit-modal-close')?.addEventListener('click', closeAuditDetail);
    container.querySelector('#view-audit-detail-modal')?.addEventListener('click', (event) => {
      if (event.target.id === 'view-audit-detail-modal') closeAuditDetail();
    });
    container.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') closeAuditDetail();
    });

    isInitialized = true;
  }

  await loadLogsTable();
}

async function loadLogsTable() {
  const tbody = document.querySelector('#view-audit-tbody');
  if (tbody) tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:20px;">جارٍ تحميل سجل النشاطات...</td></tr>';

  logsList = (await getAuditLogs()) || [];
  filterAndRenderLogs();
}

function filterAndRenderLogs() {
  const tbody = document.querySelector('#view-audit-tbody');
  const empty = document.querySelector('#view-audit-empty');
  const tableWrap = document.querySelector('#view-audit-table-wrap');
  const search = document.querySelector('#view-audit-search')?.value || '';
  const role = document.querySelector('#view-audit-role-filter')?.value || 'all';
  const category = document.querySelector('#view-audit-category-filter')?.value || 'all';
  const startDate = document.querySelector('#view-audit-date-from')?.value || '';
  const endDate = document.querySelector('#view-audit-date-to')?.value || '';

  if (!tbody) return;

  const filtered = filterAuditLogs(logsList, { query: search, role, category, startDate, endDate });
  updateAuditStats(logsList);

  if (filtered.length === 0) {
    tbody.innerHTML = '';
    if (tableWrap) tableWrap.style.display = 'none';
    if (empty) empty.style.display = 'flex';
    return;
  }

  if (tableWrap) tableWrap.style.display = 'block';
  if (empty) empty.style.display = 'none';
  tbody.innerHTML = filtered.map((log) => {
    const initial = escapeHtml(String(log.operatorName || 'م').trim().charAt(0));
    const roleClass = {
      director: 'badge-primary',
      social_affairs: 'badge-warning',
      tech_specialist: 'badge-accent',
      student_affairs: 'badge-primary',
      teacher: 'badge-primary',
      student: 'badge-accent',
      parent: 'badge-accent',
      system: 'badge-default',
    }[log.operatorRole] || 'badge-default';
    return `
      <tr>
        <td style="font-size:11.5px;color:var(--text-muted);font-weight:600;">${escapeHtml(log.formattedDate || formatDate(log.timestamp))}</td>
        <td>
          <div class="audit-user-cell">
            <span class="audit-avatar">${initial}</span>
            <div>
              <div style="font-weight:700;font-size:var(--text-xs);color:var(--text-primary);">${escapeHtml(log.operatorName || 'مستخدم المنظومة')}</div>
              <span class="badge ${roleClass}" style="font-size:10px;padding:1px 6px;">${escapeHtml(log.roleTitleAr || AUDIT_ROLES_MAP[log.operatorRole] || log.operatorRole || 'النظام')}</span>
            </div>
          </div>
        </td>
        <td><span class="badge badge-default" style="font-size:11px;">${escapeHtml(log.categoryTitleAr || AUDIT_CATEGORIES_MAP[log.category] || log.category || '—')}</span></td>
        <td style="font-weight:700;font-size:var(--text-xs);color:var(--color-primary-950);">${escapeHtml(log.action || '—')}</td>
        <td style="font-size:var(--text-xs);color:var(--text-secondary);">${escapeHtml(log.target || '—')}</td>
        <td style="text-align:center;"><button type="button" class="btn btn-outline btn-sm view-audit-detail-btn" data-log-id="${escapeHtml(log.id)}" style="padding:2px 8px;font-size:11px;">🔍 تفاصيل</button></td>
      </tr>
    `;
  }).join('');
}

function updateAuditStats(logs) {
  const today = new Date().toLocaleDateString('en-CA');
  const todayCount = logs.filter((log) => new Date(log.timestamp || log.createdAt || 0).toLocaleDateString('en-CA') === today).length;
  const adminRoles = ['director', 'social_affairs', 'tech_specialist', 'student_affairs', 'super_admin'];
  const staffRoles = ['teacher', 'student', 'parent'];
  document.querySelector('#view-audit-stat-total').textContent = String(logs.length);
  document.querySelector('#view-audit-stat-today').textContent = String(todayCount);
  document.querySelector('#view-audit-stat-admin').textContent = String(logs.filter((log) => adminRoles.includes(log.operatorRole)).length);
  document.querySelector('#view-audit-stat-staff').textContent = String(logs.filter((log) => staffRoles.includes(log.operatorRole)).length);
}

function showAuditDetail(logId) {
  const entry = logsList.find((log) => log.id === logId);
  if (!entry) return;
  const fields = {
    '#view-audit-modal-id': entry.id,
    '#view-audit-modal-date': entry.formattedDate || formatDate(entry.timestamp),
    '#view-audit-modal-operator': `${entry.operatorName || 'مستخدم المنظومة'} (${entry.operatorEmail || 'غير محدد'})`,
    '#view-audit-modal-role': entry.roleTitleAr || AUDIT_ROLES_MAP[entry.operatorRole] || entry.operatorRole || 'النظام',
    '#view-audit-modal-category': entry.categoryTitleAr || AUDIT_CATEGORIES_MAP[entry.category] || entry.category || '—',
    '#view-audit-modal-action': entry.action || '—',
    '#view-audit-modal-target': entry.target || '—',
    '#view-audit-modal-details': entry.details || 'لا توجد تفاصيل إضافية مسجلة لهذه العملية.',
  };
  Object.entries(fields).forEach(([selector, value]) => {
    const element = document.querySelector(selector);
    if (element) element.textContent = value;
  });
  document.querySelector('#view-audit-detail-modal').style.display = 'flex';
}

function closeAuditDetail() {
  const modal = document.querySelector('#view-audit-detail-modal');
  if (modal) modal.style.display = 'none';
}

function escapeHtml(value) {
  return String(value || '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character]);
}

function formatDate(value) {
  const date = new Date(value || Date.now());
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString('ar-EG', { dateStyle: 'medium', timeStyle: 'short' });
}

function exportLogs() {
  const search = document.querySelector('#view-audit-search')?.value || '';
  const role = document.querySelector('#view-audit-role-filter')?.value || 'all';
  const category = document.querySelector('#view-audit-category-filter')?.value || 'all';
  const startDate = document.querySelector('#view-audit-date-from')?.value || '';
  const endDate = document.querySelector('#view-audit-date-to')?.value || '';
  const filtered = filterAuditLogs(logsList, { query: search, role, category, startDate, endDate });
  exportAuditLogsToCsv(filtered);
}

