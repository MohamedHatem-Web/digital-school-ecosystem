// ==========================================================================
// DIGITAL SCHOOL ECOSYSTEM (VANILLA EDITION)
// Client Route Guard & Authorization Enforcement
// ==========================================================================

import { getCurrentUser, logout, ROLES_METADATA, updateUserProfile } from './auth.js';
import { auth, onAuthStateChanged, doc, getDoc, db } from './firebase.js';

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

  // Mutual family access: students and parents share access to both student and parent portals
  let effectiveRoles = [...allowedRoles];
  if (effectiveRoles.includes('student') && !effectiveRoles.includes('parent')) {
    effectiveRoles.push('parent');
  }
  if (effectiveRoles.includes('parent') && !effectiveRoles.includes('student')) {
    effectiveRoles.push('student');
  }

  if (!cachedUser) {
    // If not in cache, wait for Firebase Auth state to resolve
    onAuthStateChanged(auth, async (firebaseUser) => {
      if (!firebaseUser) {
        window.location.replace(loginUrl);
        return;
      }

      // Fetch user role from Firestore
      try {
        const userDoc = await getDoc(doc(db, 'users', firebaseUser.uid));
        const userData = userDoc.exists() ? userDoc.data() : { role: 'director' };
        const role = userData.role || 'director';

        if (effectiveRoles.length > 0 && !effectiveRoles.includes(role)) {
          window.location.replace(unauthorizedUrl);
          return;
        }

        updateUserInterface({
          uid: firebaseUser.uid,
          email: firebaseUser.email,
          displayName: userData.displayName || firebaseUser.displayName,
          role,
          schoolId: userData.schoolId || 'sch_cairo_sec_01',
        });
      } catch (err) {
        console.error('Auth verification error:', err);
        window.location.replace(loginUrl);
      }
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
  onAuthStateChanged(auth, async (firebaseUser) => {
    if (!firebaseUser) {
      // If we already have a validated cached user session, keep user logged in smoothly
      if (!cachedUser) {
        localStorage.removeItem('dse_user_session');
        sessionStorage.removeItem('dse_user_session');
        window.location.replace(loginUrl);
      }
      return;
    }

    try {
      const userDoc = await getDoc(doc(db, 'users', firebaseUser.uid));
      if (userDoc.exists()) {
        const liveData = userDoc.data();
        const role = liveData.role || 'director';
        if (effectiveRoles.length > 0 && !effectiveRoles.includes(role)) {
          window.location.replace(unauthorizedUrl);
          return;
        }
        const updated = {
          ...cachedUser,
          ...liveData,
        };
        localStorage.setItem('dse_user_session', JSON.stringify(updated));
        sessionStorage.setItem('dse_user_session', JSON.stringify(updated));
        updateUserInterface(updated);
      }
    } catch (e) {
      console.warn('Live session validation notice (keeping cached session active):', e);
    }
  });

  return true;
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
      resolvedName = 'أ. أحمد المنشاوي';
      resolvedRoleTitle = 'ولي أمر معتمد';
    } else if (isFamilyUser && isStudentPortal) {
      resolvedName = 'يوسف أحمد المنشاوي';
      resolvedRoleTitle = 'طالب بالصف الأول الثانوي';
    } else if (user.email && knownStaffNames[user.email]) {
      resolvedName = knownStaffNames[user.email];
    } else if (!resolvedName || resolvedName === 'طالب' || resolvedName === 'ولي أمر' || resolvedName === 'مستخدم المنظومة') {
      resolvedName = meta.titleAr;
    }

    if (nameEl) nameEl.textContent = resolvedName;
    if (roleEl) roleEl.textContent = resolvedRoleTitle;
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
