import { getCurrentUser } from '../auth.js';
import {
  changeManagedAccountPassword,
  createAccountInvitation,
  deleteManagedAccount,
  getManagedAccounts,
  updateManagedAccountStatus,
} from '../services/account-service.js';
import { getSchoolClasses, getSchoolSubjects } from '../services/academic-service.js';

const ROLE_LABELS = {
  director: 'مدير المدرسة',
  tech_specialist: 'أخصائي التطوير التكنولوجي',
  student_affairs: 'مسؤول شؤون الطلاب والقيد',
  social_affairs: 'أخصائي اجتماعي',
  teacher: 'معلم',
  student: 'طالب',
  parent: 'ولي أمر',
  unknown: 'غير محدد',
};

const EMPLOYEE_ROLES = ['director', 'tech_specialist', 'student_affairs', 'social_affairs', 'teacher'];

const ROLES_BY_CREATOR = {
  director: ['tech_specialist', 'student_affairs', 'social_affairs', 'teacher'],
  tech_specialist: ['student_affairs', 'social_affairs', 'teacher'],
};

const STATUS_LABELS = {
  active: 'نشط',
  blocked: 'محظور',
  archived: 'مؤرشف',
  orphaned: 'ملف بلا حساب دخول',
  pending: 'دعوة معلقة',
  expired: 'انتهت الدعوة',
};

function escapeHtml(value) {
  return String(value || '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[character]);
}

function formatDate(value) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString('ar-EG');
}

function statusClass(status) {
  if (status === 'active') return 'badge badge-primary';
  if (status === 'archived' || status === 'expired') return 'badge badge-danger';
  if (status === 'blocked' || status === 'pending') return 'badge badge-warning';
  return 'badge badge-accent';
}

function accountActions(account) {
  if (!account.canManage || account.status === 'orphaned') return '—';
  const uid = escapeHtml(account.uid);
  const actions = [];
  if (account.status === 'active') {
    actions.push(`<button type="button" class="btn btn-outline btn-sm" data-account-action="password" data-uid="${uid}">كلمة مرور</button>`);
    actions.push(`<button type="button" class="btn btn-outline btn-sm" data-account-action="block" data-uid="${uid}">حظر</button>`);
    actions.push(`<button type="button" class="btn btn-outline btn-sm" data-account-action="archive" data-uid="${uid}">أرشفة</button>`);
  } else {
    actions.push(`<button type="button" class="btn btn-outline btn-sm" data-account-action="restore" data-uid="${uid}">استعادة</button>`);
  }
  actions.push(`<button type="button" class="btn btn-outline btn-sm" data-account-action="delete" data-uid="${uid}">حذف نهائي</button>`);
  return `<div style="display:flex;flex-wrap:wrap;gap:var(--space-1);">${actions.join('')}</div>`;
}

function accountRow(account) {
  return `
    <tr>
      <td><strong>${escapeHtml(account.displayName || 'بدون اسم')}</strong><br><small>${escapeHtml(account.email || 'بدون بريد')}</small></td>
      <td>${escapeHtml(ROLE_LABELS[account.role] || account.role || ROLE_LABELS.unknown)}${account.studentCode ? `<br><small>كود الطالب: ${escapeHtml(account.studentCode)}</small>` : ''}</td>
      <td><span class="${statusClass(account.status)}">${escapeHtml(STATUS_LABELS[account.status] || account.status)}</span></td>
      <td>${formatDate(account.createdAt)}</td>
      <td>${accountActions(account)}</td>
    </tr>`;
}

function invitationRow(invitation) {
  return `
    <tr>
      <td><strong>${escapeHtml(invitation.displayName || 'دعوة موظف')}</strong><br><small>${escapeHtml(invitation.email)}</small></td>
      <td>${escapeHtml(ROLE_LABELS[invitation.role] || invitation.role || ROLE_LABELS.unknown)}</td>
      <td><span class="${statusClass(invitation.status)}">${escapeHtml(STATUS_LABELS[invitation.status] || invitation.status)}</span></td>
      <td>${formatDate(invitation.expiresAt || invitation.createdAt)}</td>
      <td><span style="color:var(--text-muted);">بانتظار التفعيل</span></td>
    </tr>`;
}

export async function renderAccountManagementView(container) {
  const user = getCurrentUser();
  const allowedRoles = ROLES_BY_CREATOR[user?.role] || [];
  if (!allowedRoles.length || !user?.schoolId) {
    container.innerHTML = '<div class="empty-state"><h3 class="empty-state-title">إدارة الحسابات غير متاحة لهذا الحساب.</h3></div>';
    return;
  }

  const [classes, subjects] = await Promise.all([
    getSchoolClasses(user.schoolId),
    getSchoolSubjects(user.schoolId),
  ]);
  const classOptions = classes.map((item) =>
    `<option value="${escapeHtml(item.id)}" data-name="${escapeHtml(item.name)}">${escapeHtml(item.name)}</option>`
  ).join('');
  const subjectOptions = subjects.map((item) =>
    `<option value="${escapeHtml(item.name)}">${escapeHtml(item.name)}</option>`
  ).join('');
  const roleOptions = allowedRoles.map((role) =>
    `<option value="${role}">${ROLE_LABELS[role]}</option>`
  ).join('');
  const roleFilterOptions = [
    '<option value="all">كل الأدوار</option>',
    '<option value="employees">الموظفون</option>',
    ...Object.entries(ROLE_LABELS)
      .filter(([role]) => role !== 'unknown')
      .map(([role, label]) => `<option value="${role}">${label}</option>`),
  ].join('');

  container.innerHTML = `
    <div style="display:flex;flex-direction:column;gap:var(--space-5);">
      <header>
        <h1 style="font-size:var(--text-2xl);font-weight:800;color:var(--color-primary-950);margin-bottom:var(--space-1);">إدارة الحسابات</h1>
        <p style="font-size:var(--text-sm);color:var(--text-muted);margin:0;">إنشاء حسابات الموظفين ومتابعة حسابات المدرسة المسجلة ودعوات التفعيل.</p>
      </header>

      <section class="panel">
        <div class="panel-header" style="display:flex;justify-content:space-between;align-items:center;gap:var(--space-3);">
          <div>
            <h2 class="panel-title">حسابات المدرسة</h2>
            <p style="margin:var(--space-1) 0 0;color:var(--text-muted);font-size:var(--text-xs);">تُعرض حسابات هذه المدرسة فقط. الحذف النهائي يزيل حساب الدخول ولا يحذف السجلات التعليمية أو سجل التدقيق.</p>
          </div>
          <button type="button" id="accounts-refresh" class="btn btn-outline btn-sm">تحديث القائمة</button>
        </div>
        <div class="panel-body" style="display:flex;flex-direction:column;gap:var(--space-3);">
          <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:var(--space-3);">
            <input id="accounts-search" class="form-control" type="search" placeholder="ابحث بالاسم أو البريد أو كود الطالب" aria-label="البحث في الحسابات">
            <select id="accounts-role-filter" class="form-control" aria-label="تصفية حسب الدور">${roleFilterOptions}</select>
            <select id="accounts-status-filter" class="form-control" aria-label="تصفية حسب حالة الحساب">
              <option value="all">كل الحالات</option>
              <option value="active">نشط</option>
              <option value="blocked">محظور</option>
              <option value="archived">مؤرشف</option>
              <option value="orphaned">ملف بلا حساب دخول</option>
              <option value="pending">دعوة معلقة</option>
              <option value="expired">انتهت الدعوة</option>
            </select>
          </div>
          <p id="accounts-status" role="status" aria-live="polite" style="margin:0;min-height:1.5em;color:var(--text-muted);font-size:var(--text-sm);">جارٍ تحميل الحسابات...</p>
          <div style="overflow-x:auto;">
            <table class="data-table" style="min-width:760px;">
              <thead><tr><th>الحساب</th><th>الدور</th><th>الحالة</th><th>تاريخ الإنشاء / انتهاء الدعوة</th><th>الإجراءات</th></tr></thead>
              <tbody id="accounts-table-body"></tbody>
            </table>
          </div>
        </div>
      </section>

      <section class="panel">
        <div class="panel-header">
          <h2 class="panel-title">إنشاء حساب موظف</h2>
          <p style="margin:var(--space-1) 0 0;color:var(--text-muted);font-size:var(--text-xs);">أنشئ رابط دعوة أحادي الاستخدام وأرسله بنفسك للموظف عبر قناة آمنة؛ لا يُرسل بريد تلقائيًا.</p>
        </div>
        <form id="account-invitation-form" class="panel-body" style="display:flex;flex-direction:column;gap:var(--space-4);">
          <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:var(--space-3);">
            <div class="form-group">
              <label class="form-label" for="account-invitation-name">الاسم الرسمي *</label>
              <input id="account-invitation-name" class="form-control" autocomplete="name" maxlength="120" required>
            </div>
            <div class="form-group">
              <label class="form-label" for="account-invitation-email">البريد الإلكتروني *</label>
              <input id="account-invitation-email" class="form-control" type="email" autocomplete="email" maxlength="254" required>
            </div>
            <div class="form-group">
              <label class="form-label" for="account-invitation-role">نوع الحساب *</label>
              <select id="account-invitation-role" class="form-control" required>${roleOptions}</select>
            </div>
          </div>
          <fieldset id="teacher-invitation-details" style="display:none;border:1px solid var(--border-light);border-radius:var(--radius-sm);padding:var(--space-4);">
            <legend style="padding-inline:var(--space-2);font-weight:700;">بيانات التكليف الدراسي</legend>
            <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:var(--space-3);">
              <div class="form-group">
                <label class="form-label" for="teacher-invitation-subject">المادة *</label>
                ${subjectOptions
                  ? `<select id="teacher-invitation-subject" class="form-control"><option value="">اختر المادة</option>${subjectOptions}</select>`
                  : '<input id="teacher-invitation-subject" class="form-control" maxlength="120" placeholder="اسم المادة" required>'}
              </div>
              <div class="form-group">
                <label class="form-label" for="teacher-invitation-class">الفصل *</label>
                ${classOptions
                  ? `<select id="teacher-invitation-class" class="form-control"><option value="">اختر الفصل</option>${classOptions}</select>`
                  : '<input id="teacher-invitation-class" class="form-control" maxlength="100" placeholder="اسم الفصل" required>'}
              </div>
              <div class="form-group">
                <label class="form-label" for="teacher-invitation-hours">عدد الحصص الأسبوعية *</label>
                <input id="teacher-invitation-hours" class="form-control" type="number" min="1" max="40" step="1" value="1" required>
              </div>
            </div>
          </fieldset>
          <p id="account-invitation-status" role="status" aria-live="polite" style="font-size:var(--text-sm);min-height:1.5em;margin:0;"></p>
          <div style="display:flex;justify-content:flex-end;">
            <button id="account-invitation-submit" type="submit" class="btn btn-primary btn-md">إنشاء رابط الدعوة</button>
          </div>
        </form>
      </section>

      <div id="account-password-modal" class="modal-backdrop" style="display:none;align-items:center;justify-content:center;padding:1rem;">
        <div style="width:min(100%,440px);padding:var(--space-5);border-radius:var(--radius-md);background:var(--bg-surface);color:var(--text-primary);box-shadow:var(--shadow-xl);">
          <form id="account-password-form" style="display:flex;flex-direction:column;gap:var(--space-3);">
            <h2 style="margin:0;font-size:var(--text-lg);">تعيين كلمة مرور جديدة</h2>
            <p id="account-password-target" style="margin:0;color:var(--text-muted);font-size:var(--text-sm);"></p>
            <label class="form-label" for="account-new-password">كلمة المرور الجديدة</label>
            <input id="account-new-password" class="form-control" type="password" autocomplete="new-password" minlength="12" required>
            <small style="color:var(--text-muted);">12 حرفًا على الأقل، مع حرف كبير وصغير ورقم ورمز. لن تُحفظ كلمة المرور في سجل النظام.</small>
            <label class="form-label" for="account-confirm-password">تأكيد كلمة المرور</label>
            <input id="account-confirm-password" class="form-control" type="password" autocomplete="new-password" minlength="12" required>
            <p id="account-password-modal-status" role="status" aria-live="polite" style="margin:0;min-height:1.5em;font-size:var(--text-sm);"></p>
            <div style="display:flex;justify-content:flex-end;gap:var(--space-2);">
              <button type="button" class="btn btn-outline btn-md" data-close-password>إلغاء</button>
              <button type="submit" class="btn btn-primary btn-md">تغيير كلمة المرور</button>
            </div>
          </form>
        </div>
      </div>

      <div id="account-delete-modal" class="modal-backdrop" style="display:none;align-items:center;justify-content:center;padding:1rem;">
        <div style="width:min(100%,480px);padding:var(--space-5);border-radius:var(--radius-md);background:var(--bg-surface);color:var(--text-primary);box-shadow:var(--shadow-xl);">
          <form id="account-delete-form" style="display:flex;flex-direction:column;gap:var(--space-3);">
            <h2 style="margin:0;font-size:var(--text-lg);">تأكيد الحذف النهائي</h2>
            <p id="account-delete-target" style="margin:0;color:var(--text-muted);font-size:var(--text-sm);"></p>
            <p style="margin:0;color:var(--color-danger-text);font-size:var(--text-sm);">سيُحذف حساب الدخول وملف المستخدم نهائيًا. ستبقى سجلات المدرسة وسجل التدقيق محفوظة.</p>
            <label class="form-label" for="account-delete-confirmation">اكتب البريد الإلكتروني للحساب للتأكيد</label>
            <input id="account-delete-confirmation" class="form-control" type="email" autocomplete="off" required>
            <p id="account-delete-modal-status" role="status" aria-live="polite" style="margin:0;min-height:1.5em;font-size:var(--text-sm);"></p>
            <div style="display:flex;justify-content:flex-end;gap:var(--space-2);">
              <button type="button" class="btn btn-outline btn-md" data-close-delete>إلغاء</button>
              <button type="submit" class="btn btn-danger btn-md">حذف الحساب نهائيًا</button>
            </div>
          </form>
        </div>
      </div>
    </div>
  `;

  const state = { accounts: [], invitations: [] };
  const tableBody = container.querySelector('#accounts-table-body');
  const accountStatus = container.querySelector('#accounts-status');
  const searchInput = container.querySelector('#accounts-search');
  const roleFilter = container.querySelector('#accounts-role-filter');
  const statusFilter = container.querySelector('#accounts-status-filter');
  const passwordModal = container.querySelector('#account-password-modal');
  const passwordForm = container.querySelector('#account-password-form');
  const passwordStatus = container.querySelector('#account-password-modal-status');
  const deleteModal = container.querySelector('#account-delete-modal');
  const deleteForm = container.querySelector('#account-delete-form');
  const deleteStatus = container.querySelector('#account-delete-modal-status');

  function renderRows() {
    const search = searchInput.value.trim().toLocaleLowerCase();
    const selectedRole = roleFilter.value;
    const selectedStatus = statusFilter.value;
    const matchesRole = (item) => selectedRole === 'all' ||
      (selectedRole === 'employees' ? EMPLOYEE_ROLES.includes(item.role) : item.role === selectedRole);
    const matchesStatus = (item) => selectedStatus === 'all' || item.status === selectedStatus;
    const matchesSearch = (item) => !search ||
      [item.displayName, item.email, item.studentCode, ROLE_LABELS[item.role]]
        .some((value) => String(value || '').toLocaleLowerCase().includes(search));
    const rows = [
      ...state.accounts.filter((item) => matchesRole(item) && matchesStatus(item) && matchesSearch(item)).map(accountRow),
      ...state.invitations.filter((item) => matchesRole(item) && matchesStatus(item) && matchesSearch(item)).map(invitationRow),
    ];
    tableBody.innerHTML = rows.length
      ? rows.join('')
      : '<tr><td colspan="5" style="text-align:center;color:var(--text-muted);">لا توجد حسابات مطابقة للفلاتر.</td></tr>';
  }

  async function loadAccounts() {
    const refresh = container.querySelector('#accounts-refresh');
    refresh.disabled = true;
    accountStatus.textContent = 'جارٍ تحميل الحسابات...';
    accountStatus.style.color = 'var(--text-muted)';
    try {
      const result = await getManagedAccounts();
      state.accounts = result.accounts;
      state.invitations = result.invitations;
      renderRows();
      accountStatus.textContent = `الحسابات: ${state.accounts.length}، الدعوات المعلقة أو المنتهية: ${state.invitations.length}.`;
      accountStatus.style.color = 'var(--color-success-text)';
    } catch (error) {
      accountStatus.textContent = error.message || 'تعذر تحميل حسابات المدرسة.';
      accountStatus.style.color = 'var(--color-danger-text)';
      tableBody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--color-danger-text);">فشل تحميل البيانات؛ أعد المحاولة.</td></tr>';
    } finally {
      refresh.disabled = false;
    }
  }

  searchInput.addEventListener('input', renderRows);
  roleFilter.addEventListener('change', renderRows);
  statusFilter.addEventListener('change', renderRows);
  container.querySelector('#accounts-refresh').addEventListener('click', loadAccounts);

  tableBody.addEventListener('click', async (event) => {
    const button = event.target.closest('button[data-account-action]');
    if (!button) return;
    const account = state.accounts.find((item) => item.uid === button.dataset.uid);
    if (!account) return;

    const action = button.dataset.accountAction;
    if (action === 'password') {
      passwordForm.dataset.uid = account.uid;
      passwordForm.dataset.email = account.email;
      passwordForm.reset();
      passwordStatus.textContent = '';
      container.querySelector('#account-password-target').textContent = `${account.displayName || account.email} — ${account.email}`;
      passwordModal.style.display = 'flex';
      return;
    }
    if (action === 'delete') {
      deleteForm.dataset.uid = account.uid;
      deleteForm.dataset.email = account.email;
      deleteForm.reset();
      deleteStatus.textContent = '';
      container.querySelector('#account-delete-target').textContent = `${account.displayName || account.email} — ${account.email}`;
      deleteModal.style.display = 'flex';
      return;
    }

    const actionText = {
      block: 'حظر الحساب ومنع تسجيل الدخول',
      archive: 'أرشفة الحساب والاحتفاظ بسجلات المدرسة',
      restore: 'استعادة الحساب والسماح بتسجيل الدخول',
    }[action];
    if (!actionText || !window.confirm(`هل تريد ${actionText} للحساب ${account.displayName || account.email}؟`)) return;

    button.disabled = true;
    try {
      await updateManagedAccountStatus(account.uid, action);
      accountStatus.textContent = action === 'restore' ? 'تمت استعادة الحساب.' : 'تم تحديث حالة الحساب.';
      accountStatus.style.color = 'var(--color-success-text)';
      await loadAccounts();
    } catch (error) {
      const message = error.message || 'تعذر تحديث حالة الحساب.';
      await loadAccounts();
      accountStatus.textContent = message;
      accountStatus.style.color = 'var(--color-danger-text)';
    } finally {
      button.disabled = false;
    }
  });

  container.querySelectorAll('[data-close-password]').forEach((button) => {
    button.addEventListener('click', () => { passwordModal.style.display = 'none'; });
  });
  passwordModal.addEventListener('click', (event) => {
    if (event.target === passwordModal) passwordModal.style.display = 'none';
  });
  passwordForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const password = container.querySelector('#account-new-password').value;
    const confirmation = container.querySelector('#account-confirm-password').value;
    if (password !== confirmation) {
      passwordStatus.textContent = 'كلمتا المرور غير متطابقتين.';
      passwordStatus.style.color = 'var(--color-danger-text)';
      return;
    }

    const submit = passwordForm.querySelector('button[type="submit"]');
    submit.disabled = true;
    passwordStatus.textContent = 'جارٍ تحديث كلمة المرور وإلغاء الجلسات السابقة...';
    passwordStatus.style.color = 'var(--text-muted)';
    try {
      await changeManagedAccountPassword(passwordForm.dataset.email, password);
      passwordStatus.textContent = 'تم تغيير كلمة المرور وتوثيق الإجراء.';
      passwordStatus.style.color = 'var(--color-success-text)';
      passwordForm.reset();
      await loadAccounts();
      setTimeout(() => { passwordModal.style.display = 'none'; }, 1000);
    } catch (error) {
      const message = error.message || 'تعذر تغيير كلمة المرور.';
      await loadAccounts();
      passwordStatus.textContent = message;
      passwordStatus.style.color = 'var(--color-danger-text)';
    } finally {
      submit.disabled = false;
    }
  });

  container.querySelectorAll('[data-close-delete]').forEach((button) => {
    button.addEventListener('click', () => { deleteModal.style.display = 'none'; });
  });
  deleteModal.addEventListener('click', (event) => {
    if (event.target === deleteModal) deleteModal.style.display = 'none';
  });
  deleteForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const submit = deleteForm.querySelector('button[type="submit"]');
    submit.disabled = true;
    deleteStatus.textContent = 'جارٍ إلغاء ربط الحساب وحذفه...';
    deleteStatus.style.color = 'var(--text-muted)';
    try {
      await deleteManagedAccount(deleteForm.dataset.uid, container.querySelector('#account-delete-confirmation').value);
      deleteStatus.textContent = 'تم حذف حساب الدخول نهائيًا مع الاحتفاظ بالسجلات المدرسية.';
      deleteStatus.style.color = 'var(--color-success-text)';
      deleteForm.reset();
      await loadAccounts();
      setTimeout(() => { deleteModal.style.display = 'none'; }, 1000);
    } catch (error) {
      const message = error.message || 'تعذر حذف الحساب.';
      await loadAccounts();
      deleteStatus.textContent = message;
      deleteStatus.style.color = 'var(--color-danger-text)';
    } finally {
      submit.disabled = false;
    }
  });

  const invitationForm = container.querySelector('#account-invitation-form');
  const roleSelect = container.querySelector('#account-invitation-role');
  const teacherDetails = container.querySelector('#teacher-invitation-details');
  const subjectSelect = container.querySelector('#teacher-invitation-subject');
  const classField = container.querySelector('#teacher-invitation-class');
  const hoursField = container.querySelector('#teacher-invitation-hours');
  const invitationStatus = container.querySelector('#account-invitation-status');
  const invitationSubmit = container.querySelector('#account-invitation-submit');

  function syncTeacherFields() {
    const isTeacher = roleSelect.value === 'teacher';
    teacherDetails.style.display = isTeacher ? 'block' : 'none';
    subjectSelect.required = isTeacher;
    classField.required = isTeacher;
    hoursField.required = isTeacher;
  }
  roleSelect.addEventListener('change', syncTeacherFields);
  syncTeacherFields();

  invitationForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const role = roleSelect.value;
    const classOption = classField instanceof HTMLSelectElement ? classField.selectedOptions[0] : null;
    const classId = classField instanceof HTMLSelectElement ? classField.value : classField.value.trim();
    const className = classOption?.dataset.name || classField.value.trim();
    const payload = {
      displayName: container.querySelector('#account-invitation-name').value.trim(),
      email: container.querySelector('#account-invitation-email').value.trim().toLowerCase(),
      role,
      schoolId: user.schoolId,
    };
    if (role === 'teacher') {
      payload.subject = subjectSelect.value;
      payload.classId = classId;
      payload.className = className;
      payload.weeklyHours = Number(hoursField.value);
    }

    invitationSubmit.disabled = true;
    invitationStatus.textContent = 'جارٍ التحقق وإنشاء رابط التفعيل...';
    invitationStatus.style.color = 'var(--text-muted)';
    try {
      const result = await createAccountInvitation(payload);
      invitationForm.reset();
      syncTeacherFields();
      invitationStatus.replaceChildren(document.createTextNode('تم إنشاء رابط الدعوة فقط؛ لم يُرسل بريد تلقائيًا. أرسله للموظف صاحب هذا البريد عبر قناة آمنة:'));
      const linkInput = document.createElement('input');
      linkInput.type = 'url';
      linkInput.readOnly = true;
      linkInput.value = result.invitationLink;
      linkInput.className = 'form-control';
      linkInput.setAttribute('aria-label', 'رابط الدعوة السري');
      linkInput.style.marginTop = 'var(--space-2)';
      const copyButton = document.createElement('button');
      copyButton.type = 'button';
      copyButton.className = 'btn btn-outline btn-sm';
      copyButton.textContent = 'نسخ الرابط';
      copyButton.style.marginTop = 'var(--space-2)';
      const copyStatus = document.createElement('span');
      copyStatus.setAttribute('role', 'status');
      copyStatus.style.marginInlineStart = 'var(--space-2)';
      copyButton.addEventListener('click', async () => {
        try {
          await navigator.clipboard.writeText(linkInput.value);
          copyStatus.textContent = 'تم النسخ';
        } catch {
          linkInput.focus();
          linkInput.select();
          copyStatus.textContent = 'انسخ الرابط المحدد يدويًا';
        }
      });
      invitationStatus.append(document.createElement('br'), linkInput, document.createElement('br'), copyButton, copyStatus);
      invitationStatus.style.color = 'var(--color-success-text)';
      await loadAccounts();
    } catch (error) {
      invitationStatus.textContent = error.message || 'تعذر إنشاء رابط الدعوة.';
      invitationStatus.style.color = 'var(--color-danger-text)';
    } finally {
      invitationSubmit.disabled = false;
    }
  });

  await loadAccounts();
}
