// ==========================================================================
// DIGITAL SCHOOL ECOSYSTEM (VANILLA EDITION)
// SPA View Module: Tablet Devices & Ministry Inventory (IMEI)
// ==========================================================================

import {
  getTabletDevices,
  getTabletBatches,
  createTabletBatch,
  increaseTabletBatchQuantity,
  registerTabletDevice,
  deliverTabletDevice,
} from '../services/tablet-service.js';
import { getStudents } from '../services/student-service.js';
import { exportDevicesToCsv } from '../utils/export-utils.js';

let isInitialized = false;
let allDevices = [];
let allBatches = [];
let allStudents = [];
let selectedBatchId = '';
let selectedDeliveryStudent = null;

export async function renderTabletsView(container) {
  if (!isInitialized) {
    container.innerHTML = `
      <div style="display: flex; flex-direction: column; gap: 18px;">
        <div style="display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 12px;">
          <div>
            <h1 style="font-size: 2rem; font-weight: 800; color: #f8fafc; margin-bottom: 4px;">📱 إدارة أجهزة التابلت</h1>
            <p style="font-size: 0.9rem; color: #94a3b8; margin: 0;">حصر الأجهزة، تسجيل الموديلات، وتوثيق عمليات التسليم والقبول.</p>
          </div>

          <div style="display: flex; gap: 10px; flex-wrap: wrap;">
            <button type="button" id="tab-export-csv-btn" class="btn btn-outline btn-sm" style="padding: 10px 16px;">📥 تصدير ملف إكسل</button>
            <button type="button" id="tab-create-batch-btn" class="btn btn-primary btn-sm" style="padding: 10px 16px; font-weight:700;">+ تسجيل دفعة مستلمة</button>
          </div>
        </div>

        <div id="tab-alert-box" style="display: none;"></div>

        <div style="display:grid; grid-template-columns:minmax(0, 1fr) auto; gap:10px; align-items:center; background:rgba(15,23,42,.82); border:1px solid rgba(148,163,184,.2); border-radius:12px; padding:12px;">
          <input type="search" id="tab-global-search" class="form-control" placeholder="بحث في كل الدفعات برقم IMEI أو اسم الطالب أو كوده" aria-label="بحث في جميع دفعات التابلت" style="background:rgba(2,6,23,.85); color:#f8fafc; border:1px solid rgba(148,163,184,.2); border-radius:10px;">
          <span id="tab-search-scope" style="color:#94a3b8; font-size:.8rem; white-space:nowrap;">كل الدفعات</span>
        </div>

        <div id="tab-create-batch-panel" style="display:none; background:rgba(15,23,42,.92); border:1px solid rgba(148,163,184,.25); border-radius:14px; padding:18px;">
          <form id="tab-create-batch-form">
            <div style="display:grid; grid-template-columns:repeat(auto-fit,minmax(190px,1fr)); gap:14px;">
              <div class="form-group"><label class="form-label" for="tab-batch-name">اسم الدفعة *</label><input id="tab-batch-name" class="form-control" required maxlength="80" placeholder="مثال: دفعة أكتوبر 2026"></div>
              <div class="form-group"><label class="form-label" for="tab-batch-quantity">الكمية المستلمة *</label><input id="tab-batch-quantity" class="form-control" type="number" min="1" step="1" required placeholder="200"></div>
              <div class="form-group"><label class="form-label" for="tab-batch-date">تاريخ الاستلام</label><input id="tab-batch-date" class="form-control" type="date"></div>
            </div>
            <div style="display:flex; justify-content:flex-end; gap:8px; margin-top:14px;">
              <button type="button" id="tab-cancel-create-batch" class="btn btn-outline">إلغاء</button>
              <button type="submit" class="btn btn-primary">حفظ الدفعة</button>
            </div>
          </form>
        </div>

        <section id="tab-batches-section" style="display:flex; flex-direction:column; gap:12px;">
          <div style="display:flex; justify-content:space-between; align-items:center; gap:10px; flex-wrap:wrap;">
            <h2 style="font-size:1.2rem; color:#f8fafc;">دفعات التابلت المستلمة</h2>
            <span id="tab-batches-count" style="color:#94a3b8; font-size:.85rem;"></span>
          </div>
          <div id="tab-batches-list" style="display:grid; grid-template-columns:repeat(auto-fit,minmax(260px,1fr)); gap:14px;"></div>
        </section>

        <div id="tab-reg-panel" style="display: none; background: rgba(15, 23, 42, 0.92); border: 1px solid rgba(148, 163, 184, 0.25); border-radius: 14px; padding: 18px; box-shadow: 0 20px 40px rgba(15, 23, 42, 0.25);">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px;">
            <h3 style="margin:0; color:#f8fafc; font-size:1.1rem;">قيد جهاز تابلت جديد في المخزن</h3>
            <button type="button" class="btn btn-sm" id="tab-close-reg-btn">✕ إغلاق</button>
          </div>
          <form id="tab-new-device-form">
            <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 16px;">
              <div class="form-group">
                <label class="form-label" for="tab-dev-batch">دفعة التابلت *</label>
                <select id="tab-dev-batch" class="form-control" required></select>
              </div>
              <div class="form-group">
                <label class="form-label" for="tab-dev-imei">رقم IMEI *</label>
                <input type="text" id="tab-dev-imei" class="form-control" placeholder="مثال: 358941094829104" required maxlength="15">
              </div>
              <div class="form-group">
                <label class="form-label" for="tab-dev-serial">الرقم التسلسلي</label>
                <input type="text" id="tab-dev-serial" class="form-control" placeholder="مثال: TAB-2026-001">
              </div>
              <div class="form-group">
                <label class="form-label" for="tab-dev-model">موديل التابلت</label>
                <input type="text" id="tab-dev-model" class="form-control" value="Samsung Galaxy Tab A9">
              </div>
            </div>
            <div style="display:flex; justify-content:flex-end; margin-top:16px;">
              <button type="submit" class="btn btn-primary btn-md">تأكيد وقيد الجهاز</button>
            </div>
          </form>
        </div>

        <div id="tab-batch-dashboard" style="display:none; flex-direction:column; gap:16px;">
        <div style="display:flex; justify-content:space-between; align-items:center; gap:10px; flex-wrap:wrap;">
          <div style="display:flex; align-items:center; gap:10px; flex-wrap:wrap;">
            <button type="button" id="tab-back-to-batches" class="btn btn-outline btn-sm">← كل الدفعات</button>
            <h2 id="tab-active-batch-heading" style="font-size:1.2rem; color:#f8fafc;"></h2>
          </div>
          <button type="button" id="tab-register-btn" class="btn btn-primary btn-sm">+ تسجيل IMEI بالدفعة</button>
        </div>

        <div style="display:flex; gap:10px; align-items:end; flex-wrap:wrap; padding:14px; background:rgba(15,23,42,.7); border:1px solid rgba(148,163,184,.2); border-radius:12px;">
          <div class="form-group" style="margin:0; flex:1; min-width:150px;"><label class="form-label" for="tab-add-stock-quantity">إضافة أجهزة مستلمة للدفعة</label><input id="tab-add-stock-quantity" type="number" min="1" step="1" class="form-control" placeholder="الكمية الإضافية"></div>
          <button type="button" id="tab-add-stock-btn" class="btn btn-outline">+ زيادة كمية الدفعة</button>
          <span style="color:#94a3b8; font-size:.8rem;">تُضاف للمخزون الافتراضي دون إنشاء IMEI لكل جهاز.</span>
        </div>

        <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 14px;">
          <div class="panel" style="padding: 16px; background: rgba(15, 23, 42, 0.82); border: 1px solid rgba(148, 163, 184, 0.2); border-radius: 14px; min-height: 110px;">
            <div style="color:#94a3b8; font-size:0.8rem;">📦 المستلم</div>
            <div id="batch-received-count" style="font-size:2.15rem; font-weight:900; color:#f8fafc; margin-top:8px;">0</div>
          </div>
          <div class="panel" style="padding: 16px; background: rgba(15, 23, 42, 0.82); border: 1px solid rgba(148, 163, 184, 0.2); border-radius: 14px; min-height: 110px;">
            <div style="color:#94a3b8; font-size:0.8rem;">⚡ مفعّل</div>
            <div id="batch-activated-count" style="font-size:2.15rem; font-weight:900; color:#4ade80; margin-top:8px;">0</div>
          </div>
          <div class="panel" style="padding: 16px; background: rgba(15, 23, 42, 0.82); border: 1px solid rgba(148, 163, 184, 0.2); border-radius: 14px; min-height: 110px;">
            <div style="color:#94a3b8; font-size:0.8rem;">⏳ غير مفعّل</div>
            <div id="batch-not-activated-count" style="font-size:2.15rem; font-weight:900; color:#fbbf24; margin-top:8px;">0</div>
          </div>
          <div class="panel" style="padding: 16px; background: rgba(15, 23, 42, 0.82); border: 1px solid rgba(148, 163, 184, 0.2); border-radius: 14px; min-height: 110px;">
            <div style="color:#94a3b8; font-size:0.8rem;">🎓 مسلّم</div>
            <div id="batch-delivered-count" style="font-size:2.15rem; font-weight:900; color:#60a5fa; margin-top:8px;">0</div>
          </div>
          <div class="panel" style="padding: 16px; background: rgba(15, 23, 42, 0.82); border: 1px solid rgba(148, 163, 184, 0.2); border-radius: 14px; min-height: 110px;">
            <div style="color:#94a3b8; font-size:0.8rem;">📦 مفعّل ولم يُسلّم</div>
            <div id="batch-activated-not-delivered-count" style="font-size:2.15rem; font-weight:900; color:#fb923c; margin-top:8px;">0</div>
          </div>
          <div class="panel" style="padding: 16px; background: rgba(15, 23, 42, 0.82); border: 1px solid rgba(148, 163, 184, 0.2); border-radius: 14px; min-height: 110px;">
            <div style="color:#94a3b8; font-size:0.8rem;">❗ لم يُسلّم</div>
            <div id="batch-not-delivered-count" style="font-size:2.15rem; font-weight:900; color:#f87171; margin-top:8px;">0</div>
          </div>
        </div>

        <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 18px;">
          <div class="panel" style="padding:20px; background: rgba(15, 23, 42, 0.82); border: 1px solid rgba(148, 163, 184, 0.2); border-radius: 14px; min-height: 160px;">
            <h3 style="margin:0 0 16px; color:#f8fafc; font-size:1.15rem;">⚡ تسجيل رقم IMEI وتفعيله</h3>
            <div style="display:flex; gap:10px; flex-wrap:wrap; align-items:center;">
              <input id="tablet-activation-imei" type="text" class="form-control" placeholder="IMEI" autocomplete="one-time-code" style="flex:1; min-width: 210px; background: rgba(2, 6, 23, 0.85); color: #f8fafc; border:1px solid rgba(148,163,184,.2); border-radius:10px;">
              <button onclick="activateTabletInBatch()" type="button" style="background:#22c55e; color:#0f172a; border:none; border-radius:10px; padding:12px 16px; cursor:pointer; font-weight:800;">تسجيل وتفعيل</button>
            </div>
            <div id="activation-feedback" style="margin-top:12px; color:#cbd5e1; min-height:20px;"></div>
          </div>

          <div class="panel" style="padding:20px; background: rgba(15, 23, 42, 0.82); border: 1px solid rgba(148, 163, 184, 0.2); border-radius: 14px; min-height: 160px;">
            <h3 style="margin:0 0 16px; color:#f8fafc; font-size:1.15rem;">🎓 تسليم التابلت</h3>
            <div style="display:flex; gap:10px; flex-wrap:wrap; align-items:center; margin-bottom:12px;">
              <input id="tablet-delivery-imei" type="text" class="form-control" placeholder="بحث IMEI" style="flex:1; min-width: 210px; background: rgba(2, 6, 23, 0.85); color: #f8fafc; border:1px solid rgba(148,163,184,.2); border-radius:10px;">
              <button onclick="lookupTabletForDelivery()" type="button" style="background:#60a5fa; color:#0f172a; border:none; border-radius:10px; padding:12px 16px; cursor:pointer; font-weight:800;">بحث</button>
            </div>
            <div id="delivery-result" style="min-height:70px; color:#cbd5e1;"></div>
            <div id="delivery-form" style="display:none; margin-top:12px;">
              <input id="delivery-student-search" type="search" autocomplete="off" placeholder="ابحث بكود الطالب أو الرقم القومي" class="form-control" style="width:100%; margin-bottom:8px; background: rgba(2, 6, 23, 0.85); color:#f8fafc; border:1px solid rgba(148,163,184,.2); border-radius:10px;">
              <div id="delivery-student-results" role="listbox" aria-label="نتائج البحث عن الطالب" style="display:grid; gap:6px; margin-bottom:10px;"></div>
              <div id="delivery-selected-student" style="min-height:20px; margin-bottom:10px; color:#86efac;"></div>
              <button id="delivery-confirm-btn" onclick="deliverTabletToStudent()" type="button" disabled style="background:#f59e0b; color:#0f172a; border:none; border-radius:10px; padding:12px 16px; cursor:pointer; font-weight:800; opacity:.55;">✓ تأكيد التسليم</button>
            </div>
          </div>
        </div>

        <div class="panel" style="padding: 0; overflow: hidden; background: rgba(15, 23, 42, 0.82); border: 1px solid rgba(148,163,184,.2); border-radius: 14px;">
          <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap: 10px; padding: 14px 18px; border-bottom: 1px solid rgba(148,163,184,.12);">
            <h3 style="margin:0; color:#f8fafc; font-size:1rem;">📊 سجل الأجهزة المسجلة</h3>
            <div style="display:flex; gap:10px; flex-wrap:wrap; align-items:center;">
              <button type="button" id="tab-export-csv-btn-secondary" class="btn btn-outline btn-sm">📤 تصدير ملف إكسل</button>
              <input type="text" id="tab-search-input" class="form-control" placeholder="بحث داخل الأجهزة" style="max-width: 240px; font-size: var(--text-xs); background: rgba(2, 6, 23, 0.85); color:#f8fafc; border:1px solid rgba(148,163,184,.2); border-radius:10px;">
              <select id="tab-status-filter" class="form-control" style="max-width: 170px; font-size: var(--text-xs); background: rgba(2, 6, 23, 0.85); color:#f8fafc; border:1px solid rgba(148,163,184,.2); border-radius:10px;">
                <option value="all">كافة الحالات</option>
                <option value="inventory">في المخزن</option>
                <option value="delivered">تم التسليم</option>
                <option value="maintenance">في الصيانة</option>
              </select>
              <span id="tab-total-badge" class="badge badge-accent">0 جهاز</span>
            </div>
          </div>
          <div class="table-wrap" style="border: none;">
            <table class="data-table">
              <thead>
                <tr>
                  <th style="width: 170px;">IMEI</th>
                  <th>الدفعة</th>
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
          <div id="tab-empty-state" class="empty-state" style="display: none; padding: 26px;">
            <div class="empty-state-icon">📱</div>
            <h4 class="empty-state-title">لا توجد أجهزة مطابقة للبحث</h4>
            <p class="empty-state-desc">يمكنك تسجيل جهاز جديد باستخدام الزر الأعلى.</p>
          </div>
        </div>
        </div>

        <div class="modal-backdrop" id="tab-handover-modal" style="display: none; position: fixed; inset: 0; background: rgba(2,6,23,0.7); z-index: 1000; align-items: center; justify-content: center; padding: var(--space-4);">
          <div class="panel" style="max-width: 520px; width: 100%; box-shadow: var(--shadow-xl); background: rgba(15,23,42,0.96); border: 1px solid rgba(148,163,184,.25); border-radius: 14px;">
            <div class="panel-header" style="display:flex; justify-content:space-between; align-items:center;">
              <h3 class="panel-title" style="margin: 0; color:#f8fafc;">📋 محضر تسليم رسمي</h3>
              <button type="button" class="btn btn-sm" id="tab-close-handover-btn">✕</button>
            </div>
            <div class="panel-body">
              <form id="tab-handover-form">
                <input type="hidden" id="handover-imei" value="">
                <div class="form-group" style="margin-bottom: var(--space-3);">
                  <label class="form-label">رقم IMEI</label>
                  <input type="text" id="handover-display-imei" class="form-control" readonly style="font-family: var(--font-mono); font-weight:700; background: rgba(15,23,42,0.85); color:#f8fafc; border:1px solid rgba(148,163,184,.2);">
                </div>
                <div class="form-group" style="margin-bottom: var(--space-3);">
                  <label class="form-label" for="handover-student-select">الطالب المستلم *</label>
                  <select id="handover-student-select" class="form-control" required></select>
                </div>
                <div style="display:grid; grid-template-columns: 1fr 1fr; gap: var(--space-3); margin-bottom: var(--space-3);">
                  <div class="form-group">
                    <label class="form-label" for="handover-parent-name">اسم ولي الأمر *</label>
                    <input type="text" id="handover-parent-name" class="form-control" required placeholder="الاسم الرباعي">
                  </div>
                  <div class="form-group">
                    <label class="form-label" for="handover-parent-nid">الرقم القومي *</label>
                    <input type="text" id="handover-parent-nid" class="form-control" required maxlength="14" placeholder="14 رقم">
                  </div>
                </div>
                <div class="form-group" style="margin-bottom: var(--space-4);">
                  <label class="form-label" for="handover-parent-phone">رقم الهاتف *</label>
                  <input type="tel" id="handover-parent-phone" class="form-control" required placeholder="010XXXXXXXX">
                </div>
                <div style="display:flex; justify-content:flex-end; gap: var(--space-2);">
                  <button type="button" class="btn btn-outline" id="tab-cancel-handover-btn">إلغاء</button>
                  <button type="submit" class="btn btn-primary">اعتماد التسليم</button>
                </div>
              </form>
            </div>
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

  renderBatchesList();
  populateBatchSelect();
  updateBatchPresentation();
  refreshTabletSummary();

  const badge = document.getElementById('tab-total-badge');
  if (badge) badge.textContent = `${allDevices.length} جهاز مسجل`;

  renderDevicesTable();
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[char]);
}

function getBatchDevices(batchId) {
  return allDevices.filter((device) => device.batchId === batchId);
}

function renderBatchesList() {
  const list = document.getElementById('tab-batches-list');
  const count = document.getElementById('tab-batches-count');
  if (!list) return;
  if (count) count.textContent = `${allBatches.length} دفعة`;

  list.innerHTML = allBatches.length ? allBatches.map((batch) => {
    const devices = getBatchDevices(batch.id);
    const received = Math.max(0, Number(batch.receivedQuantity || 0));
    const activated = devices.length;
    const delivered = devices.filter((device) => device.status === 'delivered').length;
    return `
      <article style="display:flex; flex-direction:column; gap:12px; padding:16px; background:rgba(15,23,42,.86); border:1px solid rgba(148,163,184,.22); border-radius:12px;">
        <div style="display:flex; justify-content:space-between; gap:10px; align-items:flex-start;">
          <div><h3 style="font-size:1.05rem; color:#f8fafc;">${escapeHtml(batch.batchNumber || batch.id)}</h3><div style="color:#94a3b8; font-size:.8rem; margin-top:4px;">${escapeHtml(batch.receivedDate || 'تاريخ الاستلام غير محدد')} · ${received} جهاز مستلم</div></div>
          <span class="badge badge-success">${received > activated ? 'نشطة' : 'مكتملة'}</span>
        </div>
        <div style="display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:8px; color:#cbd5e1; font-size:.8rem;">
          <div>مسجل/مفعّل <strong style="display:block;color:#4ade80;">${activated}</strong></div>
          <div>مسلم <strong style="display:block;color:#60a5fa;">${delivered}</strong></div>
          <div>متبقٍ للتسجيل <strong style="display:block;color:#fbbf24;">${Math.max(0, received - activated)}</strong></div>
        </div>
        <div style="display:flex; gap:8px; align-items:center;">
          <button type="button" class="btn btn-primary btn-sm" data-open-batch="${escapeHtml(batch.id)}" style="flex:1;">فتح الدفعة</button>
          <input type="number" min="1" step="1" aria-label="كمية إضافية" data-stock-quantity="${escapeHtml(batch.id)}" placeholder="+ كمية" style="width:90px; padding:8px; border-radius:8px; background:#020617; border:1px solid rgba(148,163,184,.25); color:#f8fafc;">
          <button type="button" class="btn btn-outline btn-sm" data-add-stock="${escapeHtml(batch.id)}" title="زيادة الكمية المستلمة">+</button>
        </div>
      </article>
    `;
  }).join('') : '<div style="grid-column:1/-1; padding:20px; border:1px solid rgba(148,163,184,.2); border-radius:12px; color:#94a3b8;">لا توجد دفعات مسجلة. ابدأ بتسجيل دفعة الاستلام.</div>';

  list.querySelectorAll('[data-open-batch]').forEach((button) => {
    button.addEventListener('click', () => {
      selectedBatchId = button.dataset.openBatch;
      document.getElementById('tab-global-search').value = '';
      document.getElementById('tab-search-input').value = '';
      updateBatchPresentation();
      renderDevicesTable();
    });
  });

  list.querySelectorAll('[data-add-stock]').forEach((button) => {
    button.addEventListener('click', async () => {
      const batchId = button.dataset.addStock;
      const quantityInput = list.querySelector(`[data-stock-quantity="${CSS.escape(batchId)}"]`);
      try {
        button.disabled = true;
        await increaseTabletBatchQuantity(batchId, quantityInput?.value);
        if (quantityInput) quantityInput.value = '';
        await loadTabletsData();
      } catch (error) {
        alert(error.message || 'تعذر زيادة كمية الدفعة.');
      } finally {
        button.disabled = false;
      }
    });
  });
}

function populateBatchSelect() {
  const select = document.getElementById('tab-dev-batch');
  if (!select) return;
  select.innerHTML = allBatches.length
    ? allBatches.map((batch) => `<option value="${escapeHtml(batch.id)}">${escapeHtml(batch.batchNumber || batch.id)}</option>`).join('')
    : '<option value="">سجل دفعة أولاً</option>';
  if (selectedBatchId && allBatches.some((batch) => batch.id === selectedBatchId)) {
    select.value = selectedBatchId;
  }
}

function updateBatchPresentation() {
  const isSearching = Boolean(document.getElementById('tab-global-search')?.value.trim());
  const isInBatch = Boolean(selectedBatchId);
  const batchList = document.getElementById('tab-batches-section');
  const dashboard = document.getElementById('tab-batch-dashboard');
  const heading = document.getElementById('tab-active-batch-heading');
  const batch = allBatches.find((entry) => entry.id === selectedBatchId);

  if (batchList) batchList.style.display = isInBatch || isSearching ? 'none' : 'flex';
  if (dashboard) dashboard.style.display = isInBatch || isSearching ? 'flex' : 'none';
  if (heading) heading.textContent = batch ? batch.batchNumber || batch.id : isSearching ? 'نتائج البحث في كل الدفعات' : '';
  document.getElementById('tab-search-scope').textContent = isInBatch && !isSearching ? `داخل دفعة: ${batch?.batchNumber || ''}` : 'كل الدفعات';
  document.getElementById('tab-dev-batch').value = selectedBatchId || allBatches[0]?.id || '';
}

function refreshTabletSummary() {
  const batch = allBatches.find((entry) => entry.id === selectedBatchId);
  const devices = selectedBatchId ? getBatchDevices(selectedBatchId) : allDevices;
  const received = batch
    ? Number(batch.receivedQuantity || 0)
    : allBatches.reduce((total, entry) => total + Number(entry.receivedQuantity || 0), 0);
  const registered = devices.length;
  const delivered = devices.filter((device) => device.status === 'delivered').length;
  const summary = {
    received,
    activated: registered,
    delivered,
    notActivated: Math.max(0, received - registered),
  };

  const receivedEl = document.getElementById('batch-received-count');
  const activatedEl = document.getElementById('batch-activated-count');
  const notActivatedEl = document.getElementById('batch-not-activated-count');
  const deliveredEl = document.getElementById('batch-delivered-count');
  const activatedNotDeliveredEl = document.getElementById('batch-activated-not-delivered-count');
  const notDeliveredEl = document.getElementById('batch-not-delivered-count');

  if (receivedEl) receivedEl.textContent = summary.received;
  if (activatedEl) activatedEl.textContent = summary.activated;
  if (notActivatedEl) notActivatedEl.textContent = summary.notActivated;
  if (deliveredEl) deliveredEl.textContent = summary.delivered;
  if (activatedNotDeliveredEl) activatedNotDeliveredEl.textContent = Math.max(0, registered - delivered);
  if (notDeliveredEl) notDeliveredEl.textContent = Math.max(0, received - delivered);
}

function activateTabletInBatch() {
  const imeiValue = document.getElementById('tablet-activation-imei')?.value.trim();
  const feedback = document.getElementById('activation-feedback');

  if (!imeiValue) {
    if (feedback) feedback.textContent = 'يرجى إدخال رقم IMEI أولاً.';
    return;
  }

  if (allDevices.some((entry) => entry.imei === imeiValue)) {
    if (feedback) feedback.textContent = 'رقم IMEI مسجل بالفعل. استخدم بحث التسليم أو البحث العام.';
    return;
  }

  if (!selectedBatchId) {
    if (feedback) feedback.textContent = 'افتح الدفعة التي استُلم منها الجهاز أولاً.';
    return;
  }

  document.getElementById('tab-dev-batch').value = selectedBatchId;
  document.getElementById('tab-dev-imei').value = imeiValue;
  document.getElementById('tab-reg-panel').style.display = 'block';
  document.getElementById('tab-dev-serial').focus();
  if (feedback) feedback.textContent = 'أدخل البيانات الاختيارية ثم احفظ لقيد الجهاز وتفعيله في الدفعة.';
}

function lookupTabletForDelivery() {
  const imeiValue = document.getElementById('tablet-delivery-imei')?.value.trim();
  const resultBox = document.getElementById('delivery-result');
  const formEl = document.getElementById('delivery-form');
  selectedDeliveryStudent = null;

  if (!imeiValue) {
    if (resultBox) resultBox.innerHTML = '<span class="text-warning">يرجى إدخال رقم IMEI أولاً.</span>';
    if (formEl) formEl.style.display = 'none';
    return;
  }

  const device = allDevices.find((entry) => entry.imei === imeiValue);
  if (!device) {
    if (resultBox) resultBox.innerHTML = '<span class="text-warning">لا يوجد جهاز بهذا IMEI في المنظومة.</span>';
    if (formEl) formEl.style.display = 'none';
    return;
  }

  if (device.status === 'delivered') {
    const assignedStudent = allStudents.find((student) => String(student.code || student.studentCode) === String(device.assignedStudentCode));
    const grade = assignedStudent?.gradeName || assignedStudent?.grade || assignedStudent?.stage || 'غير مسجل';
    const className = assignedStudent?.className || assignedStudent?.classId || 'غير مسجل';
    const batchName = allBatches.find((batch) => batch.id === device.batchId)?.batchNumber || 'دفعة غير محددة';
    if (resultBox) resultBox.innerHTML = `<div style="padding:10px;color:#bfdbfe;">تم تسليم الجهاز إلى ${escapeHtml(device.assignedStudentName)} (كود ${escapeHtml(device.assignedStudentCode)}) · الصف ${escapeHtml(grade)} · الفصل ${escapeHtml(className)} · ${escapeHtml(batchName)}</div>`;
    if (formEl) formEl.style.display = 'none';
    return;
  }

  document.getElementById('delivery-student-search').value = '';
  document.getElementById('delivery-student-results').innerHTML = '';
  document.getElementById('delivery-selected-student').textContent = '';
  document.getElementById('delivery-confirm-btn').disabled = true;
  document.getElementById('delivery-confirm-btn').style.opacity = '.55';

  if (resultBox) {
    resultBox.innerHTML = `
      <div style="padding: 10px 12px; border-radius: 10px; background: rgba(59,130,246,0.08); border: 1px solid rgba(96,165,250,0.25);">
        <div style="font-weight:700; color:#f8fafc;">${escapeHtml(device.model || 'تابلت')} | IMEI: ${escapeHtml(device.imei)}</div>
        <div style="font-size:12px; color:#cbd5e1; margin-top:4px;">الحالة: ${device.status === 'delivered' ? 'مسلم' : 'في المخزن'} · ${escapeHtml(device.serialNumber || 'بدون رقم تسلسلي')}</div>
        <div style="font-size:12px;color:#94a3b8;margin-top:4px;">الدفعة: ${escapeHtml(allBatches.find((batch) => batch.id === device.batchId)?.batchNumber || 'غير محددة')}</div>
      </div>
    `;
  }

  if (formEl) formEl.style.display = 'block';
}

function renderDeliveryStudentMatches(searchValue) {
  const results = document.getElementById('delivery-student-results');
  if (!results) return;
  const queryValue = String(searchValue || '').trim().toLowerCase();
  selectedDeliveryStudent = null;
  document.getElementById('delivery-selected-student').textContent = '';
  document.getElementById('delivery-confirm-btn').disabled = true;
  document.getElementById('delivery-confirm-btn').style.opacity = '.55';

  if (queryValue.length < 2) {
    results.innerHTML = queryValue ? '<span style="color:#94a3b8;font-size:.8rem;">أدخل حرفين على الأقل للبحث.</span>' : '';
    return;
  }

  const matches = allStudents.filter((student) => {
    const searchable = [
      student.code, student.studentCode, student.nationalId,
      student.name, student.studentName,
    ].map((value) => String(value || '').toLowerCase());
    return searchable.some((value) => value.includes(queryValue));
  }).slice(0, 8);

  if (!matches.length) {
    results.innerHTML = '<span style="color:#fca5a5;font-size:.8rem;">لا يوجد طالب مطابق في سجل القيد.</span>';
    return;
  }

  results.innerHTML = matches.map((student, index) => {
    const grade = student.gradeName || student.grade || student.stage || 'الصف غير مسجل';
    const className = student.className || student.classId || 'الفصل غير مسجل';
    return `<button type="button" role="option" aria-selected="false" data-student-index="${index}" style="text-align:right;padding:10px 12px;border:1px solid rgba(148,163,184,.2);border-radius:8px;background:rgba(15,23,42,.92);color:#f8fafc;">
      <strong>${escapeHtml(student.name || student.studentName || 'طالب')}</strong>
      <span style="display:block;color:#94a3b8;font-size:.78rem;margin-top:3px;">الكود: ${escapeHtml(student.code || student.studentCode || '—')} · ${escapeHtml(grade)} · ${escapeHtml(className)}</span>
    </button>`;
  }).join('');

  results.querySelectorAll('[data-student-index]').forEach((button) => {
    button.addEventListener('click', () => {
      selectedDeliveryStudent = matches[Number(button.dataset.studentIndex)];
      results.querySelectorAll('[role="option"]').forEach((option) => option.setAttribute('aria-selected', String(option === button)));
      const studentCode = selectedDeliveryStudent.code || selectedDeliveryStudent.studentCode;
      document.getElementById('delivery-selected-student').textContent = `الطالب المحدد: ${selectedDeliveryStudent.name || selectedDeliveryStudent.studentName} · الكود ${studentCode}`;
      const confirmButton = document.getElementById('delivery-confirm-btn');
      confirmButton.disabled = false;
      confirmButton.style.opacity = '1';
    });
  });
}

function deliverTabletToStudent() {
  const imeiValue = document.getElementById('tablet-delivery-imei')?.value.trim();
  const resultBox = document.getElementById('delivery-result');
  const studentCode = selectedDeliveryStudent?.code || selectedDeliveryStudent?.studentCode || '';
  const studentName = selectedDeliveryStudent?.name || selectedDeliveryStudent?.studentName || '';

  if (!imeiValue || !studentCode || !studentName) {
    if (resultBox) resultBox.innerHTML = '<span class="text-warning">يرجى اختيار الطالب أولاً قبل تأكيد التسليم.</span>';
    return;
  }

  const device = allDevices.find((entry) => entry.imei === imeiValue);
  if (!device) {
    if (resultBox) resultBox.innerHTML = '<span class="text-warning">لا يوجد جهاز بهذا IMEI في المنظومة.</span>';
    return;
  }

  const deliveryEvent = {
    imei: imeiValue,
    studentCode,
    studentName,
    operatorName: 'مسؤول التطوير التكنولوجي',
  };

  deliverTabletDevice(deliveryEvent.imei, {
    studentCode: deliveryEvent.studentCode,
    studentName: deliveryEvent.studentName,
    operatorName: deliveryEvent.operatorName,
  }).then(() => {
    if (resultBox) {
      resultBox.innerHTML = `<span style="color:#86efac; font-weight:700;">✓ تم تسليم الجهاز بنجاح للطالب ${escapeHtml(studentName)}.</span>`;
    }
    document.getElementById('delivery-form').style.display = 'none';
    document.getElementById('tablet-delivery-imei').value = '';
    selectedDeliveryStudent = null;
    return loadTabletsData();
  }).catch((error) => {
    if (resultBox) resultBox.innerHTML = `<span style="color:#fca5a5; font-weight:700;">${escapeHtml(error.message || 'حدث خطأ أثناء التسليم.')}</span>`;
  });
}

function renderDevicesTable() {
  const tbody = document.getElementById('tab-devices-tbody');
  const emptyState = document.getElementById('tab-empty-state');
  const q = (document.getElementById('tab-global-search')?.value || document.getElementById('tab-search-input')?.value || '').toLowerCase().trim();
  const status = document.getElementById('tab-status-filter')?.value || 'all';
  if (!tbody) return;

  const filtered = allDevices.filter((d) => {
    if (selectedBatchId && !q && d.batchId !== selectedBatchId) return false;
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

  refreshTabletSummary();
  const tabTotal = document.getElementById('tab-total-badge');
  if (tabTotal) tabTotal.textContent = `${filtered.length} جهاز مطابق`;

  if (filtered.length === 0) {
    tbody.innerHTML = '';
    emptyState.style.display = 'flex';
    return;
  }

  emptyState.style.display = 'none';
  tbody.innerHTML = filtered.map((d) => {
    const isDelivered = d.status === 'delivered';
    const statusBadge = isDelivered ? '<span class="badge badge-success">تم التسليم ✓</span>' : '<span class="badge badge-primary">بالمخزن</span>';
    const assignedStudent = allStudents.find((student) => String(student.code || student.studentCode) === String(d.assignedStudentCode));
    const studentPlacement = [assignedStudent?.gradeName || assignedStudent?.grade || assignedStudent?.stage, assignedStudent?.className || assignedStudent?.classId].filter(Boolean).map(escapeHtml).join(' · ');
    return `
      <tr>
        <td style="font-family: var(--font-mono); font-weight: 700; color: var(--color-primary-950); font-size: 12px;">
          ${escapeHtml(d.imei)}
        </td>
        <td>${escapeHtml(allBatches.find((batch) => batch.id === d.batchId)?.batchNumber || 'دفعة غير محددة')}</td>
        <td>
          <div style="font-size: var(--text-xs); font-weight: 600;">${escapeHtml(d.model || 'تابلت مدرسي')}</div>
          <div style="font-size: 11px; color: var(--text-muted); font-family: var(--font-mono);">${escapeHtml(d.serialNumber || '—')}</div>
        </td>
        <td>${statusBadge}</td>
        <td>
          ${isDelivered ? `
            <div style="font-size: var(--text-xs); font-weight: 700; color: var(--text-primary);">${escapeHtml(d.assignedStudentName || 'طالب')}</div>
            <div style="font-size: 11px; color: var(--text-muted);">كود: <code>${escapeHtml(d.assignedStudentCode || '—')}</code> ${studentPlacement ? `· ${studentPlacement}` : ''}</div>
          ` : '<span style="color: var(--text-muted); font-size: 11px;">غير مسند</span>'}
        </td>
        <td style="font-size: 11px; color: var(--text-muted);">${escapeHtml(d.deliveredDate || d.registeredDate || d.registeredAt || '—')}</td>
        <td style="text-align: center;">
          ${!isDelivered ? `
            <button type="button" class="btn btn-primary btn-sm handover-btn" data-imei="${escapeHtml(d.imei)}" style="padding: 2px 8px; font-size: 11px;">
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
  stuSelect.innerHTML = `<option value="">اختر الطالب</option>${allStudents.map(s => `
    <option value="${escapeHtml(s.code || s.studentCode)}" data-name="${escapeHtml(s.name || s.studentName)}" data-parent="${escapeHtml(s.parentInfo?.parentName || '')}" data-phone="${escapeHtml(s.parentInfo?.phone || '')}">
      ${escapeHtml(s.name || s.studentName)} (${escapeHtml(s.code || s.studentCode)} - ${escapeHtml(s.grade || 'المرحلة الثانوية')})
    </option>
  `).join('')}`;

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
  window.activateTabletInBatch = activateTabletInBatch;
  window.lookupTabletForDelivery = lookupTabletForDelivery;
  window.deliverTabletToStudent = deliverTabletToStudent;

  const toggleRegBtn = document.getElementById('tab-register-btn');
  const regPanel = document.getElementById('tab-reg-panel');
  const closeRegBtn = document.getElementById('tab-close-reg-btn');
  const regForm = document.getElementById('tab-new-device-form');
  const createBatchPanel = document.getElementById('tab-create-batch-panel');

  document.getElementById('tab-create-batch-btn')?.addEventListener('click', () => {
    createBatchPanel.style.display = createBatchPanel.style.display === 'none' ? 'block' : 'none';
  });
  document.getElementById('tab-cancel-create-batch')?.addEventListener('click', () => {
    createBatchPanel.style.display = 'none';
  });
  document.getElementById('tab-create-batch-form')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const batchNumber = document.getElementById('tab-batch-name').value.trim();
    const receivedQuantity = document.getElementById('tab-batch-quantity').value;
    const deliveryDate = document.getElementById('tab-batch-date').value;
    const submitButton = form.querySelector('[type="submit"]');
    try {
      submitButton.disabled = true;
      const batch = await createTabletBatch({ batchNumber, receivedQuantity, deliveryDate });
      form.reset();
      createBatchPanel.style.display = 'none';
      await loadTabletsData();
      selectedBatchId = batch.id;
      updateBatchPresentation();
      renderDevicesTable();
    } catch (error) {
      alert(error.message || 'تعذر تسجيل الدفعة.');
    } finally {
      submitButton.disabled = false;
    }
  });

  document.getElementById('tab-back-to-batches')?.addEventListener('click', () => {
    selectedBatchId = '';
    document.getElementById('tab-global-search').value = '';
    document.getElementById('tab-search-input').value = '';
    updateBatchPresentation();
    renderDevicesTable();
  });
  document.getElementById('tab-add-stock-btn')?.addEventListener('click', async (event) => {
    const button = event.currentTarget;
    try {
      button.disabled = true;
      await increaseTabletBatchQuantity(selectedBatchId, document.getElementById('tab-add-stock-quantity').value);
      document.getElementById('tab-add-stock-quantity').value = '';
      await loadTabletsData();
    } catch (error) {
      alert(error.message || 'تعذر زيادة كمية الدفعة.');
    } finally {
      button.disabled = false;
    }
  });

  document.getElementById('tab-export-csv-btn-secondary')?.addEventListener('click', () => {
    exportDevicesToCsv(allDevices);
  });

  toggleRegBtn?.addEventListener('click', () => {
    if (!selectedBatchId) {
      alert('افتح الدفعة التي تريد تسجيل الجهاز ضمنها أولاً.');
      return;
    }
    document.getElementById('tab-dev-batch').value = selectedBatchId;
    regPanel.style.display = regPanel.style.display === 'none' ? 'block' : 'none';
  });
  closeRegBtn?.addEventListener('click', () => { regPanel.style.display = 'none'; });

  regForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      await registerTabletDevice({
        imei: document.getElementById('tab-dev-imei').value.trim(),
        serialNumber: document.getElementById('tab-dev-serial').value.trim(),
        model: document.getElementById('tab-dev-model').value.trim(),
        batchId: document.getElementById('tab-dev-batch').value,
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
    const studentCode = stuSelect.value;
    const studentName = opt?.dataset?.name || opt?.textContent || '';
    const parentName = document.getElementById('handover-parent-name').value.trim();
    const phone = document.getElementById('handover-parent-phone').value.trim();

    try {
      await deliverTabletDevice(imei, {
        studentCode,
        studentName,
        operatorName: 'مسؤول التطوير التكنولوجي',
        recipientName: parentName,
        recipientNationalId: document.getElementById('handover-parent-nid').value.trim(),
        recipientPhone: phone,
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
  document.getElementById('delivery-student-search')?.addEventListener('input', (event) => {
    renderDeliveryStudentMatches(event.currentTarget.value);
  });
  document.getElementById('tab-global-search')?.addEventListener('input', () => {
    const globalSearch = document.getElementById('tab-global-search');
    document.getElementById('tab-search-input').value = globalSearch.value;
    if (globalSearch.value.trim()) selectedBatchId = '';
    updateBatchPresentation();
    renderDevicesTable();
  });
  document.getElementById('tab-status-filter')?.addEventListener('change', renderDevicesTable);
  document.getElementById('tab-export-csv-btn')?.addEventListener('click', () => {
    exportDevicesToCsv(allDevices);
  });
}

