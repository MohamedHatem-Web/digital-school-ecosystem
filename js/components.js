// ==========================================================================
// DIGITAL SCHOOL ECOSYSTEM (VANILLA EDITION)
// Shared UI Interactive Components (Drawers, Modals, Menus, Active Session Sync)
// ==========================================================================

import { getCurrentUser, getRoleDashboardUrl } from './auth.js';

export function initComponents() {
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
          if (name !== 'dse-pwa-v6.0-prod') {
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

        // Update header CTA button
        document.querySelectorAll('.header-cta-group a[href*="login"]').forEach((btn) => {
          btn.href = dest;
          btn.className = 'btn btn-accent btn-md';
          btn.innerHTML = `<span style="display: flex; align-items: center; gap: 6px;">👤 <span>لوحة التحكم (${userName})</span></span>`;
          btn.title = 'حسابك مسجل بالفعل — انقر للدخول المباشر لمساحتك المعتمدة';
        });

        // Update mobile drawer button
        document.querySelectorAll('.drawer-nav-list + div a[href*="login"]').forEach((btn) => {
          btn.href = dest;
          btn.className = 'btn btn-accent btn-full';
          btn.innerHTML = `👤 لوحة التحكم (${userName})`;
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
    const mobileToggleBtn = document.querySelector('.mobile-menu-btn');
    const drawerOverlay = document.querySelector('.mobile-drawer-overlay');
    const drawer = document.querySelector('.mobile-drawer');
    const drawerCloseBtn = document.querySelector('.drawer-close-btn');

    if (mobileToggleBtn && drawer && drawerOverlay) {
      const openDrawer = () => {
        drawerOverlay.classList.add('open');
        drawer.classList.add('open');
      };
      const closeDrawer = () => {
        drawerOverlay.classList.remove('open');
        drawer.classList.remove('open');
      };

      mobileToggleBtn.addEventListener('click', openDrawer);
      drawerOverlay.addEventListener('click', closeDrawer);
      if (drawerCloseBtn) drawerCloseBtn.addEventListener('click', closeDrawer);
    }

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
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setup);
  } else {
    setup();
  }
}

