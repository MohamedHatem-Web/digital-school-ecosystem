import { getRoleDashboardUrl, ROLE_DASHBOARDS } from './dashboard-routing.js';
import { readCachedUserSession } from './session-cache.js';
import { getTenantSlug, isSameTenant } from './tenant-router.js';

export function syncPublicDashboardEntry() {
  const activeUser = readCachedUserSession();
  if (!activeUser || !Object.prototype.hasOwnProperty.call(ROLE_DASHBOARDS, activeUser.role)) return;

  const isPlatformAdmin = activeUser.role === 'super_admin';
  const tenantSlug = getTenantSlug();
  if (!isPlatformAdmin && (!activeUser.schoolId ||
    (tenantSlug && !isSameTenant(activeUser.schoolId, tenantSlug)))) {
    return;
  }

  const destination = getRoleDashboardUrl(activeUser.role, activeUser.schoolId);
  const userName = activeUser.displayName || 'حسابي';
  const platformEntry = document.querySelector('.platform-admin-login');
  const headerLoginLinks = [...document.querySelectorAll('.header-cta-group a[href*="login"]')];
  const updateDashboardLink = (link) => {
    link.href = destination;
    link.classList.remove('btn-outline', 'btn-sm');
    link.classList.add('btn-accent', 'btn-md');
    link.textContent = '👤 لوحة التحكم';
    link.setAttribute('aria-label', 'الانتقال إلى لوحة التحكم');
    link.title = `مرحباً ${userName} — الانتقال إلى لوحة التحكم`;
  };

  if (platformEntry) {
    updateDashboardLink(platformEntry);
    headerLoginLinks.forEach((link) => {
      link.hidden = true;
      link.setAttribute('aria-hidden', 'true');
    });
  } else {
    headerLoginLinks.forEach(updateDashboardLink);
  }

  document.querySelectorAll('.drawer-nav-list + div a[href*="login"]').forEach((link) => {
    link.href = destination;
    link.textContent = '👤 الانتقال إلى لوحة التحكم';
  });

  document.querySelectorAll('.hero-actions-bar a[href*="login"]').forEach((link) => {
    link.href = destination;
    link.textContent = '🚀 الدخول إلى لوحة التحكم';
    link.title = `لوحة تحكم ${userName}`;
  });

  document.querySelectorAll('.site-footer a[href*="login"]').forEach((link) => {
    link.href = destination;
  });
}
