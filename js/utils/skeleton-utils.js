// ==========================================================================
// DIGITAL SCHOOL ECOSYSTEM (VANILLA EDITION)
// Skeleton Loading UI — Reusable Helper Functions
// ==========================================================================

/**
 * Generate skeleton HTML for a stats grid (KPI cards)
 * @param {number} count Number of stat cards
 * @returns {string} Skeleton HTML
 */
export function skeletonStats(count = 4) {
  return `<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:var(--space-3);">
    ${Array(count).fill('').map(() => `
      <div class="skeleton skeleton-stat">
        <div class="skeleton skeleton-text w-3-4" style="margin-bottom:12px;"></div>
        <div class="skeleton skeleton-text xl w-half"></div>
      </div>`).join('')}
  </div>`;
}

/**
 * Generate skeleton HTML for a data table
 * @param {number} rows Number of rows
 * @param {number} cols Number of columns
 * @returns {string} Skeleton HTML
 */
export function skeletonTable(rows = 5, cols = 6) {
  const colClass = cols <= 4 ? 'cols-4' : cols <= 5 ? 'cols-5' : cols <= 6 ? 'cols-6' : 'cols-7';
  return `<div class="skeleton-panel">
    <div class="skeleton-panel-header">
      <div class="skeleton skeleton-text w-1-4 lg" style="margin:0;"></div>
      <div class="skeleton skeleton-badge"></div>
    </div>
    <div style="padding:0;">
      ${Array(rows).fill('').map(() => `
        <div class="skeleton-table-row ${colClass}">
          ${Array(cols).fill('').map((_, i) => `
            <div class="skeleton skeleton-text" style="width:${i === 0 ? '90' : 60 + Math.random() * 30}%;"></div>
          `).join('')}
        </div>`).join('')}
    </div>
  </div>`;
}

/**
 * Generate skeleton HTML for a panel with content
 * @returns {string} Skeleton HTML
 */
export function skeletonPanel() {
  return `<div class="skeleton-panel">
    <div class="skeleton-panel-header">
      <div class="skeleton skeleton-text w-1-4 lg" style="margin:0;"></div>
    </div>
    <div class="skeleton-panel-body">
      <div class="skeleton skeleton-text w-full"></div>
      <div class="skeleton skeleton-text w-3-4"></div>
      <div class="skeleton skeleton-text w-half"></div>
    </div>
  </div>`;
}

/**
 * Generate skeleton for a chart area
 * @returns {string} Skeleton HTML
 */
export function skeletonChart() {
  return `<div class="skeleton skeleton-chart"></div>`;
}

/**
 * Generate skeleton for a form
 * @param {number} fields Number of form fields
 * @returns {string} Skeleton HTML
 */
export function skeletonForm(fields = 4) {
  return `<div class="skeleton-panel">
    <div class="skeleton-panel-header">
      <div class="skeleton skeleton-text w-1-4 lg" style="margin:0;"></div>
    </div>
    <div class="skeleton-panel-body" style="display:flex;flex-direction:column;gap:var(--space-4);">
      ${Array(fields).fill('').map(() => `
        <div>
          <div class="skeleton skeleton-text w-1-4" style="margin-bottom:6px;height:12px;"></div>
          <div class="skeleton skeleton-text w-full" style="height:38px;border-radius:var(--radius-sm);"></div>
        </div>`).join('')}
      <div style="display:flex;justify-content:flex-end;gap:var(--space-2);">
        <div class="skeleton skeleton-btn"></div>
        <div class="skeleton skeleton-btn" style="width:160px;"></div>
      </div>
    </div>
  </div>`;
}

/**
 * Generate skeleton for a user/student list with avatars
 * @param {number} count Number of list items
 * @returns {string} Skeleton HTML
 */
export function skeletonUserList(count = 4) {
  return Array(count).fill('').map(() => `
    <div style="display:flex;align-items:center;gap:var(--space-3);padding:var(--space-3) var(--space-4);border-bottom:1px solid var(--border-light);">
      <div class="skeleton skeleton-avatar"></div>
      <div style="flex:1;">
        <div class="skeleton skeleton-text w-half" style="margin-bottom:6px;"></div>
        <div class="skeleton skeleton-text w-1-4" style="height:11px;"></div>
      </div>
      <div class="skeleton skeleton-badge"></div>
    </div>`).join('');
}

/**
 * Show skeleton in a container, then replace with real content
 * @param {string} containerId The container element ID
 * @param {string} skeletonHtml The skeleton HTML to show
 * @param {Function} loadFn Async function that returns the real HTML
 */
export async function withSkeleton(containerId, skeletonHtml, loadFn) {
  const container = document.getElementById(containerId);
  if (!container) return;
  
  container.innerHTML = skeletonHtml;
  
  try {
    const result = await loadFn();
    container.innerHTML = '';
    if (typeof result === 'string') {
      container.innerHTML = result;
    }
    container.style.animation = 'fadeInContent 0.3s ease-out';
  } catch (err) {
    console.warn('Skeleton load error:', err);
    container.innerHTML = `<div class="empty-state" style="border:none;margin:var(--space-4);">
      <div class="empty-state-icon">⚠️</div>
      <h4 class="empty-state-title">حدث خطأ في تحميل البيانات</h4>
    </div>`;
  }
}

