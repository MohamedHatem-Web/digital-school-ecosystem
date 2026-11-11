// ==========================================================================
// DIGITAL SCHOOL ECOSYSTEM (VANILLA EDITION)
// SPA View Module: Social Affairs & Behavioral Warnings (Resolution 187)
// ==========================================================================

import {
  getDisciplinaryCases,
  issueDisciplinaryWarning,
} from '../services/social-service.js';
import { getStudents } from '../services/student-service.js';

let isInitialized = false;
let casesList = [];
let allStudents = [];

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

        <!-- Issue Warning Panel (Collapsible) -->
        <div class="panel" id="soc-warning-panel" style="display: none; border-inline-start: 4px solid var(--color-warning-border);">
          <div class="panel-header" style="display: flex; justify-content: space-between; align-items: center;">
            <h3 class="panel-title" style="margin: 0;">إصدار قرار انضباط رسمي ضد طالب</h3>
            <button type="button" class="btn btn-sm" id="soc-close-warning-btn">✕ إغلاق</button>
          </div>
          <div class="panel-body">
            <form id="soc-warning-form">
              <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: var(--space-4); margin-bottom: var(--space-4);">
                <div class="form-group">
                  <label class="form-label" for="soc-stu-select">الطالب المعني *</label>
                  <select id="soc-stu-select" class="form-control" required></select>
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
                    <option value="warning_second">إنذار كتابي نهائي وتعهد ولي الأمر</option>
                    <option value="suspension_3_days">فصل مؤقت لمدة 3 أيام مع أداء الواجبات</option>
                    <option value="suspension_7_days">فصل مؤقت لمدة 7 أيام مع تكليف بالخدمة العامة</option>
                  </select>
                </div>
              </div>

              <div class="form-group" style="margin-bottom: var(--space-4);">
                <label class="form-label" for="soc-reason">تفاصيل وسياق المخالفة الميدانية *</label>
                <textarea id="soc-reason" class="form-control" rows="3" required placeholder="وصف الواقعة بدقة والتاريخ وتوصية لجنة الحماية..."></textarea>
              </div>

              <div style="display: flex; justify-content: flex-end;">
                <button type="submit" class="btn btn-warning btn-md" style="font-weight: 700;">
                  ⚠️ اعتماد وتوثيق القرار رسميًا
                </button>
              </div>
            </form>
          </div>
        </div>

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
      </div>
    `;

    bindSocialEvents(container);
    isInitialized = true;
  }

  await loadSocialData();
}

async function loadSocialData() {
  casesList = (await getDisciplinaryCases()) || [];
  allStudents = (await getStudents()) || [];

  const badge = document.getElementById('soc-cases-badge');
  if (badge) badge.textContent = `${casesList.length} قرارات`;

  const stuSelect = document.getElementById('soc-stu-select');
  if (stuSelect) {
    stuSelect.innerHTML = allStudents.map(s => `
      <option value="${s.code}" data-name="${s.name}" data-parent="${s.parentInfo?.parentName || ''}">
        ${s.name} (${s.code} - ${s.grade || 'أولى ثانوي'})
      </option>
    `).join('');
  }

  renderCasesTable();
}

function renderCasesTable() {
  const tbody = document.getElementById('soc-cases-tbody');
  const emptyState = document.getElementById('soc-empty-state');
  if (!tbody) return;

  if (casesList.length === 0) {
    tbody.innerHTML = '';
    emptyState.style.display = 'flex';
    return;
  }

  emptyState.style.display = 'none';
  tbody.innerHTML = casesList.map((c) => `
    <tr>
      <td style="font-size: 11.5px; color: var(--text-muted); font-weight: 600;">${c.date || c.createdAt}</td>
      <td>
        <strong style="font-size: var(--text-xs); color: var(--color-primary-950);">${c.studentName}</strong>
        <div style="font-size: 11px; color: var(--text-muted);">كود: <code>${c.studentCode}</code></div>
      </td>
      <td>
        <span class="badge ${c.severityLevel === 'level_3' ? 'badge-danger' : 'badge-warning'}">
          ${c.severityLevel === 'level_3' ? 'جسيمة (المستوى 3)' : (c.severityLevel === 'level_2' ? 'متوسطة (المستوى 2)' : 'بسيطة (المستوى 1)')}
        </span>
      </td>
      <td style="font-weight: 700; font-size: var(--text-xs); color: var(--color-primary-900);">
        ${c.actionTaken || c.type}
      </td>
      <td style="font-size: var(--text-xs); color: var(--text-secondary); max-width: 280px;">
        ${c.reason || '—'}
      </td>
      <td style="text-align: center;">
        <span class="badge badge-success">معتمد وموثق</span>
      </td>
    </tr>
  `).join('');
}

function bindSocialEvents(container) {
  const openBtn = document.getElementById('soc-open-warning-btn');
  const panel = document.getElementById('soc-warning-panel');
  const closeBtn = document.getElementById('soc-close-warning-btn');
  const form = document.getElementById('soc-warning-form');

  openBtn.addEventListener('click', () => {
    panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
  });
  closeBtn.addEventListener('click', () => { panel.style.display = 'none'; });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const stuSelect = document.getElementById('soc-stu-select');
    const opt = stuSelect.options[stuSelect.selectedIndex];

    try {
      await issueDisciplinaryWarning({
        studentCode: stuSelect.value,
        studentName: opt.dataset.name,
        severityLevel: document.getElementById('soc-level').value,
        actionTaken: document.getElementById('soc-action').options[document.getElementById('soc-action').selectedIndex].text,
        reason: document.getElementById('soc-reason').value.trim(),
      });
      form.reset();
      panel.style.display = 'none';
      alert('تم اعتماد قرار الانضباط بنجاح وإخطار ولي الأمر عبر المنظومة.');
      await loadSocialData();
    } catch (err) {
      alert(err.message || 'حدث خطأ أثناء إصدار القرار.');
    }
  });
}

