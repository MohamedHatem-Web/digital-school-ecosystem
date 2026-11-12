// ==========================================================================
// DIGITAL SCHOOL ECOSYSTEM (VANILLA EDITION)
// SPA View Module: Student Affairs & Official Governmental Registry (سجل 31)
// ==========================================================================

import {
  getStudents,
  createStudent,
  updateStudent,
  deleteStudent,
  bulkImportStudents,
  extractStudentDetailsFromNID,
} from '../services/student-service.js';
import {
  printEnrollmentCertificate,
  printStudentIdCard,
  printHonorCertificate,
  printAbsenceWarningLetter,
  exportStudentsToCsv,
  printOfficialStudentsRegister,
  exportToCsv,
} from '../utils/export-utils.js';
import { showToast, showConfirmModal } from '../components.js';

let isInitialized = false;
let studentList = [];
let editingStudentCode = null;

export async function renderStudentsView(container) {
  if (!isInitialized) {
    container.innerHTML = `
      <div style="display: flex; flex-direction: column; gap: var(--space-5);">
        <!-- Page Title & Actions -->
        <div style="display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: var(--space-3);">
          <div>
            <h1 style="font-size: var(--text-2xl); font-weight: 800; color: var(--color-primary-950); margin-bottom: 2px;">
              🎓 شؤون الطلاب وسجلات القيد الرسمية
            </h1>
            <p style="font-size: var(--text-sm); color: var(--text-muted); margin: 0;">
              إدارة ملفات الطلاب، الأكواد الموحدة لوزارة التربية والتعليم، السن في 1 أكتوبر، دفاتر القيد (سجل 31)، وإفادات القيد.
            </p>
          </div>
          <div style="display: flex; gap: var(--space-2); flex-wrap: wrap;">
            <button type="button" id="stu-print-register-btn" class="btn btn-outline btn-sm" title="طباعة دفتر 31 شؤون طلاب الرسمي">
              🖨️ طباعة دفتر القيد (سجل 31)
            </button>
            <button type="button" id="stu-export-csv-btn" class="btn btn-outline btn-sm" title="تصدير كشف إكسيل كامل">
              📥 تصدير السجل (Excel)
            </button>
            <button type="button" id="stu-toggle-import-btn" class="btn btn-outline btn-sm" title="استيراد كشف مجمع من إكسيل">
              📤 استيراد كشف طلاب (Excel)
            </button>
            <button type="button" id="stu-toggle-reg-btn" class="btn btn-primary btn-sm" style="font-weight: 700;">
              + تسجيل قيد طالب جديد
            </button>
          </div>
        </div>

        <!-- Bulk Import Panel (Collapsible) -->
        <div class="panel" id="stu-import-panel" style="display: none; border-inline-start: 4px solid var(--color-accent-700);">
          <div class="panel-header" style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: var(--space-2);">
            <div>
              <h3 class="panel-title" style="margin: 0;">استيراد كشف قيد طلاب مجمع (Excel / CSV)</h3>
              <p style="font-size: var(--text-xs); color: var(--text-muted); margin: 2px 0 0;">
                يمكنك رفع ملف كشف المدرسة لاستيراد وقيد الطلاب دفعة واحدة في ثوانٍ.
              </p>
            </div>
            <div style="display: flex; gap: var(--space-2);">
              <button type="button" id="download-template-btn" class="btn btn-sm btn-outline">
                📄 تحميل نموذج الكشف الفارغ (Template)
              </button>
              <button type="button" class="btn btn-sm" id="stu-close-import-btn">✕ إغلاق</button>
            </div>
          </div>
          <div class="panel-body">
            <div style="display: flex; flex-direction: column; gap: var(--space-3);">
              <div style="border: 2px dashed var(--border-light); padding: var(--space-6); text-align: center; border-radius: var(--radius-md); background: var(--bg-surface-subtle);">
                <input type="file" id="stu-csv-file-input" accept=".csv,text/csv" style="display: none;">
                <div style="font-size: 2rem; margin-bottom: var(--space-2);">📊</div>
                <h4 style="margin: 0 0 var(--space-1); font-size: var(--text-sm); font-weight: 700;">اختر ملف CSV الخاص بكشف الطلاب</h4>
                <p style="color: var(--text-muted); font-size: var(--text-xs); margin-bottom: var(--space-3);">
                  الملف يجب أن يحتوي على أعمدة: كود الطالب، الاسم، الرقم القومي، الفصل، ولي الأمر، الهاتف
                </p>
                <button type="button" id="browse-csv-btn" class="btn btn-primary btn-sm">
                  اختيار الملف من جهازك 📁
                </button>
              </div>
              <div id="import-preview-box" style="display: none; padding: var(--space-3); background: rgba(16, 185, 129, 0.08); border: 1px solid rgba(16, 185, 129, 0.3); border-radius: var(--radius-sm);">
                <div style="display: flex; justify-content: space-between; align-items: center; font-size: var(--text-xs); font-weight: 700;">
                  <span id="import-preview-text">تمت قراءة 0 طالب جاهزين للقيد</span>
                  <button type="button" id="confirm-bulk-import-btn" class="btn btn-primary btn-sm">
                    تأكيد وقيد الطلاب في السجلات الآن ✓
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Add / Edit Student Panel (Collapsible) -->
        <div class="panel" id="stu-reg-panel" style="display: none; border-inline-start: 4px solid var(--color-primary-800);">
          <div class="panel-header" style="display: flex; justify-content: space-between; align-items: center;">
            <h3 class="panel-title" id="stu-panel-form-title" style="margin: 0;">تسجيل ملف قيد طالب رسمي جديد</h3>
            <button type="button" class="btn btn-sm" id="stu-close-reg-btn">✕ إغلاق</button>
          </div>
          <div class="panel-body">
            <form id="stu-new-form">
              <!-- القسم الأول: بيانات الطالب الأساسية والحكومية -->
              <h4 style="font-size: var(--text-sm); font-weight: 800; color: var(--color-primary-950); margin-bottom: var(--space-3); border-bottom: 1px solid var(--border-light); padding-bottom: 4px;">
                📋 أولاً: البيانات الشخصية للطالب (حسب شهادة الميلاد والرقم القومي)
              </h4>
              <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: var(--space-3); margin-bottom: var(--space-4);">
                <div class="form-group">
                  <label class="form-label" for="new-stu-name">الاسم الرباعي للطالب *</label>
                  <input type="text" id="new-stu-name" class="form-control" required placeholder="مثال: يوسف أحمد محمود المنشاوي">
                </div>
                <div class="form-group">
                  <label class="form-label" for="new-stu-code">كود الطالب بالوزارة (يدوي رسمي) *</label>
                  <input type="text" id="new-stu-code" class="form-control" required maxlength="12" placeholder="الكود المعتمد من وزارة التربية والتعليم">
                </div>
                <div class="form-group">
                  <label class="form-label" for="new-stu-nid">الرقم القومي للطالب (14 رقم) *</label>
                  <input type="text" id="new-stu-nid" class="form-control" required maxlength="14" placeholder="14 رقم لاستخراج السن والميلاد تلقائياً">
                </div>
                <div class="form-group">
                  <label class="form-label" for="new-stu-birthdate">تاريخ الميلاد</label>
                  <input type="date" id="new-stu-birthdate" class="form-control">
                </div>
                <div class="form-group">
                  <label class="form-label" for="new-stu-age-oct1">السن في 1 أكتوبر</label>
                  <input type="text" id="new-stu-age-oct1" class="form-control" placeholder="يُحسب آلياً من الرقم القومي">
                </div>
                <div class="form-group">
                  <label class="form-label" for="new-stu-gender">النوع</label>
                  <select id="new-stu-gender" class="form-control">
                    <option value="ذكر">ذكر</option>
                    <option value="أنثى">أنثى</option>
                  </select>
                </div>
                <div class="form-group">
                  <label class="form-label" for="new-stu-religion">الديانة</label>
                  <select id="new-stu-religion" class="form-control">
                    <option value="مسلم">مسلم</option>
                    <option value="مسيحي">مسيحي</option>
                  </select>
                </div>
                <div class="form-group">
                  <label class="form-label" for="new-stu-grade">المرحلة والفصل *</label>
                  <select id="new-stu-grade" class="form-control" required>
                    <option value="الصف الأول الثانوي — فصل 1/1">الصف الأول الثانوي — فصل 1/1</option>
                    <option value="الصف الأول الثانوي — فصل 1/2">الصف الأول الثانوي — فصل 1/2</option>
                    <option value="الصف الثاني الثانوي — علمي">الصف الثاني الثانوي — علمي</option>
                    <option value="الصف الثاني الثانوي — أدبي">الصف الثاني الثانوي — أدبي</option>
                    <option value="الصف الثالث الثانوي — علمي علوم">الصف الثالث الثانوي — علمي علوم</option>
                    <option value="الصف الثالث الثانوي — علمي رياضة">الصف الثالث الثانوي — علمي رياضة</option>
                  </select>
                </div>
                <div class="form-group">
                  <label class="form-label" for="new-stu-status">حالة القيد</label>
                  <select id="new-stu-status" class="form-control">
                    <option value="enrolled">مقيد منتظم</option>
                    <option value="transferred">محول من مدرسة أخرى</option>
                    <option value="integration">دمج تعليمي</option>
                    <option value="homeschooled">منازل</option>
                  </select>
                </div>
                <div class="form-group">
                  <label class="form-label" for="new-stu-phone">هاتف الطالب (إن وُجد)</label>
                  <input type="tel" id="new-stu-phone" class="form-control" placeholder="01XXXXXXXXX">
                </div>
                <div class="form-group" style="grid-column: span 2;">
                  <label class="form-label" for="new-stu-address">العنوان ومحل الإقامة التفصيلي</label>
                  <input type="text" id="new-stu-address" class="form-control" placeholder="المحافظة - المدينة - الحي - اسم الشارع والعقار">
                </div>
              </div>

              <!-- القسم الثاني: بيانات ولي الأمر المعتمد -->
              <h4 style="font-size: var(--text-sm); font-weight: 800; color: var(--color-primary-950); margin-bottom: var(--space-3); border-bottom: 1px solid var(--border-light); padding-bottom: 4px;">
                👨‍👧‍👦 ثانياً: بيانات ولي الأمر والمسؤول القانوني
              </h4>
              <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: var(--space-3); margin-bottom: var(--space-4);">
                <div class="form-group">
                  <label class="form-label" for="new-stu-parent-name">اسم ولي الأمر الرباعي *</label>
                  <input type="text" id="new-stu-parent-name" class="form-control" required placeholder="الاسم الرباعي لولي الأمر">
                </div>
                <div class="form-group">
                  <label class="form-label" for="new-stu-parent-relation">صلة القرابة</label>
                  <select id="new-stu-parent-relation" class="form-control">
                    <option value="أب">أب</option>
                    <option value="أم">أم</option>
                    <option value="وصي قانوني">وصي قانوني / ولي شرعي</option>
                  </select>
                </div>
                <div class="form-group">
                  <label class="form-label" for="new-stu-parent-nid">الرقم القومي لولي الأمر (14 رقم)</label>
                  <input type="text" id="new-stu-parent-nid" class="form-control" maxlength="14" placeholder="الرقم القومي لولي الأمر">
                </div>
                <div class="form-group">
                  <label class="form-label" for="new-stu-parent-phone">هاتف ولي الأمر الأساسي *</label>
                  <input type="tel" id="new-stu-parent-phone" class="form-control" required placeholder="010XXXXXXXX">
                </div>
                <div class="form-group">
                  <label class="form-label" for="new-stu-parent-job">الوظيفة / جهة العمل</label>
                  <input type="text" id="new-stu-parent-job" class="form-control" placeholder="مهنة ولي الأمر">
                </div>
              </div>

              <!-- القسم الثالث: ربط الأشقاء والعائلة -->
              <div style="background: var(--bg-surface-subtle); padding: var(--space-3) var(--space-4); border: 1px dashed var(--border-light); border-radius: var(--radius-sm); margin-bottom: var(--space-4);">
                <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: var(--space-2);">
                  <label style="display: flex; align-items: center; gap: 8px; cursor: pointer; font-weight: 700; font-size: var(--text-sm); margin: 0;">
                    <input type="checkbox" id="has-sibling-check" style="width: 18px; height: 18px; cursor: pointer;">
                    <span>🔗 هل للطالب إخوة أو أشقاء مسجلين بالفعل بالمدرسة؟</span>
                  </label>
                  <small style="color: var(--text-muted); font-size: 11px;">(يتم ربط الأسرة تلقائياً لتوحيد حساب ولي الأمر والأبناء)</small>
                </div>

                <div id="sibling-picker-container" style="display: none; margin-top: var(--space-3);">
                  <div class="form-group" style="margin-bottom: var(--space-2);">
                    <label class="form-label" for="sibling-select" style="font-size: var(--text-xs);">اختر الشقيق / الشقيقة المسجل بالمدرسة:</label>
                    <select id="sibling-select" class="form-control" style="font-size: var(--text-sm);">
                      <option value="">-- اضغط للاختيار من قائمة الطلاب المسجلين --</option>
                    </select>
                  </div>
                  <div id="sibling-link-info" style="display: none; padding: var(--space-2) var(--space-3); background: rgba(16, 185, 129, 0.1); border: 1px solid rgba(16, 185, 129, 0.3); border-radius: var(--radius-sm); font-size: var(--text-xs); color: #10b981;">
                  </div>
                </div>
              </div>

              <div style="display: flex; justify-content: flex-end; gap: var(--space-2);">
                <button type="button" id="cancel-stu-form-btn" class="btn btn-outline btn-md" style="display: none;">إلغاء التعديل</button>
                <button type="submit" id="submit-stu-form-btn" class="btn btn-primary btn-md">تأكيد وقيد ملف الطالب</button>
              </div>
            </form>
          </div>
        </div>

        <!-- Filter Bar -->
        <div class="panel" style="padding: var(--space-3) var(--space-4);">
          <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: var(--space-3);">
            <div style="display: flex; gap: var(--space-2); flex: 1; min-width: 260px; flex-wrap: wrap;">
              <input type="text" id="stu-search-input" class="form-control" placeholder="بحث باسم الطالب، الكود الوزاري، أو الرقم القومي..." style="max-width: 320px; font-size: var(--text-xs);">
              <select id="stu-grade-filter" class="form-control" style="max-width: 220px; font-size: var(--text-xs);">
                <option value="all">كافة الفصول والمراحل</option>
                <option value="فصل 1/1">فصل 1/1</option>
                <option value="فصل 1/2">فصل 1/2</option>
                <option value="الثاني الثانوي">الصف الثاني الثانوي</option>
                <option value="الثالث الثانوي">الصف الثالث الثانوي</option>
              </select>
            </div>
            <div>
              <span id="stu-total-badge" class="badge badge-accent">0 طالب مسجل</span>
            </div>
          </div>
        </div>

        <!-- Students Table -->
        <div class="panel" style="padding: 0; overflow: hidden;">
          <div class="table-wrap" style="border: none;">
            <table class="data-table">
              <thead>
                <tr>
                  <th style="width: 40px; text-align: center;">م</th>
                  <th>اسم الطالب الرباعي</th>
                  <th>كود الوزارة</th>
                  <th>الرقم القومي</th>
                  <th>الميلاد والسن في 1/10</th>
                  <th>المرحلة والفصل</th>
                  <th>ولي الأمر والهاتف</th>
                  <th style="text-align: center; width: 140px;">إجراءات</th>
                </tr>
              </thead>
              <tbody id="stu-table-tbody"></tbody>
            </table>
          </div>
          <div id="stu-empty-state" class="empty-state" style="display: none; padding: var(--space-8);">
            <div class="empty-state-icon">👥</div>
            <h4 class="empty-state-title">لا توجد سجلات طلاب مطابقة</h4>
            <p class="empty-state-desc">يمكنك إضافة طالب جديد أو استيراد كشف المدرسة باستخدام الأزرار بالأعلى.</p>
          </div>
        </div>
      </div>
    `;

    bindStudentsEvents(container);
    isInitialized = true;
  }

  await loadStudentsData();
}

async function loadStudentsData() {
  studentList = (await getStudents()) || [];
  const badge = document.getElementById('stu-total-badge');
  if (badge) badge.textContent = `${studentList.length} طالب مقيد رسمياً`;
  renderStudentsTable();
}

function renderStudentsTable() {
  const tbody = document.getElementById('stu-table-tbody');
  const emptyState = document.getElementById('stu-empty-state');
  const q = (document.getElementById('stu-search-input')?.value || '').toLowerCase().trim();
  const grade = document.getElementById('stu-grade-filter')?.value || 'all';
  if (!tbody) return;

  const filtered = studentList.filter((s) => {
    if (grade !== 'all' && !(s.grade || '').includes(grade)) return false;
    if (q) {
      const match = (s.name || '').toLowerCase().includes(q) ||
                    (s.code || '').includes(q) ||
                    (s.nationalId || '').includes(q) ||
                    (s.parentInfo?.parentName || '').toLowerCase().includes(q);
      if (!match) return false;
    }
    return true;
  });

  if (filtered.length === 0) {
    tbody.innerHTML = '';
    emptyState.style.display = 'flex';
    return;
  }

  emptyState.style.display = 'none';
  tbody.innerHTML = filtered.map((s, idx) => `
    <tr>
      <td style="text-align: center; font-weight: 700; color: var(--text-muted);">${idx + 1}</td>
      <td>
        <strong style="font-size: var(--text-xs); color: var(--color-primary-950);">${s.name}</strong>
        ${s.siblingCodes && s.siblingCodes.length ? `<span class="badge badge-accent" style="font-size: 10px; margin-inline-start: 4px;">🔗 شقيق مسجل</span>` : ''}
      </td>
      <td><code style="font-weight: 800; color: var(--color-primary-900);">${s.code}</code></td>
      <td style="font-size: 11px; color: var(--text-muted); font-family: var(--font-mono);">${s.nationalId || '—'}</td>
      <td style="font-size: 11px;">
        <div>${s.birthDate || '—'}</div>
        <small style="color: var(--text-muted);">${s.ageOct1 || ''}</small>
      </td>
      <td><span class="badge badge-primary" style="font-size: 11px;">${s.grade || 'أولى ثانوي'}</span></td>
      <td>
        <div style="font-size: var(--text-xs); font-weight: 600;">${s.parentInfo?.parentName || 'غير مسجل'}</div>
        <div style="font-size: 11px; color: var(--text-muted); font-family: var(--font-mono);">${s.parentInfo?.parentPhone || s.parentInfo?.phone || '—'}</div>
      </td>
      <td style="text-align: center;">
        <div style="display: inline-flex; gap: 4px;">
          <button type="button" class="btn btn-outline btn-sm edit-stu-btn" data-code="${s.code}" title="تعديل بيانات الطالب" style="padding: 2px 7px; font-size: 11px;">
            ✏️
          </button>
          <button type="button" class="btn btn-outline btn-sm print-card-btn" data-code="${s.code}" title="طباعة كارنيه الطالب الرسمي (QR Code)" style="padding: 2px 7px; font-size: 11px;">
            🪪
          </button>
          <button type="button" class="btn btn-outline btn-sm print-honor-btn" data-code="${s.code}" title="طباعة شهادة تقدير وتفوق رسمي" style="padding: 2px 7px; font-size: 11px;">
            🎖️
          </button>
          <button type="button" class="btn btn-outline btn-sm print-warn-btn" data-code="${s.code}" title="إصدار إنذار غياب رسمي" style="padding: 2px 7px; font-size: 11px;">
            ⚠️
          </button>
          <button type="button" class="btn btn-outline btn-sm print-cert-btn" data-code="${s.code}" title="طباعة إفادة قيد" style="padding: 2px 7px; font-size: 11px;">
            🖨️
          </button>
          <button type="button" class="btn btn-outline btn-sm del-stu-btn" data-code="${s.code}" title="حذف" style="color: var(--color-danger-text); padding: 2px 7px; font-size: 11px;">
            🗑️
          </button>
        </div>
      </td>
    </tr>
  `).join('');

  // Wire Edit button
  tbody.querySelectorAll('.edit-stu-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const code = btn.dataset.code;
      const s = studentList.find(st => st.code === code);
      if (s) enterEditMode(s);
    });
  });

  // Wire Card Print
  tbody.querySelectorAll('.print-card-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const s = studentList.find(st => st.code === btn.dataset.code);
      if (s) {
        printStudentIdCard(s);
      }
    });
  });

  // Wire Honor Certificate Print
  tbody.querySelectorAll('.print-honor-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const s = studentList.find(st => st.code === btn.dataset.code);
      if (s) {
        printHonorCertificate({ student: s });
      }
    });
  });

  // Wire Warning Letter Print
  tbody.querySelectorAll('.print-warn-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const s = studentList.find(st => st.code === btn.dataset.code);
      if (s) {
        printAbsenceWarningLetter({ student: s, days: 3, warningNumber: 'الأول' });
      }
    });
  });

  // Wire Certificate Print
  tbody.querySelectorAll('.print-cert-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const s = studentList.find(st => st.code === btn.dataset.code);
      if (s) {
        printEnrollmentCertificate({
          name: s.name,
          code: s.code,
          nationalId: s.nationalId || '—',
          grade: s.grade || 'الصف الأول الثانوي',
        });
      }
    });
  });

  // Wire Delete with custom modal
  tbody.querySelectorAll('.del-stu-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const ok = await showConfirmModal({
        title: 'حذف ملف قيد الطالب',
        message: 'هل أنت متأكد من حذف هذا الطالب من السجلات وقواعد البيانات المدرسية نهائياً؟',
        danger: true,
      });
      if (ok) {
        await deleteStudent(btn.dataset.code);
        showToast('تم حذف ملف الطالب بنجاح');
        await loadStudentsData();
      }
    });
  });
}

function enterEditMode(student) {
  const panel = document.getElementById('stu-reg-panel');
  const title = document.getElementById('stu-panel-form-title');
  const submitBtn = document.getElementById('submit-stu-form-btn');
  const cancelBtn = document.getElementById('cancel-stu-form-btn');
  const codeInput = document.getElementById('new-stu-code');

  editingStudentCode = student.code;
  panel.style.display = 'block';
  title.textContent = `تعديل ملف قيد الطالب: ${student.name} (كود: ${student.code})`;
  submitBtn.textContent = 'حفظ التعديلات الرسمية 💾';
  cancelBtn.style.display = 'inline-flex';

  document.getElementById('new-stu-name').value = student.name || '';
  codeInput.value = student.code || '';
  codeInput.disabled = true; // Code is the primary key and cannot be altered
  document.getElementById('new-stu-nid').value = student.nationalId || '';
  document.getElementById('new-stu-birthdate').value = student.birthDate || '';
  document.getElementById('new-stu-age-oct1').value = student.ageOct1 || '';
  document.getElementById('new-stu-gender').value = student.gender || 'ذكر';
  document.getElementById('new-stu-religion').value = student.religion || 'مسلم';
  document.getElementById('new-stu-grade').value = student.grade || 'الصف الأول الثانوي — فصل 1/1';
  document.getElementById('new-stu-status').value = student.status || 'enrolled';
  document.getElementById('new-stu-phone').value = student.studentPhone || '';
  document.getElementById('new-stu-address').value = student.address || '';
  document.getElementById('new-stu-parent-name').value = student.parentInfo?.parentName || '';
  document.getElementById('new-stu-parent-relation').value = student.parentInfo?.parentRelation || 'أب';
  document.getElementById('new-stu-parent-nid').value = student.parentInfo?.parentNationalId || '';
  document.getElementById('new-stu-parent-phone').value = student.parentInfo?.parentPhone || student.parentInfo?.phone || '';
  document.getElementById('new-stu-parent-job').value = student.parentInfo?.parentJob || '';

  panel.scrollIntoView({ behavior: 'smooth' });
}

function exitEditMode() {
  const title = document.getElementById('stu-panel-form-title');
  const submitBtn = document.getElementById('submit-stu-form-btn');
  const cancelBtn = document.getElementById('cancel-stu-form-btn');
  const codeInput = document.getElementById('new-stu-code');
  const form = document.getElementById('stu-new-form');

  editingStudentCode = null;
  form.reset();
  codeInput.disabled = false;
  title.textContent = 'تسجيل ملف قيد طالب رسمي جديد';
  submitBtn.textContent = 'تأكيد وقيد ملف الطالب';
  cancelBtn.style.display = 'none';
}

function bindStudentsEvents(container) {
  const toggleBtn = document.getElementById('stu-toggle-reg-btn');
  const panel = document.getElementById('stu-reg-panel');
  const closeBtn = document.getElementById('stu-close-reg-btn');
  const cancelBtn = document.getElementById('cancel-stu-form-btn');
  const form = document.getElementById('stu-new-form');
  const nidInput = document.getElementById('new-stu-nid');
  const birthInput = document.getElementById('new-stu-birthdate');
  const ageInput = document.getElementById('new-stu-age-oct1');
  const genderInput = document.getElementById('new-stu-gender');

  // Auto extract birth date, gender, and age on Oct 1 from 14-digit National ID
  if (nidInput) {
    nidInput.addEventListener('input', () => {
      const nid = nidInput.value.trim();
      if (nid.length === 14) {
        const details = extractStudentDetailsFromNID(nid);
        if (details) {
          if (birthInput) birthInput.value = details.birthDate;
          if (ageInput) ageInput.value = details.ageOct1;
          if (genderInput) genderInput.value = details.gender;
        }
      }
    });
  }

  // Handle Sibling Link Checkbox
  const hasSiblingCheck = document.getElementById('has-sibling-check');
  const siblingPicker = document.getElementById('sibling-picker-container');
  const siblingSelect = document.getElementById('sibling-select');
  const siblingLinkInfo = document.getElementById('sibling-link-info');
  const parentNameInput = document.getElementById('new-stu-parent-name');
  const parentPhoneInput = document.getElementById('new-stu-parent-phone');

  if (hasSiblingCheck && siblingPicker) {
    hasSiblingCheck.addEventListener('change', () => {
      if (hasSiblingCheck.checked) {
        siblingPicker.style.display = 'block';
        siblingSelect.innerHTML = '<option value="">-- اضغط للاختيار من قائمة الطلاب المسجلين --</option>' +
          studentList.map(s => `<option value="${s.code}">${s.name} (${s.code} — ${s.grade || 'مرحلة ثانوية'})</option>`).join('');
      } else {
        siblingPicker.style.display = 'none';
        siblingSelect.value = '';
        if (siblingLinkInfo) siblingLinkInfo.style.display = 'none';
      }
    });

    siblingSelect.addEventListener('change', () => {
      const selectedCode = siblingSelect.value;
      if (!selectedCode) {
        if (siblingLinkInfo) siblingLinkInfo.style.display = 'none';
        return;
      }
      const sibling = studentList.find(s => s.code === selectedCode);
      if (sibling && sibling.parentInfo) {
        if (parentNameInput && sibling.parentInfo.parentName) {
          parentNameInput.value = sibling.parentInfo.parentName;
        }
        if (parentPhoneInput && (sibling.parentInfo.parentPhone || sibling.parentInfo.phone)) {
          parentPhoneInput.value = sibling.parentInfo.parentPhone || sibling.parentInfo.phone;
        }
        if (siblingLinkInfo) {
          siblingLinkInfo.style.display = 'block';
          siblingLinkInfo.innerHTML = `✓ تم استيراد بيانات ولي الأمر: <strong>${sibling.parentInfo.parentName || 'مسجل'}</strong> وسيتم ربط ملف الطالب مباشرة بالشقيق/ة <strong>(${sibling.name})</strong> لتوحيد حساب العائلة.`;
        }
      }
    });
  }

  toggleBtn.addEventListener('click', () => {
    exitEditMode();
    panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
  });
  closeBtn.addEventListener('click', () => {
    exitEditMode();
    panel.style.display = 'none';
  });
  cancelBtn?.addEventListener('click', () => {
    exitEditMode();
    panel.style.display = 'none';
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const siblingCode = (hasSiblingCheck && hasSiblingCheck.checked) ? siblingSelect.value : null;

    const studentData = {
      name: document.getElementById('new-stu-name').value.trim(),
      code: document.getElementById('new-stu-code').value.trim(),
      nationalId: document.getElementById('new-stu-nid').value.trim(),
      birthDate: document.getElementById('new-stu-birthdate').value,
      ageOct1: document.getElementById('new-stu-age-oct1').value.trim(),
      gender: document.getElementById('new-stu-gender').value,
      religion: document.getElementById('new-stu-religion').value,
      grade: document.getElementById('new-stu-grade').value,
      status: document.getElementById('new-stu-status').value,
      studentPhone: document.getElementById('new-stu-phone').value.trim(),
      address: document.getElementById('new-stu-address').value.trim(),
      siblingCode,
      parentInfo: {
        parentName: parentNameInput ? parentNameInput.value.trim() : '',
        parentRelation: document.getElementById('new-stu-parent-relation').value,
        parentNationalId: document.getElementById('new-stu-parent-nid').value.trim(),
        parentPhone: parentPhoneInput ? parentPhoneInput.value.trim() : '',
        parentJob: document.getElementById('new-stu-parent-job').value.trim(),
      },
    };

    try {
      if (editingStudentCode) {
        await updateStudent(studentData);
        showToast('✓ تم حفظ التعديلات الرسمية على ملف الطالب بنجاح.');
      } else {
        await createStudent(studentData);
        showToast('✓ تم قيد الطالب بنجاح في سجلات المدرسة والوزارة وتوثيقه في المنظومة.');
      }

      exitEditMode();
      panel.style.display = 'none';
      await loadStudentsData();
    } catch (err) {
      showToast(err.message || 'حدث خطأ أثناء حفظ ملف الطالب.', 'error');
    }
  });

  // Bulk Import Toggle & Actions
  const importBtn = document.getElementById('stu-toggle-import-btn');
  const importPanel = document.getElementById('stu-import-panel');
  const closeImportBtn = document.getElementById('stu-close-import-btn');
  const browseCsvBtn = document.getElementById('browse-csv-btn');
  const csvFileInput = document.getElementById('stu-csv-file-input');
  const templateBtn = document.getElementById('download-template-btn');
  const confirmImportBtn = document.getElementById('confirm-bulk-import-btn');
  const previewBox = document.getElementById('import-preview-box');
  const previewText = document.getElementById('import-preview-text');

  let parsedImportStudents = [];

  importBtn?.addEventListener('click', () => {
    importPanel.style.display = importPanel.style.display === 'none' ? 'block' : 'none';
  });
  closeImportBtn?.addEventListener('click', () => {
    importPanel.style.display = 'none';
  });

  // Download Empty Template CSV
  templateBtn?.addEventListener('click', () => {
    const templateHeaders = [
      'كود الطالب بالوزارة',
      'الاسم الرباعي',
      'الرقم القومي (14 رقم)',
      'الفصل والمرحلة',
      'اسم ولي الأمر',
      'هاتف ولي الأمر',
      'العنوان ومحل السكن'
    ];
    const sampleRows = [
      ['2026105', 'علي محمد إبراهيم حسن', '30809150102345', 'الصف الأول الثانوي — فصل 1/1', 'محمد إبراهيم حسن', '01011223344', 'القاهرة الجديدة - التجمع الخامس'],
      ['2026106', 'سارة أحمد كمال السيد', '30810200104567', 'الصف الأول الثانوي — فصل 1/2', 'أحمد كمال السيد', '01233445566', 'مدينة نصر - الحي السابع']
    ];
    exportToCsv('نموذج_كشف_قيد_طلاب_مدرسي', templateHeaders, sampleRows);
  });

  browseCsvBtn?.addEventListener('click', () => csvFileInput.click());

  csvFileInput?.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const text = evt.target.result;
        const lines = text.split(/\r\n|\n/).filter(line => line.trim().length > 0);
        if (lines.length < 2) {
          showToast('الملف فارغ أو لا يحتوي على صفوف طلاب.', 'warning');
          return;
        }

        // Parse CSV lines
        parsedImportStudents = [];
        for (let i = 1; i < lines.length; i++) {
          const cols = lines[i].split(',').map(c => c.replace(/^["']|["']$/g, '').trim());
          if (cols.length >= 2 && cols[0] && cols[1]) {
            parsedImportStudents.push({
              code: cols[0],
              name: cols[1],
              nationalId: cols[2] || '',
              grade: cols[3] || 'الصف الأول الثانوي — فصل 1/1',
              parentName: cols[4] || 'ولي الأمر',
              parentPhone: cols[5] || '',
              address: cols[6] || 'القاهرة',
            });
          }
        }

        if (parsedImportStudents.length > 0) {
          previewBox.style.display = 'block';
          previewText.textContent = `✓ تمت قراءة عدد (${parsedImportStudents.length}) طالب جاهزين للقيد بالسجلات.`;
        } else {
          showToast('تعذر قراءة بيانات الطلاب من الملف. يرجى التأكد من مطابقة الملف للنموذج الرسمي.', 'warning');
        }
      } catch (err) {
        showToast('خطأ أثناء قراءة ملف CSV: ' + err.message, 'error');
      }
    };
    reader.readAsText(file, 'UTF-8');
  });

  confirmImportBtn?.addEventListener('click', async () => {
    if (!parsedImportStudents.length) return;
    confirmImportBtn.disabled = true;
    confirmImportBtn.textContent = 'جارٍ القيد بالسجلات...';

    try {
      const res = await bulkImportStudents(parsedImportStudents);
      showToast(`✓ تم بنجاح استيراد وقيد (${res.importedCount}) طالب في سجلات المدرسة والوزارة الرسمية.`);
      importPanel.style.display = 'none';
      previewBox.style.display = 'none';
      parsedImportStudents = [];
      csvFileInput.value = '';
      await loadStudentsData();
    } catch (err) {
      showToast('حدث خطأ أثناء الاستيراد: ' + err.message, 'error');
    } finally {
      confirmImportBtn.disabled = false;
      confirmImportBtn.textContent = 'تأكيد وقيد الطلاب في السجلات الآن ✓';
    }
  });

  // Table Filters & Search
  document.getElementById('stu-search-input')?.addEventListener('input', renderStudentsTable);
  document.getElementById('stu-grade-filter')?.addEventListener('change', renderStudentsTable);

  // Full Register Print (سجل 31)
  document.getElementById('stu-print-register-btn')?.addEventListener('click', async () => {
    await printOfficialStudentsRegister(studentList);
  });

  // Full CSV Export (Excel)
  document.getElementById('stu-export-csv-btn')?.addEventListener('click', () => {
    exportStudentsToCsv(studentList);
  });
}
