// ==========================================================================
// DIGITAL SCHOOL ECOSYSTEM (VANILLA EDITION)
// SPA View Module: Institutional Messaging Box (Internal Communications)
// ==========================================================================

import {
  getMessages,
  sendMessage,
  getAllowedRecipients,
} from '../services/messaging-service.js';
import { getCurrentUser } from '../auth.js';
import { showToast } from '../components.js';

let activeFilter = 'inbox';
let currentMessages = [];
let searchQuery = '';

export async function renderMessagesView(container) {
  const user = getCurrentUser() || { displayName: 'مستخدم المنظومة', role: 'tech_specialist', email: 'tech@dse.edu.eg' };
  const allowedRecipients = getAllowedRecipients(user);

  container.innerHTML = `
    <div style="display: flex; flex-direction: column; gap: var(--space-5);">
      <!-- Header -->
      <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: var(--space-3);">
        <div>
          <h1 style="font-size: var(--text-2xl); font-weight: 800; color: var(--color-primary-950); margin-bottom: 2px;">
            ✉️ نظام المراسلات والبريد الداخلي المباشر
          </h1>
          <p style="font-size: var(--text-sm); color: var(--text-muted); margin: 0;">
            تواصل داخلي آمن ومؤرخ بين أطراف المنظومة المدرسية مع توثيق كامل في سجل الرقابة.
          </p>
        </div>
        <button type="button" class="btn btn-primary btn-sm" id="msg-compose-btn" style="font-weight: 700;">
          + إنشاء رسالة جديدة
        </button>
      </div>

      <!-- Compose Panel (Collapsible) -->
      <div class="panel" id="msg-compose-panel" style="display: none; border-inline-start: 4px solid var(--color-primary-800);">
        <div class="panel-header" style="display: flex; justify-content: space-between; align-items: center;">
          <h3 class="panel-title" style="margin: 0;">إرسال رسالة داخلية رسمية</h3>
          <button type="button" class="btn btn-sm" id="msg-close-compose-btn">✕ إغلاق</button>
        </div>
        <div class="panel-body">
          <form id="msg-new-form">
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: var(--space-3); margin-bottom: var(--space-3);">
              <div class="form-group">
                <label class="form-label" for="msg-recipient">المستلم المعتمد *</label>
                <select id="msg-recipient" class="form-control" required>
                  ${allowedRecipients.map(r => `<option value="${r.id}" data-role="${r.role}">${r.name}</option>`).join('')}
                </select>
              </div>
              <div class="form-group">
                <label class="form-label" for="msg-subject">الموضوع *</label>
                <input type="text" id="msg-subject" class="form-control" required placeholder="عنوان الرسالة بوضوح...">
              </div>
              <div class="form-group">
                <label class="form-label" for="msg-priority">الأولوية</label>
                <select id="msg-priority" class="form-control">
                  <option value="normal">عادية</option>
                  <option value="high">هامة</option>
                  <option value="urgent">عاجلة جداً</option>
                </select>
              </div>
            </div>
            <div class="form-group" style="margin-bottom: var(--space-3);">
              <label class="form-label" for="msg-body">نص الرسالة *</label>
              <textarea id="msg-body" class="form-control" rows="4" required placeholder="اكتب نص الرسالة بوضوح..."></textarea>
            </div>
            <div style="display: flex; justify-content: flex-end;">
              <button type="submit" class="btn btn-primary btn-md">إرسال الرسالة الآن</button>
            </div>
          </form>
        </div>
      </div>

      <!-- Messages List Panel -->
      <div class="panel" style="padding: 0; overflow: hidden;">
        <div class="panel-header" style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: var(--space-3);">
          <div style="display: flex; align-items: center; gap: var(--space-3); flex-wrap: wrap;">
            <div style="display: flex; gap: var(--space-2);">
              <button type="button" class="btn btn-sm ${activeFilter === 'inbox' ? 'btn-primary' : 'btn-outline'}" id="msg-tab-inbox">الوارد 📥</button>
              <button type="button" class="btn btn-sm ${activeFilter === 'sent' ? 'btn-primary' : 'btn-outline'}" id="msg-tab-sent">الصادر 📤</button>
            </div>
            <span id="msg-section-header" style="font-weight: 700; font-size: var(--text-sm); color: var(--color-primary-950);">
              ${activeFilter === 'inbox' ? 'البريد الوارد المعتمد' : 'الرسائل الصادرة المعتمدة'}
            </span>
          </div>
          <div style="display: flex; align-items: center; gap: var(--space-3); flex-wrap: wrap;">
            <input type="text" id="msg-search-box" class="form-control" placeholder="بحث بالاسم أو الموضوع..." style="width: 220px; padding: 4px 10px; font-size: var(--text-xs);">
            <span class="badge badge-accent" id="msg-count-badge">0 رسائل</span>
          </div>
        </div>
        <div id="msg-list-body" style="padding: var(--space-4); display: flex; flex-direction: column; gap: var(--space-3);">
          <!-- Dynamic Content -->
        </div>
      </div>
    </div>
  `;

  // Hook Compose Toggle
  const composeBtn = document.getElementById('msg-compose-btn');
  const closeComposeBtn = document.getElementById('msg-close-compose-btn');
  const composePanel = document.getElementById('msg-compose-panel');

  if (composeBtn && composePanel) {
    composeBtn.addEventListener('click', () => {
      composePanel.style.display = composePanel.style.display === 'none' ? 'block' : 'none';
    });
  }
  if (closeComposeBtn && composePanel) {
    closeComposeBtn.addEventListener('click', () => {
      composePanel.style.display = 'none';
    });
  }

  // Hook Tab Switching
  const tabInbox = document.getElementById('msg-tab-inbox');
  const tabSent = document.getElementById('msg-tab-sent');
  const sectionHeader = document.getElementById('msg-section-header');

  if (tabInbox && tabSent) {
    tabInbox.addEventListener('click', () => {
      if (activeFilter === 'inbox') return;
      activeFilter = 'inbox';
      tabInbox.classList.add('btn-primary');
      tabInbox.classList.remove('btn-outline');
      tabSent.classList.add('btn-outline');
      tabSent.classList.remove('btn-primary');
      if (sectionHeader) sectionHeader.textContent = 'البريد الوارد المعتمد';
      loadMessagesWithSkeleton(activeFilter, user);
    });

    tabSent.addEventListener('click', () => {
      if (activeFilter === 'sent') return;
      activeFilter = 'sent';
      tabSent.classList.add('btn-primary');
      tabSent.classList.remove('btn-outline');
      tabInbox.classList.add('btn-outline');
      tabInbox.classList.remove('btn-primary');
      if (sectionHeader) sectionHeader.textContent = 'الرسائل الصادرة المعتمدة';
      loadMessagesWithSkeleton(activeFilter, user);
    });
  }

  // Hook Search Filter
  const searchInput = document.getElementById('msg-search-box');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      searchQuery = e.target.value.trim().toLowerCase();
      renderFilteredMessages(user);
    });
  }

  // Hook Compose Form Submission
  const composeForm = document.getElementById('msg-new-form');
  if (composeForm) {
    composeForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const recSelect = document.getElementById('msg-recipient');
      const recId = recSelect.value;
      const recName = recSelect.options[recSelect.selectedIndex].text;
      const recRole = recSelect.options[recSelect.selectedIndex].dataset.role || recId;
      const subject = document.getElementById('msg-subject').value.trim();
      const priority = document.getElementById('msg-priority').value;
      const body = document.getElementById('msg-body').value.trim();

      try {
        await sendMessage({
          senderId: user.uid || 'user',
          senderName: user.displayName || 'مسؤول بالمنظومة',
          senderRole: user.role || 'staff',
          senderEmail: user.email || '',
          recipientId: recId,
          recipientName: recName,
          recipientRole: recRole,
          subject,
          priority,
          body,
        });

        showToast('✓ تم إرسال الرسالة بنجاح.');
        composeForm.reset();
        if (composePanel) composePanel.style.display = 'none';

        // Switch to Sent tab and reload
        if (tabSent) tabSent.click();
      } catch (err) {
        showToast('خطأ أثناء الإرسال: ' + err.message, 'error');
      }
    });
  }

  await loadMessagesWithSkeleton(activeFilter, user);
}

function renderSkeletonLoading(container) {
  container.innerHTML = `
    <div style="display: flex; flex-direction: column; gap: var(--space-3);">
      ${[1, 2, 3].map(() => `
        <div style="padding: var(--space-4); border: 1px solid var(--border-subtle); border-radius: var(--radius-md); background: var(--bg-surface-subtle); display: flex; flex-direction: column; gap: var(--space-2);">
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <div style="display: flex; gap: var(--space-2); align-items: center; width: 60%;">
              <div class="skeleton-line" style="width: 50px; height: 18px; border-radius: 4px;"></div>
              <div class="skeleton-line" style="width: 60%; height: 18px; border-radius: 4px;"></div>
            </div>
            <div class="skeleton-line" style="width: 80px; height: 14px; border-radius: 4px;"></div>
          </div>
          <div class="skeleton-line" style="width: 35%; height: 14px; border-radius: 4px;"></div>
          <div class="skeleton-line" style="width: 100%; height: 36px; border-radius: 4px; margin-top: 4px;"></div>
        </div>
      `).join('')}
    </div>
  `;
}

async function loadMessagesWithSkeleton(filter, user) {
  const container = document.getElementById('msg-list-body');
  if (!container) return;

  renderSkeletonLoading(container);

  currentMessages = (await getMessages({
    userId: user.uid,
    userEmail: user.email,
    userRole: user.role,
    filter,
  })) || [];

  renderFilteredMessages(user);
}

function renderFilteredMessages(user) {
  const container = document.getElementById('msg-list-body');
  const badge = document.getElementById('msg-count-badge');
  if (!container) return;

  let filtered = currentMessages;
  if (searchQuery) {
    filtered = currentMessages.filter(m => {
      const matchSubject = (m.subject || '').toLowerCase().includes(searchQuery);
      const matchBody = (m.body || '').toLowerCase().includes(searchQuery);
      const matchSender = (m.senderName || '').toLowerCase().includes(searchQuery);
      const matchRecipient = (m.recipientName || '').toLowerCase().includes(searchQuery);
      return matchSubject || matchBody || matchSender || matchRecipient;
    });
  }

  if (badge) badge.textContent = `${filtered.length} رسائل`;

  if (filtered.length === 0) {
    container.innerHTML = `
      <div class="empty-state" style="border: none; padding: 30px; text-align: center;">
        <div class="empty-state-icon" style="font-size: 28px; margin-bottom: 8px;">📭</div>
        <p style="color: var(--text-muted); margin: 0; font-size: var(--text-sm);">
          ${searchQuery ? 'لا توجد رسائل مطابقة لكلمة البحث.' : 'لا توجد رسائل في هذا الصندوق حالياً.'}
        </p>
      </div>
    `;
    return;
  }

  container.innerHTML = filtered.map(m => `
    <div style="padding: var(--space-4); border: 1px solid var(--border-subtle); border-radius: var(--radius-md); background: var(--bg-surface-subtle); display: flex; flex-direction: column; gap: var(--space-2); transition: transform 0.15s ease;">
      <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: var(--space-2);">
        <div style="display: flex; align-items: center; gap: var(--space-2);">
          <span class="badge ${m.priority === 'urgent' ? 'badge-danger' : m.priority === 'high' ? 'badge-warning' : 'badge-primary'}">
            ${m.priority === 'urgent' ? 'عاجل جداً' : m.priority === 'high' ? 'هام' : 'عادي'}
          </span>
          <strong style="font-size: var(--text-base); color: var(--color-primary-950);">${m.subject || 'بدون موضوع'}</strong>
        </div>
        <small style="color: var(--text-muted); font-size: 11px;">
          ${m.formattedDate || new Date(m.createdAt || Date.now()).toLocaleString('ar-EG')}
        </small>
      </div>

      <div style="font-size: var(--text-xs); color: var(--text-secondary);">
        ${activeFilter === 'sent' ? `إلى: <strong>${m.recipientName || 'المستلم'}</strong>` : `من: <strong>${m.senderName || m.senderEmail}</strong> (${m.senderRole || 'معتمد'})`}
      </div>

      <p style="margin: 0; font-size: var(--text-sm); line-height: 1.6; color: var(--text-primary); white-space: pre-wrap; background: var(--bg-surface); padding: var(--space-3); border-radius: var(--radius-sm); border: 1px solid var(--border-light);">
        ${m.body || ''}
      </p>
    </div>
  `).join('');
}
