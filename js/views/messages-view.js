// ==========================================================================
// DIGITAL SCHOOL ECOSYSTEM (VANILLA EDITION)
// SPA View Module: Institutional Messaging Box (Internal Communications)
// ==========================================================================

import {
  getMessages,
  sendMessage,
  OFFICIAL_STAFF_RECIPIENTS,
} from '../services/messaging-service.js';
import { getCurrentUser } from '../auth.js';

let isInitialized = false;

export async function renderMessagesView(container) {
  const user = getCurrentUser() || { displayName: 'مستخدم المنظومة', role: 'tech_specialist', email: 'tech@dse.edu.eg' };

  if (!isInitialized) {
    container.innerHTML = `
      <div style="display: flex; flex-direction: column; gap: var(--space-5);">
        <!-- Header -->
        <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: var(--space-3);">
          <div>
            <h1 style="font-size: var(--text-2xl); font-weight: 800; color: var(--color-primary-950); margin-bottom: 2px;">
              ✉️ نظام المراسلات والبريد الداخلي المباشر
            </h1>
            <p style="font-size: var(--text-sm); color: var(--text-muted); margin: 0;">
              تواصل داخلي آمن ومؤرخ بين أطراف المنظومة المدرسية مع توثيق كامل.
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
              <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: var(--space-3); margin-bottom: var(--space-3);">
                <div class="form-group">
                  <label class="form-label" for="msg-recipient">المستلم المعتمد *</label>
                  <select id="msg-recipient" class="form-control" required>
                    ${OFFICIAL_STAFF_RECIPIENTS.map(r => `<option value="${r.id}">${r.name}</option>`).join('')}
                  </select>
                </div>
                <div class="form-group">
                  <label class="form-label" for="msg-subject">الموضوع *</label>
                  <input type="text" id="msg-subject" class="form-control" required placeholder="عنوان الرسالة باختصار...">
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
                <textarea id="msg-body" class="form-control" rows="3" required placeholder="اكتب نص الرسالة بوضوح..."></textarea>
              </div>
              <div style="display: flex; justify-content: flex-end;">
                <button type="submit" class="btn btn-primary btn-md">إرسال الرسالة الآن</button>
              </div>
            </form>
          </div>
        </div>

        <!-- Messages List Panel -->
        <div class="panel" style="padding: 0; overflow: hidden;">
          <div class="panel-header" style="display: flex; justify-content: space-between; align-items: center;">
            <div style="display: flex; gap: var(--space-2);">
              <button type="button" class="btn btn-sm btn-primary" id="msg-tab-inbox">الوارد 📥</button>
              <button type="button" class="btn btn-sm btn-outline" id="msg-tab-sent">الصادر 📤</button>
            </div>
            <span class="badge badge-accent" id="msg-count-badge">0 رسائل</span>
          </div>
          <div id="msg-list-body" style="padding: var(--space-4); display: flex; flex-direction: column; gap: var(--space-3);">
            <p style="text-align: center; color: var(--text-muted); padding: 20px;">جارٍ تحميل الرسائل...</p>
          </div>
        </div>
      </div>
    `;

    document.getElementById('msg-compose-btn')?.addEventListener('click', () => {
      document.getElementById('msg-compose-panel').style.display = 'block';
    });
    document.getElementById('msg-close-compose-btn')?.addEventListener('click', () => {
      document.getElementById('msg-compose-panel').style.display = 'none';
    });

    document.getElementById('msg-tab-inbox')?.addEventListener('click', () => {
      document.getElementById('msg-tab-inbox').classList.replace('btn-outline', 'btn-primary');
      document.getElementById('msg-tab-sent').classList.replace('btn-primary', 'btn-outline');
      loadMessagesList('inbox', user);
    });

    document.getElementById('msg-tab-sent')?.addEventListener('click', () => {
      document.getElementById('msg-tab-sent').classList.replace('btn-outline', 'btn-primary');
      document.getElementById('msg-tab-inbox').classList.replace('btn-primary', 'btn-outline');
      loadMessagesList('sent', user);
    });

    document.getElementById('msg-new-form')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const recSelect = document.getElementById('msg-recipient');
      const recId = recSelect.value;
      const recName = recSelect.options[recSelect.selectedIndex].text;
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
          recipientRole: recId,
          subject,
          priority,
          body,
        });
        alert('✓ تم إرسال الرسالة بنجاح.');
        document.getElementById('msg-new-form').reset();
        document.getElementById('msg-compose-panel').style.display = 'none';
        loadMessagesList('sent', user);
      } catch (err) {
        alert('خطأ أثناء الإرسال: ' + err.message);
      }
    });

    isInitialized = true;
  }

  await loadMessagesList('inbox', user);
}

async function loadMessagesList(filter, user) {
  const container = document.getElementById('msg-list-body');
  const badge = document.getElementById('msg-count-badge');
  if (!container) return;

  container.innerHTML = '<p style="text-align: center; color: var(--text-muted); padding: 20px;">جارٍ التحميل...</p>';

  const msgs = (await getMessages({
    userId: user.uid,
    userEmail: user.email,
    userRole: user.role,
    filter,
  })) || [];

  if (badge) badge.textContent = `${msgs.length} رسائل`;

  if (msgs.length === 0) {
    container.innerHTML = '<p style="text-align: center; color: var(--text-muted); padding: 20px;">لا توجد رسائل في هذا الصندوق حالياً.</p>';
    return;
  }

  container.innerHTML = msgs.map(m => `
    <div style="padding: var(--space-4); border: 1px solid var(--border-subtle); border-radius: var(--radius-md); background: var(--bg-surface-subtle); display: flex; flex-direction: column; gap: var(--space-2);">
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
        ${filter === 'sent' ? `إلى: <strong>${m.recipientName || 'المستلم'}</strong>` : `من: <strong>${m.senderName || m.senderEmail}</strong> (${m.senderRole || 'معتمد'})`}
      </div>

      <p style="margin: 0; font-size: var(--text-sm); line-height: 1.6; color: var(--text-primary); white-space: pre-wrap; background: var(--bg-surface); padding: var(--space-3); border-radius: var(--radius-sm); border: 1px solid var(--border-light);">
        ${m.body || ''}
      </p>
    </div>
  `).join('');
}

