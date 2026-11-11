// ==========================================================================
// DIGITAL SCHOOL ECOSYSTEM (VANILLA EDITION)
// SPA View Module: Comprehensive Audit Logs & Security Activity
// ==========================================================================

import { getAuditLogs } from '../services/audit-service.js';
import { exportToCsv } from '../utils/export-utils.js';

let isInitialized = false;
let logsList = [];

export async function renderAuditView(container) {
  if (!isInitialized) {
    container.innerHTML = `
      <div style="display: flex; flex-direction: column; gap: var(--space-5);">
        <div style="display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: var(--space-3);">
          <div>
            <h1 style="font-size: var(--text-2xl); font-weight: 800; color: var(--color-primary-950); margin-bottom: var(--space-1);">
              🛡️ سجل النشاطات الشامل والتوثيق الأمني
            </h1>
            <p style="font-size: var(--text-sm); color: var(--text-muted); margin: 0;">
              توثيق فوري ومؤرخ لكافة الإجراءات والعمليات المنفذة من قِبل المدير، الأخصائيين، المعلمين، والطلاب.
            </p>
          </div>
          <div style="display: flex; gap: var(--space-2); align-items: center; flex-wrap: wrap;">
            <button type="button" class="btn btn-outline btn-sm" id="view-audit-refresh-btn">
              <span>🔄</span> <span>تحديث السجل</span>
            </button>
            <button type="button" class="btn btn-primary btn-sm" id="view-audit-export-btn">
              <span>📥</span> <span>تصدير السجل (Excel)</span>
            </button>
          </div>
        </div>

        <!-- Filter Bar -->
        <div style="display: flex; gap: var(--space-3); flex-wrap: wrap; background: var(--bg-surface); padding: var(--space-3); border: 1px solid var(--border-subtle); border-radius: var(--radius-md);">
          <input type="text" id="view-audit-search" class="form-control" placeholder="بحث بالعملية، المنفذ، أو التفاصيل..." style="flex: 1 1 220px; font-size: var(--text-xs);">
          <select id="view-audit-role-filter" class="form-control" style="width: auto; min-width: 140px; font-size: var(--text-xs);">
            <option value="all">كافة الأدوار 👥</option>
            <option value="director">مدير المدرسة 👑</option>
            <option value="tech_specialist">مسؤول التطوير 💻</option>
            <option value="social_affairs">الأخصائي الاجتماعي 🤝</option>
            <option value="student_affairs">شؤون الطلاب 🎓</option>
            <option value="teacher">المعلمون 👨‍🏫</option>
          </select>
        </div>

        <!-- Table Panel -->
        <div class="panel" style="padding: 0; overflow: hidden;">
          <div class="table-wrap" style="border: none;">
            <table class="data-table">
              <thead>
                <tr>
                  <th style="width: 160px;">التوقيت</th>
                  <th>العملية / الإجراء</th>
                  <th>المعني / الهدف</th>
                  <th>المنفذ</th>
                  <th>التفاصيل</th>
                </tr>
              </thead>
              <tbody id="view-audit-tbody">
                <!-- Rows injected dynamically -->
              </tbody>
            </table>
          </div>
          <div id="view-audit-empty" style="display: none; padding: 30px; text-align: center; color: var(--text-muted);">
            لا توجد نشاطات مسجلة مطابقة للبحث
          </div>
        </div>
      </div>
    `;

    document.getElementById('view-audit-refresh-btn')?.addEventListener('click', () => loadLogsTable());
    document.getElementById('view-audit-search')?.addEventListener('input', () => filterAndRenderLogs());
    document.getElementById('view-audit-role-filter')?.addEventListener('change', () => filterAndRenderLogs());
    document.getElementById('view-audit-export-btn')?.addEventListener('click', () => exportLogs());

    isInitialized = true;
  }

  await loadLogsTable();
}

async function loadLogsTable() {
  const tbody = document.getElementById('view-audit-tbody');
  if (tbody) tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; padding: 20px;">جارٍ تحميل سجل النشاطات...</td></tr>';

  logsList = (await getAuditLogs()) || [];
  filterAndRenderLogs();
}

function filterAndRenderLogs() {
  const tbody = document.getElementById('view-audit-tbody');
  const empty = document.getElementById('view-audit-empty');
  const search = (document.getElementById('view-audit-search')?.value || '').toLowerCase().trim();
  const role = document.getElementById('view-audit-role-filter')?.value || 'all';

  if (!tbody) return;

  const filtered = logsList.filter(l => {
    if (role !== 'all' && l.operatorRole !== role) return false;
    if (search) {
      const match = (l.action || '').toLowerCase().includes(search) ||
                    (l.target || '').toLowerCase().includes(search) ||
                    (l.operator || '').toLowerCase().includes(search) ||
                    (l.details || '').toLowerCase().includes(search);
      if (!match) return false;
    }
    return true;
  });

  if (filtered.length === 0) {
    tbody.innerHTML = '';
    if (empty) empty.style.display = 'block';
    return;
  }

  if (empty) empty.style.display = 'none';
  tbody.innerHTML = filtered.map(l => `
    <tr>
      <td style="font-size: 11px; white-space: nowrap;">
        ${new Date(l.timestamp || Date.now()).toLocaleString('ar-EG', { dateStyle: 'short', timeStyle: 'short' })}
      </td>
      <td><strong>${l.action || '—'}</strong></td>
      <td>${l.target || l.entityType || '—'}</td>
      <td><span class="badge badge-accent">${l.operatorRole || l.operator || 'النظام'}</span></td>
      <td style="font-size: 12px; color: var(--text-muted); max-width: 250px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${l.details || ''}">
        ${l.details || '—'}
      </td>
    </tr>
  `).join('');
}

function exportLogs() {
  const headers = ['التوقيت', 'الإجراء', 'المستهدف', 'المنفذ', 'التفاصيل'];
  const rows = logsList.map(l => [
    new Date(l.timestamp || Date.now()).toLocaleString('ar-EG'),
    l.action || '',
    l.target || '',
    l.operatorRole || '',
    l.details || '',
  ]);
  exportToCsv('سجل_النشاطات_الشامل', headers, rows);
}

