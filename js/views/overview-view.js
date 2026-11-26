import { showConfirmModal, showToast } from '../components.js?v=11.0';
import { DEFAULT_SCHOOL_ID, getSchoolProfile, saveSchoolProfile } from '../services/school-service.js';
import { getTabletBatches, getTabletDevices } from '../services/tablet-service.js';
import { summarizeTabletDevices } from '../utils/tablet-metrics.js';
import { getAuditLogs } from '../services/audit-service.js';
import { getSchoolClasses, createSchoolClass } from '../services/academic-service.js';
import { getStudents } from '../services/student-service.js';
import { getWeeklyAttendanceTrends } from '../services/attendance-service.js';
import { getSubjectPerformanceAverages } from '../services/grade-service.js';
import { getGatePasses } from '../services/gate-pass-service.js';
import { compressMediaImage, uploadMediaImage } from '../services/cloudinary-service.js';
import {
  getSchoolApplications,
  approveSchoolApplication,
  rejectSchoolApplication,
} from '../services/account-service.js';
import { renderAttendanceAlerts } from './attendance-alerts-view.js';

const OVERVIEW_VIEW_MARKUP = String.raw`<div id="admin-attendance-alerts"></div>

          <!-- Page Header & Action Bar -->
          <div style="display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: var(--space-4);">
            <div style="display: flex; flex-direction: column; gap: var(--space-1);">
              <h1 style="font-size: var(--text-2xl); font-weight: 800; color: var(--color-primary-950);">
                لوحة الإشراف الإداري المركزية
              </h1>
              <p style="font-size: var(--text-sm); color: var(--text-muted);">
                مؤشرات الأداء الأكاديمي، سجلات القيد الفعلي، حصر التابلت، وإدارة محتوى المنظومة.
              </p>
            </div>
            <div style="display: flex; gap: var(--space-2); flex-wrap: wrap;">
              <button type="button" id="trigger-dismissal-btn" class="btn btn-warning btn-md" style="font-weight: 700;" title="فتح تبويب خطة الانصراف اليومي">
                🔔 خطة انصراف اليوم الدراسي
              </button>
            </div>
          </div>

          <div id="dismissal-success-alert" class="alert alert-success" style="display: none;">
            ✓ تم اعتماد وإشعار أولياء الأمور رسميًا بانتهاء اليوم الدراسي وتوثيقه في المنظومة.
          </div>

          <!-- Real Counters (Zero Fake Data) -->
          <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: var(--space-4);">
            <div class="panel">
              <div class="panel-body">
                <div style="font-size: var(--text-xs); color: var(--text-muted); font-weight: 600; margin-bottom: var(--space-2);">
                  أجهزة التابلت في المخزن
                </div>
                <div style="font-size: var(--text-3xl); font-weight: 800; color: var(--color-primary-950);" id="stat-tablets-count">
                  0
                </div>
                <div style="font-size: var(--text-xs); color: var(--text-muted); margin-top: var(--space-1);">
                  من واقع سجلات الـ IMEI الفعلية
                </div>
              </div>
            </div>

            <div class="panel">
              <div class="panel-body">
                <div style="font-size: var(--text-xs); color: var(--text-muted); font-weight: 600; margin-bottom: var(--space-2);">
                  دفعات الاستلام الوزارية
                </div>
                <div style="font-size: var(--text-3xl); font-weight: 800; color: var(--color-accent-700);" id="stat-batches-count">
                  0
                </div>
                <div style="font-size: var(--text-xs); color: var(--text-muted); margin-top: var(--space-1);">
                  دفعات استلام مسجلة
                </div>
              </div>
            </div>

            <div class="panel">
              <div class="panel-body">
                <div style="font-size: var(--text-xs); color: var(--text-muted); font-weight: 600; margin-bottom: var(--space-2);">
                  الأجهزة المسلمة رسميًا للطلاب
                </div>
                <div style="font-size: var(--text-3xl); font-weight: 800; color: var(--color-success-solid);" id="stat-delivered-count">
                  0
                </div>
                <div style="font-size: var(--text-xs); color: var(--text-muted); margin-top: var(--space-1);">
                  بمحاضر استلام موثقة
                </div>
              </div>
            </div>

            <div class="panel">
              <div class="panel-body">
                <div style="font-size: var(--text-xs); color: var(--text-muted); font-weight: 600; margin-bottom: var(--space-2);">
                  الطلاب المقيدين في المنظومة
                </div>
                <div style="font-size: var(--text-3xl); font-weight: 800; color: var(--color-primary-700);" id="stat-students-count">
                  0
                </div>
                <div style="font-size: var(--text-xs); color: var(--text-muted); margin-top: var(--space-1);">
                  ملفات قيد معتمدة
                </div>
              </div>
            </div>
          </div>

          <!-- Interactive Director Analytics Charts Grid -->
          <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(340px, 1fr)); gap: var(--space-4);">
            
            <!-- Chart Panel 1: Attendance Trends (SVG Bar Chart) -->
            <div class="panel">
              <div class="panel-header" style="display: flex; justify-content: space-between; align-items: center;">
                <div>
                  <h3 class="panel-title" style="margin: 0;">📊 مؤشر انتظام الحضور الأسبوعي</h3>
                  <p style="font-size: var(--text-xs); color: var(--text-muted); margin: 2px 0 0;">نسبة الحضور اليومية في الفصول المعتمدة</p>
                </div>
                <span class="badge badge-success" id="chart-avg-attendance-badge">—</span>
              </div>
              <div class="panel-body">
                <div id="attendance-chart-container" style="width: 100%; min-height: 180px;">
                  <!-- Rendered dynamically via SVG -->
                </div>
              </div>
            </div>

            <!-- Chart Panel 2: Tablet Distribution & Inventory Donut -->
            <div class="panel">
              <div class="panel-header" style="display: flex; justify-content: space-between; align-items: center;">
                <div>
                  <h3 class="panel-title" style="margin: 0;">📱 توزيع عهدة التابلت المدرسي</h3>
                  <p style="font-size: var(--text-xs); color: var(--text-muted); margin: 2px 0 0;">توزيع سجلات الأجهزة حسب الحالة الفعلية</p>
                </div>
                <span class="badge badge-accent" id="chart-tablet-pct-badge">—</span>
              </div>
              <div class="panel-body" style="display: flex; align-items: center; justify-content: space-around; flex-wrap: wrap; gap: var(--space-4);">
                <div id="tablet-donut-chart-container" style="width: 150px; height: 150px; position: relative; display: flex; align-items: center; justify-content: center;">
                  <!-- SVG Donut Chart -->
                </div>
                <div id="tablet-chart-legend" style="display: flex; flex-direction: column; gap: var(--space-2); font-size: var(--text-xs);">
                  <!-- Dynamic Legend -->
                </div>
              </div>
            </div>

            <!-- Chart Panel 3: Gate Pass & Security Exit Activity -->
            <div class="panel">
              <div class="panel-header" style="display: flex; justify-content: space-between; align-items: center;">
                <div>
                  <h3 class="panel-title" style="margin: 0;">🚪 حركة بوابة المدرسة والتصاريح</h3>
                  <p style="font-size: var(--text-xs); color: var(--text-muted); margin: 2px 0 0;">حصر أذونات الخروج الرسمية المعتمدة</p>
                </div>
                <a href="#gate-pass" class="btn btn-outline btn-sm" style="font-size: 11px;">إدارة البوابة ↗</a>
              </div>
              <div class="panel-body" id="gate-pass-chart-container">
                <!-- Dynamic progress bars -->
              </div>
            </div>

            <!-- Chart Panel 4: Academic Performance by Subject -->
            <div class="panel">
              <div class="panel-header" style="display: flex; justify-content: space-between; align-items: center;">
                <div>
                  <h3 class="panel-title" style="margin: 0;">🎓 متوسط التحصيل الأكاديمي للمواد</h3>
                  <p style="font-size: var(--text-xs); color: var(--text-muted); margin: 2px 0 0;">نتائج تقييمات شهر أكتوبر 2026</p>
                </div>
                <span class="badge badge-primary">الصف الأول الثانوي</span>
              </div>
              <div class="panel-body" id="subject-bars-chart-container">
                <!-- Dynamic subject progress bars -->
              </div>
            </div>

          </div>

          <!-- Audit Trail Activity Log -->
          <div class="panel">
            <div class="panel-header">
              <div>
                <h3 class="panel-title">سجل العمليات والرقابة الإدارية (Audit Trail)</h3>
                <p style="font-size: var(--text-xs); color: var(--text-muted); margin-top: 2px;">
                  توثيق فوري لكافة إجراءات قيد التابلت، ومحاضر التسليم، وتحديثات البيانات الرسمية.
                </p>
              </div>
              <span class="badge badge-accent">تتبع حي</span>
            </div>
            <div class="panel-body">
              <div id="audit-empty-state" class="empty-state" style="border: none; display: none;">
                <div class="empty-state-icon">📜</div>
                <h4 class="empty-state-title">لا توجد سجلات تشغيلية حتى الآن</h4>
                <p class="empty-state-desc">تظهر هنا تلقائيًا كافة العمليات الموثقة فور تنفيذها في المدرسة.</p>
              </div>
              <div class="table-wrap" id="audit-table-wrap">
                <table class="data-table">
                  <thead>
                    <tr>
                      <th>وقت العملية</th>
                      <th>نوع الإجراء</th>
                      <th>الهدف / البيان</th>
                      <th>تفاصيل السجل</th>
                      <th>المسؤول</th>
                    </tr>
                  </thead>
                  <tbody id="audit-logs-body">
                    <!-- Skeleton Loading Rows -->
                    <tr class="skeleton-row">
                      <td><div class="skeleton skeleton-text" style="width: 120px;"></div></td>
                      <td><div class="skeleton skeleton-badge" style="width: 70px;"></div></td>
                      <td><div class="skeleton skeleton-text" style="width: 150px;"></div></td>
                      <td><div class="skeleton skeleton-text" style="width: 180px;"></div></td>
                      <td><div class="skeleton skeleton-text" style="width: 90px;"></div></td>
                    </tr>
                    <tr class="skeleton-row">
                      <td><div class="skeleton skeleton-text" style="width: 120px;"></div></td>
                      <td><div class="skeleton skeleton-badge" style="width: 70px;"></div></td>
                      <td><div class="skeleton skeleton-text" style="width: 140px;"></div></td>
                      <td><div class="skeleton skeleton-text" style="width: 160px;"></div></td>
                      <td><div class="skeleton skeleton-text" style="width: 90px;"></div></td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <!-- Academic Classes & Sections Management -->
          <div class="panel">
            <div class="panel-header">
              <div>
                <h3 class="panel-title">الهيكل الأكاديمي والفصول الدراسية</h3>
                <p style="font-size: var(--text-xs); color: var(--text-muted); margin-top: 2px;">
                  إدارة المراحل التعليمية وتوزيع القاعات الدراسية.
                </p>
              </div>
              <button type="button" id="toggle-class-form-btn" class="btn btn-outline btn-sm">+ إضافة فصل دراسي</button>
            </div>
            <div class="panel-body">
              <div id="class-form-panel" style="display: none; padding: var(--space-4); background: var(--bg-surface-subtle); border: 1px solid var(--border-light); border-radius: var(--radius-sm); margin-bottom: var(--space-4);">
                <form id="new-class-form">
                  <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: var(--space-3);">
                    <div class="form-group">
                      <label class="form-label" for="cls-name">مسمى الفصل <span class="required">*</span></label>
                      <input type="text" id="cls-name" class="form-control" placeholder="مثال: فصل 1/3" required>
                    </div>
                    <div class="form-group">
                      <label class="form-label" for="cls-grade">المرحلة الدراسية <span class="required">*</span></label>
                      <select id="cls-grade" class="form-control">
                        <option value="الصف الأول الثانوي">الصف الأول الثانوي</option>
                        <option value="الصف الثاني الثانوي">الصف الثاني الثانوي</option>
                        <option value="الصف الثالث الثانوي">الصف الثالث الثانوي</option>
                      </select>
                    </div>
                    <div class="form-group">
                      <label class="form-label" for="cls-room">القاعة الدراسية</label>
                      <input type="text" id="cls-room" class="form-control" placeholder="مثال: قاعة 103">
                    </div>
                  </div>
                  <div style="display: flex; justify-content: flex-end; gap: var(--space-2); margin-top: var(--space-3);">
                    <button type="button" id="cancel-class-btn" class="btn btn-sm">إلغاء</button>
                    <button type="submit" class="btn btn-primary btn-sm">حفظ الفصل الدراسي</button>
                  </div>
                </form>
              </div>
              <div class="table-wrap">
                <table class="data-table">
                  <thead>
                    <tr>
                      <th>مسمى الفصل</th>
                      <th>المرحلة الأكاديمية</th>
                      <th>المقر / القاعة</th>
                      <th>الحالة</th>
                    </tr>
                  </thead>
                  <tbody id="classes-table-body">
                    <!-- Populated dynamically -->
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <div class="panel" id="platform-approval-panel" style="display:none;">
            <div class="panel-header">
              <div>
                <h3 class="panel-title">اعتمادات المدارس والمنصة العامة</h3>
                <p style="font-size:var(--text-xs);color:var(--text-muted);margin-top:2px;">مخصصة لمدير المنصة العام فقط.</p>
              </div>
              <button type="button" id="refresh-school-applications-btn" class="btn btn-outline btn-sm">تحديث الطلبات</button>
            </div>
            <div class="panel-body">
              <div id="school-applications-empty" class="empty-state" style="display:none;">
                <h4 class="empty-state-title">لا توجد طلبات مدارس حاليًا</h4>
              </div>
              <div id="school-applications-list" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:var(--space-3);"></div>
            </div>
          </div>

          <!-- School Profile Setup Panel (Allows entering the real school identity!) -->
          <div class="panel">
            <div class="panel-header">
              <div>
                <h3 class="panel-title">تكوين هوية وبيانات المدرسة الرسمية</h3>
                <p style="font-size: var(--text-xs); color: var(--text-muted); margin-top: 2px;">
                  البيانات التي تُدخل هنا تظهر فوراً في ترويسة الموقع العام وكافة المحاضر الرسمية.
                </p>
              </div>
              <span class="badge badge-primary">إعدادات الإدارة</span>
            </div>
            <div class="panel-body">
              <div id="profile-saved-alert" class="alert alert-success" style="display: none;">
                ✓ تم حفظ واعتماد بيانات المدرسة بنجاح وتحديث الموقع العام.
              </div>
              <div id="profile-error-alert" class="alert alert-danger" role="alert" style="display: none;"></div>

              <form id="school-profile-form">
                <!-- School Logo Customization Box -->
                <div style="background: var(--bg-surface-subtle); border: 1.5px dashed var(--border-default); border-radius: var(--radius-md); padding: var(--space-4); margin-bottom: var(--space-5); display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: var(--space-4);">
                  <div style="display: flex; align-items: center; gap: var(--space-4);">
                    <div id="prof-logo-preview" style="width: 72px; height: 72px; border-radius: var(--radius-md); background: var(--bg-surface); border: 2px solid var(--border-subtle); display: flex; align-items: center; justify-content: center; overflow: hidden; box-shadow: var(--shadow-xs); padding: 4px;">
                      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="color: var(--color-primary-600);">
                        <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1-2.5-2.5Z"></path>
                        <path d="M6 6h10"></path>
                        <path d="M6 10h10"></path>
                      </svg>
                    </div>
                    <div>
                      <div style="font-weight: 700; font-size: var(--text-sm); color: var(--text-primary); margin-bottom: 2px;">شعار المدرسة الرسمي المعتمد</div>
                      <div style="font-size: var(--text-xs); color: var(--text-muted);">يظهر فورياً مكان الشعار الافتراضي في الهيدر، الفوتر، لوحات التحكم، وقسم الهيرو.</div>
                    </div>
                  </div>

                  <div style="display: flex; gap: var(--space-2); align-items: center; flex-wrap: wrap;">
                    <input type="file" id="prof-logo-file" accept="image/png,image/jpeg,image/webp" style="display: none;">
                    <button type="button" class="btn btn-outline btn-sm" id="prof-logo-upload-btn">
                      📸 اختيار صورة الشعار
                    </button>
                    <button type="button" class="btn btn-outline btn-sm" id="prof-logo-clear-btn" style="display: none; color: var(--color-danger-text);">
                      ✕ إزالة الشعار
                    </button>
                    <input type="hidden" id="prof-logo-val" value="">
                  </div>
                </div>

                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: var(--space-4);">
                  <div class="form-group">
                    <label class="form-label" for="prof-name-ar">اسم المدرسة الرسمي (بالعربية) <span class="required">*</span></label>
                    <input type="text" id="prof-name-ar" class="form-control" placeholder="أدخل الاسم الرسمي المعتمد للمدرسة" required>
                  </div>

                  <div class="form-group">
                    <label class="form-label" for="prof-admin">الإدارة التعليمية التابعة لها <span class="required">*</span></label>
                    <input type="text" id="prof-admin" class="form-control" placeholder="مثال: إدارة النزهة التعليمية" required>
                  </div>

                  <div class="form-group">
                    <label class="form-label" for="prof-address">العنوان والمقر</label>
                    <input type="text" id="prof-address" class="form-control" placeholder="محافظة القاهرة — شارع...">
                  </div>

                  <div class="form-group">
                    <label class="form-label" for="prof-phone">رقم الهاتف الرسمي</label>
                    <input type="text" id="prof-phone" class="form-control" placeholder="+20 2 XXXXXXXX">
                  </div>

                  <div style="grid-column: 1 / -1; display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: var(--space-4); margin-top: var(--space-2);">
                    <div class="form-group">
                      <label class="form-label" for="prof-story">نبذة تعريفية وتاريخ المدرسة (About Story)</label>
                      <textarea id="prof-story" class="form-control" rows="3" placeholder="نبذة عن تاريخ تأسيس المدرسة ومسيرتها التعليمية..."></textarea>
                    </div>
                    <div class="form-group">
                      <label class="form-label" for="prof-vision">الرؤية المعتمدة (School Vision)</label>
                      <textarea id="prof-vision" class="form-control" rows="3" placeholder="رؤية المدرسة نحو التميز العلمي والتربوي..."></textarea>
                    </div>
                    <div class="form-group">
                      <label class="form-label" for="prof-mission">الرسالة التربوية (School Mission)</label>
                      <textarea id="prof-mission" class="form-control" rows="3" placeholder="رسالة المدرسة في إعداد جيل واعٍ ومبتكر..."></textarea>
                    </div>
                  </div>
                </div>

                <div style="display: flex; justify-content: flex-end; margin-top: var(--space-4);">
                  <button type="submit" class="btn btn-primary btn-md">حفظ واعتماد هوية المدرسة</button>
                </div>
              </form>
            </div>
          </div>`;

const DEFAULT_PREVIEW_SVG = '<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="color: var(--color-primary-600);"><path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1-2.5-2.5Z"></path><path d="M6 6h10"></path><path d="M6 10h10"></path></svg>';

function escapeHtml(value) {
  return String(value || '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[character]);
}

function setValue(container, id, value) {
  const field = container.querySelector(`#${id}`);
  if (field && value) field.value = value;
}

export async function renderOverviewView(container, { currentUser, schoolId } = {}) {
  if (!container) return;
  container.innerHTML = `<div class="overview-view" style="display:flex;flex-direction:column;gap:var(--space-5);">${OVERVIEW_VIEW_MARKUP}</div>`;

  const activeSchoolId = schoolId || currentUser?.schoolId || DEFAULT_SCHOOL_ID;
  const [devices, batches, students, profile] = await Promise.all([
    getTabletDevices(activeSchoolId),
    getTabletBatches(activeSchoolId),
    getStudents(activeSchoolId),
    getSchoolProfile(activeSchoolId),
  ]);
  const tabletCounts = summarizeTabletDevices(devices || []);
  const metrics = {
    'stat-tablets-count': tabletCounts.inventory,
    'stat-batches-count': (batches || []).length,
    'stat-delivered-count': tabletCounts.delivered,
    'stat-students-count': (students || []).length,
  };
  Object.entries(metrics).forEach(([id, value]) => {
    const element = container.querySelector(`#${id}`);
    if (element) element.textContent = String(value);
  });

  container.querySelector('#trigger-dismissal-btn')?.addEventListener('click', () => {
    window.location.hash = 'dismissals';
  });

  await Promise.all([
    renderOverviewCharts(container, tabletCounts, activeSchoolId),
    renderAttendanceAlerts(container.querySelector('#admin-attendance-alerts'), currentUser?.role),
    refreshOverviewAuditTrail(container, activeSchoolId),
    loadOverviewClasses(container, activeSchoolId),
    initializeSchoolProfile(container, activeSchoolId, profile),
    initializeSchoolApplications(container, currentUser),
  ]);
}

export async function refreshOverviewAuditTrail(container, schoolId) {
  const tbody = container?.querySelector('#audit-logs-body');
  const emptyState = container?.querySelector('#audit-empty-state');
  const tableWrap = container?.querySelector('#audit-table-wrap');
  if (!tbody) return;

  try {
    const logs = await getAuditLogs(schoolId);
    if (!logs?.length) {
      tbody.innerHTML = '';
      if (tableWrap) tableWrap.style.display = 'none';
      if (emptyState) emptyState.style.display = 'flex';
      return;
    }

    if (tableWrap) tableWrap.style.display = 'block';
    if (emptyState) emptyState.style.display = 'none';
    const roleBadgeClasses = {
      director: 'badge-primary',
      social_affairs: 'badge-warning',
      tech_specialist: 'badge-accent',
      student_affairs: 'badge-primary',
      teacher: 'badge-primary',
      student: 'badge-accent',
      parent: 'badge-accent',
      system: 'badge-default',
    };
    tbody.innerHTML = logs.slice(0, 8).map((log) => `
      <tr>
        <td style="font-size:11.5px;color:var(--text-muted);font-weight:600;">${escapeHtml(log.formattedDate || log.timestamp)}</td>
        <td><span class="badge ${roleBadgeClasses[log.operatorRole] || 'badge-default'}" style="font-size:10.5px;">${escapeHtml(log.action || 'إجراء')}</span></td>
        <td style="font-weight:700;font-size:var(--text-xs);color:var(--color-primary-950);">${escapeHtml(log.target || '—')}</td>
        <td style="font-size:var(--text-xs);color:var(--text-secondary);max-width:280px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml(log.details || '—')}</td>
        <td style="font-size:var(--text-xs);font-weight:700;">${escapeHtml(log.operatorName || 'مسؤول')}</td>
      </tr>
    `).join('');
  } catch (error) {
    console.warn('Overview audit trail notice:', error);
    if (emptyState) {
      emptyState.style.display = 'flex';
      emptyState.querySelector('.empty-state-desc').textContent = 'تعذر تحميل سجل العمليات. تحقق من الاتصال والصلاحيات ثم أعد المحاولة.';
    }
  }
}

async function renderOverviewCharts(container, tabletCounts, schoolId) {
  renderTabletDonutChart(container, tabletCounts);
  await Promise.all([
    renderAttendanceChart(container, schoolId),
    renderGatePassChart(container, schoolId),
    renderSubjectBarsChart(container, schoolId),
  ]);
}

async function renderAttendanceChart(container, schoolId) {
  const chart = container.querySelector('#attendance-chart-container');
  const badge = container.querySelector('#chart-avg-attendance-badge');
  if (!chart) return;
  try {
    const trends = await getWeeklyAttendanceTrends(schoolId);
    if (badge) badge.textContent = trends.hasRealData ? `متوسط: ${trends.averageRate}%` : 'بانتظار رصد الحضور';
    const days = trends.days;
    const barWidth = 38;
    const gap = 18;
    const chartHeight = 185;
    const chartWidth = days.length * (barWidth + gap);
    const usableHeight = 115;
    const bars = days.map((day, index) => {
      const rate = day.hasData ? day.rate : 0;
      const height = Math.max((rate / 100) * usableHeight, rate > 0 ? 8 : 4);
      const x = index * (barWidth + gap) + gap / 2;
      const y = chartHeight - 28 - height;
      const fill = rate >= 90 ? 'var(--color-primary-600, #2563eb)' : (rate >= 75 ? '#3b82f6' : '#94a3b8');
      return `
        <rect x="${x}" y="${y}" width="${barWidth}" height="${height}" rx="5" fill="${fill}" opacity="0.88"/>
        <text x="${x + barWidth / 2}" y="${y - 8}" text-anchor="middle" fill="var(--text-primary)" font-size="11.5" font-weight="700">${rate > 0 ? `${rate}%` : '—'}</text>
        <text x="${x + barWidth / 2}" y="${chartHeight - 8}" text-anchor="middle" fill="var(--text-muted)" font-size="11.5" font-weight="600">${escapeHtml(day.day)}</text>
      `;
    }).join('');
    chart.innerHTML = `<svg viewBox="0 0 ${chartWidth} ${chartHeight}" width="100%" height="${chartHeight}" style="direction:ltr;overflow:visible;">${bars}</svg>`;
  } catch (error) {
    console.warn('Attendance chart error:', error);
    chart.textContent = 'تعذر تحميل بيانات الحضور.';
  }
}

function renderTabletDonutChart(container, tabletCounts) {
  const chart = container.querySelector('#tablet-donut-chart-container');
  const legend = container.querySelector('#tablet-chart-legend');
  const badge = container.querySelector('#chart-tablet-pct-badge');
  if (!chart) return;
  const { total, delivered, inventory, maintenance, unclassified } = tabletCounts;
  if (!total) {
    chart.innerHTML = '<div style="text-align:center;color:var(--text-muted);font-size:var(--text-xs);padding:var(--space-6);">لا توجد أجهزة مسجلة بعد</div>';
    if (legend) legend.innerHTML = '';
    if (badge) badge.textContent = '—';
    return;
  }

  if (badge) badge.textContent = `${Math.round((delivered / total) * 100)}% مسلّم`;
  const radius = 54;
  const circumference = 2 * Math.PI * radius;
  let arcOffset = 0;
  const arcs = [
    { count: delivered, color: '#10b981' },
    { count: inventory, color: 'var(--border-subtle)' },
    { count: maintenance, color: '#f59e0b' },
    { count: unclassified, color: '#f87171' },
  ].filter((segment) => segment.count > 0).map((segment) => {
    const arcLength = (segment.count / total) * circumference;
    const offset = arcOffset;
    arcOffset += arcLength;
    return `<circle cx="70" cy="70" r="${radius}" fill="none" stroke="${segment.color}" stroke-width="14" stroke-dasharray="${arcLength} ${circumference - arcLength}" stroke-dashoffset="${-offset}"/>`;
  }).join('');
  chart.innerHTML = `
    <svg viewBox="0 0 140 140" width="140" height="140" style="transform:rotate(-90deg);">
      <circle cx="70" cy="70" r="${radius}" fill="none" stroke="var(--border-subtle)" stroke-width="14"/>
      ${arcs}
    </svg>
    <div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;flex-direction:column;">
      <span style="font-size:var(--text-2xl);font-weight:800;color:var(--color-primary-950);">${total}</span>
      <span style="font-size:10px;color:var(--text-muted);">إجمالي</span>
    </div>
  `;
  if (legend) {
    legend.innerHTML = `
      <div style="display:flex;align-items:center;gap:6px;"><span style="width:10px;height:10px;border-radius:50%;background:#10b981;"></span><span>مسلّم: ${delivered}</span></div>
      <div style="display:flex;align-items:center;gap:6px;"><span style="width:10px;height:10px;border-radius:50%;background:var(--border-subtle);"></span><span>في المخزن: ${inventory}</span></div>
      <div style="display:flex;align-items:center;gap:6px;"><span style="width:10px;height:10px;border-radius:50%;background:#f59e0b;"></span><span>في الصيانة: ${maintenance}</span></div>
      <div style="display:flex;align-items:center;gap:6px;"><span style="width:10px;height:10px;border-radius:50%;background:#f87171;"></span><span>حالة غير محددة: ${unclassified}</span></div>
    `;
  }
}

async function renderGatePassChart(container, schoolId) {
  const chart = container.querySelector('#gate-pass-chart-container');
  if (!chart) return;
  try {
    const passes = (await getGatePasses(schoolId)) || [];
    const counts = {
      approved: passes.filter((pass) => ['approved', 'used'].includes(pass.status)).length,
      pending: passes.filter((pass) => pass.status === 'pending').length,
      rejected: passes.filter((pass) => pass.status === 'rejected').length,
    };
    const maxCount = Math.max(...Object.values(counts), 1);
    chart.innerHTML = [
      { label: 'أذونات معتمدة ومؤكدة', value: counts.approved, color: '#10b981' },
      { label: 'طلبات قيد المراجعة', value: counts.pending, color: '#f59e0b' },
      { label: 'أذونات ملغاة / مرفوضة', value: counts.rejected, color: '#ef4444' },
    ].map((item) => `
      <div style="display:flex;align-items:center;gap:var(--space-3);margin-bottom:var(--space-3);">
        <span style="min-width:140px;font-size:var(--text-xs);color:var(--text-muted);font-weight:600;">${item.label}</span>
        <div style="flex:1;height:22px;background:var(--bg-surface-subtle);border-radius:var(--radius-sm);overflow:hidden;position:relative;">
          <div style="height:100%;width:${item.value ? Math.max((item.value / maxCount) * 100, 8) : 0}%;background:${item.color};border-radius:var(--radius-sm);transition:width .4s;"></div>
        </div>
        <span style="min-width:32px;text-align:center;font-weight:800;font-size:var(--text-sm);color:var(--color-primary-950);">${item.value}</span>
      </div>
    `).join('') || '<p>لا توجد أذونات خروج مسجلة حتى الآن</p>';
    if (!passes.length) chart.insertAdjacentHTML('beforeend', '<div style="text-align:center;padding:var(--space-2);font-size:var(--text-xs);color:var(--text-muted);">لا توجد أذونات خروج مسجلة حتى الآن</div>');
  } catch (error) {
    console.warn('Gate pass chart error:', error);
    chart.textContent = 'تعذر تحميل بيانات تصاريح الخروج.';
  }
}

async function renderSubjectBarsChart(container, schoolId) {
  const chart = container.querySelector('#subject-bars-chart-container');
  if (!chart) return;
  try {
    const averages = (await getSubjectPerformanceAverages(schoolId)) || [];
    if (!averages.length) {
      chart.textContent = 'لم يتم تسجيل نتائج تقييمات بعد — ستظهر هنا تلقائياً عند إدخال الدرجات من بوابة المعلم.';
      return;
    }
    chart.innerHTML = averages.slice(0, 5).map((item) => `
      <div style="margin-bottom:var(--space-3);">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;font-size:var(--text-xs);">
          <strong style="color:var(--color-primary-950);">${escapeHtml(item.subject)}</strong>
          <span style="font-weight:800;color:${escapeHtml(item.color)};">${escapeHtml(item.percentage)}%</span>
        </div>
        <div style="height:8px;background:var(--bg-surface-subtle);border-radius:99px;overflow:hidden;">
          <div style="height:100%;width:${Math.max(0, Math.min(Number(item.percentage) || 0, 100))}%;background:${escapeHtml(item.color)};border-radius:99px;transition:width .5s;"></div>
        </div>
      </div>
    `).join('');
  } catch (error) {
    console.warn('Subject bars error:', error);
    chart.textContent = 'تعذر تحميل متوسطات التحصيل الدراسي.';
  }
}

async function loadOverviewClasses(container, schoolId) {
  const tbody = container.querySelector('#classes-table-body');
  if (!tbody) return;
  try {
    const classes = await getSchoolClasses(schoolId);
    if (!classes?.length) {
      tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;padding:20px;color:var(--text-muted);">لا توجد فصول دراسية مسجلة بعد</td></tr>';
    } else {
      tbody.innerHTML = classes.map((item) => `
        <tr>
          <td style="font-weight:700;font-size:var(--text-xs);color:var(--color-primary-950);">${escapeHtml(item.name)}</td>
          <td style="font-size:var(--text-xs);">${escapeHtml(item.grade || 'المرحلة الثانوية')}</td>
          <td style="font-size:var(--text-xs);color:var(--text-muted);">${escapeHtml(item.room || 'قاعة دراسية')}</td>
          <td><span class="badge badge-success" style="font-size:10.5px;">نشط ومعتمد</span></td>
        </tr>
      `).join('');
    }
  } catch (error) {
    console.warn('Overview classes notice:', error);
    tbody.innerHTML = '<tr><td colspan="4" role="status">تعذر تحميل الفصول الدراسية.</td></tr>';
  }

  const form = container.querySelector('#new-class-form');
  if (!form || form.dataset.initialized) return;
  form.dataset.initialized = 'true';
  const formPanel = container.querySelector('#class-form-panel');
  container.querySelector('#toggle-class-form-btn')?.addEventListener('click', () => {
    if (formPanel) formPanel.style.display = 'block';
  });
  container.querySelector('#cancel-class-btn')?.addEventListener('click', () => {
    if (formPanel) formPanel.style.display = 'none';
  });
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const name = container.querySelector('#cls-name').value.trim();
    const grade = container.querySelector('#cls-grade').value;
    const room = container.querySelector('#cls-room').value.trim();
    if (!name) return;
    try {
      await createSchoolClass({ name, grade, room }, schoolId);
      form.reset();
      if (formPanel) formPanel.style.display = 'none';
      await loadOverviewClasses(container, schoolId);
      await refreshOverviewAuditTrail(container, schoolId);
    } catch (error) {
      showToast(`خطأ أثناء حفظ الفصل: ${error.message}`, 'error');
    }
  });
}

async function initializeSchoolProfile(container, schoolId, profile) {
  const form = container.querySelector('#school-profile-form');
  if (!form) return;
  setValue(container, 'prof-name-ar', profile?.nameAr);
  setValue(container, 'prof-admin', profile?.administration);
  setValue(container, 'prof-address', profile?.address);
  setValue(container, 'prof-phone', profile?.phone);
  setValue(container, 'prof-story', profile?.aboutStory);
  setValue(container, 'prof-vision', profile?.vision);
  setValue(container, 'prof-mission', profile?.mission);

  const logoFile = container.querySelector('#prof-logo-file');
  const logoUploadBtn = container.querySelector('#prof-logo-upload-btn');
  const logoClearBtn = container.querySelector('#prof-logo-clear-btn');
  const logoVal = container.querySelector('#prof-logo-val');
  const logoPreview = container.querySelector('#prof-logo-preview');
  const setLogoPreview = (url) => {
    if (url) {
      logoPreview.innerHTML = `<img src="${escapeHtml(url)}" alt="شعار المدرسة" style="width:100%;height:100%;object-fit:contain;border-radius:inherit;">`;
      logoVal.value = url;
      logoClearBtn.style.display = 'inline-flex';
    } else {
      logoPreview.innerHTML = DEFAULT_PREVIEW_SVG;
      logoVal.value = '';
      logoClearBtn.style.display = 'none';
    }
  };
  setLogoPreview(profile?.branding?.logoUrl || '');
  logoUploadBtn.addEventListener('click', () => logoFile.click());
  logoFile.addEventListener('change', async () => {
    const file = logoFile.files[0];
    if (!file) return;
    const previousLogo = logoVal.value;
    logoUploadBtn.disabled = true;
    logoUploadBtn.textContent = 'جارٍ تجهيز الشعار...';
    try {
      const compressedFile = await compressMediaImage(file, 800, 0.84);
      const uploaded = await uploadMediaImage(compressedFile, {
        schoolId,
        assetType: 'branding',
        onStatus: (status) => { logoUploadBtn.textContent = status; },
        onProgress: (progress) => { logoUploadBtn.textContent = `جارٍ رفع الشعار ${progress}%`; },
      });
      setLogoPreview(uploaded.secureUrl);
    } catch (error) {
      logoFile.value = '';
      setLogoPreview(previousLogo);
      showToast(error.message || 'تعذر رفع شعار المدرسة.', 'error');
    } finally {
      logoUploadBtn.disabled = false;
      logoUploadBtn.textContent = logoVal.value ? '✓ تم رفع الشعار' : '📸 اختيار صورة الشعار';
    }
  });
  logoClearBtn.addEventListener('click', () => {
    logoFile.value = '';
    setLogoPreview('');
  });
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const submitButton = form.querySelector('[type="submit"]');
    const savedAlert = container.querySelector('#profile-saved-alert');
    const errorAlert = container.querySelector('#profile-error-alert');
    savedAlert.style.display = 'none';
    errorAlert.style.display = 'none';
    if (logoVal.value.startsWith('data:')) {
      errorAlert.textContent = 'الشعار الحالي محفوظ بصيغة قديمة. ارفعه من جديد قبل حفظ البيانات حتى يُخزن بأمان في خدمة الصور.';
      errorAlert.style.display = 'flex';
      return;
    }
    submitButton.disabled = true;
    try {
      await saveSchoolProfile({
        nameAr: container.querySelector('#prof-name-ar').value.trim(),
        administration: container.querySelector('#prof-admin').value.trim(),
        address: container.querySelector('#prof-address').value.trim(),
        phone: container.querySelector('#prof-phone').value.trim(),
        aboutStory: container.querySelector('#prof-story').value.trim(),
        vision: container.querySelector('#prof-vision').value.trim(),
        mission: container.querySelector('#prof-mission').value.trim(),
        branding: { ...(profile?.branding || {}), logoUrl: logoVal.value.trim() },
      }, schoolId);
      savedAlert.style.display = 'flex';
      await refreshOverviewAuditTrail(container, schoolId);
      setTimeout(() => { savedAlert.style.display = 'none'; }, 3000);
    } catch (error) {
      errorAlert.textContent = error.message || 'تعذر حفظ بيانات المدرسة.';
      errorAlert.style.display = 'flex';
    } finally {
      submitButton.disabled = false;
    }
  });
}

async function initializeSchoolApplications(container, currentUser) {
  const panel = container.querySelector('#platform-approval-panel');
  if (currentUser?.role !== 'super_admin' || !panel) return;
  panel.style.display = 'block';
  const list = container.querySelector('#school-applications-list');
  const empty = container.querySelector('#school-applications-empty');
  const loadApplications = async () => {
    try {
      const applications = await getSchoolApplications();
      const pending = applications.filter((application) => application.status === 'pending');
      if (empty) empty.style.display = pending.length ? 'none' : 'block';
      list.innerHTML = pending.map((application) => `
        <article style="padding:var(--space-4);border:1px solid var(--border-subtle);border-radius:var(--radius-md);background:var(--bg-page);">
          <h4 style="margin:0 0 var(--space-2);">${escapeHtml(application.schoolNameAr)}</h4>
          <div style="font-size:var(--text-xs);color:var(--text-muted);line-height:1.8;">
            <div>الرابط المقترح: <strong>/${escapeHtml(application.schoolSlug)}</strong></div>
            <div>مقدم الطلب: ${escapeHtml(application.applicantName)}</div>
            <div>الدور: ${application.applicantRole === 'director' ? 'مدير المدرسة' : 'أخصائي التطوير التكنولوجي'}</div>
            <div>البريد: ${escapeHtml(application.applicantEmail)} — ${application.applicantEmailVerified ? 'موثق' : 'يُتحقق منه بعد الاعتماد'}</div>
            <div>الطرف الثاني (${application.counterpartRole === 'director' ? 'مدير المدرسة' : 'أخصائي التطوير التكنولوجي'}): ${escapeHtml(application.counterpartName)} — ${escapeHtml(application.counterpartEmail)}</div>
          </div>
          <div style="display:flex;gap:var(--space-2);margin-top:var(--space-3);">
            <button type="button" class="btn btn-primary btn-sm" data-approve-school="${escapeHtml(application.id)}">اعتماد وإنشاء الرابطين</button>
            <button type="button" class="btn btn-outline btn-sm" data-reject-school="${escapeHtml(application.id)}">رفض الطلب</button>
          </div>
        </article>
      `).join('');
    } catch (error) {
      showToast(error.message || 'تعذر تحميل طلبات المدارس.', 'error');
    }
  };
  const modal = ensureInvitationModal();
  modal.querySelector('#close-school-invitation-links').addEventListener('click', () => {
    modal.style.display = 'none';
  });
  modal.querySelector('#school-invitation-links-list').addEventListener('click', async (event) => {
    const button = event.target.closest('[data-copy-school-invitation]');
    if (!button) return;
    const card = button.closest('[data-invitation-link-card]');
    const input = card.querySelector('input');
    const status = card.querySelector('[role="status"]');
    try {
      await navigator.clipboard.writeText(input.value);
      status.textContent = 'تم النسخ';
    } catch {
      input.focus();
      input.select();
      status.textContent = 'انسخ الرابط المحدد يدويًا';
    }
  });
  container.querySelector('#refresh-school-applications-btn')?.addEventListener('click', loadApplications);
  list?.addEventListener('click', async (event) => {
    const approveButton = event.target.closest('[data-approve-school]');
    const rejectButton = event.target.closest('[data-reject-school]');
    if (approveButton) {
      const approved = await showConfirmModal({
        title: 'اعتماد المدرسة؟',
        message: 'سيتم إنشاء ملف المدرسة وروابط تفعيل المدير وأخصائي التطوير. ستحتاج إلى إرسال كل رابط يدويًا لصاحبه.',
        confirmText: 'اعتماد',
        cancelText: 'إلغاء',
      });
      if (!approved) return;
      try {
        const result = await approveSchoolApplication(approveButton.dataset.approveSchool);
        showToast(`تم اعتماد المدرسة: /${result.schoolId}/ وإنشاء روابط التفعيل.`, 'success');
        const modalList = modal.querySelector('#school-invitation-links-list');
        modalList.innerHTML = (result.invitations || []).map((invitation) => `
          <article class="panel" data-invitation-link-card>
            <div class="panel-body">
              <strong>${invitation.role === 'director' ? 'مدير المدرسة' : 'أخصائي التطوير التكنولوجي'}</strong>
              <div style="font-size:var(--text-sm);color:var(--text-muted);margin:4px 0 8px;">${escapeHtml(invitation.email)}</div>
              <input class="form-control" type="url" readonly aria-label="رابط تفعيل ${escapeHtml(invitation.email)}" value="${escapeHtml(invitation.invitationLink)}">
              <button type="button" class="btn btn-outline btn-sm" data-copy-school-invitation style="margin-top:8px;">نسخ رابط هذا الحساب</button>
              <span role="status" style="margin-inline-start:8px;"></span>
            </div>
          </article>
        `).join('');
        modal.style.display = 'grid';
        await loadApplications();
      } catch (error) {
        showToast(error.message || 'تعذر اعتماد المدرسة.', 'error');
      }
    }
    if (rejectButton) {
      const reason = window.prompt('سبب رفض الطلب (اختياري):', '');
      if (reason === null) return;
      if ((reason.trim().length > 0 && reason.trim().length < 2) || reason.trim().length > 500) {
        showToast('اترك سبب الرفض فارغًا أو اكتب سببًا من حرفين إلى 500 حرف.', 'error');
        return;
      }
      try {
        await rejectSchoolApplication(rejectButton.dataset.rejectSchool, reason.trim());
        showToast('تم رفض طلب المدرسة.', 'success');
        await loadApplications();
      } catch (error) {
        showToast(error.message || 'تعذر رفض الطلب.', 'error');
      }
    }
  });
  await loadApplications();
}

function ensureInvitationModal() {
  let modal = document.getElementById('school-invitation-links-modal');
  if (modal) return modal;
  document.body.insertAdjacentHTML('beforeend', `
    <div id="school-invitation-links-modal" role="dialog" aria-modal="true" aria-labelledby="school-invitation-links-title" style="display:none;position:fixed;inset:0;z-index:11000;background:rgba(2,6,23,.78);place-items:center;padding:24px;overflow:auto;">
      <section class="panel" style="width:min(720px,100%);max-height:90vh;overflow:auto;">
        <div class="panel-header" style="display:flex;justify-content:space-between;align-items:center;gap:12px;">
          <h2 id="school-invitation-links-title" class="panel-title">روابط تفعيل الحسابات</h2>
          <button id="close-school-invitation-links" type="button" class="btn btn-outline btn-sm">إغلاق</button>
        </div>
        <div class="panel-body">
          <p style="color:var(--text-muted);line-height:1.8;">انسخ كل رابط وأرسله يدويًا إلى البريد المعروض فقط. الرابط سري ويحتوي رمز دخول أحادي الاستخدام؛ لا تشاركه في مجموعة أو مع شخص آخر.</p>
          <div id="school-invitation-links-list" style="display:grid;gap:12px;"></div>
        </div>
      </section>
    </div>
  `);
  return document.getElementById('school-invitation-links-modal');
}
