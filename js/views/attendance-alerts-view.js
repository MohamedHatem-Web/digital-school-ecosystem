import { getEscapeAttendanceCases, reviewEscapeAttendance } from '../services/attendance-service.js';
import { getSchoolClasses } from '../services/academic-service.js';
import { getCurrentUser } from '../auth.js';
import { showToast } from '../components.js';

function escapeHtml(value) {
  return String(value || '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[char]);
}

function getClassPlacement(item, classesById) {
  const grade = String(item.grade || '').trim();
  const fullClassName = String(item.className || classesById.get(item.classId) || '').trim();
  const className = grade && fullClassName.startsWith(grade)
    ? fullClassName.slice(grade.length).replace(/^[—–-]\s*/, '').trim()
    : fullClassName;
  if (grade && className) return grade.includes(className) ? grade : `${grade} — ${className}`;
  return grade || className || item.classId;
}

export async function renderAttendanceAlerts(container, role) {
  if (!container) return;
  try {
    const canReview = ['teacher', 'student_affairs', 'director', 'super_admin'].includes(role);
    const user = getCurrentUser();
    const [allCases, classes] = await Promise.all([
      getEscapeAttendanceCases(user?.schoolId),
      getSchoolClasses(user?.schoolId),
    ]);
    const classesById = new Map(classes.map((item) => [item.id, item.name]));
    const cases = allCases.filter((item) => item.escapeReview === 'pending');
    if (!cases.length) {
      container.replaceChildren();
      return;
    }

    container.innerHTML = `
      <section class="panel" aria-labelledby="attendance-alerts-title" style="border-inline-start:4px solid var(--color-warning-text,#b45309);">
        <div class="panel-header"><h3 class="panel-title" id="attendance-alerts-title" style="margin:0;">حالات غياب محتملة تحتاج مراجعة قبل اعتماد الهروب</h3></div>
        <div class="panel-body" style="display:grid;gap:var(--space-3);">
          ${cases.map((item) => `
            <article style="padding:var(--space-3);border:1px solid var(--border-subtle);border-radius:var(--radius-sm);display:grid;gap:var(--space-2);">
              <strong>${escapeHtml(item.studentName)} <code>${escapeHtml(item.studentCode)}</code></strong>
              <p style="margin:0;color:var(--text-secondary);">${escapeHtml(getClassPlacement(item, classesById))} — الحصة ${escapeHtml(item.lessonId)} — ${escapeHtml(item.date)}</p>
              <p style="margin:0;color:var(--text-secondary);">البوابة: ${escapeHtml(item.arrivalStatus || 'لا يوجد')} — سجلها: ${escapeHtml(item.arrivalRecordedBy)} · الحصة: ${escapeHtml(item.classStatus || 'غائب')} — رصدها: ${escapeHtml(item.recordedBy || 'غير محدد')}</p>
              ${canReview ? `
                <label class="form-group" style="margin:0;">
                  <span class="form-label">ملاحظة المراجعة (اختياري)</span>
                  <input class="form-control" data-review-note maxlength="240" placeholder="سبب التصحيح أو ملخص التحقق">
                </label>
                <div style="display:flex;gap:var(--space-2);flex-wrap:wrap;">
                  <button type="button" class="btn btn-warning btn-sm" data-review="confirm" data-batch="${escapeHtml(item.batchId)}" data-code="${escapeHtml(item.studentCode)}">تأكيد الهروب</button>
                  <button type="button" class="btn btn-outline btn-sm" data-review="correct" data-batch="${escapeHtml(item.batchId)}" data-code="${escapeHtml(item.studentCode)}">تصحيحها إلى غياب عادي</button>
                </div>` : '<span class="badge badge-primary">بانتظار مراجعة الموظف المختص</span>'}
            </article>
          `).join('')}
        </div>
      </section>
    `;

    container.onclick = async (event) => {
      const button = event.target.closest('[data-review]');
      if (!button) return;
      const user = getCurrentUser();
      if (!user || !['teacher', 'student_affairs', 'director', 'super_admin'].includes(user.role)) {
        showToast('لا تملك صلاحية مراجعة هذه الحالة.', 'error');
        return;
      }
      const decision = button.dataset.review;
      if (!window.confirm(decision === 'confirm'
        ? 'هل راجعت سجل البوابة والحصة وتؤكد حالة الهروب؟'
        : 'هل راجعت السجل وتؤكد تصحيح الحالة إلى غياب عادي؟')) return;
      const noteInput = button.closest('article')?.querySelector('[data-review-note]');
      button.disabled = true;
      try {
        await reviewEscapeAttendance({
          batchId: button.dataset.batch,
          studentCode: button.dataset.code,
          decision,
          reviewedBy: user.displayName || user.email,
          reviewedByRole: user.role,
          note: noteInput?.value || '',
        }, user.schoolId);
        showToast(decision === 'confirm' ? 'تم تأكيد الهروب وإخطار ولي الأمر.' : 'تم تصحيح الحالة وتسجيل المراجعة.', 'success');
        await renderAttendanceAlerts(container, role);
      } catch (error) {
        button.disabled = false;
        showToast(error.message || 'تعذر حفظ قرار المراجعة.', 'error');
      }
    };
  } catch (error) {
    console.warn('Attendance alerts load notice:', error);
    container.innerHTML = '<p role="status" class="panel" style="padding:var(--space-3);color:var(--color-warning-text);">تعذر تحميل حالات المراجعة بسبب الاتصال أو الصلاحيات. أعد المحاولة بعد التحقق من الحساب.</p>';
  }
}