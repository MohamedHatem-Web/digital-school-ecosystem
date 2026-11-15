// ==========================================================================
// DIGITAL SCHOOL ECOSYSTEM (VANILLA EDITION)
// Client Route Guard & Authorization Enforcement
// ==========================================================================

import { getCurrentUser, logout, ROLES_METADATA, updateUserProfile } from './auth.js';
import { auth, authPersistenceReady, onAuthStateChanged, doc, getDoc, db, signOut } from './firebase.js';
import { changeOwnPassword } from './services/account-service.js';

/**
 * Validates route access against user's verified role and Firebase Auth session.
 * @param {string[]} allowedRoles Array of role identifiers permitted on this page
 */
export function checkRouteAccess(allowedRoles = []) {
  // Step 1: Immediate fast check via session cache
  const cachedUser = getCurrentUser();
  const isInsideDashboard = window.location.pathname.includes('/dashboard/');
  const loginUrl = isInsideDashboard ? '../login.html' : 'login.html';
  const unauthorizedUrl = isInsideDashboard ? 'unauthorized.html' : 'dashboard/unauthorized.html';

  if (cachedUser?.passwordChangeRequired) {
    window.location.replace(`${loginUrl}?forcePasswordChange=1`);
    return false;
  }

  const effectiveRoles = [...allowedRoles];

  // Mutual administrative access: director and social_affairs share supervisory dashboards
  if (effectiveRoles.includes('director') && !effectiveRoles.includes('social_affairs')) {
    effectiveRoles.push('social_affairs');
  }
  if (effectiveRoles.includes('social_affairs') && !effectiveRoles.includes('director')) {
    effectiveRoles.push('director');
  }
  if ((effectiveRoles.includes('director') || effectiveRoles.includes('social_affairs')) && !effectiveRoles.includes('super_admin')) {
    effectiveRoles.push('super_admin');
  }

  if (!cachedUser) {
    // If not in cache, wait for Firebase Auth state to resolve
    onAuthReady(async (firebaseUser) => {
      if (!firebaseUser) {
        clearCachedSession();
        window.location.replace(loginUrl);
        return;
      }

      // Fetch user role from Firestore
      try {
        const userDoc = await getDoc(doc(db, 'users', firebaseUser.uid));
        if (!userDoc.exists()) {
          await rejectUnprovisionedSession(loginUrl);
          return;
        }
        const userData = userDoc.data();
        const role = userData.role || 'director';

        if (userData.passwordChangeRequired) {
          const profile = {
            uid: firebaseUser.uid,
            email: firebaseUser.email,
            displayName: firebaseUser.displayName || userData.displayName || 'طالب',
            ...userData,
          };
          localStorage.setItem('dse_user_session', JSON.stringify(profile));
          sessionStorage.setItem('dse_user_session', JSON.stringify(profile));
          window.location.replace(`${loginUrl}?forcePasswordChange=1`);
          return;
        }

        if (!ROLES_METADATA[role] || !userData.schoolId || (userData.status && userData.status !== 'active')) {
          await rejectUnprovisionedSession(loginUrl);
          return;
        }
        if (effectiveRoles.length > 0 && !effectiveRoles.includes(role)) {
          window.location.replace(unauthorizedUrl);
          return;
        }

        updateUserInterface({
          uid: firebaseUser.uid,
          email: firebaseUser.email,
          ...userData,
          displayName: userData.displayName || firebaseUser.displayName,
          role,
          schoolId: userData.schoolId || 'sch_cairo_sec_01',
        });
      } catch (err) {
        console.error('Auth verification error:', err);
        if (isTemporaryAuthCheckError(err)) {
          showAuthRetryNotice(err);
          return;
        }
        window.location.replace(loginUrl);
      }
    }, (error) => {
      if (isTemporaryAuthCheckError(error)) showAuthRetryNotice(error);
      else window.location.replace(loginUrl);
    });
    return false;
  }

  // Check role authorization against cache
  if (effectiveRoles.length > 0 && !effectiveRoles.includes(cachedUser.role)) {
    window.location.replace(unauthorizedUrl);
    return false;
  }

  // Update UI immediately with cached data
  updateUserInterface(cachedUser);

  // Step 2: Asynchronously verify against live Firebase Auth session
  onAuthReady(async (firebaseUser) => {
    if (!firebaseUser) {
      if (cachedUser && navigator.onLine === false) {
        showAuthRetryNotice(Object.assign(new Error('Firebase Auth is unavailable offline.'), { code: 'network-request-failed' }));
        return;
      }
      clearCachedSession();
      window.location.replace(loginUrl);
      return;
    }

    try {
      const userDoc = await getDoc(doc(db, 'users', firebaseUser.uid));
      if (!userDoc.exists()) {
        await rejectUnprovisionedSession(loginUrl);
        return;
      }
      const liveData = userDoc.data();
      const role = liveData.role || 'director';
      if (liveData.passwordChangeRequired) {
        const updated = { ...cachedUser, ...liveData, passwordChangeRequired: true };
        localStorage.setItem('dse_user_session', JSON.stringify(updated));
        sessionStorage.setItem('dse_user_session', JSON.stringify(updated));
        window.location.replace(`${loginUrl}?forcePasswordChange=1`);
        return;
      }
      if (!ROLES_METADATA[role] || !liveData.schoolId || (liveData.status && liveData.status !== 'active')) {
        await rejectUnprovisionedSession(loginUrl);
        return;
      }
      if (effectiveRoles.length > 0 && !effectiveRoles.includes(role)) {
        window.location.replace(unauthorizedUrl);
        return;
      }
      const updated = {
        ...cachedUser,
        ...liveData,
        role,
      };
      localStorage.setItem('dse_user_session', JSON.stringify(updated));
      sessionStorage.setItem('dse_user_session', JSON.stringify(updated));
      updateUserInterface(updated);
    } catch (e) {
      console.warn('Live session validation notice (keeping cached session active):', e);
    }
  }, (error) => {
    console.warn('Firebase Auth restore notice (keeping cached session active):', error);
    showAuthRetryNotice(error);
  });

  return true;
}

function onAuthReady(callback, onError) {
  Promise.resolve(authPersistenceReady)
    .then(() => (typeof auth.authStateReady === 'function' ? auth.authStateReady() : undefined))
    .then(() => onAuthStateChanged(auth, callback))
    .catch(onError);
}

function clearCachedSession() {
  localStorage.removeItem('dse_user_session');
  sessionStorage.removeItem('dse_user_session');
  document.cookie = 'dse_user_session=; path=/; max-age=0; SameSite=Lax';
  document.cookie = 'dse_role=; path=/; max-age=0; SameSite=Lax';
  document.cookie = 'dse_user_name=; path=/; max-age=0; SameSite=Lax';
}

function isTemporaryAuthCheckError(error) {
  return navigator.onLine === false || [
    'unavailable',
    'deadline-exceeded',
    'network-request-failed',
    'auth/network-request-failed',
  ].includes(error?.code);
}

function showAuthRetryNotice(error) {
  let notice = document.getElementById('auth-verification-retry-notice');
  if (!notice) {
    notice = document.createElement('section');
    notice.id = 'auth-verification-retry-notice';
    notice.setAttribute('role', 'alert');
    notice.style.cssText = 'position:fixed;inset:12px 12px auto;z-index:20000;display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 16px;border:1px solid var(--color-warning-border,#d97706);border-radius:8px;background:var(--color-warning-bg,#fffbeb);color:var(--color-warning-text,#92400e);box-shadow:0 8px 24px rgba(0,0,0,.18);';
    const message = document.createElement('span');
    message.textContent = 'تعذر التحقق من الحساب بسبب الاتصال بالخادم. لم يتم تسجيل خروجك؛ تحقق من الاتصال ثم أعد المحاولة.';
    const retry = document.createElement('button');
    retry.type = 'button';
    retry.className = 'btn btn-warning btn-sm';
    retry.textContent = 'إعادة المحاولة';
    retry.addEventListener('click', () => window.location.reload());
    notice.append(message, retry);
    document.body.appendChild(notice);
  }
  notice.dataset.errorCode = error?.code || 'network';
}

async function rejectUnprovisionedSession(loginUrl) {
  clearCachedSession();
  try {
    await signOut(auth);
  } catch (error) {
    console.warn('Invalid session sign-out notice:', error);
  }
  window.location.replace(loginUrl);
}

/**
 * Updates topbar indicators, binds logout buttons, and injects interactive profile editor
 */
function updateUserInterface(user) {
  const applyUI = () => {
    const nameEl = document.getElementById('topbar-user-name');
    const roleEl = document.getElementById('topbar-user-role');
    const avatarEl = document.getElementById('topbar-user-avatar');
    const profileWidget = document.querySelector('.user-profile-widget');

    const meta = ROLES_METADATA[user.role] || { titleAr: user.role, titleEn: user.role };

    // Resolve realistic display name if generic
    const knownStaffNames = {
      'director@dse.edu.eg': 'د. طارق محمود المنشاوي',
      'tech@dse.edu.eg': 'م. حسام الدين عبد العزيز',
      'affairs@dse.edu.eg': 'أ. محمود عبد الرحمن سالم',
      'teacher@dse.edu.eg': 'أ. إبراهيم فؤاد القاضي',
      'student@dse.edu.eg': 'يوسف أحمد المنشاوي',
      'parent@dse.edu.eg': 'أ. أحمد المنشاوي',
      'social@dse.edu.eg': 'أ. نادية مصطفى الشريف',
      'superadmin@dse.edu.eg': 'د. خالد السعيد عبد الحميد',
    };

    let resolvedName = user.displayName;
    let resolvedRoleTitle = meta.titleAr;

    const isParentPortal = window.location.pathname.includes('parent-portal.html');
    const isStudentPortal = window.location.pathname.includes('student-portal.html');
    const isFamilyUser = user.role === 'student' || user.role === 'parent' || user.email === 'student@dse.edu.eg' || user.email === 'parent@dse.edu.eg';

    if (isFamilyUser && isParentPortal) {
      resolvedName = user.displayName || 'ولي الأمر';
      resolvedRoleTitle = 'ولي أمر';
    } else if (isFamilyUser && isStudentPortal) {
      resolvedName = user.displayName || 'الطالب';
      resolvedRoleTitle = 'طالب';
    } else if (user.email && knownStaffNames[user.email]) {
      resolvedName = knownStaffNames[user.email];
    } else if (!resolvedName || resolvedName === 'طالب' || resolvedName === 'ولي أمر' || resolvedName === 'مستخدم المنظومة') {
      resolvedName = meta.titleAr;
    }

    if (nameEl) nameEl.textContent = resolvedName;
    if (roleEl) roleEl.textContent = resolvedRoleTitle;
    const sidebarRoleBadge = document.querySelector('.sidebar-role-indicator .badge');
    if (sidebarRoleBadge) sidebarRoleBadge.textContent = resolvedRoleTitle;
    if (avatarEl) {
      const initial = (resolvedName || 'م').trim().charAt(0);
      avatarEl.textContent = initial;
    }

    // Role-based profile edit permission: ONLY staff / supervisors can edit their name & phone.
    // Students & Parents are strictly locked (managed exclusively by Student Affairs).
    const STAFF_ROLES_ALLOWED_PROFILE_EDIT = ['super_admin', 'director', 'student_affairs', 'tech_specialist', 'social_affairs', 'teacher'];
    const canEdit = STAFF_ROLES_ALLOWED_PROFILE_EDIT.includes(user.role);

    if (profileWidget) {
      if (!canEdit) {
        profileWidget.style.cursor = 'default';
        profileWidget.title = 'حساب معتمد رسميًا — للعرض والمتابعة فقط (التعديل متاح فقط لشؤون الطلاب والمشرفين)';
      } else {
        profileWidget.style.cursor = 'pointer';
        profileWidget.title = 'انقر لتعديل بيانات حسابك الرسمي وحفظها';

        if (!document.getElementById('user-profile-modal')) {
        const modalHtml = `
        <div id="user-profile-modal" style="display: none; position: fixed; inset: 0; background: rgba(10, 22, 40, 0.6); backdrop-filter: blur(4px); z-index: 9999; align-items: center; justify-content: center; padding: 1rem;">
          <div style="background: #ffffff; border-radius: var(--radius-md); max-width: 460px; width: 100%; border: 1px solid var(--border-default); box-shadow: var(--shadow-xl); overflow: hidden; animation: fadeIn 0.2s ease-out;">
            <div style="background: var(--color-primary-950); color: #ffffff; padding: var(--space-4) var(--space-5); display: flex; justify-content: space-between; align-items: center;">
              <div style="display: flex; align-items: center; gap: var(--space-2);">
                <span style="font-size: 1.25rem;">👤</span>
                <h3 style="font-size: var(--text-base); font-weight: 800; margin: 0; color: #ffffff;">تعديل بيانات الحساب الشخصي</h3>
              </div>
              <button type="button" id="close-profile-modal-btn" style="background: none; border: none; color: #ffffff; font-size: 1.25rem; cursor: pointer; line-height: 1;">&times;</button>
            </div>

            <form id="user-profile-edit-form" style="padding: var(--space-5); display: flex; flex-direction: column; gap: var(--space-4);">
              <div style="padding: var(--space-3); background: var(--bg-surface-subtle); border-radius: var(--radius-sm); border: 1px solid var(--border-subtle); display: flex; justify-content: space-between; align-items: center;">
                <div>
                  <div style="font-size: 11px; color: var(--text-muted);">الدور الوظيفي المعتمد</div>
                  <strong style="font-size: var(--text-xs); color: var(--color-primary-950);" id="modal-role-badge">${meta.titleAr}</strong>
                </div>
                <span class="badge ${meta.badgeClass || 'badge-primary'}">${user.role}</span>
              </div>

              <div>
                <label style="display: block; font-size: var(--text-xs); font-weight: 700; color: var(--text-primary); margin-bottom: 4px;">الاسم الرسمي المعتمد بالمنظومة</label>
                <input type="text" id="profile-display-name-input" class="form-control" value="${user.displayName || ''}" required placeholder="مثال: د. طارق محمود المنشاوي" style="width: 100%; height: 42px;">
                <small style="font-size: 11px; color: var(--text-muted); margin-top: 2px; display: block;">يظهر هذا الاسم في توقيعات القرارات ومحاضر الانصراف والتسليم الرسمية.</small>
              </div>

              <div>
                <label style="display: block; font-size: var(--text-xs); font-weight: 700; color: var(--text-primary); margin-bottom: 4px;">البريد الإلكتروني المعتمد (للقراءة فقط)</label>
                <input type="email" class="form-control" value="${user.email || ''}" disabled style="width: 100%; height: 40px; background: #f8fafc; color: #64748b;">
              </div>

              <div>
                <label style="display: block; font-size: var(--text-xs); font-weight: 700; color: var(--text-primary); margin-bottom: 4px;">رقم الهاتف المعتمد</label>
                <input type="tel" id="profile-phone-input" class="form-control" value="${user.phone || ''}" placeholder="01XXXXXXXXX" style="width: 100%; height: 42px;">
              </div>

              <div id="profile-modal-alert" style="display: none; padding: var(--space-2) var(--space-3); font-size: var(--text-xs); border-radius: var(--radius-xs);"></div>

              <div style="display: flex; justify-content: flex-end; gap: var(--space-2); margin-top: var(--space-2);">
                <button type="button" id="cancel-profile-modal-btn" class="btn btn-outline btn-md">إلغاء</button>
                <button type="submit" id="save-profile-btn" class="btn btn-primary btn-md">
                  <span>💾 حفظ التعديلات</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      `;
      document.body.insertAdjacentHTML('beforeend', modalHtml);

      const modalEl = document.getElementById('user-profile-modal');
      const closeBtn = document.getElementById('close-profile-modal-btn');
      const cancelBtn = document.getElementById('cancel-profile-modal-btn');
      const formEl = document.getElementById('user-profile-edit-form');
      const nameInput = document.getElementById('profile-display-name-input');
      const phoneInput = document.getElementById('profile-phone-input');
      const alertEl = document.getElementById('profile-modal-alert');
      const saveBtn = document.getElementById('save-profile-btn');

      const openModal = () => {
        nameInput.value = user.displayName || '';
        phoneInput.value = user.phone || '';
        modalEl.style.display = 'flex';
      };

      const closeModal = () => {
        modalEl.style.display = 'none';
        alertEl.style.display = 'none';
      };

      profileWidget.addEventListener('click', (e) => {
        if (!e.target.closest('.logout-btn')) {
          openModal();
        }
      });

      closeBtn.addEventListener('click', closeModal);
      cancelBtn.addEventListener('click', closeModal);
      modalEl.addEventListener('click', (e) => {
        if (e.target === modalEl) closeModal();
      });

      formEl.addEventListener('submit', async (e) => {
        e.preventDefault();
        const newDisplayName = nameInput.value.trim();
        const newPhone = phoneInput.value.trim();

        if (!newDisplayName) return;

        saveBtn.disabled = true;
        saveBtn.textContent = 'جاري الحفظ...';

        try {
          const updatedUser = await updateUserProfile({
            displayName: newDisplayName,
            phone: newPhone,
          });

          user.displayName = newDisplayName;
          user.phone = newPhone;

          if (nameEl) nameEl.textContent = newDisplayName;
          if (avatarEl) avatarEl.textContent = newDisplayName.charAt(0);

          alertEl.className = 'alert alert-success';
          alertEl.style.display = 'block';
          alertEl.textContent = 'تم حفظ بياناتك وتحديث السجلات بنجاح.';

          setTimeout(() => {
            closeModal();
            saveBtn.disabled = false;
            saveBtn.innerHTML = '<span>💾 حفظ التعديلات</span>';
          }, 1200);
        } catch (err) {
          console.error('Error saving profile:', err);
          alertEl.className = 'alert alert-danger';
          alertEl.style.display = 'block';
          alertEl.textContent = 'حدث خطأ أثناء الحفظ: ' + err.message;
          saveBtn.disabled = false;
          saveBtn.innerHTML = '<span>💾 حفظ التعديلات</span>';
        }
      });
      } // closes if (!document.getElementById('user-profile-modal'))
      } // closes else (canEdit)
    } // closes if (profileWidget)

    ensureSelfPasswordChange(profileWidget);

    // Attach logout handlers
    const logoutBtns = document.querySelectorAll('.logout-btn');
    logoutBtns.forEach((btn) => {
      btn.onclick = async (e) => {
        e.preventDefault();
        e.stopPropagation();
        btn.setAttribute('disabled', 'true');
        btn.style.opacity = '0.5';
        await logout();
      };
    });
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', applyUI);
  } else {
    applyUI();
  }
}

function ensureSelfPasswordChange(profileWidget) {
  if (!profileWidget) return;
  let button = profileWidget.querySelector('.self-password-change-btn');
  if (button) return;

  button = document.createElement('button');
  button.type = 'button';
  button.className = 'self-password-change-btn';
  button.title = 'تغيير كلمة المرور';
  button.setAttribute('aria-label', 'تغيير كلمة المرور');
  button.style.cssText = 'display:inline-flex;align-items:center;justify-content:center;min-width:36px;height:36px;padding:0 10px;border:1px solid var(--border-light);border-radius:var(--radius-sm);background:var(--bg-surface);color:var(--text-primary);cursor:pointer;font-size:12px;white-space:nowrap;';
  button.textContent = 'تغيير كلمة المرور';
  const logoutButton = profileWidget.querySelector('.logout-btn');
  profileWidget.insertBefore(button, logoutButton || null);

  if (!document.getElementById('self-password-change-modal')) {
    document.body.insertAdjacentHTML('beforeend', `
      <div id="self-password-change-modal" class="modal-backdrop" style="display:none;position:fixed;inset:0;background:rgba(10,22,40,.78);backdrop-filter:blur(4px);z-index:12000;align-items:center;justify-content:center;padding:var(--space-4);">
        <section class="panel" style="max-width:480px;width:100%;">
          <div class="panel-header" style="display:flex;align-items:center;justify-content:space-between;gap:var(--space-3);">
            <h2 class="panel-title" style="margin:0;">تغيير كلمة المرور</h2>
            <button type="button" id="self-password-change-close" class="btn btn-outline btn-sm" aria-label="إغلاق">إغلاق</button>
          </div>
          <form id="self-password-change-form" class="panel-body" style="display:grid;gap:var(--space-3);">
            <div class="form-group"><label class="form-label" for="self-password-current">كلمة المرور الحالية</label><input id="self-password-current" class="form-control" type="password" autocomplete="current-password" required></div>
            <div class="form-group"><label class="form-label" for="self-password-new">كلمة المرور الجديدة</label><input id="self-password-new" class="form-control" type="password" minlength="12" autocomplete="new-password" required><small style="color:var(--text-muted);">12 حرفًا على الأقل، مع حرف كبير وصغير ورقم ورمز.</small></div>
            <div class="form-group"><label class="form-label" for="self-password-confirm">تأكيد كلمة المرور الجديدة</label><input id="self-password-confirm" class="form-control" type="password" minlength="12" autocomplete="new-password" required></div>
            <p id="self-password-change-status" role="status" aria-live="polite" style="min-height:1.5em;margin:0;font-size:var(--text-xs);"></p>
            <div style="display:flex;justify-content:flex-end;"><button id="self-password-change-submit" type="submit" class="btn btn-primary btn-md">حفظ كلمة المرور</button></div>
          </form>
        </section>
      </div>
    `);

    const modal = document.getElementById('self-password-change-modal');
    const form = document.getElementById('self-password-change-form');
    const status = document.getElementById('self-password-change-status');
    const submit = document.getElementById('self-password-change-submit');
    const close = () => {
      modal.style.display = 'none';
      form.reset();
      status.textContent = '';
    };
    document.getElementById('self-password-change-close').addEventListener('click', close);
    modal.addEventListener('click', (event) => {
      if (event.target === modal) close();
    });
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const currentPassword = document.getElementById('self-password-current').value;
      const newPassword = document.getElementById('self-password-new').value;
      const confirmation = document.getElementById('self-password-confirm').value;
      if (newPassword !== confirmation) {
        status.textContent = 'كلمتا المرور الجديدتان غير متطابقتين.';
        status.style.color = 'var(--color-danger-text)';
        return;
      }
      if (newPassword.length < 12 || !/[a-z]/.test(newPassword) || !/[A-Z]/.test(newPassword) ||
        !/\d/.test(newPassword) || !/[^A-Za-z0-9]/.test(newPassword)) {
        status.textContent = 'استخدم 12 حرفًا على الأقل، مع حرف كبير وصغير ورقم ورمز.';
        status.style.color = 'var(--color-danger-text)';
        return;
      }
      if (newPassword === currentPassword) {
        status.textContent = 'اختر كلمة مرور مختلفة عن الحالية.';
        status.style.color = 'var(--color-danger-text)';
        return;
      }

      submit.disabled = true;
      status.textContent = 'جارٍ التحقق من كلمة المرور الحالية...';
      status.style.color = 'var(--text-muted)';
      try {
        await changeOwnPassword(currentPassword, newPassword);
        status.textContent = 'تم تغيير كلمة المرور بنجاح.';
        status.style.color = 'var(--color-success-text)';
        form.reset();
        setTimeout(close, 1200);
      } catch (error) {
        status.textContent = error.code === 'auth/wrong-password' || error.code === 'auth/invalid-credential'
          ? 'كلمة المرور الحالية غير صحيحة.'
          : error.code === 'auth/requires-recent-login'
            ? 'سجل الدخول مرة أخرى ثم أعد المحاولة.'
            : 'تعذر تغيير كلمة المرور. تحقق من البيانات والاتصال ثم أعد المحاولة.';
        status.style.color = 'var(--color-danger-text)';
      } finally {
        submit.disabled = false;
      }
    });
  }

  button.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    document.getElementById('self-password-change-modal').style.display = 'flex';
  });
}
