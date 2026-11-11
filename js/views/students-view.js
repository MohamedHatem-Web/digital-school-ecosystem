// ==========================================================================
// DIGITAL SCHOOL ECOSYSTEM (VANILLA EDITION)
// SPA View Module: Student Affairs & Registry
// ==========================================================================

import {
  getStudents,
  createStudent,
  deleteStudent,
} from '../services/student-service.js';
import { printEnrollmentCertificate, exportStudentsToCsv } from '../utils/export-utils.js';

let isInitialized = false;
let studentList = [];

export async function renderStudentsView(container) {
  if (!isInitialized) {
    container.innerHTML = `
      <div style="display: flex; flex-direction: column; gap: var(--space-5);">
        <!-- Page Title & Actions -->
        <div style="display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: var(--space-4);">
          <div>
            <h1 style="font-size: var(--text-2xl); font-weight: 800; color: var(--color-primary-950); margin-bottom: 2px;">
              🎓 شؤون الطلاب وسجلات القيد
            </h1>
            <p style="font-size: var(--text-sm); color: var(--text-muted); margin: 0;">
              إدارة ملفات الطلاب، الأكواد الموحدة، الفصول، وإصدار إفادات القيد الرسمية.
            </p>
          </div>
          <div style="display: flex; gap: var(--space-2); flex-wrap: wrap;">
            <button type="button" id="stu-export-csv-btn" class="btn btn-outline btn-sm">
              📥 تصدير السجل (Excel)
            </button>
            <button type="button" id="stu-toggle-reg-btn" class="btn btn-primary btn-sm" style="font-weight: 700;">
              + تسجيل قيد طالب جديد
            </button>
          </div>
        </div>

        <!-- Add Student Panel (Collapsible) -->
        <div class="panel" id="stu-reg-panel" style="display: none; border-inline-start: 4px solid var(--color-primary-800);">
          <div class="panel-header" style="display: flex; justify-content: space-between; align-items: center;">
            <h3 class="panel-title" style="margin: 0;">تسجيل ملف قيد طالب جديد</h3>
            <button type="button" class="btn btn-sm" id="stu-close-reg-btn">✕ إغلاق</button>
          </div>
          <div class="panel-body">
            <form id="stu-new-form">
              <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: var(--space-4); margin-bottom: var(--space-4);">
                <div class="form-group">
                  <label class="form-label" for="new-stu-name">الاسم الرباعي للطالب *</label>
                  <input type="text" id="new-stu-name" class="form-control" required placeholder="مثال: يوسف أحمد محمود المنشاوي">
                </div>
                <div class="form-group">
                  <label class="form-label" for="new-stu-code">كود الطالب الموحد (7 أرقام) *</label>
                  <input type="text" id="new-stu-code" class="form-control" required maxlength="10" placeholder="مثال: 2026101">
                </div>
                <div class="form-group">
                  <label class="form-label" for="new-stu-nid">الرقم القومي (14 رقم) *</label>
                  <input type="text" id="new-stu-nid" class="form-control" required maxlength="14" placeholder="14 رقم">
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
              </div>

              <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: var(--space-4); margin-bottom: var(--space-4);">
                <div class="form-group">
                  <label class="form-label" for="new-stu-parent-name">اسم ولي الأمر *</label>
                  <input type="text" id="new-stu-parent-name" class="form-control" required placeholder="الاسم الرباعي لولي الأمر">
                </div>
                <div class="form-group">
                  <label class="form-label" for="new-stu-parent-phone">هاتف ولي الأمر *</label>
                  <input type="tel" id="new-stu-parent-phone" class="form-control" required placeholder="010XXXXXXXX">
                </div>
              </div>

              <div style="display: flex; justify-content: flex-end;">
                <button type="submit" class="btn btn-primary btn-md">تأكيد وقيد ملف الطالب</button>
              </div>
            </form>
          </div>
        </div>

        <!-- Filter Bar -->
        <div class="panel" style="padding: var(--space-3) var(--space-4);">
          <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: var(--space-3);">
            <div style="display: flex; gap: var(--space-2); flex: 1; min-width: 260px; flex-wrap: wrap;">
              <input type="text" id="stu-search-input" class="form-control" placeholder="بحث باسم الطالب، الكود، أو الرقم القومي..." style="max-width: 320px; font-size: var(--text-xs);">
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
                  <th>اسم الطالب</th>
                  <th>كود الطالب</th>
                  <th>الرقم القومي</th>
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
            <p class="empty-state-desc">يمكنك إضافة طالب جديد باستخدام الزر بالأعلى.</p>
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
  if (badge) badge.textContent = `${studentList.length} طالب مسجل`;
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
                    (s.nationalId || '').includes(q);
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
  tbody.innerHTML = filtered.map((s) => `
    <tr>
      <td>
        <strong style="font-size: var(--text-xs); color: var(--color-primary-950);">${s.name}</strong>
      </td>
      <td><code>${s.code}</code></td>
      <td style="font-size: 11px; color: var(--text-muted); font-family: var(--font-mono);">${s.nationalId || '—'}</td>
      <td><span class="badge badge-primary" style="font-size: 11px;">${s.grade || 'أولى ثانوي'}</span></td>
      <td>
        <div style="font-size: var(--text-xs);">${s.parentInfo?.parentName || 'غير مسجل'}</div>
        <div style="font-size: 11px; color: var(--text-muted); font-family: var(--font-mono);">${s.parentInfo?.phone || '—'}</div>
      </td>
      <td style="text-align: center;">
        <div style="display: inline-flex; gap: 4px;">
          <button type="button" class="btn btn-outline btn-sm print-cert-btn" data-code="${s.code}" title="طباعة إفادة قيد" style="padding: 2px 7px; font-size: 11px;">
            🖨️ إفادة
          </button>
          <button type="button" class="btn btn-outline btn-sm del-stu-btn" data-code="${s.code}" title="حذف" style="color: var(--color-danger-text); padding: 2px 7px; font-size: 11px;">
            🗑️
          </button>
        </div>
      </td>
    </tr>
  `).join('');

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

  tbody.querySelectorAll('.del-stu-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      if (confirm('حذف ملف قيد هذا الطالب من السجلات الرسمية؟')) {
        await deleteStudent(btn.dataset.code);
        await loadStudentsData();
      }
    });
  });
}

function bindStudentsEvents(container) {
  const toggleBtn = document.getElementById('stu-toggle-reg-btn');
  const panel = document.getElementById('stu-reg-panel');
  const closeBtn = document.getElementById('stu-close-reg-btn');
  const form = document.getElementById('stu-new-form');

  toggleBtn.addEventListener('click', () => {
    panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
  });
  closeBtn.addEventListener('click', () => { panel.style.display = 'none'; });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      await createStudent({
        name: document.getElementById('new-stu-name').value.trim(),
        code: document.getElementById('new-stu-code').value.trim(),
        nationalId: document.getElementById('new-stu-nid').value.trim(),
        grade: document.getElementById('new-stu-grade').value,
        parentInfo: {
          parentName: document.getElementById('new-stu-parent-name').value.trim(),
          phone: document.getElementById('new-stu-parent-phone').value.trim(),
        },
      });
      form.reset();
      panel.style.display = 'none';
      alert('تم قيد الطالب بنجاح في سجلات المدرسة الرسمية.');
      await loadStudentsData();
    } catch (err) {
      alert(err.message || 'حدث خطأ أثناء قيد الطالب.');
    }
  });

  document.getElementById('stu-search-input')?.addEventListener('input', renderStudentsTable);
  document.getElementById('stu-grade-filter')?.addEventListener('change', renderStudentsTable);
  document.getElementById('stu-export-csv-btn')?.addEventListener('click', () => {
    exportStudentsToCsv(studentList);
  });
}

