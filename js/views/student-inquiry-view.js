import { getStudents } from '../services/student-service.js';
import { getTabletDevicesForStudent } from '../services/tablet-service.js';
import { getCurrentUser } from '../auth.js';
import { DEFAULT_SCHOOL_ID } from '../services/school-service.js';

const STAFF_ROLES = new Set(['director', 'student_affairs', 'teacher', 'social_affairs', 'tech_specialist', 'super_admin']);
const ENROLLMENT_LABELS = {
  enrolled: 'مقيد منتظم',
  active: 'نشط',
  transferred: 'محول من مدرسة أخرى',
  transferred_out: 'محول إلى مدرسة أخرى',
  integration: 'دمج تعليمي',
  homeschooled: 'منازل',
  archived: 'مؤرشف',
};
const DEVICE_LABELS = {
  delivered: 'تم التسليم',
  inventory: 'بعهدة المدرسة',
  maintenance: 'قيد الصيانة',
  lost: 'مفقود',
};

function escapeHtml(value) {
  return String(value || '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character]);
}

export async function renderStudentInquiryView(container) {
  const user = getCurrentUser();
  if (!STAFF_ROLES.has(user?.role)) {
    container.innerHTML = '<div class="panel-body" role="alert">هذه الشاشة مخصصة لموظفي المدرسة المخولين.</div>';
    return;
  }

  const schoolId = user.schoolId || DEFAULT_SCHOOL_ID;
  container.innerHTML = `
    <div style="display:flex;flex-direction:column;gap:var(--space-5);">
      <header>
        <h1 style="font-size:var(--text-2xl);font-weight:800;margin:0 0 4px;color:var(--color-primary-950);">ملف الطالب والاستعلام المدرسي</h1>
        <p style="margin:0;color:var(--text-muted);font-size:var(--text-sm);">بحث داخلي ببيانات القيد والتواصل وحالة التابلت.</p>
      </header>
      <section class="panel">
        <div class="panel-body">
          <form id="staff-student-search" style="display:flex;gap:var(--space-2);flex-wrap:wrap;">
            <input id="staff-student-query" class="form-control" type="search" autocomplete="off" placeholder="ابحث بكود الطالب أو الاسم الرباعي" aria-label="كود الطالب أو الاسم" required style="flex:1;min-width:240px;">
            <button type="submit" class="btn btn-primary">بحث</button>
          </form>
        </div>
      </section>
      <div id="staff-student-search-status" role="status" aria-live="polite"></div>
      <div id="staff-student-search-results"></div>
    </div>
  `;

  const form = container.querySelector('#staff-student-search');
  const queryInput = container.querySelector('#staff-student-query');
  const status = container.querySelector('#staff-student-search-status');
  const results = container.querySelector('#staff-student-search-results');

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const term = queryInput.value.trim().toLocaleLowerCase('ar');
    if (!term) return;

    status.textContent = 'جارٍ البحث في سجل المدرسة...';
    results.replaceChildren();
    try {
      const students = await getStudents(schoolId);
      const matches = students.filter((student) =>
        String(student.code || student.studentCode || '').toLocaleLowerCase('ar') === term ||
        String(student.name || student.studentName || '').toLocaleLowerCase('ar').includes(term));
      status.textContent = matches.length ? `تم العثور على ${matches.length} سجل.` : 'لا توجد سجلات مطابقة.';
      if (!matches.length) return;

      results.innerHTML = `
        <section class="panel">
          <div class="table-wrap">
            <table class="data-table">
              <thead><tr><th>اسم الطالب</th><th>الكود</th><th>الصف والفصل</th><th>حالة القيد</th><th>الملف</th></tr></thead>
              <tbody>${matches.map((student, index) => `
                <tr>
                  <td>${escapeHtml(student.name || student.studentName || '—')}</td>
                  <td><code>${escapeHtml(student.code || student.studentCode || '—')}</code></td>
                  <td>${escapeHtml(student.grade || student.gradeName || student.stage || '—')}</td>
                  <td>${escapeHtml(ENROLLMENT_LABELS[student.status] || student.status || 'غير محدد')}</td>
                  <td><button type="button" class="btn btn-outline btn-sm" data-student-index="${index}">عرض الملف</button></td>
                </tr>`).join('')}</tbody>
            </table>
          </div>
          <div id="staff-student-details"></div>
        </section>
      `;

      const detailBox = results.querySelector('#staff-student-details');
      results.querySelectorAll('[data-student-index]').forEach((button) => {
        button.addEventListener('click', async () => {
          const student = matches[Number(button.dataset.studentIndex)];
          const studentCode = String(student.code || student.studentCode || '');
          detailBox.innerHTML = '<div class="panel-body" role="status">جارٍ تحميل تفاصيل الملف...</div>';
          let devices = [];
          let deviceError = '';
          try {
            devices = await getTabletDevicesForStudent(studentCode, schoolId);
          } catch (error) {
            deviceError = error.message || 'تعذر تحميل حالة التابلت.';
          }
          const device = devices[0];
          const placement = [student.gradeName || student.stage, student.className || student.classId]
            .filter(Boolean).join(' — ') || student.grade || '—';
          const fields = [
            ['السنة الدراسية', student.academicYear || '—'],
            ['اللغة الثانية', student.secondLanguage || 'غير مسجلة'],
            ['النوع', student.gender || '—'],
            ['الديانة', student.religion || '—'],
            ['ولي الأمر', student.parentInfo?.parentName || '—'],
            ['هاتف ولي الأمر', student.parentInfo?.parentPhone || student.parentInfo?.phone || '—'],
            ['هاتف الطالب', student.studentPhone || '—'],
            ['حالة التابلت', device ? (DEVICE_LABELS[device.status] || device.status || 'غير محددة') : 'لا يوجد جهاز مسجل'],
            ['موديل الجهاز', device?.model || '—'],
            ['تاريخ التسليم', device?.deliveredDate || '—'],
          ];
          detailBox.innerHTML = `
            <div class="panel-body" style="border-top:1px solid var(--border-subtle);">
              <h2 class="panel-title">${escapeHtml(student.name || student.studentName || 'ملف الطالب')}</h2>
              <p style="color:var(--text-muted);margin:0 0 var(--space-3);">${escapeHtml(placement)} · كود ${escapeHtml(studentCode)}</p>
              <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:var(--space-3);">
                ${fields.map(([label, value]) => `<div><span style="display:block;color:var(--text-muted);font-size:var(--text-xs);">${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`).join('')}
              </div>
              ${deviceError ? `<p role="alert" style="color:var(--color-danger-solid);margin-bottom:0;">${escapeHtml(deviceError)}</p>` : ''}
            </div>
          `;
        });
      });
      if (matches.length === 1) results.querySelector('[data-student-index="0"]')?.click();
    } catch (error) {
      console.error('Staff student lookup failed:', error);
      status.textContent = error.message || 'تعذر البحث في سجل الطلاب.';
    }
  });
}