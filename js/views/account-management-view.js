import { getCurrentUser } from '../auth.js';
import { createAccountInvitation } from '../services/account-service.js';
import { getSchoolClasses, getSchoolSubjects } from '../services/academic-service.js';

const ROLE_LABELS = {
  director: 'مدير المدرسة',
  tech_specialist: 'أخصائي التطوير التكنولوجي',
  student_affairs: 'مسؤول شؤون الطلاب والقيد',
  social_affairs: 'أخصائي اجتماعي',
  teacher: 'معلم',
};

const ROLES_BY_CREATOR = {
  super_admin: ['director', 'tech_specialist', 'student_affairs', 'social_affairs', 'teacher'],
  director: ['tech_specialist', 'student_affairs', 'social_affairs', 'teacher'],
  tech_specialist: ['student_affairs', 'social_affairs', 'teacher'],
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

  container.innerHTML = `
    <div style="display:flex;flex-direction:column;gap:var(--space-5);max-width:880px;">
      <header>
        <h1 style="font-size:var(--text-2xl);font-weight:800;color:var(--color-primary-950);margin-bottom:var(--space-1);">إنشاء حساب موظف</h1>
        <p style="font-size:var(--text-sm);color:var(--text-muted);margin:0;">أرسل دعوة إلى البريد. صاحب الحساب يختار كلمة مروره بنفسه عند فتح الرابط.</p>
      </header>
      <section class="panel">
        <form id="account-invitation-form" class="panel-body" style="display:flex;flex-direction:column;gap:var(--space-4);">
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
          <fieldset id="teacher-invitation-details" style="display:none;border:1px solid var(--border-light);border-radius:var(--radius-sm);padding:var(--space-4);">
            <legend style="padding-inline:var(--space-2);font-weight:700;">بيانات التكليف الدراسي</legend>
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
          </fieldset>
          <p id="account-invitation-status" role="status" aria-live="polite" style="font-size:var(--text-sm);min-height:1.5em;margin:0;"></p>
          <div style="display:flex;justify-content:flex-end;">
            <button id="account-invitation-submit" type="submit" class="btn btn-primary btn-md">إرسال دعوة الحساب</button>
          </div>
        </form>
      </section>
    </div>
  `;

  const form = container.querySelector('#account-invitation-form');
  const roleSelect = container.querySelector('#account-invitation-role');
  const teacherDetails = container.querySelector('#teacher-invitation-details');
  const subjectSelect = container.querySelector('#teacher-invitation-subject');
  const classField = container.querySelector('#teacher-invitation-class');
  const hoursField = container.querySelector('#teacher-invitation-hours');
  const status = container.querySelector('#account-invitation-status');
  const submit = container.querySelector('#account-invitation-submit');

  function syncTeacherFields() {
    const isTeacher = roleSelect.value === 'teacher';
    teacherDetails.style.display = isTeacher ? 'block' : 'none';
    subjectSelect.required = isTeacher;
    classField.required = isTeacher;
    hoursField.required = isTeacher;
  }
  roleSelect.addEventListener('change', syncTeacherFields);
  syncTeacherFields();

  form.addEventListener('submit', async (event) => {
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

    submit.disabled = true;
    status.textContent = 'جارٍ التحقق وإرسال الدعوة...';
    status.style.color = 'var(--text-muted)';
    try {
      await createAccountInvitation(payload);
      form.reset();
      syncTeacherFields();
      status.textContent = 'تم إرسال الدعوة. سيختار الموظف كلمة مروره من رابط البريد.';
      status.style.color = 'var(--color-success-text)';
    } catch (error) {
      status.textContent = error.message || 'تعذر إرسال الدعوة.';
      status.style.color = 'var(--color-danger-text)';
    } finally {
      submit.disabled = false;
    }
  });
}
