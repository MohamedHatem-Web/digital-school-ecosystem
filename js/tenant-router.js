export const PLATFORM_ROOT_PATH = '/';
export const DEFAULT_SCHOOL_SLUG = 'zewail-school';
export const DEFAULT_SCHOOL_ID = 'zewail-school';

export function getTenantSlug(pathname = window.location.pathname) {
  const segments = pathname.split('/').filter(Boolean);
  if (segments.length === 0) return null;
  const reserved = new Set([
    'index.html', 'login.html', 'about.html', 'activities.html', 'calendar.html',
    'contact.html', 'gallery.html', 'leadership.html', 'news.html', 'offline.html',
    'verify.html', 'dashboard', 'js', 'css', 'images', 'evidence', 'api',
    'platform-admin',
  ]);
  if (reserved.has(segments[0])) return null;
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(segments[0]) ? segments[0] : null;
}

export function isPlatformRoot(pathname = window.location.pathname) {
  const segments = pathname.split('/').filter(Boolean);
  return segments.length === 0 || ['index.html', 'index.htm'].includes(segments[0]);
}

export function getTenantSchoolId(schoolSlug = getTenantSlug()) {
  return schoolSlug || DEFAULT_SCHOOL_ID;
}

export function getTenantSchoolSlug(schoolId = DEFAULT_SCHOOL_ID) {
  return schoolId === 'sch_cairo_sec_01' ? DEFAULT_SCHOOL_SLUG : schoolId;
}

export function isSameTenant(schoolId, schoolSlug = getTenantSlug()) {
  return Boolean(schoolId && schoolSlug && getTenantSchoolSlug(schoolId) === schoolSlug);
}

export function buildTenantUrl(path = '/', schoolSlug = getTenantSlug()) {
  const cleanPath = String(path).replace(/^\/+/, '');
  if (!schoolSlug) return `/${cleanPath}`;
  return `/${schoolSlug}/${cleanPath}`;
}

export function applyTenantNavigation() {
  const slug = getTenantSlug();
  if (!slug) return;
  document.querySelectorAll('a[href]').forEach((anchor) => {
    const href = anchor.getAttribute('href');
    if (!href || /^(?:https?:|mailto:|tel:|#|javascript:)/i.test(href) || href.startsWith(`/${slug}/`)) return;
    if (href.startsWith('/')) {
      anchor.setAttribute('href', `/${slug}/${href.replace(/^\/+/, '')}`);
      return;
    }
    const cleaned = href.replace(/^(\.\.\/)+/, '');
    if (!cleaned || cleaned === '/') {
      anchor.setAttribute('href', `/${slug}/`);
      return;
    }
    anchor.setAttribute('href', `/${slug}/${cleaned}`);
  });
}
