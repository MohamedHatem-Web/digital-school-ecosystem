// ==========================================================================
// DIGITAL SCHOOL ECOSYSTEM (VANILLA EDITION)
// Push Notifications & Live Alerting Service
// Web Push & Browser Native Notifications for Absences, Gate Passes & Grades
// ==========================================================================

import { DEFAULT_SCHOOL_ID } from './school-service.js';

const PUSH_STORAGE_KEY = 'dse_push_subscription';

/**
 * Check current browser notification permission
 */
export function getPushPermissionStatus() {
  if (!('Notification' in window)) return 'unsupported';
  return Notification.permission;
}

/**
 * Request notification permissions from the user
 */
export async function requestPushPermission() {
  if (!('Notification' in window)) {
    console.warn('Notifications not supported in this browser.');
    return false;
  }

  if (Notification.permission === 'granted') {
    return true;
  }

  if (Notification.permission !== 'denied') {
    const perm = await Notification.requestPermission();
    return perm === 'granted';
  }

  return false;
}

/**
 * Send a native browser push notification
 */
export async function sendLocalPushNotification({
  title = 'تنبيه المنظومة المدرسية',
  body = '',
  icon = '/manifest.webmanifest',
  tag = 'dse-notification',
  data = {},
  onClickUrl = '/'
}) {
  if (!('Notification' in window)) return null;

  if (Notification.permission !== 'granted') {
    const granted = await requestPushPermission();
    if (!granted) return null;
  }

  // If ServiceWorker is available, prefer serviceWorker.showNotification
  if ('serviceWorker' in navigator) {
    try {
      const reg = await navigator.serviceWorker.ready;
      if (reg && reg.showNotification) {
        await reg.showNotification(title, {
          body,
          icon,
          badge: icon,
          tag,
          data: { url: onClickUrl, ...data },
          dir: 'rtl',
          lang: 'ar',
          vibrate: [200, 100, 200],
        });
        return true;
      }
    } catch (e) {
      console.warn('ServiceWorker showNotification failed, using fallback:', e);
    }
  }

  // Standard window.Notification fallback
  try {
    const notif = new Notification(title, {
      body,
      icon,
      tag,
      dir: 'rtl',
      lang: 'ar',
    });
    notif.onclick = () => {
      window.focus();
      if (onClickUrl && onClickUrl !== '/') {
        window.location.href = onClickUrl;
      }
      notif.close();
    };
    return true;
  } catch (err) {
    console.warn('Native notification display error:', err);
    return false;
  }
}

/**
 * Helper: Trigger Push on Gate Pass Status Update
 */
export async function notifyGatePassStatus(pass) {
  const statusLabel = pass.status === 'approved' ? 'تم اعتماد تصريح الخروج ✓' : pass.status === 'departed' ? 'تمت مغادرة المدرسة من البوابة بأمان 🚪' : 'تحديث على تصريح الخروج';
  return sendLocalPushNotification({
    title: `بوابة المدرسة — ${statusLabel}`,
    body: `الطالب: ${pass.studentName} | السبب: ${pass.reason || 'إذن رسمي'}`,
    tag: `gate-pass-${pass.id}`,
    onClickUrl: '/dashboard/admin-overview.html#gate-pass',
  });
}

/**
 * Helper: Trigger Push on New Grade Publication
 */
export async function notifyGradePublished({ studentName, subject, score, maxScore }) {
  return sendLocalPushNotification({
    title: '📝 رصد نتيجة تقييم دراسي جديد',
    body: `تم اعتماد درجة ${subject} للطالب ${studentName}: (${score} / ${maxScore})`,
    tag: `grade-${Date.now()}`,
    onClickUrl: '/dashboard/student-portal.html',
  });
}

/**
 * Helper: Trigger Push on School Dismissal Announcement
 */
export async function notifySchoolDismissalAnnouncement(dismissal) {
  return sendLocalPushNotification({
    title: '🔔 إعلان انتهاء اليوم الدراسي وانصراف الطلاب',
    body: dismissal.message || 'انتهى اليوم الدراسي رسميًا وبدأت مغادرة الطلاب بأمان.',
    tag: 'school-dismissal',
    onClickUrl: '/dashboard/parent-portal.html',
  });
}

/**
 * Initialize Push Notification prompt UI
 */
export function initPushNotificationPrompt(containerSelector = '.topbar-end') {
  if (!('Notification' in window)) return;
  if (Notification.permission === 'granted') return;

  const container = document.querySelector(containerSelector);
  if (!container || document.getElementById('enable-push-btn')) return;

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.id = 'enable-push-btn';
  btn.className = 'btn btn-outline btn-sm';
  btn.style.cssText = 'font-size: 11px; padding: 4px 8px; border-color: var(--color-accent-600); color: var(--color-accent-700);';
  btn.innerHTML = '🔔 تفعيل الإشعارات';
  btn.title = 'تفعيل إشعارات المتصفح لتلقي تنبيهات الغياب وبوابة المدرسة فورًا';

  btn.onclick = async () => {
    btn.disabled = true;
    const granted = await requestPushPermission();
    if (granted) {
      btn.innerHTML = '✓ مفعلة';
      setTimeout(() => btn.remove(), 2000);
      sendLocalPushNotification({
        title: 'مرحبًا بك في الإشعارات المباشرة',
        body: 'تم تفعيل التنبيهات الرسمية بنجاح على هذا الجهاز.',
      });
    } else {
      btn.innerHTML = 'تم الرفض ✕';
      setTimeout(() => btn.remove(), 3000);
    }
  };

  container.prepend(btn);
}

