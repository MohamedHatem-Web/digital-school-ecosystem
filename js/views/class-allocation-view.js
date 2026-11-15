import { getStudents, saveClassAllocation } from '../services/student-service.js';
import { getSchoolProfile, DEFAULT_SCHOOL_ID } from '../services/school-service.js';
import { getCurrentUser } from '../auth.js';
import { buildClassAllocation } from '../utils/class-allocation.js';
import { showToast } from '../components.js';

let isInitialized = false;
let studentRoster = [];

function escapeHtml(value) {
  return String(value || '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character]);
}

function getStudentGrade(student) {
  const explicitGrade = String(student.gradeName || student.stage || '').trim();
  return explicitGrade || String(student.grade || '').split(/\s*[—–-]\s*/)[0].trim();
}

export async function renderClassAllocationView(container) {
  if (!isInitialized) {
    container.innerHTML = `
      <div style="display:flex;flex-direction:column;gap:var(--space-5);">
        <div>
          <h1 style="font-size:var(--text-2xl);font-weight:800;margin:0 0 4px;color:var(--color-primary-950);">توزيع الفصول السنوي</h1>
          <p style="margin:0;color:var(--text-muted);font-size:var(--text-sm);">توزيع أبجدي حسب الصف واللغة الثانية والديانة، بحد أقصى 25 طالبًا و25 طالبة في الفصل.</p>
        </div>
        <section class="panel">
          <div class="panel-body">
            <form id="class-allocation-form" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:var(--space-3);align-items:end;">
              <div class="form-group">
                <label class="form-label" for="allocation-year">العام الدراسي</label>
                <input id="allocation-year" class="form-control" type="text" inputmode="numeric" pattern="[0-9]{4}/[0-9]{4}" required>
              </div>
              <div class="form-group">
                <label class="form-label" for="allocation-grade">الصف المستهدف</label>
                <select id="allocation-grade" class="form-control" required><option value="">جارٍ تحميل الصفوف...</option></select>
              </div>
              <button type="submit" class="btn btn-primary">معاينة التوزيع</button>
            </form>
          </div>
        </section>
        <div id="class-allocation-preview"></div>
      </div>
    `;

    const form = container.querySelector('#class-allocation-form');
    form?.addEventListener('submit', (event) => {
      event.preventDefault();
      const year = container.querySelector('#allocation-year').value.trim();
      const grade = container.querySelector('#allocation-grade').value;
      try {
        const allocation = buildClassAllocation(studentRoster, { grade, academicYear: year });
        renderPreview(container, allocation);
      } catch (error) {
        showToast(error.message || 'تعذر إنشاء معاينة التوزيع.', 'error');
      }
    });
    isInitialized = true;
  }

  const user = getCurrentUser();
  const schoolId = user?.schoolId || DEFAULT_SCHOOL_ID;
  const [students, profile] = await Promise.all([getStudents(schoolId), getSchoolProfile(schoolId)]);
  studentRoster = students || [];

  const yearInput = container.querySelector('#allocation-year');
  if (yearInput && !yearInput.value) yearInput.value = profile?.academicYear || '2026/2027';

  const gradeSelect = container.querySelector('#allocation-grade');
  if (gradeSelect) {
    const selectedGrade = gradeSelect.value;
    const grades = [...new Set(studentRoster.map(getStudentGrade).filter(Boolean))]
      .sort((left, right) => left.localeCompare(right, 'ar'));
    gradeSelect.innerHTML = grades.length
      ? '<option value="">اختر الصف</option>' + grades.map((grade) => `<option value="${escapeHtml(grade)}">${escapeHtml(grade)}</option>`).join('')
      : '<option value="">لا توجد صفوف في سجل الطلاب</option>';
    if (grades.includes(selectedGrade)) gradeSelect.value = selectedGrade;
  }
}

function renderPreview(container, allocation) {
  const preview = container.querySelector('#class-allocation-preview');
  if (!preview) return;
  const missingRows = allocation.missingData.map((student) => `
    <tr><td>${escapeHtml(student.name || '—')}</td><td><code>${escapeHtml(student.code || '—')}</code></td><td>${escapeHtml(student.missing.join('، '))}</td></tr>
  `).join('');
  const classRows = allocation.classes.map((classRecord) => `
    <tr>
      <td>${escapeHtml(classRecord.name)}</td>
      <td>${escapeHtml(classRecord.secondLanguage)}</td>
      <td>${escapeHtml(classRecord.religion)}</td>
      <td>${classRecord.boysCount}</td>
      <td>${classRecord.girlsCount}</td>
      <td>${classRecord.studentCount}</td>
    </tr>
  `).join('');
  const readOnly = !['student_affairs', 'director', 'super_admin'].includes(getCurrentUser()?.role);

  preview.innerHTML = `
    <section class="panel">
      <div class="panel-header" style="display:flex;justify-content:space-between;align-items:center;gap:var(--space-3);flex-wrap:wrap;">
        <div>
          <h2 class="panel-title" style="margin:0;">معاينة ${escapeHtml(allocation.grade)} · ${escapeHtml(allocation.academicYear)}</h2>
          <p style="margin:4px 0 0;color:var(--text-muted);font-size:var(--text-xs);">${allocation.eligibleCount} طالبًا في ${allocation.classes.length} فصلًا</p>
        </div>
        <button id="class-allocation-save" type="button" class="btn btn-primary" ${!allocation.eligibleCount || readOnly ? 'disabled' : ''}>اعتماد التوزيع وحفظه</button>
      </div>
      ${readOnly ? '<div class="panel-body"><p role="status">المعاينة متاحة، لكن اعتماد التوزيع يتطلب صلاحية شؤون الطلاب أو الإدارة.</p></div>' : ''}
      <div class="table-wrap">
        <table class="data-table">
          <thead><tr><th>الفصل</th><th>اللغة الثانية</th><th>الديانة</th><th>بنين</th><th>بنات</th><th>الإجمالي</th></tr></thead>
          <tbody>${classRows || '<tr><td colspan="6" style="text-align:center;">لا توجد بيانات مكتملة قابلة للتوزيع</td></tr>'}</tbody>
        </table>
      </div>
      ${allocation.missingData.length ? `
        <div class="panel-body" style="border-top:1px solid var(--border-subtle);">
          <h3 style="font-size:var(--text-base);margin:0 0 var(--space-2);">طلاب يحتاجون استكمال البيانات (${allocation.missingData.length})</h3>
          <p style="font-size:var(--text-xs);color:var(--text-muted);">لن يدخلوا في التوزيع حتى تُستكمل بيانات النوع والديانة واللغة الثانية.</p>
          <div class="table-wrap"><table class="data-table"><thead><tr><th>الاسم</th><th>الكود</th><th>بيانات ناقصة</th></tr></thead><tbody>${missingRows}</tbody></table></div>
        </div>` : ''}
    </section>
  `;

  preview.querySelector('#class-allocation-save')?.addEventListener('click', async (event) => {
    const button = event.currentTarget;
    button.disabled = true;
    button.textContent = 'جارٍ حفظ التوزيع...';
    try {
      const user = getCurrentUser();
      await saveClassAllocation(allocation, studentRoster, user?.schoolId || DEFAULT_SCHOOL_ID);
      studentRoster = await getStudents(user?.schoolId || DEFAULT_SCHOOL_ID);
      showToast(`تم حفظ ${allocation.eligibleCount} طالبًا في ${allocation.classes.length} فصلًا.`);
      button.textContent = 'تم اعتماد التوزيع';
    } catch (error) {
      showToast(error.message || 'تعذر حفظ توزيع الفصول.', 'error');
      button.disabled = false;
      button.textContent = 'إعادة المحاولة';
    }
  });
}