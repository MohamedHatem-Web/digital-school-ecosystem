import { getSchoolApplicationStatus, submitSchoolApplication } from './services/school-service.js';

const storageKey = 'dse_school_application_trackers_v1';
const applicationIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const form = document.getElementById('school-application-form');
const formFeedback = document.getElementById('school-application-feedback');
const trackersList = document.getElementById('school-application-trackers');
const applicantRoleInputs = form?.querySelectorAll('input[name="applicantRole"]') || [];
let storageReadError = '';
let trackedApplications = readTrackedApplications();

if (!form || !trackersList) {
  throw new Error('Public school application page is missing required form elements.');
}

function readTrackedApplications() {
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey) || '[]');
    if (!Array.isArray(saved)) throw new Error('Saved school applications are not an array.');
    return saved
      .filter((item) => item && applicationIdPattern.test(String(item.id || '')))
      .slice(0, 5)
      .map((item) => ({
        id: String(item.id),
        schoolName: String(item.schoolName || 'طلب مدرسة').slice(0, 160),
        schoolSlug: /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(String(item.schoolSlug || '')) ? String(item.schoolSlug) : '',
        submittedAt: String(item.submittedAt || ''),
        status: ['pending', 'approved', 'rejected'].includes(item.status) ? item.status : 'pending',
        reviewedAt: String(item.reviewedAt || ''),
        lastCheckedAt: String(item.lastCheckedAt || ''),
      }));
  } catch (error) {
    storageReadError = 'تعذر قراءة الطلبات المحفوظة في هذا المتصفح.';
    console.warn('Could not read saved school application trackers:', error);
    return [];
  }
}

function saveTrackedApplications() {
  try {
    const safeRecords = trackedApplications.map((item) => ({
      id: item.id,
      schoolName: item.schoolName,
      schoolSlug: item.schoolSlug,
      submittedAt: item.submittedAt,
      status: item.status,
      reviewedAt: item.reviewedAt,
      lastCheckedAt: item.lastCheckedAt,
    }));
    localStorage.setItem(storageKey, JSON.stringify(safeRecords));
    storageReadError = '';
    return true;
  } catch (error) {
    console.warn('Could not save school application trackers:', error);
    return false;
  }
}

function statusLabel(status) {
  return {
    pending: 'قيد المراجعة',
    approved: 'تمت الموافقة',
    rejected: 'مرفوض',
  }[status] || 'غير معروف';
}

function formatDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleString('ar-EG');
}

function createTextElement(tagName, className, text) {
  const element = document.createElement(tagName);
  if (className) element.className = className;
  element.textContent = text;
  return element;
}

function renderTrackedApplications() {
  trackersList.replaceChildren();
  if (storageReadError) {
    trackersList.append(createTextElement('p', 'platform-application-status', storageReadError));
  }
  if (!trackedApplications.length) {
    trackersList.append(createTextElement('p', 'platform-info-card', 'لا توجد طلبات محفوظة على هذا الجهاز حتى الآن.'));
    return;
  }

  trackedApplications.forEach((application) => {
    const card = document.createElement('article');
    card.className = 'platform-tracking-card';
    card.dataset.applicationId = application.id;

    const header = document.createElement('div');
    header.className = 'platform-tracking-card-header';
    header.append(createTextElement('h3', '', application.schoolName));
    const badge = createTextElement('span', 'platform-tracking-status', statusLabel(application.status));
    badge.dataset.status = application.status;
    header.append(badge);
    card.append(header);

    const reference = document.createElement('p');
    reference.append('رقم المتابعة: ');
    reference.append(createTextElement('code', '', application.id));
    card.append(reference);

    const statusDescription = application.status === 'approved'
      ? 'تمت الموافقة على الطلب. راجع مسؤولي المدرسة أو إدارة المنصة لاستلام روابط تفعيل الحسابات؛ لا تُرسل الدعوات تلقائيًا بالبريد.'
      : application.status === 'rejected'
        ? 'تم رفض الطلب. راجع سبب الرفض أدناه، ثم تواصل مع إدارة المنصة إذا احتجت إلى توضيح.'
        : 'الطلب قيد المراجعة. استخدم زر تحديث الحالة للتحقق من أحدث قرار.';
    card.append(createTextElement('p', '', statusDescription));

    const checkedAt = formatDate(application.lastCheckedAt);
    if (checkedAt) card.append(createTextElement('p', '', `آخر تحقق: ${checkedAt}`));
    if (application.status === 'rejected' && application.rejectionReason) {
      card.append(createTextElement('p', 'platform-tracking-reason', `سبب الرفض: ${application.rejectionReason}`));
    }

    const message = createTextElement('p', 'platform-application-status', '');
    message.dataset.trackerMessage = '';
    card.append(message);

    const actions = document.createElement('div');
    actions.className = 'platform-tracking-actions';
    const refreshButton = document.createElement('button');
    refreshButton.type = 'button';
    refreshButton.className = 'btn btn-outline btn-sm';
    refreshButton.dataset.trackerAction = 'refresh';
    refreshButton.textContent = 'تحديث الحالة';
    const removeButton = document.createElement('button');
    removeButton.type = 'button';
    removeButton.className = 'btn btn-outline btn-sm';
    removeButton.dataset.trackerAction = 'remove';
    removeButton.textContent = 'حذف من هذا المتصفح';
    actions.append(refreshButton, removeButton);

    if (application.status === 'approved' && application.schoolSlug) {
      const schoolLink = document.createElement('a');
      schoolLink.className = 'btn btn-primary btn-sm';
      schoolLink.href = `/${encodeURIComponent(application.schoolSlug)}/`;
      schoolLink.textContent = 'فتح بوابة المدرسة';
      actions.append(schoolLink);
    }
    card.append(actions);
    trackersList.append(card);
  });
}

async function refreshTrackedApplication(applicationId, card) {
  const button = card.querySelector('[data-tracker-action="refresh"]');
  const message = card.querySelector('[data-tracker-message]');
  if (button) {
    button.disabled = true;
    button.textContent = 'جارٍ التحقق...';
  }
  if (message) message.textContent = '';

  try {
    const latest = await getSchoolApplicationStatus(applicationId);
    trackedApplications = trackedApplications.map((item) => item.id === applicationId
      ? { ...item, status: latest.status, reviewedAt: latest.reviewedAt, rejectionReason: latest.rejectionReason, lastCheckedAt: new Date().toISOString() }
      : item);
    const saved = saveTrackedApplications();
    renderTrackedApplications();
    if (!saved) {
      formFeedback.textContent = 'تم تحديث الحالة، لكن تعذر حفظها في المتصفح. احتفظ برقم الطلب للمتابعة.';
    }
  } catch (error) {
    if (message) message.textContent = error.message || 'تعذر تحديث حالة الطلب.';
    if (button) {
      button.disabled = false;
      button.textContent = 'إعادة المحاولة';
    }
  }
}

function updateRoleLabels() {
  const role = form.querySelector('input[name="applicantRole"]:checked')?.value || 'director';
  const applicantTitle = role === 'director' ? 'مدير المدرسة' : 'أخصائي التطوير التكنولوجي';
  const counterpartTitle = role === 'director' ? 'أخصائي التطوير التكنولوجي' : 'مدير المدرسة';
  document.getElementById('applicant-name-label').textContent = `اسمك — ${applicantTitle}`;
  document.getElementById('applicant-email-label').textContent = `بريدك الإلكتروني — ${applicantTitle}`;
  document.getElementById('counterpart-name-label').textContent = `اسم ${counterpartTitle}`;
  document.getElementById('counterpart-email-label').textContent = `بريد ${counterpartTitle}`;
}

trackersList.addEventListener('click', async (event) => {
  const button = event.target.closest('button[data-tracker-action]');
  if (!button) return;
  const card = button.closest('[data-application-id]');
  const applicationId = card?.dataset.applicationId;
  if (!applicationId) return;

  if (button.dataset.trackerAction === 'refresh') {
    await refreshTrackedApplication(applicationId, card);
    return;
  }

  if (button.dataset.trackerAction === 'remove') {
    trackedApplications = trackedApplications.filter((item) => item.id !== applicationId);
    const saved = saveTrackedApplications();
    renderTrackedApplications();
    formFeedback.textContent = saved
      ? 'تم حذف رقم المتابعة من هذا المتصفح فقط؛ لم يُحذف الطلب من النظام.'
      : 'تعذر حفظ التغيير في المتصفح.';
  }
});

applicantRoleInputs.forEach((input) => input.addEventListener('change', updateRoleLabels));
updateRoleLabels();
renderTrackedApplications();

if (trackedApplications[0]) {
  const mostRecentCard = trackersList.querySelector(`[data-application-id="${trackedApplications[0].id}"]`);
  if (mostRecentCard) refreshTrackedApplication(trackedApplications[0].id, mostRecentCard);
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const submitButton = form.querySelector('button[type="submit"]');
  if (submitButton) {
    submitButton.disabled = true;
    submitButton.textContent = 'جارٍ إرسال الطلب...';
  }
  formFeedback.textContent = '';

  try {
    const formData = new FormData(form);
    const applicationData = Object.fromEntries(formData.entries());
    const result = await submitSchoolApplication(applicationData);
    const schoolName = String(applicationData.schoolNameAr || '').trim();
    const schoolSlug = String(applicationData.schoolSlug || '').trim().toLowerCase();
    trackedApplications = [
      {
        id: result.id,
        schoolName,
        schoolSlug,
        submittedAt: new Date().toISOString(),
        status: 'pending',
        reviewedAt: '',
        lastCheckedAt: '',
      },
      ...trackedApplications.filter((item) => item.id !== result.id),
    ].slice(0, 5);
    const saved = saveTrackedApplications();
    form.reset();
    updateRoleLabels();
    renderTrackedApplications();
    formFeedback.textContent = saved
      ? `تم إرسال الطلب بنجاح. رقم المتابعة ${result.id} محفوظ في هذا المتصفح، ويمكنك تحديث حالته من القائمة أعلاه.`
      : `تم إرسال الطلب بنجاح، لكن تعذر حفظه في هذا المتصفح. احتفظ برقم المتابعة: ${result.id}`;
  } catch (error) {
    formFeedback.textContent = error.message || 'تعذر إرسال طلب المدرسة.';
  } finally {
    if (submitButton) {
      submitButton.disabled = false;
      submitButton.textContent = 'إرسال طلب التفعيل ←';
    }
  }
});
