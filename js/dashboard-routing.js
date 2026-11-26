import { buildTenantUrl, getTenantSchoolSlug, getTenantSlug } from './tenant-router.js';

export const ROLE_DASHBOARDS = {
  super_admin: '/platform-admin/dashboard.html',
  director: 'dashboard/admin-overview.html',
  tech_specialist: 'dashboard/tech-devices.html',
  student_affairs: 'dashboard/student-affairs.html',
  teacher: 'dashboard/teacher-portal.html',
  student: 'dashboard/student-portal.html',
  parent: 'dashboard/parent-portal.html',
  social_affairs: 'dashboard/social-affairs.html',
};

export function getRoleDashboardUrl(role, schoolId) {
  const dashboardPath = ROLE_DASHBOARDS[role] || 'dashboard/admin-overview.html';
  if (role === 'super_admin') return ROLE_DASHBOARDS.super_admin;

  const schoolSlug = getTenantSlug() || (schoolId ? getTenantSchoolSlug(schoolId) : null);
  if (schoolSlug && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(schoolSlug)) {
    return buildTenantUrl(dashboardPath, schoolSlug);
  }
  return dashboardPath;
}
