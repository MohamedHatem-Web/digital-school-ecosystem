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
          btn.innerHTML = `🚀 الدخول إلى لوحة التحكم (${userName})`;
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

