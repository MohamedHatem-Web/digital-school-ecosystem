// ==========================================================================
// DIGITAL SCHOOL ECOSYSTEM (VANILLA EDITION)
// SPA View Module: Tablet Devices & Ministry Inventory (IMEI)
// ==========================================================================

import {
  getTabletDevices,
  getTabletBatches,
  registerTabletDevice,
  deliverTabletDevice,
} from '../services/tablet-service.js';
import { getStudents } from '../services/student-service.js';
import { exportDevicesToCsv } from '../utils/export-utils.js';

let isInitialized = false;
let allDevices = [];
let allBatches = [];
let allStudents = [];

export async function renderTabletsView(container) {
  if (!isInitialized) {
    container.innerHTML = `
      <div style="display: flex; flex-direction: column; gap: var(--space-5);">
        <!-- Page Title & Actions -->
        <div style="display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: var(--space-4);">
          <div>
            <h1 style="font-size: var(--text-2xl); font-weight: 800; color: var(--color-primary-950); margin-bottom: 2px;">
              📱 منظومة أجهزة التابلت المدرسي (IMEI)
            </h1>
            <p style="font-size: var(--text-sm); color: var(--text-muted); margin: 0;">
              حصر الأجهزة الوزارية، فحص الـ IMEI، توثيق الدفعات، ومحاضر التسليم للطلاب.
            </p>
          </div>
          <div style="display: flex; gap: var(--space-2); flex-wrap: wrap;">
            <button type="button" id="tab-export-csv-btn" class="btn btn-outline btn-sm">
              📥 تصدير الكشف (Excel)
            </button>
            <button type="button" id="tab-register-btn" class="btn btn-primary btn-sm" style="font-weight: 700;">
              + قيد جهاز تابلت جديد
            </button>
          </div>
        </div>

        <!-- Alert Box -->
        <div id="tab-alert-box" style="display: none;"></div>

        <!-- Registration Form Panel (Collapsible) -->
        <div class="panel" id="tab-reg-panel" style="display: none; border-inline-start: 4px solid var(--color-primary-800);">
          <div class="panel-header" style="display: flex; justify-content: space-between; align-items: center;">
            <h3 class="panel-title" style="margin: 0;">قيد جهاز تابلت جديد في المخزن</h3>
            <button type="button" class="btn btn-sm" id="tab-close-reg-btn">✕ إغلاق</button>
          </div>
          <div class="panel-body">
            <form id="tab-new-device-form">
              <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: var(--space-4);">
                <div class="form-group">
                  <label class="form-label" for="tab-dev-imei">رقم IMEI للجهاز (14 إلى 15 رقم) *</label>
                  <input type="text" id="tab-dev-imei" class="form-control" placeholder="مثال: 358941094829104" required maxlength="15">
                  <span class="form-hint">يتم فحصه تلقائيًا لمنع تكرار القيد لنفس الجهاز</span>
                </div>
                <div class="form-group">
                  <label class="form-label" for="tab-dev-serial">الرقم التسلسلي (Serial Number)</label>
                  <input type="text" id="tab-dev-serial" class="form-control" placeholder="مثال: R52N80ABCDE">
                </div>
                <div class="form-group">
                  <label class="form-label" for="tab-dev-model">موديل التابلت</label>
                  <input type="text" id="tab-dev-model" class="form-control" value="Samsung Galaxy Tab A9">
                </div>
              </div>
              <div style="display: flex; justify-content: flex-end; margin-top: var(--space-4);">
                <button type="submit" class="btn btn-primary btn-md">تأكيد وقيد الجهاز في المخزن</button>
              </div>
            </form>
          </div>
        </div>

        <!-- Handover Modal -->
        <div class="modal-backdrop" id="tab-handover-modal" style="display: none; position: fixed; inset: 0; background: rgba(0,0,0,0.6); z-index: 1000; align-items: center; justify-content: center; padding: var(--space-4);">
          <div class="panel" style="max-width: 520px; width: 100%; box-shadow: var(--shadow-xl);">
            <div class="panel-header" style="display: flex; justify-content: space-between; align-items: center;">
              <h3 class="panel-title" style="margin: 0;">📋 محضر تسليم رسمي لجهاز تابلت</h3>
              <button type="button" class="btn btn-sm" id="tab-close-handover-btn">✕</button>
            </div>
            <div class="panel-body">
              <form id="tab-handover-form">
                <input type="hidden" id="handover-imei" value="">
                <div class="form-group" style="margin-bottom: var(--space-3);">
                  <label class="form-label">رقم IMEI للجهاز</label>
                  <input type="text" id="handover-display-imei" class="form-control" readonly style="font-family: var(--font-mono); font-weight: 700; background: var(--bg-surface-subtle);">
                </div>

                <div class="form-group" style="margin-bottom: var(--space-3);">
                  <label class="form-label" for="handover-student-select">الطالب المستلم *</label>
                  <select id="handover-student-select" class="form-control" required></select>
                </div>

                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-3); margin-bottom: var(--space-3);">
                  <div class="form-group">
                    <label class="form-label" for="handover-parent-name">اسم ولي الأمر المستلم *</label>
                    <input type="text" id="handover-parent-name" class="form-control" required placeholder="الاسم الرباعي لولي الأمر">
                  </div>
                  <div class="form-group">
                    <label class="form-label" for="handover-parent-nid">الرقم القومي لولي الأمر *</label>
                    <input type="text" id="handover-parent-nid" class="form-control" required maxlength="14" placeholder="14 رقم">
                  </div>
                </div>

                <div class="form-group" style="margin-bottom: var(--space-4);">
                  <label class="form-label" for="handover-parent-phone">رقم الهاتف للتواصل *</label>
                  <input type="tel" id="handover-parent-phone" class="form-control" required placeholder="010XXXXXXXX">
                </div>

                <div style="display: flex; justify-content: flex-end; gap: var(--space-2);">
                  <button type="button" class="btn btn-outline" id="tab-cancel-handover-btn">إلغاء</button>
                  <button type="submit" class="btn btn-primary">اعتماد وتوثيق التسليم</button>
                </div>
              </form>
            </div>
          </div>
        </div>

        <!-- Filter & Search Toolbar -->
        <div class="panel" style="padding: var(--space-3) var(--space-4);">
          <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: var(--space-3);">
            <div style="display: flex; gap: var(--space-2); flex: 1; min-width: 260px; flex-wrap: wrap;">
              <input type="text" id="tab-search-input" class="form-control" placeholder="بحث برقم IMEI، كود الطالب، أو الاسم..." style="max-width: 320px; font-size: var(--text-xs);">
              <select id="tab-status-filter" class="form-control" style="max-width: 170px; font-size: var(--text-xs);">
                <option value="all">كافة الحالات</option>
                <option value="in_stock">في المخزن (جاهز)</option>
                <option value="delivered">تم التسليم رسمياً</option>
                <option value="maintenance">في الصيانة</option>
              </select>
            </div>
            <div>
              <span id="tab-total-badge" class="badge badge-accent">0 جهاز مسجل</span>
            </div>
          </div>
        </div>

        <!-- Devices Table -->
        <div class="panel" style="padding: 0; overflow: hidden;">
          <div class="table-wrap" style="border: none;">
            <table class="data-table">
              <thead>
                <tr>
                  <th style="width: 170px;">رقم IMEI</th>
                  <th>الموديل والرقم التسلسلي</th>
                  <th>الحالة</th>
                  <th>الطالب المستلم</th>
                  <th>تاريخ الإجراء</th>
                  <th style="text-align: center; width: 120px;">إجراءات</th>
                </tr>
              </thead>
              <tbody id="tab-devices-tbody"></tbody>
            </table>
          </div>
          <div id="tab-empty-state" class="empty-state" style="display: none; padding: var(--space-8);">
            <div class="empty-state-icon">📱</div>
            <h4 class="empty-state-title">لا توجد أجهزة مطابقة للبحث</h4>
            <p class="empty-state-desc">يمكنك تسجيل جهاز تابلت جديد باستخدام الزر بالأعلى.</p>
          </div>
        </div>
      </div>
    `;

    bindTabletsEvents(container);
    isInitialized = true;
  }

  await loadTabletsData();
}

async function loadTabletsData() {
  allDevices = (await getTabletDevices()) || [];
  allBatches = (await getTabletBatches()) || [];
  allStudents = (await getStudents()) || [];

  const badge = document.getElementById('tab-total-badge');
  if (badge) badge.textContent = `${allDevices.length} جهاز مسجل`;

  renderDevicesTable();
}

function renderDevicesTable() {
  const tbody = document.getElementById('tab-devices-tbody');
  const emptyState = document.getElementById('tab-empty-state');
  const q = (document.getElementById('tab-search-input')?.value || '').toLowerCase().trim();
  const status = document.getElementById('tab-status-filter')?.value || 'all';
  if (!tbody) return;

  const filtered = allDevices.filter((d) => {
    if (status !== 'all' && d.status !== status) return false;
    if (q) {
      const match = (d.imei || '').includes(q) ||
                    (d.serialNumber || '').toLowerCase().includes(q) ||
                    (d.assignedStudentName || '').toLowerCase().includes(q) ||
                    (d.assignedStudentCode || '').includes(q);
      if (!match) return false;
    }
    return true;
  });

  if (filtered.length === 0) {
    tbody.innerHTML = '';
    emptyState.style.display = 'flex';
    return;
  }

  emptyState.style.display = 'none';
  tbody.innerHTML = filtered.map((d) => {
    const isDelivered = d.status === 'delivered';
    const statusBadge = isDelivered ? '<span class="badge badge-success">تم التسليم ✓</span>' : '<span class="badge badge-primary">بالمخزن</span>';
    return `
      <tr>
        <td style="font-family: var(--font-mono); font-weight: 700; color: var(--color-primary-950); font-size: 12px;">
          ${d.imei}
        </td>
        <td>
          <div style="font-size: var(--text-xs); font-weight: 600;">${d.model || 'تابلت مدرسي'}</div>
          <div style="font-size: 11px; color: var(--text-muted); font-family: var(--font-mono);">${d.serialNumber || '—'}</div>
        </td>
        <td>${statusBadge}</td>
        <td>
          ${isDelivered ? `
            <div style="font-size: var(--text-xs); font-weight: 700; color: var(--text-primary);">${d.assignedStudentName || 'طالب'}</div>
            <div style="font-size: 11px; color: var(--text-muted);">كود: <code>${d.assignedStudentCode || '—'}</code></div>
          ` : '<span style="color: var(--text-muted); font-size: 11px;">غير مسند</span>'}
        </td>
        <td style="font-size: 11px; color: var(--text-muted);">${d.deliveredDate || d.registeredDate || '—'}</td>
        <td style="text-align: center;">
          ${!isDelivered ? `
            <button type="button" class="btn btn-primary btn-sm handover-btn" data-imei="${d.imei}" style="padding: 2px 8px; font-size: 11px;">
              🤝 تسليم للطالب
            </button>
          ` : `
            <span class="badge badge-default" style="font-size: 11px;">موثق رسميًا</span>
          `}
        </td>
      </tr>
    `;
  }).join('');

  tbody.querySelectorAll('.handover-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      openHandoverModal(btn.dataset.imei);
    });
  });
}

function openHandoverModal(imei) {
  const modal = document.getElementById('tab-handover-modal');
  document.getElementById('handover-imei').value = imei;
  document.getElementById('handover-display-imei').value = imei;

  const stuSelect = document.getElementById('handover-student-select');
  stuSelect.innerHTML = allStudents.map(s => `
    <option value="${s.code}" data-name="${s.name}" data-parent="${s.parentInfo?.parentName || ''}" data-phone="${s.parentInfo?.phone || ''}">
      ${s.name} (${s.code} - ${s.grade || 'أولى ثانوي'})
    </option>
  `).join('');

  // Autofill parent info on select change
  const updateParentInputs = () => {
    const opt = stuSelect.options[stuSelect.selectedIndex];
    if (opt) {
      if (opt.dataset.parent) document.getElementById('handover-parent-name').value = opt.dataset.parent;
      if (opt.dataset.phone) document.getElementById('handover-parent-phone').value = opt.dataset.phone;
    }
  };
  stuSelect.onchange = updateParentInputs;
  updateParentInputs();

  modal.style.display = 'flex';
}

function bindTabletsEvents(container) {
  const toggleRegBtn = document.getElementById('tab-register-btn');
  const regPanel = document.getElementById('tab-reg-panel');
  const closeRegBtn = document.getElementById('tab-close-reg-btn');
  const regForm = document.getElementById('tab-new-device-form');

  toggleRegBtn.addEventListener('click', () => {
    regPanel.style.display = regPanel.style.display === 'none' ? 'block' : 'none';
  });
  closeRegBtn.addEventListener('click', () => { regPanel.style.display = 'none'; });

  regForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      await registerTabletDevice({
        imei: document.getElementById('tab-dev-imei').value.trim(),
        serialNumber: document.getElementById('tab-dev-serial').value.trim(),
        model: document.getElementById('tab-dev-model').value.trim(),
      });
      regForm.reset();
      regPanel.style.display = 'none';
      alert('تم قيد الجهاز بنجاح في سجلات المخزن وتوثيقه.');
      await loadTabletsData();
    } catch (err) {
      alert(err.message || 'حدث خطأ أثناء قيد الجهاز.');
    }
  });

  // Handover Modal bindings
  const handoverModal = document.getElementById('tab-handover-modal');
  const closeHandoverBtn = document.getElementById('tab-close-handover-btn');
  const cancelHandoverBtn = document.getElementById('tab-cancel-handover-btn');
  const handoverForm = document.getElementById('tab-handover-form');

  const hideHandover = () => { handoverModal.style.display = 'none'; };
  closeHandoverBtn.addEventListener('click', hideHandover);
  cancelHandoverBtn.addEventListener('click', hideHandover);

  handoverForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const imei = document.getElementById('handover-imei').value;
    const stuSelect = document.getElementById('handover-student-select');
    const opt = stuSelect.options[stuSelect.selectedIndex];

    try {
      await deliverTabletDevice({
        imei,
        studentCode: stuSelect.value,
        studentName: opt.dataset.name,
        recipientName: document.getElementById('handover-parent-name').value.trim(),
        recipientNationalId: document.getElementById('handover-parent-nid').value.trim(),
        recipientPhone: document.getElementById('handover-parent-phone').value.trim(),
      });
      handoverForm.reset();
      hideHandover();
      alert('تم اعتماد محضر تسليم التابلت للطالب بنجاح وتوثيقه.');
      await loadTabletsData();
    } catch (err) {
      alert(err.message || 'حدث خطأ أثناء تسجيل التسليم.');
    }
  });

  document.getElementById('tab-search-input')?.addEventListener('input', renderDevicesTable);
  document.getElementById('tab-status-filter')?.addEventListener('change', renderDevicesTable);
  document.getElementById('tab-export-csv-btn')?.addEventListener('click', () => {
    exportDevicesToCsv(allDevices);
  });
}

