import { getStudents } from '../services/student-service.js';
import { getSchoolProfile, DEFAULT_SCHOOL_ID } from '../services/school-service.js';
import {
  getClassAttendance,
  saveClassAttendance,
  getDailyAttendanceRegister,
  buildAbsenceThresholdReport,
  createAttendanceExcuse,
  getAttendanceExcuses,
} from '../services/attendance-service.js';
import { getCurrentUser } from '../auth.js';
import { showToast } from '../components.js';
import { renderAttendanceAlerts } from './attendance-alerts-view.js';
import { exportToCsv } from '../utils/export-utils.js';
import { printHtmlAsPdf } from '../utils/pdf-export.js';

const STATUS_LABELS = {
  present: 'حاضر',
  absent_unexcused: 'غائب دون عذر',
  absent_excused: 'غائب بعذر معتمد',
  late: 'متأخر',
};

function escapeHtml(value) {
  return String(value || '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[char]);
}

function getPlacement(student) {
  const raw = String(student.grade || student.stage || '').trim();
  const parts = raw.split(/\s*[—–-]\s*/);
  return {
    grade: String(student.gradeName || student.stage || (parts.length > 1 ? parts[0] : raw)).trim(),
    className: String(student.className || parts.slice(1).join(' — ') || student.classId || '').trim(),
    classId: String(student.classId || student.className || parts.slice(1).join(' — ') || '').trim(),
  };
}

export async function renderAttendanceView(container) {
  const currentUser = getCurrentUser();
  const schoolId = currentUser?.schoolId || DEFAULT_SCHOOL_ID;
  const canEditAttendance = ['student_affairs', 'director', 'super_admin'].includes(currentUser?.role);
  const [students, profile] = await Promise.all([
    getStudents(schoolId),
    getSchoolProfile(schoolId),
  ]);
  const enrolled = (students || []).filter((student) => student.status !== 'withdrawn' && student.status !== 'archived');
  const placements = enrolled.map((student) => ({ student, ...getPlacement(student) }))
    .filter((entry) => entry.grade && entry.className);
  const grades = [...new Set(placements.map((entry) => entry.grade))];
  const years = [...new Set(enrolled.map((student) => student.academicYear || student.schoolYear).filter(Boolean))];
  const activeYear = profile.academicYear || '2026/2027';
  const academicYearStart = `${String(activeYear).split('/')[0] || new Date().getFullYear()}-09-01`;
  const today = new Date().toISOString().slice(0, 10);
  if (!years.includes(activeYear)) years.unshift(activeYear);

  container.innerHTML = `
    <div style="display:flex;flex-direction:column;gap:var(--space-5);">
      <div id="attendance-escape-alerts"></div>
      <div>
        <h1 style="font-size:var(--text-2xl);font-weight:800;color:var(--color-primary-950);margin-bottom:2px;">الحضور والغياب اليومي</h1>
        <p style="font-size:var(--text-sm);color:var(--text-muted);margin:0;">تسجيل حضور الطالب عند بوابة المدرسة مرة واحدة يوميًا، ثم مطابقته برصد المدرسين لكل حصة.</p>
      </div>
      <div class="panel" style="padding:var(--space-4);">
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:var(--space-3);">
          <div class="form-group">
            <label class="form-label" for="attendance-year">السنة الدراسية</label>
            <select class="form-control" id="attendance-year">${years.map((year) => `<option value="${escapeHtml(year)}" ${year === activeYear ? 'selected' : ''}>${escapeHtml(year)}</option>`).join('')}</select>
          </div>
          <div class="form-group">
            <label class="form-label" for="attendance-grade">الصف</label>
            <select class="form-control" id="attendance-grade"><option value="">اختر الصف</option>${grades.map((grade) => `<option value="${escapeHtml(grade)}">${escapeHtml(grade)}</option>`).join('')}</select>
          </div>
          <div class="form-group">
            <label class="form-label" for="attendance-class">الفصل</label>
            <select class="form-control" id="attendance-class" disabled><option value="">اختر الصف أولاً</option></select>
          </div>
          <div class="form-group">
            <label class="form-label" for="attendance-date">تاريخ الرصد</label>
            <input class="form-control" type="date" id="attendance-date" value="${today}">
          </div>
        </div>
        ${placements.length ? '' : '<p role="status" style="color:var(--text-muted);margin:var(--space-3) 0 0;">لا توجد سجلات طلاب حقيقية مرتبطة بصف وفصل. تحقق من صلاحية Firestore أو أكمل القيد والإسناد أولاً.</p>'}
      </div>
      ${canEditAttendance ? `
        <section class="panel" aria-labelledby="attendance-excuse-title">
          <div class="panel-header">
            <div>
              <h2 class="panel-title" id="attendance-excuse-title" style="margin:0;">تسجيل فترة عذر معتمدة</h2>
              <p style="margin:4px 0 0;color:var(--text-muted);font-size:var(--text-xs);">الغياب داخل الفترة يسجل بعذر تلقائيًا؛ وبعد تاريخ النهاية يُسجل الغياب بلا عذر ويبدأ احتسابه للإنذارات.</p>
            </div>
          </div>
          <div class="panel-body">
            <form id="attendance-excuse-form">
              <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:var(--space-3);">
                <div class="form-group">
                  <label class="form-label" for="attendance-excuse-student">الطالب *</label>
                  <select class="form-control" id="attendance-excuse-student" required>
                    <option value="">اختر الطالب</option>
                    ${enrolled.map((student) => `<option value="${escapeHtml(student.code)}" data-name="${escapeHtml(student.name)}" data-grade="${escapeHtml(getPlacement(student).grade)}" data-class="${escapeHtml(getPlacement(student).classId)}" data-class-name="${escapeHtml(getPlacement(student).className)}">${escapeHtml(student.name)} (${escapeHtml(student.code)})</option>`).join('')}
                  </select>
                </div>
                <div class="form-group">
                  <label class="form-label" for="attendance-excuse-start">من تاريخ *</label>
                  <input class="form-control" id="attendance-excuse-start" type="date" value="${today}" required>
                </div>
                <div class="form-group">
                  <label class="form-label" for="attendance-excuse-end">إلى تاريخ *</label>
                  <input class="form-control" id="attendance-excuse-end" type="date" value="${today}" required>
                </div>
              </div>
              <div class="form-group" style="margin:var(--space-3) 0;">
                <label class="form-label" for="attendance-excuse-reason">سبب العذر *</label>
                <textarea class="form-control" id="attendance-excuse-reason" rows="2" maxlength="500" required></textarea>
              </div>
              <div style="display:flex;justify-content:flex-end;">
                <button type="submit" class="btn btn-primary btn-sm" id="attendance-excuse-submit">اعتماد فترة العذر</button>
              </div>
            </form>
            <div id="attendance-excuse-list" style="margin-top:var(--space-4);"></div>
          </div>
        </section>` : ''}
      <div id="attendance-roster" class="panel" style="padding:0;overflow:hidden;">
        <div class="empty-state" style="padding:var(--space-8);">
          <div class="empty-state-icon">📋</div>
          <h3 class="empty-state-title">اختر السنة والصف والفصل</h3>
          <p class="empty-state-desc">ستظهر هنا أسماء الطلاب المسجلين فعلياً في الفصل.</p>
        </div>
      </div>
      <section class="panel" aria-labelledby="attendance-report-title">
        <div class="panel-header"><div><h2 class="panel-title" id="attendance-report-title" style="margin:0;">تقرير الطلاب المتجاوزين لنسبة الغياب</h2><p style="margin:4px 0 0;color:var(--text-muted);font-size:var(--text-xs);">يعتمد التقرير على أيام سجل البوابة المعتمدة فقط، ولا يحتسب الحصة أو اليوم غير المرصود.</p></div></div>
        <div class="panel-body">
          <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:var(--space-3);align-items:end;">
            <div class="form-group"><label class="form-label" for="absence-report-start">من تاريخ</label><input class="form-control" id="absence-report-start" type="date" value="${academicYearStart}"></div>
            <div class="form-group"><label class="form-label" for="absence-report-end">إلى تاريخ</label><input class="form-control" id="absence-report-end" type="date" value="${today}"></div>
            <div class="form-group"><label class="form-label" for="absence-report-percent">نسبة الغياب %</label><input class="form-control" id="absence-report-percent" type="number" min="1" max="100" value="10"></div>
            <div class="form-group"><label class="form-label" for="absence-report-days">عدد أيام الغياب</label><input class="form-control" id="absence-report-days" type="number" min="1" value="3"></div>
            <div class="form-group"><label class="form-label" for="absence-report-frequency">احتساب الأيام</label><select class="form-control" id="absence-report-frequency"><option value="scattered">متفرقة أو متتالية</option><option value="consecutive">متتالية فقط</option></select></div>
          </div>
          <div style="display:flex;gap:var(--space-2);justify-content:flex-end;flex-wrap:wrap;margin-top:var(--space-3);">
            <button type="button" class="btn btn-primary btn-sm" id="absence-report-preview">عرض التقرير</button>
            <button type="button" class="btn btn-outline btn-sm" id="absence-report-excel" disabled>تنزيل Excel (CSV)</button>
            <button type="button" class="btn btn-outline btn-sm" id="absence-report-pdf" disabled>طباعة / حفظ PDF</button>
          </div>
          <div id="absence-report-results" style="margin-top:var(--space-4);"></div>
        </div>
      </section>
    </div>
  `;

  const gradeSelect = container.querySelector('#attendance-grade');
  const classSelect = container.querySelector('#attendance-class');
  const dateInput = container.querySelector('#attendance-date');
  const yearSelect = container.querySelector('#attendance-year');
  const roster = container.querySelector('#attendance-roster');
  renderAttendanceAlerts(container.querySelector('#attendance-escape-alerts'), currentUser?.role || 'student_affairs');
  const belongsToYear = (student, year) => (student.academicYear || student.schoolYear || activeYear) === year;

  async function loadExcuseRegister() {
    const list = container.querySelector('#attendance-excuse-list');
    if (!list) return;
    try {
      const excuses = await getAttendanceExcuses(schoolId, yearSelect.value);
      list.innerHTML = excuses.length ? `
        <div class="table-wrap"><table class="data-table">
          <thead><tr><th>الطالب</th><th>الفترة المعتمدة</th><th>السبب</th><th>المعتمد بواسطة</th></tr></thead>
          <tbody>${excuses.map((excuse) => `<tr><td>${escapeHtml(excuse.studentName)} <code>${escapeHtml(excuse.studentCode)}</code></td><td>${escapeHtml(excuse.startDate)} — ${escapeHtml(excuse.endDate)}</td><td>${escapeHtml(excuse.reason)}</td><td>${escapeHtml(excuse.approvedBy)}</td></tr>`).join('')}</tbody>
        </table></div>` : '<p style="margin:0;color:var(--text-muted);">لا توجد فترات عذر مسجلة لهذه السنة الدراسية.</p>';
    } catch (error) {
      list.textContent = error.message || 'تعذر تحميل سجل الأعذار المعتمدة.';
    }
  }
  loadExcuseRegister();

  const excuseForm = container.querySelector('#attendance-excuse-form');
  excuseForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const studentSelect = container.querySelector('#attendance-excuse-student');
    const studentOption = studentSelect?.selectedOptions?.[0];
    const submitButton = container.querySelector('#attendance-excuse-submit');
    if (!studentSelect?.value || !studentOption) {
      showToast('يرجى اختيار الطالب من السجل الرسمي.', 'error');
      return;
    }
    submitButton.disabled = true;
    try {
      await createAttendanceExcuse({
        studentCode: studentSelect.value,
        studentName: studentOption.dataset.name,
        grade: studentOption.dataset.grade,
        classId: studentOption.dataset.class,
        className: studentOption.dataset.className,
        startDate: container.querySelector('#attendance-excuse-start').value,
        endDate: container.querySelector('#attendance-excuse-end').value,
        reason: container.querySelector('#attendance-excuse-reason').value,
        academicYear: yearSelect.value,
        approvedBy: currentUser?.displayName || 'شؤون الطلاب',
      }, schoolId);
      excuseForm.reset();
      container.querySelector('#attendance-excuse-start').value = today;
      container.querySelector('#attendance-excuse-end').value = today;
      await loadExcuseRegister();
      showToast('تم اعتماد فترة العذر. ستُحتسب الأيام داخلها غيابًا بعذر فقط.', 'success');
    } catch (error) {
      showToast(error.message || 'تعذر اعتماد فترة العذر.', 'error');
    } finally {
      submitButton.disabled = false;
    }
  });

  function updateGradeOptions() {
    const yearStudents = enrolled.filter((student) => belongsToYear(student, yearSelect.value));
    const availableGrades = [...new Set(yearStudents.map((student) => getPlacement(student).grade).filter(Boolean))];
    gradeSelect.innerHTML = availableGrades.length
      ? '<option value="">اختر الصف</option>' + availableGrades.map((grade) => `<option value="${escapeHtml(grade)}">${escapeHtml(grade)}</option>`).join('')
      : '<option value="">لا توجد صفوف مسجلة في هذه السنة</option>';
    classSelect.innerHTML = '<option value="">اختر الصف أولاً</option>';
    classSelect.disabled = true;
    roster.innerHTML = '<div class="empty-state" style="padding:var(--space-8);"><h3 class="empty-state-title">اختر السنة والصف والفصل</h3><p class="empty-state-desc">ستظهر هنا أسماء الطلاب المسجلين فعلياً في الفصل.</p></div>';
  }

  async function loadRoster() {
    const grade = gradeSelect.value;
    const classId = classSelect.value;
    const className = placements.find((entry) => entry.grade === grade && entry.classId === classId)?.className || classId;
    const date = dateInput.value;
    const year = yearSelect.value;
    if (!grade || !classId || !date) return;

    const classStudents = placements
      .filter((entry) => entry.grade === grade && entry.classId === classId && belongsToYear(entry.student, year))
      .map((entry) => entry.student);
    if (!classStudents.length) {
      roster.innerHTML = '<div class="empty-state" style="padding:var(--space-8);"><h3 class="empty-state-title">لا يوجد طلاب مسجلون في هذا الفصل</h3></div>';
      return;
    }

    const phase = 'arrival';
    const records = await getClassAttendance(classId, date, schoolId, phase);
    const savedByCode = new Map((records || []).map((record) => [String(record.studentCode), record.status]));
    roster.innerHTML = `
      <div class="panel-header" style="display:flex;justify-content:space-between;align-items:center;gap:var(--space-3);flex-wrap:wrap;">
        <div><h3 class="panel-title" style="margin:0;">${escapeHtml(grade)} — ${escapeHtml(className)}</h3><span style="color:var(--text-muted);font-size:var(--text-xs);">${escapeHtml(date)} · ${classStudents.length} طالب</span></div>
        ${canEditAttendance ? `<button type="button" class="btn btn-primary btn-md" id="attendance-save-btn">${records.length ? 'حفظ تعديلات سجل البوابة' : 'اعتماد سجل البوابة'}</button>` : '<span class="badge badge-primary">عرض فقط</span>'}
      </div>
      <div class="table-wrap" style="border:none;">
        <table class="data-table"><thead><tr><th>م</th><th>اسم الطالب</th><th>كود الطالب</th><th>حالة اليوم</th></tr></thead>
          <tbody>${classStudents.map((student, index) => {
            const status = savedByCode.get(String(student.code)) || 'present';
            return `<tr><td>${index + 1}</td><td><strong>${escapeHtml(student.name)}</strong></td><td><code>${escapeHtml(student.code)}</code></td><td><select class="form-control attendance-status" data-code="${escapeHtml(student.code)}" ${canEditAttendance ? '' : 'disabled'} style="max-width:230px;">${Object.entries(STATUS_LABELS).map(([key, label]) => `<option value="${key}" ${status === key ? 'selected' : ''}>${label}</option>`).join('')}</select></td></tr>`;
          }).join('')}</tbody>
        </table>
      </div>
    `;

    roster.querySelector('#attendance-save-btn')?.addEventListener('click', async (event) => {
      const button = event.currentTarget;
      button.disabled = true;
      const dailyRecords = classStudents.map((student) => ({
        studentCode: student.code,
        studentName: student.name,
        grade,
        classId,
        className,
        date,
        academicYear: year,
          phase,
        status: roster.querySelector(`.attendance-status[data-code="${CSS.escape(String(student.code))}"]`)?.value || 'present',
      }));
      try {
        const result = await saveClassAttendance({
          grade,
          classId,
          className,
          date,
          academicYear: year,
          phase,
          records: dailyRecords,
          recordedBy: currentUser?.displayName || 'مسؤول شؤون الطلاب',
          recordedByRole: currentUser?.role || 'student_affairs',
        }, schoolId);
        if (result.persistedRemotely && result.warningSyncError) {
          showToast(`تم حفظ سجل البوابة، لكن تعذر تحديث تنبيهات الغياب: ${result.warningSyncError}`, 'error');
        } else {
          showToast(result.persistedRemotely ? 'تم حفظ سجل البوابة على خادم المدرسة، ويمكن تعديله لاحقًا.' : `تم حفظ نسخة محلية فقط ولم يعتمد السجل على الخادم. ${result.persistenceError || ''}`, result.persistedRemotely ? 'success' : 'error');
        }
        if (result.persistedRemotely) await loadRoster();
      } catch (error) {
        showToast(error.message || 'تعذر حفظ سجل الحضور.', 'error');
      } finally {
        button.disabled = false;
      }
    });
  }

  gradeSelect.addEventListener('change', () => {
    const grade = gradeSelect.value;
    const year = yearSelect.value;
    const classes = [...new Map(placements
      .filter((entry) => entry.grade === grade && belongsToYear(entry.student, year))
      .map((entry) => [entry.classId, entry.className])).entries()];
    classSelect.innerHTML = classes.length
      ? '<option value="">اختر الفصل</option>' + classes.map(([id, name]) => `<option value="${escapeHtml(id)}">${escapeHtml(name)}</option>`).join('')
      : '<option value="">لا توجد فصول مسجلة</option>';
    classSelect.disabled = classes.length === 0;
    loadRoster();
  });
  classSelect.addEventListener('change', loadRoster);
  dateInput.addEventListener('change', loadRoster);
  yearSelect.addEventListener('change', () => {
    updateGradeOptions();
    loadExcuseRegister();
  });

  let latestReport = [];
  const reportResults = container.querySelector('#absence-report-results');
  const reportPreviewButton = container.querySelector('#absence-report-preview');
  const reportExcelButton = container.querySelector('#absence-report-excel');
  const reportPdfButton = container.querySelector('#absence-report-pdf');
  const getReportSettings = () => ({
    startDate: container.querySelector('#absence-report-start').value,
    endDate: container.querySelector('#absence-report-end').value,
    absencePercent: Number(container.querySelector('#absence-report-percent').value),
    minimumDays: Number(container.querySelector('#absence-report-days').value),
    frequency: container.querySelector('#absence-report-frequency').value,
  });
  const escapeReportHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[char]);

  reportPreviewButton.addEventListener('click', async () => {
    const settings = getReportSettings();
    if (!settings.startDate || !settings.endDate || settings.startDate > settings.endDate || settings.absencePercent < 1 || settings.absencePercent > 100 || settings.minimumDays < 1) {
      showToast('تحقق من الفترة والنسبة وعدد أيام الغياب.', 'error');
      return;
    }
    reportPreviewButton.disabled = true;
    reportPreviewButton.textContent = 'جارٍ إعداد التقرير...';
    try {
      const attendanceRegister = await getDailyAttendanceRegister(settings.startDate, settings.endDate, schoolId);
      latestReport = buildAbsenceThresholdReport(attendanceRegister, enrolled, settings);
      reportResults.innerHTML = latestReport.length ? `
        <div class="table-wrap"><table class="data-table"><thead><tr><th>م</th><th>الصف</th><th>الفصل</th><th>اسم الطالب</th><th>كود الطالب</th><th>أيام الغياب</th><th>أطول تتابع</th><th>أيام الرصد</th><th>النسبة</th></tr></thead>
          <tbody>${latestReport.map((student, index) => `<tr><td>${index + 1}</td><td>${escapeReportHtml(student.grade)}</td><td>${escapeReportHtml(student.classId)}</td><td>${escapeReportHtml(student.name)}</td><td>${escapeReportHtml(student.code)}</td><td>${student.absenceDays}</td><td>${student.longestStreak}</td><td>${student.recordedDays}</td><td>${student.absenceRate}%</td></tr>`).join('')}</tbody>
        </table></div>` : '<p role="status" style="color:var(--text-muted);">لا يوجد طلاب تجاوزوا المعايير المحددة ضمن أيام الرصد المعتمدة.</p>';
      reportExcelButton.disabled = latestReport.length === 0;
      reportPdfButton.disabled = latestReport.length === 0;
    } catch (error) {
      latestReport = [];
      reportResults.textContent = error.message || 'تعذر إعداد تقرير الغياب.';
      reportExcelButton.disabled = true;
      reportPdfButton.disabled = true;
    } finally {
      reportPreviewButton.disabled = false;
      reportPreviewButton.textContent = 'عرض التقرير';
    }
  });

  reportExcelButton.addEventListener('click', () => {
    if (!latestReport.length) return;
    const settings = getReportSettings();
    exportToCsv(`تقرير_الغياب_${settings.startDate}_${settings.endDate}`, ['م', 'الصف', 'الفصل', 'اسم الطالب', 'كود الطالب', 'أيام الغياب', 'أطول تتابع', 'أيام الرصد', 'نسبة الغياب', 'تواريخ الغياب'], latestReport.map((student, index) => [index + 1, student.grade, student.classId, student.name, student.code, student.absenceDays, student.longestStreak, student.recordedDays, `${student.absenceRate}%`, student.dates.join('، ')]));
  });

  reportPdfButton.addEventListener('click', async () => {
    if (!latestReport.length) return;
    const settings = getReportSettings();
    const rows = latestReport.map((student, index) => `<tr><td>${index + 1}</td><td>${escapeReportHtml(student.grade)}</td><td>${escapeReportHtml(student.classId)}</td><td>${escapeReportHtml(student.name)}</td><td>${escapeReportHtml(student.code)}</td><td>${student.absenceDays}</td><td>${student.longestStreak}</td><td>${student.recordedDays}</td><td>${student.absenceRate}%</td></tr>`).join('');
    await printHtmlAsPdf({
      title: 'كشف الطلاب المتجاوزين لنسبة الغياب',
      subtitle: `الفترة ${settings.startDate} إلى ${settings.endDate} · النسبة ${settings.absencePercent}% · الحد الأدنى ${settings.minimumDays} أيام`,
      contentHtml: `<table class="print-table"><thead><tr><th>م</th><th>الصف</th><th>الفصل</th><th>اسم الطالب</th><th>الكود</th><th>أيام الغياب</th><th>أطول تتابع</th><th>أيام الرصد</th><th>النسبة</th></tr></thead><tbody>${rows}</tbody></table>`,
      signatureTitle: 'مدير المدرسة',
    });
  });
}