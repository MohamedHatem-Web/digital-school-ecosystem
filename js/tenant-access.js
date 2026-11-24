import { db, doc, getDoc } from './firebase.js';
import { getTenantSchoolId, getTenantSchoolSlug, getTenantSlug } from './tenant-router.js';

const APPROVAL_CACHE_PREFIX = 'dse_approved_tenant_';
const APPROVAL_CACHE_TTL_MS = 2 * 60 * 1000;

let tenantAccessPromise;

export function guardTenantRoute() {
  const tenantSlug = getTenantSlug();
  if (!tenantSlug) return Promise.resolve(true);
  if (tenantAccessPromise) return tenantAccessPromise;

  if (hasRecentApproval(tenantSlug)) {
    tenantAccessPromise = Promise.resolve(true);
    checkTenantRoute(tenantSlug).catch((error) => {
      console.warn('تعذر تحديث حالة اعتماد المدرسة في الخلفية:', error);
    });
    return tenantAccessPromise;
  }

  showTenantLoading();
  tenantAccessPromise = checkTenantRoute(tenantSlug).catch((error) => {
    console.error('تعذر التحقق من تفعيل المدرسة:', error);
    renderBlockedPage({
      title: 'تعذر التحقق من المدرسة',
      message: 'لم نتمكن من الاتصال للتحقق من اعتماد هذا الرابط. حاول مرة أخرى أو ارجع إلى دليل المدارس.',
      retry: true,
    });
    return false;
  });
  return tenantAccessPromise;
}

export function rememberApprovedTenantAccess(tenantSlug) {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(String(tenantSlug || ''))) return;
  try {
    sessionStorage.setItem(`${APPROVAL_CACHE_PREFIX}${tenantSlug}`, String(Date.now()));
  } catch (error) {
    console.warn('تعذر حفظ تأكيد اعتماد المدرسة لهذه الجلسة:', error);
  }
}

export function blockTenantForWrongSchool(user, tenantSlug = getTenantSlug()) {
  if (!user?.schoolId || !tenantSlug) return Promise.resolve(false);
  showTenantLoading();
  return renderWrongSchool(user, tenantSlug);
}

async function checkTenantRoute(tenantSlug) {
  const schoolId = getTenantSchoolId(tenantSlug);
  const snapshot = await getDoc(doc(db, 'schools', schoolId));
  if (!snapshot.exists() || snapshot.data().status !== 'active') {
    clearApproval(tenantSlug);
    renderBlockedPage({
      title: 'رابط المدرسة غير متاح',
      message: 'هذا الرابط غير موجود أو لم يحصل على اعتماد مدير النظام بعد.',
      link: { href: '/', label: 'العودة إلى دليل المدارس' },
    });
    return false;
  }

  rememberApprovedTenantAccess(tenantSlug);
  removeTenantLoading();
  return true;
}

function hasRecentApproval(tenantSlug) {
  try {
    const checkedAt = Number(sessionStorage.getItem(`${APPROVAL_CACHE_PREFIX}${tenantSlug}`));
    const age = Date.now() - checkedAt;
    return Number.isFinite(checkedAt) && age >= 0 && age < APPROVAL_CACHE_TTL_MS;
  } catch (error) {
    console.warn('تعذر قراءة تأكيد اعتماد المدرسة لهذه الجلسة:', error);
    return false;
  }
}

function clearApproval(tenantSlug) {
  try {
    sessionStorage.removeItem(`${APPROVAL_CACHE_PREFIX}${tenantSlug}`);
  } catch (error) {
    console.warn('تعذر مسح تأكيد اعتماد المدرسة لهذه الجلسة:', error);
  }
}

async function renderWrongSchool(user, attemptedSlug) {
  const schoolId = user.schoolId;
  let schoolName = schoolId;
  try {
    const snapshot = await getDoc(doc(db, 'schools', schoolId));
    if (snapshot.exists()) schoolName = snapshot.data().nameAr || schoolName;
  } catch (error) {
    console.warn('تعذر تحميل اسم مدرسة الحساب:', error);
  }

  const ownSlug = getTenantSchoolSlug(schoolId);
  renderBlockedPage({
    title: 'أنت على رابط مدرسة أخرى',
    message: `هذا الحساب تابع لمدرسة ${schoolName}، وليس للمدرسة التي تحاول فتحها.`,
    link: { href: `/${encodeURIComponent(ownSlug)}/`, label: `الانتقال إلى ${schoolName}` },
    attemptedSlug,
  });
  return false;
}

function renderBlockedPage({ title, message, link, retry = false }) {
  const container = document.createElement('main');
  container.dir = 'rtl';
  container.style.cssText = 'min-height:100vh;display:grid;place-items:center;padding:24px;background:#0b1220;color:#f8fafc;font-family:system-ui,sans-serif;text-align:center';

  const card = document.createElement('section');
  card.style.cssText = 'max-width:560px;padding:36px;border:1px solid #334155;border-radius:20px;background:#111b2d;box-shadow:0 20px 60px #0005';

  const heading = document.createElement('h1');
  heading.textContent = title;
  heading.style.cssText = 'margin:0 0 12px;font-size:1.6rem';

  const description = document.createElement('p');
  description.textContent = message;
  description.style.cssText = 'margin:0 0 24px;color:#cbd5e1;line-height:1.8';

  card.append(heading, description);
  if (link) {
    const anchor = document.createElement('a');
    anchor.href = link.href;
    anchor.textContent = link.label;
    anchor.style.cssText = 'display:inline-flex;margin:4px;padding:12px 18px;border-radius:10px;background:#2563eb;color:#fff;text-decoration:none;font-weight:700';
    card.append(anchor);
  }
  if (retry) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = 'إعادة المحاولة';
    button.style.cssText = 'display:inline-flex;margin:4px;padding:12px 18px;border:1px solid #64748b;border-radius:10px;background:transparent;color:#fff;cursor:pointer';
    button.addEventListener('click', () => window.location.reload());
    card.append(button);
  }
  container.append(card);
  removeTenantLoading();
  document.body.replaceChildren(container);
}

function showTenantLoading() {
  if (document.getElementById('tenant-route-loading')) return;

  const overlay = document.createElement('div');
  overlay.id = 'tenant-route-loading';
  overlay.setAttribute('aria-hidden', 'true');
  overlay.style.cssText = 'position:fixed;inset:0;z-index:2147483647;background:var(--bg-page,#f8fafc)';
  document.body.append(overlay);
}

function removeTenantLoading() {
  document.getElementById('tenant-route-loading')?.remove();
}
