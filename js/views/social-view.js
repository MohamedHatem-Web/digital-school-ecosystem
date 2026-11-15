// ==========================================================================
// DIGITAL SCHOOL ECOSYSTEM (VANILLA EDITION)
// SPA View Module: Social Affairs & Behavioral Warnings (Resolution 187)
// ==========================================================================

import {
  getDisciplinaryCases,
  issueDisciplinaryWarning,
  createSocialIncident,
  getSocialIncidents,
} from '../services/social-service.js';
import { getStudents } from '../services/student-service.js';
import { getNotifications } from '../services/notification-service.js';
import { getSchoolProfile, DEFAULT_SCHOOL_ID } from '../services/school-service.js';
import { getCurrentUser } from '../auth.js';
import { printHtmlAsPdf } from '../utils/pdf-export.js';
import { showToast } from '../components.js';

let isInitialized = false;
let casesList = [];
let allStudents = [];
let incidentsList = [];

function getStudentAcademicPlacement(student) {
  const raw = String(student.grade || student.stage || '').trim();
  const parts = raw.split(/\s*[—–-]\s*/);
  return {
    grade: String(student.gradeName || student.stage || (parts.length > 1 ? parts[0] : raw)).trim(),
    className: String(student.className || student.classId || parts.slice(1).join(' — ') || '').trim(),
  };
}

function getStudentSelectionOptions(studentList = []) {
  const academicYears = ['2025/2026', '2026/2027'];
  const yearOptions = academicYears.map((year) => `<option value="${year}">${year}</option>`).join('');

  const yearSelect = `<div class="form-group"><label class="form-label" for="soc-year-select">السنة الدراسية</label><select id="soc-year-select" class="form-control">${yearOptions}</select></div>`;
  const grades = [...new Set(studentList.map((student) => getStudentAcademicPlacement(student).grade).filter(Boolean))];
  const gradeOptions = grades.length
    ? '<option value="">اختر الصف</option>' + grades.map((grade) => `<option value="${grade}">${grade}</option>`).join('')
    : '<option value="">لا توجد صفوف مسجلة</option>';

  const classOptions = [...new Set(studentList.map((student) => getStudentAcademicPlacement(student).className).filter(Boolean))];
  const classChoices = classOptions.length
    ? '<option value="">اختر الفصل</option>' + classOptions.map((className) => `<option value="${className}">${className}</option>`).join('')
    : '<option value="">لا توجد فصول مسجلة</option>';

  return { yearSelect, gradeOptions, classChoices };
}

export async function renderSocialView(container) {
  if (!isInitialized) {
    container.innerHTML = `
      <div style="display: flex; flex-direction: column; gap: var(--space-5);">
        <!-- Page Title & Actions -->
        <div style="display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: var(--space-4);">
          <div>
            <h1 style="font-size: var(--text-2xl); font-weight: 800; color: var(--color-primary-950); margin-bottom: 2px;">
              🤝 مكتب الخدمة الاجتماعية والإنذارات الرسمية
            </h1>
            <p style="font-size: var(--text-sm); color: var(--text-muted); margin: 0;">
              المتابعة السلوكية الميدانية، قرارات الانضباط والإنذارات الرسمية وفق القرار الوزاري رقم 187.
            </p>
          </div>
          <div>
            <button type="button" id="soc-open-warning-btn" class="btn btn-warning btn-md" style="font-weight: 700;">
              ⚠️ إصدار إنذار أو قرار انضباط
            </button>
          </div>
        </div>

        <section class="panel" style="border-inline-start:4px solid var(--color-warning-border);">
          <div class="panel-header" style="display:flex;justify-content:space-between;align-items:center;gap:var(--space-2);flex-wrap:wrap;">
            <div>
              <h2 class="panel-title" style="margin:0;">تنبيهات الغياب المبكر</h2>
              <p style="margin:4px 0 0;color:var(--text-muted);font-size:var(--text-xs);">تُراجع أيام الغياب دون عذر المسجلة بدفتر البوابة للسنة الدراسية الحالية.</p>
            </div>
            <span class="badge badge-warning" id="soc-attendance-alert-count">0 تنبيهات</span>
          </div>
          <div class="panel-body" id="soc-attendance-alerts"><p style="margin:0;color:var(--text-muted);">لا توجد تنبيهات غياب قريبة حاليًا.</p></div>
        </section>
        <p id="soc-load-error" role="alert" class="panel" style="display:none;padding:var(--space-3);color:var(--color-danger-solid);"></p>

        <!-- Issue Warning Panel (Collapsible) -->
        <div class="panel" id="soc-warning-panel" style="display: none; border-inline-start: 4px solid var(--color-warning-border);">
          <div class="panel-header" style="display: flex; justify-content: space-between; align-items: center;">
            <h3 class="panel-title" style="margin: 0;">إصدار قرار انضباط رسمي ضد طالب</h3>
            <button type="button" class="btn btn-sm" id="soc-close-warning-btn">✕ إغلاق</button>
          </div>
          <div class="panel-body">
            <form id="soc-warning-form">
              <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: var(--space-4); margin-bottom: var(--space-4);">
                <div class="form-group">
                  <label class="form-label" for="soc-year-select">السنة الدراسية *</label>
                  <select id="soc-year-select" class="form-control" required>
                    <option value="2025/2026">2025/2026</option>
                    <option value="2026/2027">2026/2027</option>
                  </select>
                </div>
                <div class="form-group">
                  <label class="form-label" for="soc-grade-select">المرحلة/الصف *</label>
                  <select id="soc-grade-select" class="form-control" required>
                    <option value="">اختر الصف</option>
                  </select>
                </div>
                <div class="form-group">
                  <label class="form-label" for="soc-class-select">الفصل *</label>
                  <select id="soc-class-select" class="form-control" required>
                    <option value="">اختر الفصل</option>
                  </select>
                </div>
                <div class="form-group">
                  <label class="form-label" for="soc-stu-select">الطالب المعني *</label>
                  <select id="soc-stu-select" class="form-control" required>
                    <option value="">اختر الطالب من السجل الرسمي</option>
                  </select>
                </div>
                <div class="form-group">
                  <label class="form-label" for="soc-level">مستوى المخالفة (وفق اللائحة) *</label>
                  <select id="soc-level" class="form-control" required>
                    <option value="level_1">مخالفة من المستوى الأول (بسيطة)</option>
                    <option value="level_2">مخالفة من المستوى الثاني (متوسطة الخطورة)</option>
                    <option value="level_3">مخالفة من المستوى الثالث (جسيمة / فصل مؤقت)</option>
                  </select>
                </div>
                <div class="form-group">
                  <label class="form-label" for="soc-action">الإجراء الانضباطي المعتمد *</label>
                  <select id="soc-action" class="form-control" required>
                    <option value="warning_first">إنذار كتابي أول مع إخطار ولي الأمر</option>
                    <option value="warning_second">إنذار كتابي ثانٍ مع إخطار ولي الأمر</option>
                    <option value="dismissal">قرار فصل للمراجعة والاعتماد</option>
                  </select>
                </div>
              </div>

              <div class="form-group" style="margin-bottom: var(--space-4);">
                <label class="form-label" for="soc-reason">تفاصيل وسياق المخالفة الميدانية *</label>
                <textarea id="soc-reason" class="form-control" rows="3" required placeholder="وصف الواقعة بدقة والتاريخ وتوصية لجنة الحماية..."></textarea>
              </div>

              <div style="display: flex; justify-content: flex-end;">
                <button type="submit" class="btn btn-warning btn-md" id="soc-submit-warning-btn" style="font-weight: 700;">
                  ⚠️ اعتماد وتوثيق القرار رسميًا
                </button>
              </div>
            </form>
          </div>
        </div>

        <section class="panel">
          <div class="panel-header">
            <div>
              <h2 class="panel-title" style="margin:0;">تسجيل موقف يومي سريع</h2>
              <p style="margin:4px 0 0;color:var(--text-muted);font-size:var(--text-xs);">سجّل التأخير عن الطابور أو المواقف السلوكية واربطها بمستوى لائحة الانضباط.</p>
            </div>
          </div>
          <div class="panel-body">
            <form id="soc-incident-form">
              <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:var(--space-3);">
                <div class="form-group">
                  <label class="form-label" for="soc-incident-student">الطالب *</label>
                  <select id="soc-incident-student" class="form-control" required><option value="">جارٍ تحميل الطلاب...</option></select>
                </div>
                <div class="form-group">
                  <label class="form-label" for="soc-incident-type">نوع الموقف *</label>
                  <select id="soc-incident-type" class="form-control" required>
                    <option value="late_to_assembly">تأخير متكرر عن طابور الصباح</option>
                    <option value="behavioral">موقف سلوكي يومي</option>
                    <option value="other">موقف آخر</option>
                  </select>
                </div>
                <div class="form-group">
                  <label class="form-label" for="soc-incident-date">تاريخ الواقعة *</label>
                  <input id="soc-incident-date" class="form-control" type="date" required>
                </div>
                <div class="form-group">
                  <label class="form-label" for="soc-incident-regulation">مستوى لائحة الانضباط</label>
                  <select id="soc-incident-regulation" class="form-control">
                    <option value="level_1">المستوى الأول — مخالفة بسيطة</option>
                    <option value="level_2">المستوى الثاني — مخالفة متوسطة</option>
                    <option value="level_3">المستوى الثالث — مخالفة جسيمة</option>
                    <option value="unclassified">يحتاج مراجعة الأخصائي</option>
                  </select>
                </div>
              </div>
              <div class="form-group" style="margin:var(--space-3) 0;">
                <label class="form-label" for="soc-incident-description">تفاصيل الموقف *</label>
                <textarea id="soc-incident-description" class="form-control" rows="2" maxlength="1000" required placeholder="اكتب وصفًا مختصرًا وموضوعيًا للموقف والإجراء الأولي إن وجد."></textarea>
              </div>
              <div style="display:flex;justify-content:flex-end;">
                <button type="submit" class="btn btn-primary btn-md" id="soc-submit-incident-btn">حفظ الموقف في السجل</button>
              </div>
            </form>
          </div>
        </section>

        <section class="panel" style="padding:0;overflow:hidden;">
          <div class="panel-header" style="display:flex;justify-content:space-between;align-items:center;">
            <h2 class="panel-title" style="margin:0;">سجل المواقف اليومية</h2>
            <span class="badge badge-primary" id="soc-incidents-badge">0 مواقف</span>
          </div>
          <div class="table-wrap" style="border:none;">
            <table class="data-table">
              <thead><tr><th>التاريخ</th><th>الطالب</th><th>نوع الموقف</th><th>اللائحة</th><th>التفاصيل</th><th>المسجل</th></tr></thead>
              <tbody id="soc-incidents-tbody"></tbody>
            </table>
          </div>
          <div id="soc-incidents-empty" class="empty-state" style="display:none;padding:var(--space-6);">
            <p class="empty-state-desc">لا توجد مواقف يومية مسجلة.</p>
          </div>
        </section>

        <!-- Disciplinary Cases Table -->
        <div class="panel" style="padding: 0; overflow: hidden;">
          <div class="panel-header" style="display: flex; justify-content: space-between; align-items: center;">
            <h3 class="panel-title" style="margin: 0;">سجل الإنذارات وقضايا الانضباط المسجلة</h3>
            <span id="soc-cases-badge" class="badge badge-warning">0 قرارات</span>
          </div>
          <div class="table-wrap" style="border: none;">
            <table class="data-table">
              <thead>
                <tr>
                  <th>تاريخ القرار</th>
                  <th>اسم الطالب</th>
                  <th>المستوى</th>
                  <th>الإجراء المتخذ</th>
                  <th>السبب والملاحظات</th>
                  <th style="width: 120px; text-align: center;">التفاصيل</th>
                  <th style="width: 110px; text-align: center;">المستند</th>
                  <th style="width: 100px; text-align: center;">الحالة</th>
                </tr>
              </thead>
              <tbody id="soc-cases-tbody"></tbody>
            </table>
          </div>
          <div id="soc-empty-state" class="empty-state" style="display: none; padding: var(--space-8);">
            <div class="empty-state-icon">🛡️</div>
            <h4 class="empty-state-title">سجل الانضباط المدرسي نظيف بالكامل</h4>
            <p class="empty-state-desc">لا توجد قرارات فصل أو إنذارات انضباط مسجلة في المنظومة حاليًا.</p>
          </div>
        </div>

        <div class="panel" style="border-inline-start:4px solid var(--color-danger-solid);">
          <div class="panel-header" style="display:flex;justify-content:space-between;align-items:center;gap:var(--space-2);flex-wrap:wrap;">
            <h3 class="panel-title" style="margin:0;">🚨 تنبيهات الهروب من المدرسة</h3>
            <span class="badge badge-danger" id="soc-escape-count">0 حالات</span>
          </div>
          <div class="panel-body" id="soc-escape-notices">
            <p style="margin:0;color:var(--text-muted);">لا توجد تنبيهات هروب مسجلة.</p>
          </div>
        </div>
      </div>
    `;

    bindSocialEvents(container);
    isInitialized = true;
  }

  try {
    await loadSocialData();
  } catch (error) {
    const loadError = document.getElementById('soc-load-error');
    if (loadError) {
      loadError.textContent = error.message || 'تعذر تحميل بيانات الخدمة الاجتماعية.';
      loadError.style.display = 'block';
    }
    showToast(error.message || 'تعذر تحميل بيانات الخدمة الاجتماعية.', 'error');
  }
}


async function loadSocialData() {
  const user = getCurrentUser();
  const schoolId = user?.schoolId || DEFAULT_SCHOOL_ID;
  const loadError = document.getElementById('soc-load-error');
  let incidentsLoadFailed = false;
  if (loadError) loadError.style.display = 'none';
  const incidentsPromise = getSocialIncidents(schoolId).catch((error) => {
    incidentsLoadFailed = true;
    if (loadError) {
      loadError.textContent = error.message || 'تعذر تحميل سجل المواقف اليومية.';
      loadError.style.display = 'block';
    }
    return [];
  });
  const [cases, students, notifications, incidents, profile] = await Promise.all([
    getDisciplinaryCases(schoolId),
    getStudents(schoolId),
    getNotifications('social_affairs', schoolId),
    incidentsPromise,
    getSchoolProfile(schoolId),
  ]);
  casesList = cases || [];
  allStudents = students || [];
  incidentsList = incidents || [];

  const badge = document.getElementById('soc-cases-badge');
  if (badge) badge.textContent = `${casesList.length} قرارات`;

  const escapeNotices = (notifications || []).filter((notice) => notice.category === 'attendance' && String(notice.title || '').includes('هروب'));
  const escapeCount = document.getElementById('soc-escape-count');
  const escapeContainer = document.getElementById('soc-escape-notices');
  if (escapeCount) escapeCount.textContent = `${escapeNotices.length} حالات`;
  if (escapeContainer) {
    escapeContainer.innerHTML = escapeNotices.length ? `
      <div class="table-wrap" style="border:none;">
        <table class="data-table"><thead><tr><th>التاريخ</th><th>الطالب</th><th>التنبيه</th></tr></thead>
          <tbody>${escapeNotices.map((notice) => `<tr><td>${escapeHtml(notice.date || '—')}</td><td><strong>${escapeHtml(notice.title.replace('تنبيه هروب مدرسي — ', ''))}</strong><div><code>${escapeHtml(notice.targetStudentCode || '—')}</code></div></td><td>${escapeHtml(notice.body || '')}</td></tr>`).join('')}</tbody>
        </table>
      </div>
    ` : '<p style="margin:0;color:var(--text-muted);">لا توجد تنبيهات هروب مسجلة.</p>';
  }

  const attendanceAlerts = (notifications || []).filter((notice) => notice.alertType === 'attendance_warning' && !notice.isResolved);
  const attendanceAlertsContainer = document.getElementById('soc-attendance-alerts');
  const attendanceAlertsCount = document.getElementById('soc-attendance-alert-count');
  if (attendanceAlertsCount) attendanceAlertsCount.textContent = `${attendanceAlerts.length} تنبيهات`;
  if (attendanceAlertsContainer) {
    attendanceAlertsContainer.innerHTML = attendanceAlerts.length ? `
      <div class="table-wrap" style="border:none;">
        <table class="data-table"><thead><tr><th>التاريخ</th><th>الطالب</th><th>مرحلة التنبيه</th><th>الغياب دون عذر</th><th>التنبيه</th></tr></thead>
          <tbody>${attendanceAlerts.map((notice) => `
            <tr>
              <td>${escapeHtml(notice.date || '—')}</td>
              <td><strong>${escapeHtml(notice.title.replace(/^(اقتراب من حد الغياب|بلوغ حد الغياب) — /, ''))}</strong><div><code>${escapeHtml(notice.targetStudentCode || '—')}</code></div></td>
              <td><span class="badge ${notice.attendanceStatus === 'reached' ? 'badge-danger' : 'badge-warning'}">${escapeHtml(getAttendanceStageLabel(notice.attendanceStage))}</span></td>
              <td>${Number(notice.absenceDays || 0)} يومًا / أطول تتابع ${Number(notice.consecutiveDays || 0)} أيام</td>
              <td>${escapeHtml(notice.body || '')}</td>
            </tr>`).join('')}</tbody>
        </table>
      </div>
    ` : '<p style="margin:0;color:var(--text-muted);">لا توجد تنبيهات غياب قريبة حاليًا.</p>';
  }

  const incidentStudentSelect = document.getElementById('soc-incident-student');
  if (incidentStudentSelect) {
    incidentStudentSelect.innerHTML = '<option value="">اختر الطالب</option>' + allStudents
      .filter((student) => student.code && student.name)
      .map((student) => `<option value="${escapeHtml(student.code)}" data-name="${escapeHtml(student.name)}" data-grade="${escapeHtml(getStudentAcademicPlacement(student).grade)}" data-class="${escapeHtml(getStudentAcademicPlacement(student).className)}">${escapeHtml(student.name)} (${escapeHtml(student.code)})</option>`)
      .join('');
  }
  const incidentDate = document.getElementById('soc-incident-date');
  if (incidentDate && !incidentDate.value) incidentDate.value = new Date().toISOString().slice(0, 10);
  const incidentsTbody = document.getElementById('soc-incidents-tbody');
  const incidentsEmpty = document.getElementById('soc-incidents-empty');
  const incidentsBadge = document.getElementById('soc-incidents-badge');
  if (incidentsBadge) incidentsBadge.textContent = `${incidentsList.length} مواقف`;
  if (incidentsTbody) incidentsTbody.innerHTML = incidentsList.map((incident) => `
    <tr>
      <td>${escapeHtml(incident.date || '—')}</td>
      <td><strong>${escapeHtml(incident.studentName || '—')}</strong><div><code>${escapeHtml(incident.studentCode || '—')}</code></div></td>
      <td>${escapeHtml(getIncidentTypeLabel(incident.incidentType))}</td>
      <td>${escapeHtml(getRegulationLabel(incident.regulation))}</td>
      <td style="white-space:pre-wrap;">${escapeHtml(incident.description || '—')}</td>
      <td>${escapeHtml(incident.recordedBy || '—')}</td>
    </tr>`).join('');
  if (incidentsEmpty) incidentsEmpty.style.display = incidentsList.length || incidentsLoadFailed ? 'none' : 'flex';

  const stuSelect = document.getElementById('soc-stu-select');
  const gradeSelect = document.getElementById('soc-grade-select');
  const classSelect = document.getElementById('soc-class-select');
  const yearSelect = document.getElementById('soc-year-select');

  if (stuSelect) {
    stuSelect.innerHTML = '<option value="">اختر الصف والفصل أولاً</option>';
  }

  if (gradeSelect) {
    const gradeValues = [...new Set(allStudents.map((student) => getStudentAcademicPlacement(student).grade).filter(Boolean))];
    gradeSelect.innerHTML = gradeValues.length
      ? '<option value="">اختر الصف</option>' + gradeValues.map((grade) => `<option value="${grade}">${grade}</option>`).join('')
      : '<option value="">لا توجد صفوف مسجلة</option>';
  }

  if (classSelect) {
    classSelect.innerHTML = '<option value="">اختر الصف أولاً</option>';
  }

  if (yearSelect) {
    const academicYear = profile.academicYear || '2026/2027';
    if (![...yearSelect.options].some((option) => option.value === academicYear)) {
      yearSelect.add(new Option(academicYear, academicYear));
    }
    yearSelect.value = academicYear;
  }

  renderCasesTable();
  bindStudentChainFilters();
}

function getSeverityLabel(level) {
  if (level === 'level_3') return 'جسيمة (المستوى 3)';
  if (level === 'level_2') return 'متوسطة (المستوى 2)';
  return 'بسيطة (المستوى 1)';
}

function getActionLabel(caseEntry) {
  const value = caseEntry?.actionType || caseEntry?.actionTaken || caseEntry?.type || '';
  const labels = {
    warning_first: 'إنذار كتابي أول مع إخطار ولي الأمر',
    warning_second: 'إنذار كتابي ثانٍ مع إخطار ولي الأمر',
    dismissal: 'قرار فصل للمراجعة والاعتماد',
    'إنذار كتابي أول مع إخطار ولي الأمر': 'إنذار كتابي أول مع إخطار ولي الأمر',
    'إنذار كتابي نهائي وتعهد ولي الأمر': 'إنذار كتابي ثانٍ مع إخطار ولي الأمر',
    suspension_3_days: 'فصل مؤقت لمدة 3 أيام',
    suspension_7_days: 'فصل مؤقت لمدة 7 أيام',
  };
  return labels[value] || value || 'إجراء انضباطي';
}

function getIncidentTypeLabel(type) {
  return ({
    late_to_assembly: 'تأخير عن الطابور',
    behavioral: 'موقف سلوكي',
    other: 'موقف آخر',
  })[type] || type || '—';
}

function getRegulationLabel(level) {
  return ({
    level_1: 'المستوى الأول',
    level_2: 'المستوى الثاني',
    level_3: 'المستوى الثالث',
    unclassified: 'يحتاج مراجعة',
  })[level] || level || '—';
}

function getAttendanceStageLabel(stage) {
  return ({
    warning_first: 'الإنذار الأول',
    warning_second: 'الإنذار الثاني',
    dismissal: 'قرار الفصل',
  })[stage] || 'متابعة الغياب';
}

function escapeHtml(value) {
  return String(value || '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[char]);
}

function renderCasesTable() {
  const tbody = document.getElementById('soc-cases-tbody');
  const emptyState = document.getElementById('soc-empty-state');
  if (!tbody) return;

  if (casesList.length === 0) {
    tbody.innerHTML = '';
    if (emptyState) emptyState.style.display = 'flex';
    return;
  }

  if (emptyState) emptyState.style.display = 'none';
  tbody.innerHTML = casesList.map((c, index) => `
    <tr>
      <td style="font-size: 11.5px; color: var(--text-muted); font-weight: 600;">${escapeHtml(c.date || c.createdAt || '—')}</td>
      <td><strong style="font-size: var(--text-xs); color: var(--color-primary-950);">${escapeHtml(c.studentName || 'غير محدد')}</strong><div style="font-size: 11px; color: var(--text-muted);">كود: <code>${escapeHtml(c.studentCode || '—')}</code></div></td>
      <td><span class="badge ${c.severityLevel === 'level_3' ? 'badge-danger' : 'badge-warning'}">${getSeverityLabel(c.severityLevel || c.level || 'level_1')}</span></td>
      <td style="font-weight: 700; font-size: var(--text-xs); color: var(--color-primary-900);">${escapeHtml(getActionLabel(c))}</td>
      <td style="font-size: var(--text-xs); color: var(--text-secondary);">السبب والملاحظات ضمن التفاصيل</td>
      <td style="text-align: center;"><button type="button" class="btn btn-sm btn-outline" data-case-details="${index}" aria-expanded="false">عرض التفاصيل</button></td>
      <td style="text-align: center;"><button type="button" class="btn btn-sm btn-outline" data-case-print="${index}">طباعة PDF</button></td>
      <td style="text-align: center;"><span class="badge badge-success">مسجل</span></td>
    </tr>
    <tr class="case-details-row" style="display: none;">
      <td colspan="8" style="white-space: pre-wrap; line-height: 1.8;">
        <strong>السبب والملاحظات:</strong> ${escapeHtml(c.reason || c.details || c.description || 'لا توجد ملاحظات إضافية.')}
        <br><strong>السنة الدراسية:</strong> ${escapeHtml(c.academicYear || c.schoolYear || '—')}
        <br><strong>الفصل:</strong> ${escapeHtml(c.className || c.classId || '—')}
        <br><strong>تاريخ القرار:</strong> ${escapeHtml(c.date || c.createdAt || '—')}
      </td>
    </tr>
  `).join('');

  tbody.querySelectorAll('[data-case-details]').forEach((button) => {
    button.addEventListener('click', () => {
      const detailsRow = button.closest('tr')?.nextElementSibling;
      if (!detailsRow) return;
      const isExpanded = button.getAttribute('aria-expanded') === 'true';
      detailsRow.style.display = isExpanded ? 'none' : 'table-row';
      button.setAttribute('aria-expanded', String(!isExpanded));
      button.textContent = isExpanded ? 'عرض التفاصيل' : 'إخفاء التفاصيل';
    });
  });
  tbody.querySelectorAll('[data-case-print]').forEach((button) => {
    button.addEventListener('click', async () => {
      const record = casesList[Number(button.dataset.casePrint)];
      if (!record) return;
      const label = getActionLabel(record);
      const contentHtml = `
        <table class="print-table">
          <tbody>
            <tr><th>اسم الطالب</th><td>${escapeHtml(record.studentName || '—')}</td></tr>
            <tr><th>كود الطالب</th><td>${escapeHtml(record.studentCode || '—')}</td></tr>
            <tr><th>الصف والفصل</th><td>${escapeHtml(record.grade || '—')} — ${escapeHtml(record.className || record.classId || '—')}</td></tr>
            <tr><th>السنة الدراسية</th><td>${escapeHtml(record.academicYear || '—')}</td></tr>
            <tr><th>نوع الإجراء</th><td>${escapeHtml(label)}</td></tr>
            <tr><th>تاريخ الإجراء</th><td>${escapeHtml(record.date || '—')}</td></tr>
            <tr><th>اسم ولي الأمر</th><td>${escapeHtml(record.parentName || '—')}</td></tr>
            <tr><th>السبب والوقائع</th><td>${escapeHtml(record.reason || '—')}</td></tr>
          </tbody>
        </table>`;
      await printHtmlAsPdf({
        title: label,
        subtitle: 'بيانات الطالب والإجراء المسجل في منظومة المدرسة',
        contentHtml,
        signatureTitle: 'مدير المدرسة',
        includeSeal: true,
      });
    });
  });
}

function bindStudentChainFilters() {
  const gradeSelect = document.getElementById('soc-grade-select');
  const classSelect = document.getElementById('soc-class-select');
  const stuSelect = document.getElementById('soc-stu-select');

  if (!gradeSelect || !classSelect || !stuSelect) return;

  const refreshStudentList = () => {
    const currentGrade = gradeSelect.value;
    const currentClass = classSelect.value;
    const matched = allStudents.filter((student) => {
      const placement = getStudentAcademicPlacement(student);
      const gradeMatches = Boolean(currentGrade) && placement.grade === currentGrade;
      const classMatches = Boolean(currentClass) && placement.className === currentClass;
      return gradeMatches && classMatches;
    });

    stuSelect.innerHTML = matched.length
      ? '<option value="">اختر الطالب</option>' + matched.map((student) => `<option value="${student.code}" data-name="${student.name}" data-parent="${student.parentInfo?.parentName || ''}">${student.name} (${student.code})</option>`).join('')
      : `<option value="">${currentGrade && currentClass ? 'لا يوجد طلاب مسجلون في هذا الصف والفصل' : 'اختر الصف والفصل أولاً'}</option>`;
  };

  gradeSelect.onchange = () => {
    const selectedGrade = gradeSelect.value;
    const classValues = [...new Set(allStudents.map((student) => {
      const placement = getStudentAcademicPlacement(student);
      return placement.grade === selectedGrade ? placement.className : '';
    }))].filter(Boolean);
    classSelect.innerHTML = classValues.length
      ? '<option value="">اختر الفصل</option>' + classValues.map((className) => `<option value="${className}">${className}</option>`).join('')
      : '<option value="">لا توجد فصول مسجلة</option>';
    refreshStudentList();
  };

  classSelect.onchange = refreshStudentList;
}

function bindSocialEvents(container) {
  const openBtn = document.getElementById('soc-open-warning-btn');
  const panel = document.getElementById('soc-warning-panel');
  const closeBtn = document.getElementById('soc-close-warning-btn');
  const form = document.getElementById('soc-warning-form');
  const incidentForm = document.getElementById('soc-incident-form');
  const currentUser = getCurrentUser();
  const schoolId = currentUser?.schoolId || DEFAULT_SCHOOL_ID;

  if (openBtn && panel) {
    openBtn.addEventListener('click', () => {
      panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
    });
  }
  if (closeBtn && panel) {
    closeBtn.addEventListener('click', () => { panel.style.display = 'none'; });
  }

  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const stuSelect = document.getElementById('soc-stu-select');
      const selectedStudent = stuSelect?.selectedOptions?.[0];
      const actionSelect = document.getElementById('soc-action');
      const selectedAction = actionSelect?.selectedOptions?.[0];
      const studentRecord = allStudents.find((student) => String(student.code) === String(stuSelect?.value));

      if (!stuSelect || !selectedStudent || !stuSelect.value || !selectedAction) {
        alert('يرجى اختيار الطالب المعني من السجل الرسمي أولاً.');
        return;
      }

      const submitButton = document.getElementById('soc-submit-warning-btn');
      if (submitButton) {
        submitButton.disabled = true;
        submitButton.textContent = 'جارٍ حفظ القرار وإخطار ولي الأمر...';
      }
      try {
        await issueDisciplinaryWarning({
          studentCode: stuSelect.value,
          studentName: selectedStudent.dataset.name || selectedStudent.textContent.trim(),
          grade: studentRecord ? getStudentAcademicPlacement(studentRecord).grade : '',
          className: studentRecord ? getStudentAcademicPlacement(studentRecord).className : '',
          parentName: studentRecord?.parentInfo?.parentName || '',
          parentPhone: studentRecord?.parentInfo?.phone || '',
          severityLevel: document.getElementById('soc-level').value,
          actionType: selectedAction.value,
          actionTaken: selectedAction.textContent.trim(),
          reason: document.getElementById('soc-reason').value.trim(),
          academicYear: document.getElementById('soc-year-select').value,
          specialistName: currentUser?.displayName || 'الأخصائي الاجتماعي',
          specialistRole: currentUser?.role || 'social_affairs',
        }, schoolId);
        form.reset();
        panel.style.display = 'none';
        alert('تم حفظ القرار وإرسال إشعار لولي الأمر داخل المنظومة. استخدم «طباعة PDF» لإخراج النسخة الورقية.');
        await loadSocialData();
      } catch (err) {
        alert(err.message || 'حدث خطأ أثناء إصدار القرار.');
      } finally {
        if (submitButton) {
          submitButton.disabled = false;
          submitButton.textContent = '⚠️ اعتماد وتوثيق القرار رسميًا';
        }
      }
    });
  }

  if (incidentForm) {
    incidentForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      const studentSelect = document.getElementById('soc-incident-student');
      const studentOption = studentSelect?.selectedOptions?.[0];
      const submitButton = document.getElementById('soc-submit-incident-btn');
      if (!studentSelect?.value || !studentOption) {
        alert('يرجى اختيار الطالب من السجل الرسمي.');
        return;
      }
      if (submitButton) {
        submitButton.disabled = true;
        submitButton.textContent = 'جارٍ حفظ الموقف...';
      }
      try {
        const typeSelect = document.getElementById('soc-incident-type');
        const regulationSelect = document.getElementById('soc-incident-regulation');
        await createSocialIncident({
          studentCode: studentSelect.value,
          studentName: studentOption.dataset.name,
          grade: studentOption.dataset.grade,
          className: studentOption.dataset.class,
          incidentType: typeSelect.value,
          date: document.getElementById('soc-incident-date').value,
          description: document.getElementById('soc-incident-description').value,
          regulation: regulationSelect.value,
          academicYear: document.getElementById('soc-year-select')?.value || '2026/2027',
          recordedBy: currentUser?.displayName || 'الأخصائي الاجتماعي',
          recordedByRole: currentUser?.role || 'social_affairs',
        }, schoolId);
        incidentForm.reset();
        document.getElementById('soc-incident-date').value = new Date().toISOString().slice(0, 10);
        await loadSocialData();
        alert('تم حفظ الموقف في سجل الخدمة الاجتماعية.');
      } catch (error) {
        alert(error.message || 'تعذر حفظ الموقف اليومي.');
      } finally {
        if (submitButton) {
          submitButton.disabled = false;
          submitButton.textContent = 'حفظ الموقف في السجل';
        }
      }
    });
  }
}

