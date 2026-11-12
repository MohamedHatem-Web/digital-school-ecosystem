// ==========================================================================
// DIGITAL SCHOOL ECOSYSTEM (VANILLA EDITION)
// Shared UI Interactive Components (Drawers, Modals, Menus, Active Session Sync)
// ==========================================================================

import { getCurrentUser, getRoleDashboardUrl } from './auth.js';
import { getSchoolProfile, applySchoolBranding } from './services/school-service.js';

// ==========================================================================
// Theme Management (Light / Dark Mode with LocalStorage & OS Preference)
// ==========================================================================
export function getCurrentTheme() {
  const saved = localStorage.getItem('dse_theme');
  if (saved) return saved;
  return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('dse_theme', theme);

  const sunSvg = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"></circle><line x1="12" y1="1" x2="12" y2="3"></line><line x1="12" y1="21" x2="12" y2="23"></line><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line><line x1="1" y1="12" x2="3" y2="12"></line><line x1="21" y1="12" x2="23" y2="12"></line><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line></svg>`;
  const moonSvg = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path></svg>`;

  document.querySelectorAll('.theme-toggle-btn').forEach((btn) => {
    btn.innerHTML = `<span class="theme-icon-badge">${theme === 'dark' ? sunSvg : moonSvg}</span>`;
    btn.title = theme === 'dark' ? 'التبديل إلى الوضع النهاري' : 'التبديل إلى الوضع الليلي';
    btn.setAttribute('aria-label', btn.title);
  });
}

let isThemeToggling = false;

export function toggleTheme(event) {
  if (isThemeToggling) return;
  isThemeToggling = true;
  setTimeout(() => { isThemeToggling = false; }, 350);

  const current = getCurrentTheme();
  const next = current === 'dark' ? 'light' : 'dark';

  // Determine the exact button element to originate the circle from
  let targetEl = event?.currentTarget;
  if (!targetEl || !targetEl.getBoundingClientRect) {
    targetEl = document.getElementById('topbar-theme-toggle') ||
               document.getElementById('public-theme-toggle') ||
               document.getElementById('verify-theme-toggle') ||
               document.getElementById('login-theme-toggle') ||
               document.querySelector('.theme-toggle-btn');
  }

  // Calculate center coordinates of the button
  let x = window.innerWidth / 2;
  let y = window.innerHeight / 2;

  if (targetEl && targetEl.getBoundingClientRect) {
    const rect = targetEl.getBoundingClientRect();
    x = rect.left + rect.width / 2;
    y = rect.top + rect.height / 2;
  } else if (event && typeof event.clientX === 'number' && event.clientX > 0) {
    x = event.clientX;
    y = event.clientY;
  }

  // Clean up any leftover overlay elements
  const existingCircle = document.getElementById('dse-theme-reveal-circle');
  if (existingCircle) existingCircle.remove();

  // Calculate radius from button center to the furthest viewport corner
  const endRadius = Math.ceil(Math.hypot(
    Math.max(x, window.innerWidth - x),
    Math.max(y, window.innerHeight - y)
  ));

  // Set CSS variables on root document before transition starts so CSS keyframes read them
  document.documentElement.style.setProperty('--dse-reveal-x', `${Math.round(x)}px`);
  document.documentElement.style.setProperty('--dse-reveal-y', `${Math.round(y)}px`);
  document.documentElement.style.setProperty('--dse-reveal-radius', `${endRadius}px`);

  // If user prefers reduced motion or View Transitions not supported
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches || !document.startViewTransition) {
    applyTheme(next);
    return next;
  }

  try {
    const transition = document.startViewTransition(() => {
      applyTheme(next);
    });

    if (transition && transition.ready) {
      transition.ready.then(() => {
        try {
          document.documentElement.animate(
            {
              clipPath: [
                `circle(0px at ${Math.round(x)}px ${Math.round(y)}px)`,
                `circle(${endRadius}px at ${Math.round(x)}px ${Math.round(y)}px)`
              ]
            },
            {
              duration: 500,
              easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
              pseudoElement: '::view-transition-new(root)'
            }
          );
        } catch (animErr) {
          // CSS keyframes dse-circle-reveal are already running natively
        }
      }).catch(() => {});
    }
  } catch (e) {
    applyTheme(next);
  }

  return next;
}

export function initMobileDrawer() {
  const menuBtn = document.querySelector('.mobile-menu-btn');
  const drawer = document.querySelector('.mobile-drawer');
  const overlay = document.querySelector('.mobile-drawer-overlay');
  const closeBtn = document.querySelector('.drawer-close-btn');

  if (!menuBtn || !drawer) return;

  const openDrawer = (e) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    drawer.classList.add('active', 'open');
    if (overlay) overlay.classList.add('active', 'open');
    document.body.style.overflow = 'hidden';
  };

  const closeDrawer = (e) => {
    if (e) e.stopPropagation();
    drawer.classList.remove('active', 'open');
    if (overlay) overlay.classList.remove('active', 'open');
    document.body.style.overflow = '';
  };

  menuBtn.onclick = openDrawer;
  if (closeBtn) closeBtn.onclick = closeDrawer;
  if (overlay) overlay.onclick = closeDrawer;

  document.querySelectorAll('.drawer-nav-link').forEach(link => {
    link.addEventListener('click', closeDrawer);
  });
}

export function initTheme() {
  const theme = getCurrentTheme();
  applyTheme(theme);

  // Auto-inject Theme Toggle into Topbar or Header if not present
  const injectToggle = () => {
    const topbarEnd = document.querySelector('.topbar-end');
    const headerActions = document.querySelector('.header-cta-group') || document.querySelector('.header-actions');

    const sunSvg = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"></circle><line x1="12" y1="1" x2="12" y2="3"></line><line x1="12" y1="21" x2="12" y2="23"></line><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line><line x1="1" y1="12" x2="3" y2="12"></line><line x1="21" y1="12" x2="23" y2="12"></line><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line></svg>`;
    const moonSvg = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path></svg>`;

    if (topbarEnd && !document.getElementById('topbar-theme-toggle')) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.id = 'topbar-theme-toggle';
      btn.className = 'theme-toggle-btn';
      btn.innerHTML = `<span class="theme-icon-badge">${theme === 'dark' ? sunSvg : moonSvg}</span>`;
      btn.title = theme === 'dark' ? 'التبديل إلى الوضع النهاري' : 'التبديل إلى الوضع الليلي';
      btn.onclick = (e) => toggleTheme(e);
      topbarEnd.prepend(btn);
    }

    if (headerActions && !document.getElementById('public-theme-toggle')) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.id = 'public-theme-toggle';
      btn.className = 'theme-toggle-btn';
      btn.style.marginInlineEnd = '6px';
      btn.innerHTML = `<span class="theme-icon-badge">${theme === 'dark' ? sunSvg : moonSvg}</span>`;
      btn.title = theme === 'dark' ? 'التبديل إلى الوضع النهاري' : 'التبديل إلى الوضع الليلي';
      btn.onclick = (e) => toggleTheme(e);
      headerActions.prepend(btn);
    }

    // Attach click handler to any existing theme toggle buttons
    document.querySelectorAll('.theme-toggle-btn').forEach(btn => {
      btn.onclick = (e) => toggleTheme(e);
    });
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', injectToggle);
  } else {
    injectToggle();
  }
}

export function initComponents() {
  initTheme();

  // Dynamic School Branding Application (Cache-first then Firestore sync)
  try {
    const cachedSchool = localStorage.getItem('dse_school_sch_cairo_sec_01');
    if (cachedSchool) {
      applySchoolBranding(JSON.parse(cachedSchool));
    }
  } catch (e) {}

  getSchoolProfile().then((profile) => {
    if (profile) applySchoolBranding(profile);
  }).catch(() => {});

  // Proactive Cache & Stale Data Sanitizer
  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const key = localStorage.key(i);
      if (!key) continue;
      const val = localStorage.getItem(key);
      if (val && (val.includes('طارق محمود') || val.includes('مريم طارق') || (key.startsWith('dse_students_') && !key.includes('v6')))) {
        localStorage.removeItem(key);
      }
    }
    if ('caches' in window) {
      caches.keys().then((names) => {
        names.forEach((name) => {
          if (name !== 'dse-pwa-v11.0-prod') {
            caches.delete(name);
          }
        });
      });
    }
  } catch (e) {
    console.warn('Cache purge notice:', e);
  }

  const setup = () => {
    // 0. Active Session Sync on Public Pages (Remembering logged in state)
    try {
      const activeUser = getCurrentUser();
      const isPublicPage = !window.location.pathname.includes('/dashboard/');

      if (activeUser && isPublicPage) {
        const dest = getRoleDashboardUrl(activeUser.role);
        const userName = activeUser.displayName || 'حسابي';

        // Update header CTA button (compact & clean so it doesn't break header)
        document.querySelectorAll('.header-cta-group a[href*="login"]').forEach((btn) => {
          btn.href = dest;
          btn.className = 'btn btn-accent btn-md';
          btn.innerHTML = `<span style="display: flex; align-items: center; gap: 6px;">👤 <span>لوحة التحكم</span></span>`;
          btn.title = `مرحباً ${userName} (${activeUser.role}) — انقر للدخول إلى لوحة التحكم المعتمدة`;
        });

        // Update mobile drawer button
        document.querySelectorAll('.drawer-nav-list + div a[href*="login"]').forEach((btn) => {
          btn.href = dest;
          btn.className = 'btn btn-accent btn-full';
          btn.innerHTML = `👤 الانتقال إلى لوحة التحكم`;
        });

        // Update hero CTA button if exists on homepage
        document.querySelectorAll('.hero-actions-bar a[href*="login"]').forEach((btn) => {
          btn.href = dest;
          btn.innerHTML = '<span aria-hidden="true">🚀</span> الدخول إلى لوحة التحكم';
          btn.title = `لوحة تحكم ${userName}`;
        });

        // Update footer portal links
        document.querySelectorAll('.site-footer a[href*="login"]').forEach((link) => {
          link.href = dest;
        });
      }
    } catch (e) {
      console.warn('Components session sync notice:', e);
    }

    // 1. Public Mobile Navigation Drawer
    initMobileDrawer();

    // 2. Dashboard Sidebar (Mobile Drawer + Desktop Collapse/Expand)
    const sidebarToggleBtn = document.querySelector('.sidebar-toggle-btn');
    const dashboardOverlay = document.querySelector('.dashboard-overlay');
    const sidebar = document.querySelector('.dashboard-sidebar');
    const sidebarCloseBtn = document.querySelector('.sidebar-close-btn');
    const dashboardLayout = document.querySelector('.dashboard-layout');

    if (sidebar) {
      // Restore desktop collapse preference
      if (window.innerWidth >= 1024 && localStorage.getItem('dse_sidebar_collapsed') === 'true' && dashboardLayout) {
        dashboardLayout.classList.add('sidebar-collapsed');
      }

      const toggleDesktopSidebar = () => {
        if (!dashboardLayout) return;
        const isCollapsed = dashboardLayout.classList.toggle('sidebar-collapsed');
        localStorage.setItem('dse_sidebar_collapsed', isCollapsed ? 'true' : 'false');
      };

      const openMobileSidebar = () => {
        if (dashboardOverlay) dashboardOverlay.classList.add('active');
        sidebar.classList.add('active');
      };

      const closeMobileSidebar = () => {
        if (dashboardOverlay) dashboardOverlay.classList.remove('active');
        sidebar.classList.remove('active');
      };

      if (sidebarToggleBtn) {
        sidebarToggleBtn.addEventListener('click', () => {
          if (window.innerWidth >= 1024) {
            toggleDesktopSidebar();
          } else {
            if (sidebar.classList.contains('active')) {
              closeMobileSidebar();
            } else {
              openMobileSidebar();
            }
          }
        });
      }

      if (sidebarCloseBtn) {
        sidebarCloseBtn.addEventListener('click', () => {
          if (window.innerWidth >= 1024) {
            if (dashboardLayout) {
              dashboardLayout.classList.add('sidebar-collapsed');
              localStorage.setItem('dse_sidebar_collapsed', 'true');
            }
          } else {
            closeMobileSidebar();
          }
        });
      }

      if (dashboardOverlay) {
        dashboardOverlay.addEventListener('click', closeMobileSidebar);
      }
    }

    // 4. Offline / Online Network Status Toast
    const showNetworkToast = (isOnline) => {
      let toast = document.getElementById('dse-network-toast');
      if (!toast) {
        toast = document.createElement('div');
        toast.id = 'dse-network-toast';
        toast.style.cssText = 'position: fixed; bottom: 20px; left: 20px; z-index: 99999; padding: 10px 18px; border-radius: 8px; font-size: 13px; font-weight: 700; box-shadow: 0 10px 25px rgba(0,0,0,0.3); display: flex; align-items: center; gap: 8px; transition: all 0.3s ease; direction: rtl;';
        document.body.appendChild(toast);
      }
      if (isOnline) {
        toast.style.background = '#15803d';
        toast.style.color = '#ffffff';
        toast.innerHTML = '<span>✓</span><span>تمت استعادة الاتصال بالإنترنت بنجاح</span>';
        toast.style.display = 'flex';
        setTimeout(() => { if (toast) toast.style.display = 'none'; }, 3500);
      } else {
        toast.style.background = '#991b1b';
        toast.style.color = '#ffffff';
        toast.innerHTML = '<span>📡</span><span>أنت تتصفح في وضع عدم الاتصال (Offline)</span>';
        toast.style.display = 'flex';
      }
    };

    window.addEventListener('online', () => showNetworkToast(true));
    window.addEventListener('offline', () => showNetworkToast(false));
    if (!navigator.onLine) showNetworkToast(false);
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setup);
  } else {
    setup();
  }
}

/**
 * Global In-Page Toast Notification (Chic card alert inside the page)
 */
export function showToast(message, type = 'success', duration = 3800) {
  let container = document.getElementById('dse-toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'dse-toast-container';
    container.style.cssText = 'position: fixed; top: 24px; left: 50%; transform: translateX(-50%); z-index: 9999999; display: flex; flex-direction: column; gap: 8px; pointer-events: none; direction: rtl; max-width: 90vw; width: 440px;';
    document.body.appendChild(container);
  }

  const toast = document.createElement('div');
  toast.style.cssText = `
    pointer-events: auto;
    padding: 12px 18px;
    border-radius: 10px;
    font-size: 13.5px;
    font-weight: 700;
    box-shadow: 0 10px 30px rgba(0,0,0,0.35);
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    border: 1px solid;
    transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1);
  `;

  let icon = '✓';
  let bg = '#0f172a';
  let border = '#22c55e';
  let color = '#f8fafc';
  let iconColor = '#22c55e';

  const lower = String(message).toLowerCase();
  if (type === 'success' || message.startsWith('✓') || message.includes('بنجاح')) {
    icon = '✓';
    bg = 'linear-gradient(135deg, #064e3b 0%, #022c22 100%)';
    border = '#10b981';
    iconColor = '#34d399';
  } else if (type === 'error' || type === 'danger' || message.includes('خطأ') || message.includes('فشل')) {
    icon = '✕';
    bg = 'linear-gradient(135deg, #7f1d1d 0%, #450a0a 100%)';
    border = '#ef4444';
    iconColor = '#f87171';
  } else if (type === 'warning' || message.includes('تنبيه') || message.includes('تحذير')) {
    icon = '⚠️';
    bg = 'linear-gradient(135deg, #78350f 0%, #451a03 100%)';
    border = '#f59e0b';
    iconColor = '#fbbf24';
  } else {
    icon = 'ℹ️';
    bg = 'linear-gradient(135deg, #1e3a8a 0%, #0f172a 100%)';
    border = '#3b82f6';
    iconColor = '#60a5fa';
  }

  toast.style.background = bg;
  toast.style.borderColor = border;
  toast.style.color = color;

  const cleanMsg = String(message).replace(/^[✓✕⚠️ℹ️]\s*/, '');
  toast.innerHTML = `
    <div style="display: flex; align-items: center; gap: 10px;">
      <span style="display: inline-flex; align-items: center; justify-content: center; width: 24px; height: 24px; border-radius: 50%; background: rgba(255,255,255,0.18); color: ${iconColor}; font-weight: 800; font-size: 13px;">${icon}</span>
      <span>${cleanMsg}</span>
    </div>
    <button type="button" style="background: none; border: none; color: rgba(255,255,255,0.7); cursor: pointer; font-size: 14px; padding: 2px 6px;">✕</button>
  `;

  const closeBtn = toast.querySelector('button');
  const removeToast = () => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(-10px)';
    setTimeout(() => { toast.remove(); }, 250);
  };
  closeBtn.addEventListener('click', removeToast);

  container.appendChild(toast);
  setTimeout(removeToast, duration);
}

/**
 * Global In-Page Confirmation Modal (Replaces native browser confirm)
 */
export function showConfirmModal({ title = 'تأكيد الإجراء المطلوب', message = 'هل أنت متأكد من رغبتك في المتابعة؟', confirmText = 'تأكيد', cancelText = 'إلغاء', danger = false } = {}) {
  return new Promise((resolve) => {
    const existing = document.getElementById('dse-confirm-modal');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.id = 'dse-confirm-modal';
    overlay.style.cssText = `
      position: fixed; inset: 0; z-index: 99999999;
      background: rgba(0, 0, 0, 0.7); backdrop-filter: blur(5px);
      display: flex; align-items: center; justify-content: center;
      padding: 16px; direction: rtl;
    `;

    overlay.innerHTML = `
      <div style="
        background: var(--bg-surface, #0f172a);
        color: var(--text-primary, #ffffff);
        border: 1px solid var(--border-subtle, #334155);
        border-radius: 14px;
        box-shadow: 0 25px 60px rgba(0,0,0,0.6);
        max-width: 440px; width: 100%;
        padding: 24px;
      ">
        <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 12px;">
          <div style="width: 40px; height: 40px; border-radius: 50%; background: ${danger ? 'rgba(239, 68, 68, 0.15)' : 'rgba(59, 130, 246, 0.15)'}; color: ${danger ? '#ef4444' : '#3b82f6'}; display: flex; align-items: center; justify-content: center; font-size: 20px; flex-shrink: 0;">
            ${danger ? '⚠️' : '❓'}
          </div>
          <h3 style="margin: 0; font-size: 16px; font-weight: 800; color: var(--color-primary-950, #f8fafc);">${title}</h3>
        </div>
        <p style="margin: 0 0 22px 0; font-size: 13.5px; color: var(--text-muted, #94a3b8); line-height: 1.6;">${message || ''}</p>
        <div style="display: flex; justify-content: flex-end; gap: 10px;">
          <button type="button" id="dse-modal-cancel" class="btn btn-outline btn-sm" style="min-width: 80px;">${cancelText}</button>
          <button type="button" id="dse-modal-confirm" class="btn ${danger ? 'btn-danger' : 'btn-primary'} btn-sm" style="min-width: 95px; font-weight: 700; ${danger ? 'background: #dc2626; color: #fff; border: none;' : ''}">${confirmText}</button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    const cleanup = (val) => {
      overlay.style.opacity = '0';
      overlay.style.transition = 'opacity 0.2s ease';
      setTimeout(() => overlay.remove(), 200);
      resolve(val);
    };

    overlay.querySelector('#dse-modal-confirm').addEventListener('click', () => cleanup(true));
    overlay.querySelector('#dse-modal-cancel').addEventListener('click', () => cleanup(false));
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) cleanup(false);
    });
    const keyHandler = (e) => {
      if (e.key === 'Escape') {
        window.removeEventListener('keydown', keyHandler);
        cleanup(false);
      }
    };
    window.addEventListener('keydown', keyHandler);
  });
}

// Bind to window for global access across all pages & views
if (typeof window !== 'undefined') {
  window.showToast = showToast;
  window.showConfirmModal = showConfirmModal;
  // Override browser native alert with chic in-page toast
  window.alert = function(msg) {
    showToast(msg);
  };
}

