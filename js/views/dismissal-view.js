import { getCurrentUser } from '../auth.js';
import { DEFAULT_SCHOOL_ID } from '../services/school-service.js';
import { showConfirmModal, showToast } from '../components.js';
import {
  activateDailySchoolDismissal,
  updateDailySchoolDismissal,
  cancelDailySchoolDismissal,
  getCairoDateKey,
  subscribeToSchoolDismissals,
} from '../services/notification-service.js';

export async function renderDismissalView(container) {
  const currentUser = getCurrentUser();
  const schoolId = currentUser?.schoolId || DEFAULT_SCHOOL_ID;
  if (!container) return;

  container.innerHTML = `
    <div style="display:flex;flex-direction:column;gap:var(--space-5);">
      <div class="panel-header">
        <div>
          <span class="badge badge-warning">خدمة انصراف موحّدة</span>
          <h2 class="panel-title" style="margin-top:6px;">خطة الانصراف اليومي</h2>
          <p style="margin:6px 0 0;color:var(--text-muted);font-size:var(--text-sm);">
            اعتماد الموعد مرة واحدة لكل يوم، وتحديثه أو إلغاؤه من قبل الموظفين المخولين.
          </p>
        </div>
      </div>

      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:var(--space-5);">
        <section class="panel">
          <div class="panel-header"><h3 class="panel-title">اعتماد أو تعديل اليوم</h3></div>
          <div class="panel-body" style="display:flex;flex-direction:column;gap:var(--space-4);">
            <label style="display:flex;flex-direction:column;gap:6px;">
              تاريخ الانصراف
              <input type="date" id="dismissal-date" class="form-control">
            </label>
            <label style="display:flex;flex-direction:column;gap:6px;">
              وقت الانصراف الرسمي
              <input type="time" id="dismissal-time" class="form-control">
            </label>
            <label style="display:flex;flex-direction:column;gap:6px;">
              نص البيان لأولياء الأمور
              <textarea id="dismissal-message" class="form-control" rows="4">تم إعلان انتهاء اليوم الدراسي رسميًا وبدء خروج الطلاب بأمان.</textarea>
            </label>
            <div style="display:flex;gap:8px;flex-wrap:wrap;">
              <button type="button" id="activate-dismissal-btn" class="btn btn-primary">اعتماد انصراف اليوم</button>
              <button type="button" id="update-dismissal-btn" class="btn btn-outline" style="display:none;">حفظ التعديل</button>
              <button type="button" id="cancel-dismissal-btn" class="btn btn-danger" style="display:none;">إلغاء اليوم</button>
            </div>
            <div id="dismissal-form-status" class="alert" style="display:none;"></div>
          </div>
        </section>

        <section class="panel">
          <div class="panel-header"><h3 class="panel-title">حالة اليوم المباشر</h3></div>
          <div class="panel-body" id="dismissal-live-status" style="line-height:1.9;">
            جارٍ تحميل حالة الانصراف...
          </div>
        </section>
      </div>

      <section class="panel">
        <div class="panel-header"><h3 class="panel-title">سجل خطط الانصراف</h3></div>
        <div class="panel-body" id="dismissal-history" style="display:flex;flex-direction:column;gap:8px;">
          جارٍ تحميل السجل...
        </div>
      </section>
    </div>
  `;

  const dateInput = container.querySelector('#dismissal-date');
  const timeInput = container.querySelector('#dismissal-time');
  const messageInput = container.querySelector('#dismissal-message');
  const activateBtn = container.querySelector('#activate-dismissal-btn');
  const updateBtn = container.querySelector('#update-dismissal-btn');
  const cancelBtn = container.querySelector('#cancel-dismissal-btn');
  const statusEl = container.querySelector('#dismissal-form-status');
  const liveEl = container.querySelector('#dismissal-live-status');
  const historyEl = container.querySelector('#dismissal-history');
  let dismissalRecords = [];

  dateInput.value = getCairoDateKey();

  const getSelectedRecord = () => dismissalRecords.find((record) => record.dateKey === dateInput.value);

  const refreshForm = () => {
    const record = getSelectedRecord();
    const active = record && record.status !== 'cancelled';
    activateBtn.style.display = active ? 'none' : 'inline-flex';
    updateBtn.style.display = active ? 'inline-flex' : 'none';
    cancelBtn.style.display = active ? 'inline-flex' : 'none';

    if (active) {
      timeInput.value = record.dismissalTime || '';
      messageInput.value = record.message || '';
      liveEl.innerHTML = `
        <div><strong>الحالة:</strong> معتمد ويظهر لأولياء الأمور</div>
        <div><strong>التاريخ:</strong> ${record.dateKey}</div>
        <div><strong>الوقت:</strong> ${record.dismissalTime || 'غير محدد بعد'}</div>
        <div><strong>اعتمد بواسطة:</strong> ${record.authorizedBy || 'غير مسجل'}</div>
        <div><strong>الصفة:</strong> ${record.authorizedByRole || 'موظف مخول'}</div>
      `;
    } else if (record?.status === 'cancelled') {
      timeInput.value = record.dismissalTime || '';
      messageInput.value = record.message || '';
      liveEl.innerHTML = `<div><strong>الحالة:</strong> ملغي لهذا اليوم</div><div><strong>ألغاه:</strong> ${record.cancelledBy || 'موظف مخول'}</div>`;
    } else {
      liveEl.innerHTML = '<div><strong>الحالة:</strong> لم يعتمد انصراف لهذا التاريخ بعد.</div>';
    }

    historyEl.innerHTML = dismissalRecords.length
      ? dismissalRecords.slice(0, 30).map((record) => `
          <div style="border:1px solid var(--border-subtle);border-radius:var(--radius-sm);padding:10px 12px;">
            <strong>${record.dateKey || '—'}</strong>
            <span style="margin-inline-start:8px;">${record.status === 'cancelled' ? 'ملغي' : 'معتمد'}</span>
            <span style="margin-inline-start:8px;">${record.dismissalTime || 'بدون وقت محدد'}</span>
            <span style="display:block;color:var(--text-muted);font-size:12px;margin-top:4px;">
              المنفذ: ${record.authorizedBy || 'غير مسجل'} — ${record.authorizedByRole || ''}
            </span>
          </div>
        `).join('')
      : '<div style="color:var(--text-muted);">لا توجد خطط انصراف مسجلة بعد.</div>';
  };

  subscribeToSchoolDismissals((records) => {
    dismissalRecords = records;
    refreshForm();
  }, (error) => {
    statusEl.className = 'alert alert-danger';
    statusEl.style.display = 'block';
    statusEl.textContent = error.message || 'تعذر متابعة خطة الانصراف مباشرة.';
  }, schoolId);

  dateInput.addEventListener('change', refreshForm);

  activateBtn.addEventListener('click', async () => {
    activateBtn.disabled = true;
    statusEl.style.display = 'none';
    try {
      const result = await activateDailySchoolDismissal({
        dateKey: dateInput.value,
        dismissalTime: timeInput.value,
        message: messageInput.value,
        authorizedBy: currentUser?.displayName || currentUser?.email || 'موظف مخول',
        authorizedByUid: currentUser?.uid || '',
        authorizedByRole: currentUser?.role || 'director',
      }, schoolId);
      statusEl.className = 'alert alert-success';
      statusEl.style.display = 'block';
      if (result.created) {
        statusEl.textContent = 'تم الاعتماد ونشره لأولياء الأمور مباشرة.';
        showToast('تم اعتماد خطة الانصراف ونشرها.', 'success');
      } else {
        statusEl.textContent = `تم الاعتماد مسبقًا بواسطة: ${result.dismissed.authorizedBy || 'موظف مخول'} ولا يُسجل الاعتماد مرتين.`;
      }
    } catch (error) {
      statusEl.className = 'alert alert-danger';
      statusEl.style.display = 'block';
      statusEl.textContent = error.message || 'تعذر اعتماد الانصراف.';
    } finally {
      activateBtn.disabled = false;
    }
  });

  updateBtn.addEventListener('click', async () => {
    updateBtn.disabled = true;
    try {
      await updateDailySchoolDismissal({
        dateKey: dateInput.value,
        dismissalTime: timeInput.value,
        message: messageInput.value,
        authorizedBy: currentUser?.displayName || currentUser?.email || 'موظف مخول',
        authorizedByUid: currentUser?.uid || '',
        authorizedByRole: currentUser?.role || 'director',
      }, schoolId);
      statusEl.className = 'alert alert-success';
      statusEl.style.display = 'block';
      statusEl.textContent = 'تم حفظ التعديل ونشره لأولياء الأمور مباشرة.';
      showToast('تم تحديث خطة الانصراف.', 'success');
    } catch (error) {
      statusEl.className = 'alert alert-danger';
      statusEl.style.display = 'block';
      statusEl.textContent = error.message || 'تعذر تعديل الانصراف.';
    } finally {
      updateBtn.disabled = false;
    }
  });

  cancelBtn.addEventListener('click', async () => {
    const confirmed = await showConfirmModal({
      title: 'إلغاء انصراف اليوم',
      message: `هل تريد إلغاء خطة الانصراف بتاريخ ${dateInput.value}؟`,
      confirmText: 'إلغاء الخطة',
      cancelText: 'رجوع',
      danger: true,
    });
    if (!confirmed) return;
    try {
      await cancelDailySchoolDismissal({
        dateKey: dateInput.value,
        authorizedBy: currentUser?.displayName || currentUser?.email || 'موظف مخول',
        authorizedByUid: currentUser?.uid || '',
        authorizedByRole: currentUser?.role || 'director',
      }, schoolId);
      showToast('تم إلغاء خطة الانصراف.', 'success');
    } catch (error) {
      statusEl.className = 'alert alert-danger';
      statusEl.style.display = 'block';
      statusEl.textContent = error.message || 'تعذر إلغاء الانصراف.';
    }
  });
}
