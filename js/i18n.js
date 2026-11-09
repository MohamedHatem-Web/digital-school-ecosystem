// ==========================================================================
// DIGITAL SCHOOL ECOSYSTEM (VANILLA EDITION)
// Permanent Arabic RTL Infrastructure
// ==========================================================================

export const currentLang = 'ar';

export function initI18n() {
  document.documentElement.lang = 'ar';
  document.documentElement.dir = 'rtl';
}

export function t(key) {
  return key;
}

export function getCurrentLanguage() {
  return 'ar';
}
