// ==========================================================================
// DIGITAL SCHOOL ECOSYSTEM — CLOUDFLARE WORKER GATEWAY
// Secure Cloudinary Signed Uploads & Media Deletion
// ==========================================================================

export default {
  async fetch(request, env) {
    const requestEnv = Object.create(env);
    requestEnv.REQUEST_ORIGIN = request.headers.get('Origin') || '';
    const url = new URL(request.url);

    // 1. CORS Preflight
    if (request.method === 'OPTIONS') {
      return handleCors(requestEnv);
    }

    // 2. Health check
    if (url.pathname === '/api/health') {
      return jsonResponse({ status: 'healthy', timestamp: new Date().toISOString() }, 200, requestEnv);
    }

    if (url.pathname === '/api/public/contact' && request.method === 'POST') {
      return handlePublicContactInquiry(request, requestEnv);
    }

    if (url.pathname === '/api/public/school-applications' && request.method === 'POST') {
      return handlePublicSchoolApplication(request, requestEnv);
    }

    // 3. Media Upload Signature Endpoint
    if (url.pathname === '/api/media/sign-upload' && request.method === 'POST') {
      return handleSignUpload(request, requestEnv);
    }

    // 4. Media Deletion Endpoint
    if (url.pathname === '/api/media/delete' && request.method === 'POST') {
      return handleDeleteMedia(request, requestEnv);
    }

    if (url.pathname === '/api/admin/change-password' && request.method === 'POST') {
      return handleChangePassword(request, requestEnv);
    }

    if (url.pathname === '/api/admin/account-invitations' && request.method === 'POST') {
      return handleCreateAccountInvitation(request, requestEnv);
    }

    if (url.pathname === '/api/admin/link-student-family' && request.method === 'POST') {
      return handleLinkEnrolledStudentFamily(request, requestEnv);
    }

    if (url.pathname === '/api/admin/platform/migrate-school' && request.method === 'POST') {
      return handlePlatformSchoolMigration(request, requestEnv);
    }

    if (url.pathname === '/api/admin/platform/approve-school' && request.method === 'POST') {
      return handlePlatformApproveSchool(request, requestEnv);
    }

    if (url.pathname === '/api/admin/platform/reject-school' && request.method === 'POST') {
      return handlePlatformRejectSchool(request, requestEnv);
    }

    if (url.pathname === '/api/admin/platform/applications' && request.method === 'GET') {
      return handlePlatformListApplications(request, requestEnv);
    }

    if (url.pathname === '/api/admin/platform/super-admins' && request.method === 'GET') {
      return handlePlatformListSuperAdmins(request, requestEnv);
    }

    if (url.pathname === '/api/admin/platform/invite-super-admin' && request.method === 'POST') {
      return handlePlatformInviteSuperAdmin(request, requestEnv);
    }

    if (url.pathname === '/api/auth/complete-first-login' && request.method === 'POST') {
      return handleCompleteFirstLogin(request, requestEnv);
    }

    if (url.pathname === '/api/auth/complete-account-invitation' && request.method === 'POST') {
      return handleCompleteAccountInvitation(request, requestEnv);
    }

    if (url.pathname === '/api/portal/student-attendance' && request.method === 'POST') {
      return handleStudentPortalAttendance(request, requestEnv);
    }

    if (url.pathname === '/api/portal/students' && request.method === 'POST') {
      return handleFamilyStudentRecords(request, requestEnv);
    }

      if (url.pathname === '/api/family/activate-parent' && request.method === 'POST') {
        return handleParentActivation(request, requestEnv);
      }

      if (url.pathname === '/api/family/complete-parent-password' && request.method === 'POST') {
        return handleCompleteParentPassword(request, requestEnv);
      }

      if (url.pathname === '/api/family/request-student-activation' && request.method === 'POST') {
        return handleStudentActivationRequest(request, requestEnv);
      }

      if (url.pathname === '/api/family/student-activation-status' && request.method === 'POST') {
        return handleStudentActivationStatus(request, requestEnv);
      }

      if (url.pathname === '/api/family/activation-requests' && request.method === 'POST') {
        return handleListActivationRequests(request, requestEnv);
      }

      if (url.pathname === '/api/family/review-student-activation' && request.method === 'POST') {
        return handleReviewStudentActivation(request, requestEnv);
      }

      if (url.pathname === '/api/family/complete-student-activation' && request.method === 'POST') {
        return handleCompleteStudentActivation(request, requestEnv);
      }

    return jsonResponse({ error: 'Endpoint Not Found' }, 404, requestEnv);
  }
};

// --------------------------------------------------------------------------
// Authorization & Token Verification
// --------------------------------------------------------------------------
let firebaseKeysCache = null;
let firebaseKeysExpiry = 0;
let firebaseAdminToken = null;
let firebaseAdminTokenExpiry = 0;

async function verifyAuth(request, env, allowUnprovisioned = false) {
  const authHeader = request.headers.get('Authorization') || '';
  if (!authHeader.startsWith('Bearer ')) {
    throw Object.assign(new Error('Missing or invalid Authorization header'), { status: 401 });
  }

  const token = authHeader.split('Bearer ')[1].trim();
  if (!token) {
    throw Object.assign(new Error('Empty token provided'), { status: 401 });
  }

  const parts = token.split('.');
  if (parts.length !== 3) {
    throw Object.assign(new Error('Malformed JWT token'), { status: 401 });
  }

  try {
    const header = JSON.parse(decodeBase64Url(parts[0]));
    const payload = JSON.parse(decodeBase64Url(parts[1]));
    if (header.alg !== 'RS256' || !header.kid) throw new Error('Unsupported token signature');

    const projectId = env.FIREBASE_PROJECT_ID;
    if (!projectId) throw new Error('Firebase project is not configured');
    const now = Math.floor(Date.now() / 1000);
    if (payload.aud !== projectId || payload.iss !== `https://securetoken.google.com/${projectId}`) {
      throw new Error('Invalid Firebase token issuer or audience');
    }
    if (typeof payload.exp !== 'number' || payload.exp <= now || typeof payload.iat !== 'number' || payload.iat > now + 60) {
      throw new Error('Expired or invalid Firebase token');
    }
    if (typeof payload.sub !== 'string' || !payload.sub || (payload.auth_time && payload.auth_time > now + 60)) {
      throw new Error('Invalid Firebase user identity');
    }

    const jwk = await getFirebaseSigningKey(header.kid);
    const publicKey = await crypto.subtle.importKey(
      'jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']
    );
    const validSignature = await crypto.subtle.verify(
      'RSASSA-PKCS1-v1_5', publicKey, decodeBase64UrlBytes(parts[2]),
      new TextEncoder().encode(`${parts[0]}.${parts[1]}`)
    );
    if (!validSignature) throw new Error('Invalid Firebase token signature');

    const identity = {
      uid: payload.sub,
      email: typeof payload.email === 'string' ? payload.email.toLowerCase() : '',
      emailVerified: payload.email_verified === true,
    };
    if (allowUnprovisioned) return identity;

    const profileResponse = await fetch(
      `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/users/${encodeURIComponent(payload.sub)}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (!profileResponse.ok) throw new Error('Could not verify the Firebase user profile');
    const profile = await profileResponse.json();
    const fields = profile.fields || {};
    const role = fields.role?.stringValue;
    const schoolId = fields.schoolId?.stringValue;
    const status = fields.status?.stringValue;
    if (status && status !== 'active') throw Object.assign(new Error('User account is inactive'), { status: 403 });

    if (role !== 'super_admin' && schoolId) {
      const schoolResponse = await fetch(
        `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/schools/${encodeURIComponent(schoolId)}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (!schoolResponse.ok) throw Object.assign(new Error('School is not available'), { status: 403 });
      const school = await schoolResponse.json();
      if (school.fields?.status?.stringValue !== 'active') {
        throw Object.assign(new Error('School is not approved'), { status: 403 });
      }
    }

    return {
      ...identity,
      role,
      schoolId,
      studentCode: fields.studentCode?.stringValue || '',
      linkedStudentCodes: (fields.linkedStudentCodes?.arrayValue?.values || []).map((value) => value.stringValue || '').filter(Boolean),
      mustChangePassword: fields.passwordChangeRequired?.booleanValue === true,
    };
  } catch (err) {
    throw Object.assign(new Error('Firebase authentication failed: ' + err.message), { status: err.status || 401 });
  }
}

async function handleParentActivation(request, env) {
  try {
    const identity = await verifyAuth(request, env, true);
    if (!identity.email || !identity.emailVerified) {
      return jsonResponse({ error: 'افتح رابط التفعيل من البريد الإلكتروني لولي الأمر أولاً.' }, 403, env);
    }

    const projectId = env.FIREBASE_PROJECT_ID;
    const schoolId = String(body.schoolId || '').trim() || env.DEFAULT_SCHOOL_ID || 'zewail-school';
    const adminToken = await getFirebaseAdminAccessToken(env);
    const profileUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/users/${encodeURIComponent(identity.uid)}`;
    const existingProfileResponse = await fetch(profileUrl, { headers: { Authorization: `Bearer ${adminToken}` } });
    let existingProfile = null;
    if (existingProfileResponse.ok) {
      existingProfile = await existingProfileResponse.json();
      const existingRole = firestoreString(existingProfile.fields || {}, 'role');
      if (existingRole && existingRole !== 'parent') {
        return jsonResponse({ error: 'هذا البريد مرتبط بحساب مدرسي آخر؛ استخدم بريد ولي الأمر المسجل.' }, 409, env);
      }
    } else if (existingProfileResponse.status !== 404) {
      return jsonResponse({ error: 'تعذر التحقق من ملف حساب ولي الأمر.' }, 502, env);
    }

    const studentsUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/schools/${encodeURIComponent(schoolId)}/students`;
    const studentDocuments = [];
    let pageToken = '';
    do {
      const pageUrl = new URL(studentsUrl);
      pageUrl.searchParams.set('pageSize', '1000');
      if (pageToken) pageUrl.searchParams.set('pageToken', pageToken);
      const pageResponse = await fetch(pageUrl, { headers: { Authorization: `Bearer ${adminToken}` } });
      if (!pageResponse.ok) throw new Error('تعذر قراءة سجلات الطلاب لربط الأسرة.');
      const page = await pageResponse.json();
      studentDocuments.push(...(page.documents || []));
      if (studentDocuments.length > 10000) throw new Error('عدد سجلات الطلاب تجاوز حد التحقق الآمن.');
      pageToken = page.nextPageToken || '';
    } while (pageToken);

    const studentsByCode = new Map();
    const linkedCodes = new Set();
    for (const document of studentDocuments) {
      const fields = document.fields || {};
      const code = firestoreString(fields, 'code');
      if (code) studentsByCode.set(code, document);
      const parentEmail = fields.parentInfo?.mapValue?.fields?.parentEmail?.stringValue || '';
      if (code && parentEmail.trim().toLowerCase() === identity.email) linkedCodes.add(code);
    }
    if (linkedCodes.size === 0) {
      return jsonResponse({ error: 'لم نعثر على طالب مسجل بهذا البريد. راجع البريد المسجل مع شؤون الطلاب.' }, 404, env);
    }

    for (const code of [...linkedCodes]) {
      const fields = studentsByCode.get(code)?.fields || {};
      const siblingCodes = fields.siblingCodes?.arrayValue?.values || [];
      for (const value of siblingCodes) {
        const siblingCode = value.stringValue || '';
        const siblingFields = studentsByCode.get(siblingCode)?.fields || {};
        const siblingEmail = siblingFields.parentInfo?.mapValue?.fields?.parentEmail?.stringValue || '';
        if (siblingCode && (!siblingEmail || siblingEmail.trim().toLowerCase() === identity.email)) {
          linkedCodes.add(siblingCode);
        }
      }
    }

    const familyId = firestoreString(existingProfile?.fields || {}, 'familyId') || `fam_${identity.uid}`;
    const passwordSetupRequired = existingProfile?.fields?.passwordSetupRequired?.booleanValue !== false;
    const linkedStudents = [...linkedCodes].map((code) => studentsByCode.get(code)).filter(Boolean);
    const parentName = linkedStudents[0]?.fields?.parentInfo?.mapValue?.fields?.parentName?.stringValue || 'ولي الأمر';
    for (const document of linkedStudents) {
      const fields = document.fields || {};
      const parentInfo = decodeFirestoreValue(fields.parentInfo || { mapValue: { fields: {} } });
      const code = firestoreString(fields, 'code');
      const siblingCodes = Array.from(new Set([
        ...((fields.siblingCodes?.arrayValue?.values || []).map((value) => value.stringValue || '')),
        ...[...linkedCodes].filter((linkedCode) => linkedCode !== code),
      ].filter(Boolean)));
      parentInfo.parentEmail = identity.email;
      parentInfo.parentUid = identity.uid;
      const documentPath = document.name.split('/documents/')[1];
      const updateUrl = new URL(`https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/${documentPath}`);
      ['familyId', 'siblingCodes', 'linkedParentUid', 'parentInfo'].forEach((field) => updateUrl.searchParams.append('updateMask.fieldPaths', field));
      const updateResponse = await fetch(updateUrl, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ fields: encodeFirestoreMap({
          familyId,
          siblingCodes,
          linkedParentUid: identity.uid,
          parentInfo,
        }) }),
      });
      if (!applicationUpdateResponse.ok) throw new Error('تعذر تسجيل اعتماد المدرسة في الطلب.');
      if (!updateResponse.ok) throw new Error('تعذر ربط جميع أبناء الأسرة؛ أعد المحاولة.');
    }

    const profileFields = encodeFirestoreMap({
      role: 'parent',
      schoolId,
      status: 'active',
      email: identity.email,
      displayName: parentName,
      parentName,
      familyId,
      linkedStudentCodes: [...linkedCodes],
      passwordSetupRequired,
    });
    const profileUrlWithMask = new URL(profileUrl);
    ['role', 'schoolId', 'status', 'email', 'displayName', 'parentName', 'familyId', 'linkedStudentCodes', 'passwordSetupRequired'].forEach((field) => {
      profileUrlWithMask.searchParams.append('updateMask.fieldPaths', field);
    });
    const profileResponse = await fetch(profileUrlWithMask, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields: profileFields }),
    });
    if (!profileResponse.ok) throw new Error('تم التحقق من البريد لكن تعذر إنشاء ملف ولي الأمر.');

    return jsonResponse({ success: true, profile: {
      uid: identity.uid,
      email: identity.email,
      role: 'parent',
      schoolId,
      displayName: parentName,
      parentName,
      familyId,
      linkedStudentCodes: [...linkedCodes],
      passwordSetupRequired,
    }, needsPassword: passwordSetupRequired }, 200, env);
  } catch (error) {
    return jsonResponse({ error: error.message || 'تعذر تفعيل حساب ولي الأمر.' }, error.status || 401, env);
  }
}

async function handleCompleteParentPassword(request, env) {
  try {
    const parent = await verifyAuth(request, env);
    if (parent.role !== 'parent' || !parent.emailVerified) {
      return jsonResponse({ error: 'يجب استخدام حساب ولي أمر موثق.' }, 403, env);
    }
    const adminToken = await getFirebaseAdminAccessToken(env);
    const projectId = env.FIREBASE_PROJECT_ID;
    const profileUrl = new URL(`https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/users/${encodeURIComponent(parent.uid)}`);
    profileUrl.searchParams.append('updateMask.fieldPaths', 'passwordSetupRequired');
    profileUrl.searchParams.append('updateMask.fieldPaths', 'passwordUpdatedAt');
    const response = await fetch(profileUrl, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields: encodeFirestoreMap({
        passwordSetupRequired: false,
        passwordUpdatedAt: new Date().toISOString(),
      }) }),
    });
    if (!response.ok) throw new Error('تعذر حفظ اكتمال إعداد كلمة المرور.');
    return jsonResponse({ success: true }, 200, env);
  } catch (error) {
    return jsonResponse({ error: error.message || 'تعذر تأكيد كلمة مرور ولي الأمر.' }, error.status || 401, env);
  }
}

async function handleStudentActivationRequest(request, env) {
  let requestId = '';
  try {
    if (Number(request.headers.get('Content-Length') || 0) > 8192) {
      return jsonResponse({ error: 'بيانات الطلب أكبر من المسموح.' }, 413, env);
    }
    const body = await request.json();
    const studentCode = String(body.studentCode || '').trim();
    const nationalId = String(body.nationalId || '').trim();
    if (!/^\d{6,12}$/.test(studentCode) || !/^\d{14}$/.test(nationalId)) {
      return jsonResponse({ error: 'تعذر التحقق من البيانات. راجع شؤون الطلاب.' }, 400, env);
    }

    const rateLimiter = env.FAMILY_ACTIVATION_LIMITER;
    const clientIp = request.headers.get('CF-Connecting-IP') || 'unknown';
    if (!rateLimiter) return jsonResponse({ error: 'خدمة التفعيل غير مكتملة الإعداد.' }, 503, env);
    const [ipLimit, studentLimit] = await Promise.all([
      rateLimiter.limit({ key: `ip:${clientIp}` }),
      rateLimiter.limit({ key: `student:${studentCode}` }),
    ]);
    if (!ipLimit.success || !studentLimit.success) {
      return jsonResponse({ error: 'محاولات كثيرة. انتظر دقيقة ثم حاول مرة أخرى.' }, 429, env);
    }

    const schoolId = env.DEFAULT_SCHOOL_ID || 'zewail-school';
    const projectId = env.FIREBASE_PROJECT_ID;
    const adminToken = await getFirebaseAdminAccessToken(env);
    const studentUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/schools/${encodeURIComponent(schoolId)}/students/${encodeURIComponent(`stu_${studentCode}`)}`;
    const studentResponse = await fetch(studentUrl, { headers: { Authorization: `Bearer ${adminToken}` } });
    if (!studentResponse.ok) return jsonResponse({ error: 'تعذر التحقق من البيانات. راجع شؤون الطلاب.' }, 400, env);
    const studentDocument = await studentResponse.json();
    const studentFields = studentDocument.fields || {};
    const storedNationalId = firestoreString(studentFields, 'nationalId');
    const parentFields = studentFields.parentInfo?.mapValue?.fields || {};
    const parentEmail = (parentFields.parentEmail?.stringValue || '').trim().toLowerCase();
    const accountAlreadyLinked = Boolean(firestoreString(studentFields, 'authUid')) ||
      firestoreString(studentFields, 'accountStatus') === 'active';
    if (storedNationalId !== nationalId || accountAlreadyLinked || !parentEmail ||
      ['archived', 'withdrawn', 'transferred_out'].includes(firestoreString(studentFields, 'status'))) {
      return jsonResponse({ error: 'تعذر التحقق من البيانات. راجع شؤون الطلاب.' }, 400, env);
    }

    requestId = crypto.randomUUID();
    const activationSecret = encodeBase64Url(crypto.getRandomValues(new Uint8Array(32)));
    const secretHash = await hashActivationSecret(activationSecret);
    const activationUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/schools/${encodeURIComponent(schoolId)}/activationRequests?documentId=${encodeURIComponent(requestId)}`;
    const createRequest = await fetch(activationUrl, {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields: {
        studentCode: { stringValue: studentCode },
        studentName: { stringValue: firestoreString(studentFields, 'name') },
        grade: { stringValue: firestoreString(studentFields, 'grade') },
        parentEmail: { stringValue: parentEmail },
        parentUid: { stringValue: parentFields.parentUid?.stringValue || '' },
        schoolId: { stringValue: schoolId },
        status: { stringValue: 'pending' },
        secretHash: { stringValue: secretHash },
        createdAt: { timestampValue: new Date().toISOString() },
        expiresAt: { timestampValue: new Date(Date.now() + 30 * 60 * 1000).toISOString() },
      } }),
    });
    if (!createRequest.ok) throw new Error('تعذر إنشاء طلب التفعيل.');

    const emailResult = await sendParentActivationEmail(parentEmail, env);
    if (!emailResult.ok) {
      await fetch(activationUrl.replace(`?documentId=${encodeURIComponent(requestId)}`, `/${encodeURIComponent(requestId)}`), {
        method: 'DELETE', headers: { Authorization: `Bearer ${adminToken}` },
      }).catch(() => {});
      console.error('Student activation parent email failed', { status: emailResult.status, code: emailResult.code });
      const message = emailResult.code === 'OPERATION_NOT_ALLOWED'
        ? 'تسجيل الدخول برابط البريد غير مفعّل في Firebase Authentication.'
        : ['UNAUTHORIZED_DOMAIN', 'INVALID_CONTINUE_URI'].includes(emailResult.code)
          ? 'عنوان صفحة التفعيل غير مسموح به في نطاقات Firebase Authentication المعتمدة.'
          : emailResult.code
            ? `تعذر إرسال طلب الموافقة إلى ولي الأمر (Firebase: ${emailResult.code}).`
            : 'تعذر إرسال طلب الموافقة إلى ولي الأمر. أعد المحاولة لاحقًا.';
      return jsonResponse({ error: message }, 502, env);
    }

    return jsonResponse({ success: true, requestId, activationSecret, expiresInSeconds: 1800 }, 202, env);
  } catch (error) {
    return jsonResponse({ error: error.message || 'تعذر إرسال طلب تفعيل الطالب.' }, error.status || 500, env);
  }
}

async function handlePublicContactInquiry(request, env) {
  try {
    if (getCorsOrigin(env) === 'null') return jsonResponse({ error: 'Origin not allowed' }, 403, env);
    if (Number(request.headers.get('Content-Length') || 0) > 8192) {
      return jsonResponse({ error: 'بيانات الطلب أكبر من المسموح.' }, 413, env);
    }

    const body = await request.json();
    const name = String(body.name || '').trim();
    const phone = String(body.phone || '').trim();
    const studentCode = String(body.studentCode || '').trim();
    const topic = String(body.topic || '').trim();
    const message = String(body.message || '').trim();
    const allowedTopics = new Set(['tablet', 'student-affairs', 'attendance', 'other']);
    if (name.length < 4 || name.length > 120 || !/^\+?[0-9()\-\s]{8,20}$/.test(phone) ||
      (studentCode && !/^\d{6,12}$/.test(studentCode)) || !allowedTopics.has(topic) ||
      message.length < 10 || message.length > 2500) {
      return jsonResponse({ error: 'راجع الاسم والهاتف وكود الطالب وموضوع الرسالة وتفاصيلها.' }, 400, env);
    }

    const rateLimiter = env.PUBLIC_CONTACT_LIMITER;
    if (!rateLimiter) return jsonResponse({ error: 'خدمة استقبال الاستفسارات غير مكتملة الإعداد.' }, 503, env);
    const clientIp = request.headers.get('CF-Connecting-IP') || 'unknown';
    const rateLimit = await rateLimiter.limit({ key: `public-contact:${clientIp}` });
    if (!rateLimit.success) return jsonResponse({ error: 'تم استلام طلبات كثيرة. انتظر دقيقة ثم حاول مجددًا.' }, 429, env);

    const recipientByTopic = {
      tablet: { id: 'tech_specialist', role: 'tech_specialist', name: 'مسؤول التطوير التكنولوجي' },
      'student-affairs': { id: 'student_affairs', role: 'student_affairs', name: 'شؤون الطلاب والقيد' },
      attendance: { id: 'student_affairs', role: 'student_affairs', name: 'شؤون الطلاب والقيد' },
      other: { id: 'director', role: 'director', name: 'مدير المدرسة' },
    }[topic];
    const schoolId = env.DEFAULT_SCHOOL_ID || 'zewail-school';
    const projectId = env.FIREBASE_PROJECT_ID;
    const adminToken = await getFirebaseAdminAccessToken(env);
    const inquiryId = `public_${crypto.randomUUID()}`;
    const createdAt = new Date().toISOString();
    const messageRecord = {
      id: inquiryId,
      schoolId,
      source: 'public-contact',
      senderId: 'public_contact',
      senderRole: 'public',
      senderName: name,
      senderEmail: '',
      recipientId: recipientByTopic.id,
      recipientRole: recipientByTopic.role,
      recipientName: recipientByTopic.name,
      subject: `استفسار من الموقع العام: ${topic}`,
      body: `الاسم: ${name}\nالهاتف: ${phone}\nكود الطالب: ${studentCode || 'غير متاح'}\n\n${message}`,
      priority: 'normal',
      createdAt,
      formattedDate: new Intl.DateTimeFormat('ar-EG', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(createdAt)),
      readBy: [],
    };
    const endpoint = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/schools/${encodeURIComponent(schoolId)}/messages?documentId=${encodeURIComponent(inquiryId)}`;
    const writeResponse = await fetch(endpoint, {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields: encodeFirestoreMap(messageRecord) }),
    });
    if (!writeResponse.ok) {
      console.error('Public contact inquiry persistence failed:', writeResponse.status);
      return jsonResponse({ error: 'تعذر حفظ الاستفسار على خادم المدرسة. أعد المحاولة لاحقًا.' }, 502, env);
    }

    return jsonResponse({ success: true, inquiryId }, 201, env);
  } catch (error) {
    console.error('Public contact inquiry failed:', error.message);
    return jsonResponse({ error: error.message || 'تعذر إرسال الاستفسار.' }, error.status || 500, env);
  }
}

async function sendParentActivationEmail(email, env) {
  if (!env.FIREBASE_WEB_API_KEY || !env.FAMILY_ACTIVATION_CONTINUE_URL) {
    return { ok: false, status: 0, code: 'MISSING_EMAIL_LINK_CONFIGURATION' };
  }
  const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:sendOobCode?key=${encodeURIComponent(env.FIREBASE_WEB_API_KEY)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      requestType: 'EMAIL_SIGNIN',
      email,
      continueUrl: env.FAMILY_ACTIVATION_CONTINUE_URL,
      canHandleCodeInApp: true,
    }),
  });
  const result = await response.json().catch(() => ({}));
  return { ok: response.ok, status: response.status, code: getFirebaseApiErrorCode(result) };
}

async function handleCreateAccountInvitation(request, env) {
  let invitationUrl = '';
  try {
    const operator = await verifyAuth(request, env);
    const rolesByOperator = {
      super_admin: ['director', 'tech_specialist', 'student_affairs', 'social_affairs', 'teacher'],
      director: ['tech_specialist', 'student_affairs', 'social_affairs', 'teacher'],
      tech_specialist: ['student_affairs', 'social_affairs', 'teacher'],
    };
    if (!rolesByOperator[operator.role]) {
      return jsonResponse({ error: 'غير مصرح لك بإنشاء حسابات موظفين.' }, 403, env);
    }
    if (Number(request.headers.get('Content-Length') || 0) > 8192) {
      return jsonResponse({ error: 'بيانات الدعوة أكبر من المسموح.' }, 413, env);
    }

    const body = await request.json();
    const email = String(body.email || '').trim().toLowerCase();
    const displayName = String(body.displayName || '').trim();
    const role = String(body.role || '').trim();
    const schoolId = String(body.schoolId || '').trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254 ||
      !displayName || displayName.length > 120 || !rolesByOperator[operator.role].includes(role) ||
      !schoolId || schoolId !== operator.schoolId || !canAccessSchool(operator, schoolId)) {
      return jsonResponse({ error: 'راجع البريد والاسم والدور المحدد للمدرسة.' }, 400, env);
    }
    if (email === operator.email) return jsonResponse({ error: 'لا يمكن إرسال دعوة إلى بريد الحساب نفسه.' }, 409, env);

    const teacherInfo = {};
    if (role === 'teacher') {
      teacherInfo.subject = String(body.subject || '').trim();
      teacherInfo.classId = String(body.classId || '').trim();
      teacherInfo.className = String(body.className || '').trim();
      teacherInfo.weeklyHours = Number(body.weeklyHours);
      if (!teacherInfo.subject || teacherInfo.subject.length > 120 || !teacherInfo.classId ||
        !teacherInfo.className || !Number.isInteger(teacherInfo.weeklyHours) ||
        teacherInfo.weeklyHours < 1 || teacherInfo.weeklyHours > 40) {
        return jsonResponse({ error: 'حدد مادة المعلم وفصله وحمله الأسبوعي من 1 إلى 40 ساعة.' }, 400, env);
      }
    }

    const rateLimit = env.FAMILY_ACTIVATION_LIMITER;
    if (!rateLimit) return jsonResponse({ error: 'خدمة الدعوات غير مكتملة الإعداد.' }, 503, env);
    const inviteLimit = await rateLimit.limit({ key: `invite:${operator.uid}` });
    if (!inviteLimit.success) return jsonResponse({ error: 'تم إرسال دعوات كثيرة. انتظر دقيقة ثم حاول.' }, 429, env);

    const projectId = env.FIREBASE_PROJECT_ID;
    const adminToken = await getFirebaseAdminAccessToken(env);
    const authBase = `https://identitytoolkit.googleapis.com/v1/projects/${projectId}`;
    const lookupResponse = await fetch(`${authBase}/accounts:lookup`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: [email] }),
    });
    const lookupData = await lookupResponse.json().catch(() => ({}));
    if (!lookupResponse.ok) {
      const code = getFirebaseApiErrorCode(lookupData);
      console.error('Account invitation account lookup failed', { status: lookupResponse.status, code });
      return jsonResponse({
        error: code
          ? `تعذر التحقق من الحساب في Firebase (${code}).`
          : 'تعذر التحقق من البريد قبل إرسال الدعوة.',
      }, 502, env);
    }
    const existingAccount = lookupData.users?.find((account) => account.email?.toLowerCase() === email);
    if (existingAccount?.localId) {
      const existingProfileResponse = await fetch(
        `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/users/${encodeURIComponent(existingAccount.localId)}`,
        { headers: { Authorization: `Bearer ${adminToken}` } }
      );
      if (existingProfileResponse.ok) {
        return jsonResponse({
          error: 'هذا البريد مرتبط بحساب وملف مستخدم موجودين بالفعل؛ لم تُنشأ دعوة جديدة. استخدم الحساب الحالي أو راجع مسؤول المدرسة لمعالجته.',
        }, 409, env);
      }
      if (existingProfileResponse.status !== 404) {
        return jsonResponse({ error: 'تعذر التحقق من الحساب الموجود.' }, 502, env);
      }
    }

    const invitationId = crypto.randomUUID();
    invitationUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/accountInvitations?documentId=${encodeURIComponent(invitationId)}`;
    const invitation = {
      invitationId,
      email,
      displayName,
      role,
      schoolId,
      teacherInfo,
      status: 'pending',
      invitedByUid: operator.uid,
      invitedByRole: operator.role,
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString(),
    };
    const createResponse = await fetch(invitationUrl, {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields: encodeFirestoreMap(invitation) }),
    });
    if (!createResponse.ok) {
      const createData = await createResponse.json().catch(() => ({}));
      const code = getFirebaseApiErrorCode(createData);
      console.error('Account invitation record creation failed', { status: createResponse.status, code });
      throw Object.assign(new Error(code
        ? `تعذر إنشاء سجل الدعوة في Firebase (${code}).`
        : 'تعذر إنشاء سجل الدعوة في Firebase.'), { status: 502 });
    }

    const platformBase = env.PLATFORM_CONTINUE_BASE || 'https://digital-school-platform.vercel.app';
    const continueUrl = new URL(`${platformBase.replace(/\/$/, '')}/${encodeURIComponent(schoolId)}/login.html`);
    continueUrl.searchParams.set('flow', 'staff-invitation');
    continueUrl.searchParams.set('invitationId', invitationId);
    const invitationLinkResult = await generateAccountInvitationLink(email, continueUrl.toString(), env, adminToken);
    if (!invitationLinkResult.ok) {
      await fetch(invitationUrl.replace(`?documentId=${encodeURIComponent(invitationId)}`, `/${encodeURIComponent(invitationId)}`), {
        method: 'DELETE', headers: { Authorization: `Bearer ${adminToken}` },
      }).catch(() => {});
      console.error('Account invitation link generation failed', { status: invitationLinkResult.status, code: invitationLinkResult.code });
      return jsonResponse({ error: invitationLinkFailureMessage(invitationLinkResult.code) }, 502, env);
    }

    return jsonResponse({
      success: true,
      invitationId,
      email,
      role,
      invitationLink: invitationLinkResult.invitationLink,
    }, 202, env);
  } catch (error) {
    return jsonResponse({ error: error.message || 'تعذر إنشاء رابط دعوة الحساب.' }, error.status || 500, env);
  }
}

async function generateAccountInvitationLink(email, continueUrl, env, adminToken) {
  if (!env.FIREBASE_WEB_API_KEY) return { ok: false, status: 0, code: 'MISSING_WEB_API_KEY' };
  const linkResponse = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:sendOobCode?key=${encodeURIComponent(env.FIREBASE_WEB_API_KEY)}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      requestType: 'EMAIL_SIGNIN',
      email,
      continueUrl,
      canHandleCodeInApp: true,
      returnOobLink: true,
    }),
  });
  const linkResult = await linkResponse.json().catch(() => ({}));
  if (!linkResponse.ok || typeof linkResult.oobLink !== 'string') {
    return {
      ok: false,
      status: linkResponse.status || 502,
      code: getFirebaseApiErrorCode(linkResult) || 'MISSING_OOB_LINK',
    };
  }
  return { ok: true, status: linkResponse.status, invitationLink: linkResult.oobLink };
}

function invitationLinkFailureMessage(code) {
  if (['OPERATION_NOT_ALLOWED', 'EMAIL_SIGNIN_DISABLED'].includes(code)) {
    return 'تسجيل الدخول برابط البريد غير مفعّل في Firebase Authentication.';
  }
  if (['UNAUTHORIZED_DOMAIN', 'INVALID_CONTINUE_URI'].includes(code)) {
    return 'عنوان صفحة إكمال الدعوة غير مسموح به في نطاقات Firebase Authentication المعتمدة.';
  }
  if (code === 'MISSING_WEB_API_KEY') return 'إعداد رابط Firebase غير مكتمل على الخادم.';
  return code ? `تعذر إنشاء رابط الدعوة (${code}).` : 'تعذر إنشاء رابط الدعوة.';
}

function getFirebaseApiErrorCode(result) {
  const message = String(result?.error?.message || result?.error?.status || '');
  return message.split(/[\s:]/, 1)[0].replace(/[^A-Z0-9_]/gi, '').slice(0, 60);
}

async function handleCompleteAccountInvitation(request, env) {
  try {
    const identity = await verifyAuth(request, env, true);
    if (!identity.email || !identity.emailVerified) {
      return jsonResponse({ error: 'افتح رابط الدعوة من البريد المدعو إليه.' }, 403, env);
    }
    const body = await request.json();
    const invitationId = String(body.invitationId || '').trim();
    if (!/^[0-9a-f-]{36}$/i.test(invitationId)) return jsonResponse({ error: 'معرّف الدعوة غير صالح.' }, 400, env);

    const projectId = env.FIREBASE_PROJECT_ID;
    const adminToken = await getFirebaseAdminAccessToken(env);
    const invitationUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/accountInvitations/${encodeURIComponent(invitationId)}`;
    const invitationResponse = await fetch(invitationUrl, { headers: { Authorization: `Bearer ${adminToken}` } });
    if (!invitationResponse.ok) return jsonResponse({ error: 'الدعوة غير موجودة أو انتهت صلاحيتها.' }, 404, env);
    const invitationDocument = await invitationResponse.json();
    const invitation = decodeFirestoreMap(invitationDocument.fields || {});
    if (String(invitation.email || '').toLowerCase() !== identity.email) {
      return jsonResponse({ error: 'استخدم البريد الإلكتروني الذي استقبل الدعوة.' }, 403, env);
    }
    if (Date.parse(invitation.expiresAt || '') <= Date.now()) {
      return jsonResponse({ error: 'انتهت صلاحية الدعوة. اطلب دعوة جديدة من إدارة المدرسة.' }, 410, env);
    }
    if (!['super_admin', 'director', 'tech_specialist', 'student_affairs', 'social_affairs', 'teacher'].includes(invitation.role)) {
      return jsonResponse({ error: 'الدور الوظيفي في الدعوة غير صالح.' }, 400, env);
    }

    const profileUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/users/${encodeURIComponent(identity.uid)}`;
    const existingProfileResponse = await fetch(profileUrl, { headers: { Authorization: `Bearer ${adminToken}` } });
    if (existingProfileResponse.ok) {
      const existingProfile = await existingProfileResponse.json();
      const fields = existingProfile.fields || {};
      if (firestoreString(fields, 'invitationId') !== invitationId ||
        firestoreString(fields, 'schoolId') !== invitation.schoolId) {
        return jsonResponse({ error: 'هذا الحساب مرتبط بالفعل بمدرسة أو دعوة أخرى.' }, 409, env);
      }
      return jsonResponse({ success: true, profile: decodeFirestoreMap(fields) }, 200, env);
    }
    if (existingProfileResponse.status !== 404) {
      return jsonResponse({ error: 'تعذر التحقق من ملف المستخدم.' }, 502, env);
    }
    if (invitation.status !== 'pending') {
      return jsonResponse({ error: 'تم استخدام الدعوة أو إلغاؤها بالفعل.' }, 409, env);
    }

    const authBase = `https://identitytoolkit.googleapis.com/v1/projects/${projectId}`;
    const accountResponse = await fetch(`${authBase}/accounts:lookup`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ localId: [identity.uid] }),
    });
    const accountData = await accountResponse.json().catch(() => ({}));
    const account = accountData.users?.find((user) => user.localId === identity.uid);
    if (!accountResponse.ok || !account?.providerUserInfo?.some((provider) => provider.providerId === 'password')) {
      return jsonResponse({ error: 'أنشئ كلمة المرور من شاشة الدعوة أولًا.' }, 400, env);
    }

    const teacherInfo = invitation.teacherInfo || {};
    const profile = {
      role: invitation.role,
      status: 'active',
      email: identity.email,
      displayName: invitation.displayName,
      invitationId,
      createdAt: new Date().toISOString(),
      createdByUid: invitation.invitedByUid,
      platformRole: invitation.platformRole || '',
    };
    if (invitation.role !== 'super_admin') profile.schoolId = invitation.schoolId;
    if (invitation.role === 'teacher') {
      profile.subject = teacherInfo.subject || '';
      profile.classId = teacherInfo.classId || '';
      profile.className = teacherInfo.className || '';
      profile.weeklyHours = Number(teacherInfo.weeklyHours) || 0;
    }

    const profileResponse = await fetch(profileUrl, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields: encodeFirestoreMap(profile) }),
    });
    if (!profileResponse.ok) throw new Error('تعذر إنشاء ملف الصلاحيات. أعد المحاولة.');

    const invitationUpdateUrl = new URL(invitationUrl);
    ['status', 'accountUid', 'acceptedAt'].forEach((field) => invitationUpdateUrl.searchParams.append('updateMask.fieldPaths', field));
    await fetch(invitationUpdateUrl, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields: encodeFirestoreMap({
        status: 'completed',
        accountUid: identity.uid,
        acceptedAt: new Date().toISOString(),
      }) }),
    });

    await recordAccountInvitationAudit(env, adminToken, invitation, identity);
    return jsonResponse({ success: true, profile }, 201, env);
  } catch (error) {
    return jsonResponse({ error: error.message || 'تعذر إكمال دعوة الحساب.' }, error.status || 401, env);
  }
}

async function recordAccountInvitationAudit(env, accessToken, invitation, identity) {
  const documentId = `account_invite_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`;
  const endpoint = `https://firestore.googleapis.com/v1/projects/${env.FIREBASE_PROJECT_ID}/databases/(default)/documents/schools/${encodeURIComponent(invitation.schoolId)}/auditLogs?documentId=${documentId}`;
  await fetch(endpoint, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields: encodeFirestoreMap({
      action: 'إكمال دعوة حساب موظف',
      target: `${invitation.displayName} (${identity.email})`,
      details: `تم إنشاء حساب بدور ${invitation.role} بواسطة ${invitation.invitedByRole}.`,
      category: 'auth',
      operatorUid: invitation.invitedByUid,
      operatorRole: invitation.invitedByRole,
      schoolId: invitation.schoolId,
      createdAt: new Date().toISOString(),
    }) }),
  });
}

async function hashActivationSecret(secret) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(secret));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function loadActivationRequest(requestId, projectId, adminToken, schoolId = 'zewail-school') {
  const documentUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/schools/${encodeURIComponent(schoolId)}/activationRequests/${encodeURIComponent(requestId)}`;
  const response = await fetch(documentUrl, { headers: { Authorization: `Bearer ${adminToken}` } });
  if (!response.ok) return null;
  const document = await response.json();
  return { document, url: documentUrl, data: decodeFirestoreMap(document.fields || {}) };
}

function safeStringEquals(left, right) {
  if (typeof left !== 'string' || typeof right !== 'string' || left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return difference === 0;
}

async function verifyActivationSecret(activation, secret) {
  if (!activation || !/^[A-Za-z0-9_-]{40,50}$/.test(secret)) return false;
  return safeStringEquals(activation.data.secretHash || '', await hashActivationSecret(secret));
}

function activationRequestExpired(activation) {
  const expiry = Date.parse(activation?.data?.expiresAt || '');
  return !Number.isFinite(expiry) || expiry <= Date.now();
}

async function handleStudentActivationStatus(request, env) {
  try {
    const body = await request.json();
    const requestId = String(body.requestId || '').trim();
    const secret = String(body.activationSecret || '').trim();
    if (!/^[0-9a-f-]{36}$/i.test(requestId)) return jsonResponse({ error: 'طلب التفعيل غير صالح.' }, 400, env);
    const adminToken = await getFirebaseAdminAccessToken(env);
    const activation = await loadActivationRequest(requestId, env.FIREBASE_PROJECT_ID, adminToken, String(body.schoolId || '').trim() || 'zewail-school');
    if (!await verifyActivationSecret(activation, secret)) return jsonResponse({ error: 'طلب التفعيل غير صالح أو انتهت صلاحيته.' }, 404, env);
    if (activationRequestExpired(activation)) return jsonResponse({ status: 'expired' }, 200, env);
    return jsonResponse({ status: activation.data.status }, 200, env);
  } catch (error) {
    return jsonResponse({ error: error.message || 'تعذر التحقق من حالة الطلب.' }, error.status || 401, env);
  }
}

async function handleListActivationRequests(request, env) {
  try {
    const parent = await verifyAuth(request, env);
    if (parent.role !== 'parent' || !parent.emailVerified) {
      return jsonResponse({ error: 'يجب تسجيل الدخول ببريد ولي أمر موثق.' }, 403, env);
    }
    const adminToken = await getFirebaseAdminAccessToken(env);
    const schoolId = parent.schoolId || env.DEFAULT_SCHOOL_ID || 'zewail-school';
    const collectionUrl = `https://firestore.googleapis.com/v1/projects/${env.FIREBASE_PROJECT_ID}/databases/(default)/documents/schools/${encodeURIComponent(schoolId)}/activationRequests`;
    const requests = [];
    let pageToken = '';
    do {
      const pageUrl = new URL(collectionUrl);
      pageUrl.searchParams.set('pageSize', '1000');
      if (pageToken) pageUrl.searchParams.set('pageToken', pageToken);
      const response = await fetch(pageUrl, { headers: { Authorization: `Bearer ${adminToken}` } });
      if (!response.ok) throw new Error('تعذر تحميل طلبات التفعيل.');
      const page = await response.json();
      for (const document of page.documents || []) {
        const data = decodeFirestoreMap(document.fields || {});
        if (data.status !== 'pending' || activationRequestExpired({ data })) continue;
        if (data.parentUid !== parent.uid && String(data.parentEmail || '').toLowerCase() !== parent.email) continue;
        requests.push({
          requestId: document.name.split('/').pop(),
          studentCode: data.studentCode,
          studentName: data.studentName,
          grade: data.grade,
          createdAt: data.createdAt,
        });
      }
      if (requests.length > 100) throw new Error('طلبات التفعيل كثيرة؛ راجع إدارة المدرسة.');
      pageToken = page.nextPageToken || '';
    } while (pageToken);
    requests.sort((left, right) => String(right.createdAt).localeCompare(String(left.createdAt)));
    return jsonResponse({ requests }, 200, env);
  } catch (error) {
    return jsonResponse({ error: error.message || 'تعذر تحميل طلبات التفعيل.' }, error.status || 401, env);
  }
}

async function handleReviewStudentActivation(request, env) {
  try {
    const parent = await verifyAuth(request, env);
    if (parent.role !== 'parent' || !parent.emailVerified) {
      return jsonResponse({ error: 'يجب تسجيل الدخول ببريد ولي أمر موثق.' }, 403, env);
    }
    const body = await request.json();
    const requestId = String(body.requestId || '').trim();
    const decision = String(body.decision || '').trim();
    if (!/^[0-9a-f-]{36}$/i.test(requestId) || !['approve', 'reject'].includes(decision)) {
      return jsonResponse({ error: 'بيانات مراجعة الطلب غير صالحة.' }, 400, env);
    }
    const adminToken = await getFirebaseAdminAccessToken(env);
    const activation = await loadActivationRequest(requestId, env.FIREBASE_PROJECT_ID, adminToken, parent.schoolId || 'zewail-school');
    if (!activation || activation.data.status !== 'pending' || activationRequestExpired(activation)) {
      return jsonResponse({ error: 'انتهت صلاحية الطلب أو تمت مراجعته بالفعل.' }, 409, env);
    }
    if (activation.data.parentUid !== parent.uid && String(activation.data.parentEmail || '').toLowerCase() !== parent.email) {
      return jsonResponse({ error: 'هذا الطلب غير مرتبط بحساب ولي الأمر.' }, 403, env);
    }

    const updateUrl = new URL(activation.url);
    ['status', 'parentUid', 'reviewedAt'].forEach((field) => updateUrl.searchParams.append('updateMask.fieldPaths', field));
    const response = await fetch(updateUrl, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields: encodeFirestoreMap({
        status: decision === 'approve' ? 'approved' : 'rejected',
        parentUid: parent.uid,
        reviewedAt: new Date().toISOString(),
      }) }),
    });
    if (!response.ok) throw new Error('تعذر حفظ قرار ولي الأمر.');
    return jsonResponse({ success: true, status: decision === 'approve' ? 'approved' : 'rejected' }, 200, env);
  } catch (error) {
    return jsonResponse({ error: error.message || 'تعذر مراجعة طلب التفعيل.' }, error.status || 401, env);
  }
}

async function handleCompleteStudentActivation(request, env) {
  let createdUid = '';
  let profileCreated = false;
  let studentLinked = false;
  let studentUrlForRollback = '';
  let userProfileUrlForRollback = '';
  try {
    if (Number(request.headers.get('Content-Length') || 0) > 8192) return jsonResponse({ error: 'الطلب أكبر من المسموح.' }, 413, env);
    const body = await request.json();
    const requestId = String(body.requestId || '').trim();
    const secret = String(body.activationSecret || '').trim();
    const password = String(body.password || '');
    if (!/^[0-9a-f-]{36}$/i.test(requestId) || password.length < 12 || !/[a-z]/.test(password) ||
      !/[A-Z]/.test(password) || !/\d/.test(password) || !/[^A-Za-z0-9]/.test(password)) {
      return jsonResponse({ error: 'استخدم كلمة مرور من 12 حرفًا على الأقل تشمل حرفًا كبيرًا وصغيرًا ورقمًا ورمزًا.' }, 400, env);
    }
    const rateLimit = env.FAMILY_ACTIVATION_LIMITER;
    if (!rateLimit) return jsonResponse({ error: 'خدمة التفعيل غير مكتملة الإعداد.' }, 503, env);
    const limit = await rateLimit.limit({ key: `complete:${requestId}` });
    if (!limit.success) return jsonResponse({ error: 'محاولات كثيرة. انتظر دقيقة ثم حاول مرة أخرى.' }, 429, env);

    const projectId = env.FIREBASE_PROJECT_ID;
    const adminToken = await getFirebaseAdminAccessToken(env);
    const activation = await loadActivationRequest(requestId, projectId, adminToken, String(body.schoolId || '').trim() || 'zewail-school');
    if (!await verifyActivationSecret(activation, secret) || activationRequestExpired(activation)) {
      return jsonResponse({ error: 'انتهت صلاحية طلب التفعيل أو بياناته غير صحيحة.' }, 403, env);
    }
    if (activation.data.status === 'completed') return jsonResponse({ success: true, email: `${activation.data.studentCode}@cairo7.moe.edu.eg` }, 200, env);
    if (activation.data.status !== 'approved') return jsonResponse({ error: 'بانتظار موافقة ولي الأمر.' }, 409, env);

    const schoolId = activation.data.schoolId || env.DEFAULT_SCHOOL_ID || 'zewail-school';
    const studentCode = String(activation.data.studentCode || '');
    const studentUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/schools/${encodeURIComponent(schoolId)}/students/${encodeURIComponent(`stu_${studentCode}`)}`;
    studentUrlForRollback = studentUrl;
    const studentResponse = await fetch(studentUrl, { headers: { Authorization: `Bearer ${adminToken}` } });
    if (!studentResponse.ok) return jsonResponse({ error: 'ملف الطالب غير موجود. راجع شؤون الطلاب.' }, 404, env);
    const studentDocument = await studentResponse.json();
    const studentFields = studentDocument.fields || {};
    if (firestoreString(studentFields, 'authUid')) return jsonResponse({ error: 'تم تفعيل حساب الطالب بالفعل.' }, 409, env);

    const email = `${studentCode}@cairo7.moe.edu.eg`;
    const authBase = `https://identitytoolkit.googleapis.com/v1/projects/${projectId}`;
    const createResponse = await fetch(`${authBase}/accounts`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email,
        password,
        displayName: firestoreString(studentFields, 'name'),
        emailVerified: false,
        disabled: false,
      }),
    });
    const createData = await createResponse.json().catch(() => ({}));
    if (!createResponse.ok || !createData.localId) {
      const duplicate = /EMAIL_EXISTS|email.*already/i.test(JSON.stringify(createData));
      return jsonResponse({ error: duplicate ? 'يوجد حساب مسبق لهذا البريد؛ تواصل مع إدارة المدرسة لربطه.' : 'تعذر إنشاء حساب الطالب.' }, duplicate ? 409 : 502, env);
    }
    createdUid = createData.localId;

    const parentInfo = decodeFirestoreValue(studentFields.parentInfo || { mapValue: { fields: {} } });
    const parentName = parentInfo.parentName || '';
    const familyId = firestoreString(studentFields, 'familyId') || `fam_${studentCode}`;
    const userProfileUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/users/${encodeURIComponent(createdUid)}`;
    userProfileUrlForRollback = userProfileUrl;
    const userProfileResponse = await fetch(userProfileUrl, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields: encodeFirestoreMap({
        role: 'student',
        schoolId,
        status: 'active',
        email,
        displayName: firestoreString(studentFields, 'name'),
        studentCode,
        familyId,
        parentName,
        parentUid: activation.data.parentUid || parentInfo.parentUid || '',
        passwordChangeRequired: false,
        createdAt: new Date().toISOString(),
      }) }),
    });
    if (!userProfileResponse.ok) throw new Error('تعذر إنشاء ملف صلاحيات الطالب.');
    profileCreated = true;

    const studentUpdateUrl = new URL(studentUrl);
    ['authUid', 'accountStatus', 'linkedParentUid', 'familyId'].forEach((field) => studentUpdateUrl.searchParams.append('updateMask.fieldPaths', field));
    const studentUpdateResponse = await fetch(studentUpdateUrl, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields: encodeFirestoreMap({
        authUid: createdUid,
        accountStatus: 'active',
        linkedParentUid: activation.data.parentUid || parentInfo.parentUid || '',
        familyId,
      }) }),
    });
    if (!studentUpdateResponse.ok) throw new Error('تعذر ربط حساب الطالب بملف القيد.');
    studentLinked = true;

    const activationUpdateUrl = new URL(activation.url);
    ['status', 'accountUid', 'completedAt'].forEach((field) => activationUpdateUrl.searchParams.append('updateMask.fieldPaths', field));
    const completionResponse = await fetch(activationUpdateUrl, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields: encodeFirestoreMap({
        status: 'completed',
        accountUid: createdUid,
        completedAt: new Date().toISOString(),
      }) }),
    });
    if (!completionResponse.ok) throw new Error('تعذر إنهاء طلب التفعيل. حاول مرة أخرى.');

    await recordStudentAccountAudit(env, adminToken, {
      uid: activation.data.parentUid || 'family_activation',
      role: 'parent',
    }, schoolId, email, studentCode);
    return jsonResponse({ success: true, uid: createdUid, email }, 201, env);
  } catch (error) {
    if (createdUid) {
      try {
        const adminToken = await getFirebaseAdminAccessToken(env);
        const projectId = env.FIREBASE_PROJECT_ID;
        if (studentLinked && studentUrlForRollback) {
          const unlinkUrl = new URL(studentUrlForRollback);
          ['authUid', 'accountStatus', 'linkedParentUid'].forEach((field) => unlinkUrl.searchParams.append('updateMask.fieldPaths', field));
          await fetch(unlinkUrl, {
            method: 'PATCH',
            headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ fields: encodeFirestoreMap({
              authUid: '',
              accountStatus: 'pending_activation',
              linkedParentUid: '',
            }) }),
          });
        }
        if (profileCreated && userProfileUrlForRollback) {
          await fetch(userProfileUrlForRollback, {
            method: 'DELETE', headers: { Authorization: `Bearer ${adminToken}` },
          });
        }
        await fetch(`https://identitytoolkit.googleapis.com/v1/projects/${projectId}/accounts:delete`, {
          method: 'POST', headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ localId: createdUid }),
        });
      } catch (rollbackError) {
        console.error('Student activation rollback failed:', rollbackError.message);
      }
    }
    return jsonResponse({ error: error.message || 'تعذر إكمال تفعيل الطالب.' }, error.status || 500, env);
  }
}

function decodeBase64Url(value) {
  return new TextDecoder().decode(decodeBase64UrlBytes(value));
}

function decodeBase64UrlBytes(value) {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
  const binary = atob(padded);
  return Uint8Array.from(binary, char => char.charCodeAt(0));
}

async function getFirebaseSigningKey(keyId) {
  const now = Date.now();
  if (!firebaseKeysCache || now >= firebaseKeysExpiry) {
    const response = await fetch('https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com');
    if (!response.ok) throw new Error('Could not fetch Firebase signing keys');
    const payload = await response.json();
    firebaseKeysCache = payload.keys || [];
    const maxAge = Number(response.headers.get('Cache-Control')?.match(/max-age=(\d+)/)?.[1] || 300);
    firebaseKeysExpiry = now + maxAge * 1000;
  }

  const key = firebaseKeysCache.find(candidate => candidate.kid === keyId);
  if (!key) throw new Error('Unknown Firebase signing key');
  return key;
}

function getCloudinaryConfig(env) {
  const { CLOUDINARY_CLOUD_NAME: cloudName, CLOUDINARY_API_KEY: apiKey, CLOUDINARY_API_SECRET: apiSecret } = env;
  if (!cloudName || !apiKey || !apiSecret) {
    throw Object.assign(new Error('Cloudinary Worker secrets are not configured'), { status: 503 });
  }
  return { cloudName, apiKey, apiSecret };
}

function canAccessSchool(user, schoolId) {
  return typeof schoolId === 'string' && schoolId.length > 0 &&
    (user.role === 'super_admin' || user.schoolId === schoolId);
}

async function getFirebaseAdminAccessToken(env) {
  if (firebaseAdminToken && Date.now() < firebaseAdminTokenExpiry) return firebaseAdminToken;

  if (!env.FIREBASE_ADMIN_SERVICE_ACCOUNT) {
    throw Object.assign(new Error('Firebase Admin service account is not configured'), { status: 503 });
  }

  let credentials;
  try {
    credentials = JSON.parse(env.FIREBASE_ADMIN_SERVICE_ACCOUNT);
  } catch {
    throw Object.assign(new Error('Firebase Admin service account secret is invalid'), { status: 503 });
  }
  if (!credentials.client_email || !credentials.private_key || credentials.project_id !== env.FIREBASE_PROJECT_ID) {
    throw Object.assign(new Error('Firebase Admin service account does not match the Worker project'), { status: 503 });
  }

  const tokenUri = credentials.token_uri || 'https://oauth2.googleapis.com/token';
  const now = Math.floor(Date.now() / 1000);
  const header = encodeBase64Url(new TextEncoder().encode(JSON.stringify({ alg: 'RS256', typ: 'JWT' })));
  const payload = encodeBase64Url(new TextEncoder().encode(JSON.stringify({
    iss: credentials.client_email,
      scope: 'https://www.googleapis.com/auth/cloud-platform https://www.googleapis.com/auth/identitytoolkit https://www.googleapis.com/auth/datastore',
    aud: tokenUri,
    iat: now,
    exp: now + 3600,
  })));
  const unsignedToken = `${header}.${payload}`;
  const privateKeyBytes = decodeBase64Bytes(credentials.private_key
    .replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\s/g, ''));
  const privateKey = await crypto.subtle.importKey(
    'pkcs8',
    privateKeyBytes,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    privateKey,
    new TextEncoder().encode(unsignedToken)
  );
  const assertion = `${unsignedToken}.${encodeBase64Url(new Uint8Array(signature))}`;
  const tokenResponse = await fetch(tokenUri, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
  });
  const tokenData = await tokenResponse.json().catch(() => ({}));
  if (!tokenResponse.ok || !tokenData.access_token) {
    throw Object.assign(new Error('Could not authenticate Firebase Admin service account'), { status: 503 });
  }

  firebaseAdminToken = tokenData.access_token;
  firebaseAdminTokenExpiry = Date.now() + Math.max(60, Number(tokenData.expires_in || 3600) - 60) * 1000;
  return firebaseAdminToken;
}

async function handleLinkEnrolledStudentFamily(request, env) {
  try {
    const operator = await verifyAuth(request, env);
    if (!['student_affairs', 'director', 'super_admin'].includes(operator.role)) {
      return jsonResponse({ error: 'Forbidden: only school staff can link a new student to a family' }, 403, env);
    }
    const body = await request.json();
    const studentCode = String(body.studentCode || '').trim();
    const schoolId = String(body.schoolId || '').trim();
    if (!/^\d{6,12}$/.test(studentCode) || !schoolId || schoolId !== operator.schoolId ||
      !canAccessSchool(operator, schoolId)) {
      return jsonResponse({ error: 'Invalid student code or school scope' }, 400, env);
    }

    const projectId = env.FIREBASE_PROJECT_ID;
    const adminToken = await getFirebaseAdminAccessToken(env);
    const studentUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/schools/${encodeURIComponent(schoolId)}/students/${encodeURIComponent(`stu_${studentCode}`)}`;
    const studentResponse = await fetch(studentUrl, { headers: { Authorization: `Bearer ${adminToken}` } });
    if (!studentResponse.ok) return jsonResponse({ error: 'Student record was not found' }, 404, env);
    const studentDocument = await studentResponse.json();
    const studentFields = studentDocument.fields || {};
    const parentInfo = decodeFirestoreValue(studentFields.parentInfo || { mapValue: { fields: {} } });
    const parentEmail = String(parentInfo.parentEmail || '').trim().toLowerCase();
    if (!parentEmail || firestoreString(studentFields, 'code') !== studentCode) {
      return jsonResponse({ success: true, linked: false }, 200, env);
    }

    const authBase = `https://identitytoolkit.googleapis.com/v1/projects/${projectId}`;
    const lookupResponse = await fetch(`${authBase}/accounts:lookup`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: [parentEmail] }),
    });
    const lookupData = await lookupResponse.json().catch(() => ({}));
    const parentAccount = lookupData.users?.find((account) => account.email?.toLowerCase() === parentEmail);
    if (!lookupResponse.ok || !parentAccount?.localId) return jsonResponse({ success: true, linked: false }, 200, env);

    const parentProfileUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/users/${encodeURIComponent(parentAccount.localId)}`;
    const parentProfileResponse = await fetch(parentProfileUrl, { headers: { Authorization: `Bearer ${adminToken}` } });
    if (!parentProfileResponse.ok) return jsonResponse({ success: true, linked: false }, 200, env);
    const parentProfile = await parentProfileResponse.json();
    const profileFields = parentProfile.fields || {};
    if (firestoreString(profileFields, 'role') !== 'parent' || firestoreString(profileFields, 'schoolId') !== schoolId) {
      return jsonResponse({ success: true, linked: false }, 200, env);
    }

    const familyId = firestoreString(profileFields, 'familyId') || `fam_${parentAccount.localId}`;
    const linkedCodes = Array.from(new Set([
      ...(profileFields.linkedStudentCodes?.arrayValue?.values || []).map((value) => value.stringValue || ''),
      studentCode,
    ].filter(Boolean)));
    const updateProfileUrl = new URL(parentProfileUrl);
    ['familyId', 'linkedStudentCodes'].forEach((field) => updateProfileUrl.searchParams.append('updateMask.fieldPaths', field));
    const updateProfileResponse = await fetch(updateProfileUrl, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields: encodeFirestoreMap({ familyId, linkedStudentCodes: linkedCodes }) }),
    });
    if (!updateProfileResponse.ok) throw new Error('Parent family profile could not be updated');

    for (const linkedCode of linkedCodes) {
      let linkedFields = studentFields;
      let linkedStudentUrl = studentUrl;
      if (linkedCode !== studentCode) {
        linkedStudentUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/schools/${encodeURIComponent(schoolId)}/students/${encodeURIComponent(`stu_${linkedCode}`)}`;
        const linkedResponse = await fetch(linkedStudentUrl, { headers: { Authorization: `Bearer ${adminToken}` } });
        if (!linkedResponse.ok) throw new Error('A linked sibling record could not be loaded');
        linkedFields = (await linkedResponse.json()).fields || {};
      }
      const linkedParentInfo = decodeFirestoreValue(linkedFields.parentInfo || { mapValue: { fields: {} } });
      linkedParentInfo.parentEmail = parentEmail;
      linkedParentInfo.parentUid = parentAccount.localId;
      const updateStudentUrl = new URL(linkedStudentUrl);
      ['familyId', 'linkedParentUid', 'parentInfo', 'siblingCodes'].forEach((field) => updateStudentUrl.searchParams.append('updateMask.fieldPaths', field));
      const updateStudentResponse = await fetch(updateStudentUrl, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ fields: encodeFirestoreMap({
          familyId,
          linkedParentUid: parentAccount.localId,
          parentInfo: linkedParentInfo,
          siblingCodes: linkedCodes.filter((code) => code !== linkedCode),
        }) }),
      });
      if (!updateStudentResponse.ok) throw new Error('Student record could not be linked to the parent');
    }

    return jsonResponse({ success: true, linked: true, familyId }, 200, env);
  } catch (error) {
    return jsonResponse({ error: error.message || 'Could not link the student family account' }, error.status || 401, env);
  }
}

function encodeBase64Url(bytes) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function decodeBase64Bytes(value) {
  const binary = atob(value);
  return Uint8Array.from(binary, char => char.charCodeAt(0));
}

async function handleChangePassword(request, env) {
  try {
    const operator = await verifyAuth(request, env);
    if (operator.role !== 'tech_specialist') {
      return jsonResponse({ error: 'Forbidden: only Technology Support can change user passwords' }, 403, env);
    }
    if (typeof operator.schoolId !== 'string' || !operator.schoolId) {
      return jsonResponse({ error: 'Technology Support account has no school assignment' }, 403, env);
    }

    const contentLength = Number(request.headers.get('Content-Length') || 0);
    if (contentLength > 8192) return jsonResponse({ error: 'Request is too large' }, 413, env);

    const body = await request.json();
    const targetEmail = String(body.targetEmail || '').trim().toLowerCase();
    const newPassword = String(body.newPassword || '');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(targetEmail)) {
      return jsonResponse({ error: 'Enter a valid user email address' }, 400, env);
    }
    if (newPassword.length < 12 || !/[a-z]/.test(newPassword) || !/[A-Z]/.test(newPassword) ||
        !/\d/.test(newPassword) || !/[^A-Za-z0-9]/.test(newPassword)) {
      return jsonResponse({ error: 'Password must be at least 12 characters and include upper/lowercase letters, a number, and a symbol' }, 400, env);
    }

    const adminToken = await getFirebaseAdminAccessToken(env);
    const projectId = env.FIREBASE_PROJECT_ID;
    const apiBase = `https://identitytoolkit.googleapis.com/v1/projects/${projectId}`;
    const lookupResponse = await fetch(`${apiBase}/accounts:lookup`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${adminToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email: [targetEmail] }),
    });
    const lookupData = await lookupResponse.json().catch(() => ({}));
    const targetAccount = lookupData.users?.find(user => user.email?.toLowerCase() === targetEmail);
    if (!lookupResponse.ok || !targetAccount?.localId) {
      return jsonResponse({ error: 'No matching active school account was found' }, 404, env);
    }
    if (targetAccount.disabled) {
      return jsonResponse({ error: 'Disabled accounts cannot be changed through this endpoint' }, 403, env);
    }

    const profileResponse = await fetch(
      `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/users/${encodeURIComponent(targetAccount.localId)}`,
      { headers: { 'Authorization': `Bearer ${adminToken}` } }
    );
    const profileDocument = await profileResponse.json().catch(() => ({}));
    if (!profileResponse.ok) {
      return jsonResponse({ error: 'Could not verify the target account school profile' }, 403, env);
    }

    const profileFields = profileDocument.fields || {};
    const targetRole = profileFields.role?.stringValue;
    const targetSchoolId = profileFields.schoolId?.stringValue;
    const targetStatus = profileFields.status?.stringValue;
    const allowedTargetRoles = ['student', 'parent', 'teacher', 'student_affairs', 'social_affairs'];
    if (targetStatus === 'inactive' || !allowedTargetRoles.includes(targetRole) ||
      typeof targetSchoolId !== 'string' || !targetSchoolId ||
      targetSchoolId !== operator.schoolId || targetAccount.localId === operator.uid) {
      return jsonResponse({ error: 'This account is not eligible for a technology-support password change' }, 403, env);
    }

    const updateResponse = await fetch(`${apiBase}/accounts:update`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${adminToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        localId: targetAccount.localId,
        password: newPassword,
        validSince: String(Math.floor(Date.now() / 1000)),
        returnSecureToken: false,
      }),
    });
    const updateData = await updateResponse.json().catch(() => ({}));
    if (!updateResponse.ok) {
      return jsonResponse({ error: 'Firebase could not update this account password' }, 502, env);
    }

    await recordPasswordChangeAudit(env, adminToken, operator, targetAccount, targetSchoolId);
    return jsonResponse({ success: true }, 200, env);
  } catch (err) {
    return jsonResponse({ error: err.message }, err.status || 401, env);
  }
}

async function recordPasswordChangeAudit(env, accessToken, operator, targetAccount, schoolId) {
  const projectId = env.FIREBASE_PROJECT_ID;
  const documentId = `password_change_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`;
  const endpoint = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/schools/${encodeURIComponent(schoolId)}/auditLogs?documentId=${documentId}`;
  const fields = {
    action: { stringValue: 'تغيير كلمة مرور بواسطة مسؤول التطوير التكنولوجي' },
    target: { stringValue: targetAccount.email },
    details: { stringValue: `تم تغيير كلمة مرور الحساب ${targetAccount.localId}، ولم يتم تسجيل كلمة المرور.` },
    category: { stringValue: 'security' },
    operatorUid: { stringValue: operator.uid },
    operatorRole: { stringValue: operator.role },
    schoolId: { stringValue: schoolId },
    createdAt: { timestampValue: new Date().toISOString() },
  };

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ fields }),
    });
    if (!response.ok) console.warn('Password-change audit write failed');
  } catch {
    console.warn('Password-change audit write failed');
  }
}

function makeInitialStudentPassword() {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return `Dse-${encodeBase64Url(bytes)}1!aA`;
}

function firestoreString(fields, name) {
  return fields?.[name]?.stringValue || '';
}

function firestoreBool(fields, name) {
  return fields?.[name]?.booleanValue === true;
}

async function handleProvisionStudent(request, env) {
  let createdUid = '';
  let profileCreated = false;
  let studentDocumentUrl = '';
  try {
    const operator = await verifyAuth(request, env);
    if (!['student_affairs', 'director', 'super_admin'].includes(operator.role)) {
      return jsonResponse({ error: 'Forbidden: only student affairs or school administration can provision student accounts' }, 403, env);
    }
    if (typeof operator.schoolId !== 'string' || !operator.schoolId) {
      return jsonResponse({ error: 'Operator has no school assignment' }, 403, env);
    }

    const contentLength = Number(request.headers.get('Content-Length') || 0);
    if (contentLength > 4096) return jsonResponse({ error: 'Request is too large' }, 413, env);
    const body = await request.json();
    const code = String(body.studentCode || '').trim();
    const schoolId = String(body.schoolId || '').trim();
    const expectedEmail = `${code}@cairo7.moe.edu.eg`;
    if (!/^\d{6,12}$/.test(code) || !schoolId || !canAccessSchool(operator, schoolId) || schoolId !== operator.schoolId) {
      return jsonResponse({ error: 'Invalid student code or school scope' }, 400, env);
    }

    const projectId = env.FIREBASE_PROJECT_ID;
    const adminToken = await getFirebaseAdminAccessToken(env);
    const studentPath = `schools/${encodeURIComponent(schoolId)}/students/${encodeURIComponent(`stu_${code}`)}`;
    studentDocumentUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/${studentPath}`;
    const studentResponse = await fetch(studentDocumentUrl, { headers: { Authorization: `Bearer ${adminToken}` } });
    if (!studentResponse.ok) return jsonResponse({ error: 'A registered student record for this code was not found' }, 404, env);
    const studentDocument = await studentResponse.json();
    const studentFields = studentDocument.fields || {};
    if (firestoreString(studentFields, 'schoolId') !== schoolId ||
        firestoreString(studentFields, 'code') !== code ||
        firestoreString(studentFields, 'email').toLowerCase() !== expectedEmail ||
        ['archived', 'withdrawn', 'transferred_out'].includes(firestoreString(studentFields, 'status'))) {
      return jsonResponse({ error: 'Student record is not eligible for account activation' }, 409, env);
    }
    if (firestoreString(studentFields, 'authUid')) {
      return jsonResponse({ error: 'A login account is already linked to this student' }, 409, env);
    }

    const studentName = firestoreString(studentFields, 'name');
    const parentName = studentFields.parentInfo?.mapValue?.fields?.parentName?.stringValue || '';
    const initialPassword = makeInitialStudentPassword();
    const authBase = `https://identitytoolkit.googleapis.com/v1/projects/${projectId}`;
    const createResponse = await fetch(`${authBase}/accounts`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: expectedEmail, password: initialPassword, displayName: studentName, emailVerified: false, disabled: false }),
    });
    const createData = await createResponse.json().catch(() => ({}));
    if (!createResponse.ok || !createData.localId) {
      const isDuplicate = /EMAIL_EXISTS|email.*already/i.test(JSON.stringify(createData));
      return jsonResponse({ error: isDuplicate ? 'An authentication account already exists for this student email; contact the administrator to link it safely' : 'Firebase could not create the student account' }, isDuplicate ? 409 : 502, env);
    }
    createdUid = createData.localId;

    const userDocUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/users/${encodeURIComponent(createdUid)}`;
    const userFields = {
      role: { stringValue: 'student' },
      schoolId: { stringValue: schoolId },
      status: { stringValue: 'active' },
      email: { stringValue: expectedEmail },
      displayName: { stringValue: studentName },
      studentCode: { stringValue: code },
      parentName: { stringValue: parentName },
      passwordChangeRequired: { booleanValue: true },
      createdAt: { timestampValue: new Date().toISOString() },
    };
    const profileResponse = await fetch(userDocUrl, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields: userFields }),
    });
    if (!profileResponse.ok) throw new Error('Firebase could not create the student authorization profile');
    profileCreated = true;

    const updateMask = new URLSearchParams();
    ['authUid', 'accountStatus', 'linkedParentUid'].forEach((field) => updateMask.append('updateMask.fieldPaths', field));
    const linkResponse = await fetch(`${studentDocumentUrl}?${updateMask.toString()}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields: {
        authUid: { stringValue: createdUid },
        accountStatus: { stringValue: 'active' },
        linkedParentUid: { stringValue: createdUid },
      } }),
    });
    if (!linkResponse.ok) throw new Error('The student record could not be linked to the new account');

    await recordStudentAccountAudit(env, adminToken, operator, schoolId, expectedEmail, code);
    return jsonResponse({ success: true, uid: createdUid, email: expectedEmail, initialPassword, passwordChangeRequired: true }, 201, env);
  } catch (error) {
    if (createdUid) {
      try {
        const adminToken = await getFirebaseAdminAccessToken(env);
        const projectId = env.FIREBASE_PROJECT_ID;
        if (studentDocumentUrl) {
          const unlinkMask = new URLSearchParams();
          ['authUid', 'accountStatus', 'linkedParentUid'].forEach((field) => unlinkMask.append('updateMask.fieldPaths', field));
          await fetch(`${studentDocumentUrl}?${unlinkMask.toString()}`, {
            method: 'PATCH',
            headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ fields: {} }),
          });
        }
        if (profileCreated) {
          await fetch(`https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/users/${encodeURIComponent(createdUid)}`, {
            method: 'DELETE', headers: { Authorization: `Bearer ${adminToken}` },
          });
        }
        await fetch(`https://identitytoolkit.googleapis.com/v1/projects/${projectId}/accounts:delete`, {
          method: 'POST', headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ localId: createdUid }),
        });
      } catch (rollbackError) {
        console.error('Student account rollback failed:', rollbackError.message);
      }
    }
    return jsonResponse({ error: error.message || 'Student account provisioning failed' }, error.status || 500, env);
  }
}

async function recordStudentAccountAudit(env, accessToken, operator, schoolId, email, studentCode) {
  const projectId = env.FIREBASE_PROJECT_ID;
  const documentId = `student_account_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`;
  const endpoint = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/schools/${encodeURIComponent(schoolId)}/auditLogs?documentId=${documentId}`;
  const fields = {
    action: { stringValue: 'إنشاء حساب دخول لطالب عند اعتماد القيد' },
    target: { stringValue: `${email} (كود الطالب: ${studentCode})` },
    details: { stringValue: `تم إنشاء حساب الطالب بواسطة ${operator.role}. لم تُحفظ كلمة المرور في سجل التدقيق.` },
    category: { stringValue: 'auth' },
    operatorUid: { stringValue: operator.uid },
    operatorRole: { stringValue: operator.role },
    schoolId: { stringValue: schoolId },
    createdAt: { timestampValue: new Date().toISOString() },
  };
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields }),
  });
  if (!response.ok) console.warn('Student account audit write failed');
}

async function handleFamilyStudentRecords(request, env) {
  try {
    const user = await verifyAuth(request, env);
    if (!['student', 'parent'].includes(user.role) || !user.schoolId ||
      (user.role === 'parent' && !user.emailVerified)) {
      return jsonResponse({ error: 'حساب الأسرة غير مخول لعرض سجلات الطلاب.' }, 403, env);
    }

    const studentCodes = user.role === 'student' ? [user.studentCode] : user.linkedStudentCodes;
    if (!studentCodes.length || studentCodes.length > 100) return jsonResponse({ students: [] }, 200, env);

    const projectId = env.FIREBASE_PROJECT_ID;
    const adminToken = await getFirebaseAdminAccessToken(env);
    const students = [];
    for (const studentCode of studentCodes) {
      if (!/^\d{6,12}$/.test(studentCode)) continue;
      const studentUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/schools/${encodeURIComponent(user.schoolId)}/students/${encodeURIComponent(`stu_${studentCode}`)}`;
      const response = await fetch(studentUrl, { headers: { Authorization: `Bearer ${adminToken}` } });
      if (!response.ok) continue;
      const document = await response.json();
      const fields = document.fields || {};
      const parentFields = fields.parentInfo?.mapValue?.fields || {};
      const linkedToStudent = user.role === 'student' &&
        firestoreString(fields, 'code') === user.studentCode &&
        firestoreString(fields, 'authUid') === user.uid;
      const linkedToParent = user.role === 'parent' && (
        firestoreString(fields, 'linkedParentUid') === user.uid ||
        (parentFields.parentUid?.stringValue || '') === user.uid ||
        (parentFields.parentEmail?.stringValue || '').toLowerCase() === user.email
      );
      if (!linkedToStudent && !linkedToParent) continue;

      const siblingCodes = fields.siblingCodes?.arrayValue?.values || [];
      students.push({
        id: document.name.split('/').pop(),
        name: firestoreString(fields, 'name'),
        code: firestoreString(fields, 'code'),
        email: firestoreString(fields, 'email'),
        nationalId: linkedToStudent ? firestoreString(fields, 'nationalId') : '',
        birthDate: linkedToStudent ? firestoreString(fields, 'birthDate') : '',
        ageOct1: linkedToStudent ? firestoreString(fields, 'ageOct1') : '',
        gender: linkedToStudent ? firestoreString(fields, 'gender') : '',
        religion: linkedToStudent ? firestoreString(fields, 'religion') : '',
        nationality: linkedToStudent ? firestoreString(fields, 'nationality') : '',
        grade: firestoreString(fields, 'grade'),
        status: firestoreString(fields, 'status'),
        parentInfo: { parentName: parentFields.parentName?.stringValue || '' },
        hasSiblings: linkedToStudent ? siblingCodes.length > 0 : studentCodes.length > 1,
      });
    }
    return jsonResponse({ students }, 200, env);
  } catch (error) {
    return jsonResponse({ error: error.message || 'تعذر تحميل بيانات الأسرة.' }, error.status || 401, env);
  }
}

async function handleStudentPortalAttendance(request, env) {
  try {
    const user = await verifyAuth(request, env);
    if (!['student', 'parent'].includes(user.role) || !user.schoolId) {
      return jsonResponse({ error: 'This account cannot access family attendance records' }, 403, env);
    }

    const body = await request.json();
    const studentCode = String(body.studentCode || '').trim();
    if (!/^\d{6,12}$/.test(studentCode)) {
      return jsonResponse({ error: 'Invalid student code' }, 400, env);
    }
    if (user.role === 'student' && user.studentCode !== studentCode) {
      return jsonResponse({ error: 'Students may only access their own attendance records' }, 403, env);
    }
    if (user.role === 'parent' && !user.emailVerified) {
      return jsonResponse({ error: 'Verify the guardian email before accessing student records' }, 403, env);
    }

    const projectId = env.FIREBASE_PROJECT_ID;
    const adminToken = await getFirebaseAdminAccessToken(env);
    const studentUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/schools/${encodeURIComponent(user.schoolId)}/students/${encodeURIComponent(`stu_${studentCode}`)}`;
    const studentResponse = await fetch(studentUrl, { headers: { Authorization: `Bearer ${adminToken}` } });
    if (!studentResponse.ok) return jsonResponse({ error: 'Linked student record was not found' }, 404, env);
    const studentDocument = await studentResponse.json();
    const fields = studentDocument.fields || {};
    const parentFields = fields.parentInfo?.mapValue?.fields || {};
    const isLinkedStudent = user.role === 'student' &&
      firestoreString(fields, 'authUid') === user.uid &&
      firestoreString(fields, 'email').toLowerCase() === user.email;
    const isLinkedParent = user.role === 'parent' && (
      firestoreString(fields, 'linkedParentUid') === user.uid ||
      (parentFields.parentUid?.stringValue || '') === user.uid ||
      (parentFields.parentEmail?.stringValue || '').toLowerCase() === user.email
    );
    if (!isLinkedStudent && !isLinkedParent) {
      return jsonResponse({ error: 'This account is not linked to the requested student' }, 403, env);
    }

    const attendanceCollection = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/schools/${encodeURIComponent(user.schoolId)}/attendance`;
    const records = [];
    let pageToken = '';
    let scannedDocuments = 0;
    do {
      const pageUrl = new URL(attendanceCollection);
      pageUrl.searchParams.set('pageSize', '1000');
      if (pageToken) pageUrl.searchParams.set('pageToken', pageToken);
      const pageResponse = await fetch(pageUrl, { headers: { Authorization: `Bearer ${adminToken}` } });
      if (!pageResponse.ok) throw new Error('Could not load attendance history');
      const page = await pageResponse.json();
      const documents = page.documents || [];
      scannedDocuments += documents.length;
      if (scannedDocuments > 10000) {
        return jsonResponse({ error: 'Attendance history is too large to load safely; contact the school administrator' }, 503, env);
      }

      for (const document of documents) {
        const batch = decodeFirestoreMap(document.fields || {});
        const batchRecords = Array.isArray(batch.records) ? batch.records : batch.studentCode ? [batch] : [];
        for (const record of batchRecords) {
          if (String(record.studentCode || '') !== studentCode) continue;
          records.push({
            ...record,
            date: record.date || batch.date || '',
            classId: record.classId || batch.classId || '',
            phase: record.phase || batch.phase || 'class',
            lessonId: record.lessonId || batch.lessonId || '',
          });
        }
      }
      pageToken = page.nextPageToken || '';
    } while (pageToken);

    records.sort((left, right) => String(right.date).localeCompare(String(left.date)));
    return jsonResponse({ records }, 200, env);
  } catch (error) {
    return jsonResponse({ error: error.message || 'Could not load attendance history' }, error.status || 401, env);
  }
}

function decodeFirestoreMap(fields) {
  return Object.fromEntries(Object.entries(fields).map(([key, value]) => [key, decodeFirestoreValue(value)]));
}

function decodeFirestoreValue(value) {
  if ('stringValue' in value) return value.stringValue;
  if ('integerValue' in value) return Number(value.integerValue);
  if ('doubleValue' in value) return value.doubleValue;
  if ('booleanValue' in value) return value.booleanValue;
  if ('timestampValue' in value) return value.timestampValue;
  if ('nullValue' in value) return null;
  if ('arrayValue' in value) return (value.arrayValue.values || []).map(decodeFirestoreValue);
  if ('mapValue' in value) return decodeFirestoreMap(value.mapValue.fields || {});
  return null;
}

function encodeFirestoreMap(fields) {
  return Object.fromEntries(Object.entries(fields).map(([key, value]) => [key, encodeFirestoreValue(value)]));
}

function encodeFirestoreValue(value) {
  if (value === null || value === undefined) return { nullValue: null };
  if (typeof value === 'string') return { stringValue: value };
  if (typeof value === 'boolean') return { booleanValue: value };
  if (typeof value === 'number') return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
  if (Array.isArray(value)) return { arrayValue: { values: value.map(encodeFirestoreValue) } };
  if (typeof value === 'object') return { mapValue: { fields: encodeFirestoreMap(value) } };
  return { nullValue: null };
}

async function handlePlatformListSuperAdmins(request, env) {
  try {
    const user = await verifyAuth(request, env);
    if (user.role !== 'super_admin') return jsonResponse({ error: 'هذه العملية مخصصة لمديري المنصة العامين.' }, 403, env);
    const projectId = env.FIREBASE_PROJECT_ID;
    const adminToken = await getFirebaseAdminAccessToken(env);
    const collectionUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/users`;
    const response = await fetch(collectionUrl, { headers: { Authorization: `Bearer ${adminToken}` } });
    if (!response.ok) throw new Error('تعذر تحميل حسابات مديري المنصة.');
    const page = await response.json();
    const superAdmins = (page.documents || []).map((document) => {
      const fields = decodeFirestoreMap(document.fields || {});
      return {
        uid: document.name.split('/').pop(),
        email: fields.email || '',
        displayName: fields.displayName || '',
        status: fields.status || 'active',
        platformRole: fields.platformRole || 'super_admin',
        createdAt: fields.createdAt || '',
      };
    }).filter((profile) => profile.platformRole === 'super_admin' || !profile.schoolId);
    return jsonResponse({ superAdmins }, 200, env);
  } catch (error) {
    return jsonResponse({ error: error.message || 'تعذر تحميل مديري المنصة.' }, error.status || 401, env);
  }
}

async function handlePlatformInviteSuperAdmin(request, env) {
  try {
    const inviter = await verifyAuth(request, env);
    if (inviter.role !== 'super_admin') return jsonResponse({ error: 'هذه العملية مخصصة لمديري المنصة العامين.' }, 403, env);
    const body = await request.json();
    const email = String(body.email || '').trim().toLowerCase();
    const displayName = String(body.displayName || '').trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254 ||
      displayName.length < 2 || displayName.length > 120) {
      return jsonResponse({ error: 'أدخل اسمًا وبريدًا صحيحين.' }, 400, env);
    }

    const projectId = env.FIREBASE_PROJECT_ID;
    const adminToken = await getFirebaseAdminAccessToken(env);
    const authBase = `https://identitytoolkit.googleapis.com/v1/projects/${projectId}`;
    const lookupResponse = await fetch(`${authBase}/accounts:lookup`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: [email] }),
    });
    const lookupData = await lookupResponse.json().catch(() => ({}));
    if (!lookupResponse.ok) throw new Error('تعذر التحقق من البريد في Firebase.');
    if (lookupData.users?.length) throw Object.assign(new Error('يوجد حساب مرتبط بهذا البريد بالفعل.'), { status: 409 });

    const invitationId = crypto.randomUUID();
    const invitationUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/accountInvitations?documentId=${encodeURIComponent(invitationId)}`;
    const invitation = {
      invitationId,
      email,
      displayName,
      role: 'super_admin',
      schoolId: '',
      platformRole: 'super_admin',
      teacherInfo: {},
      status: 'pending',
      invitedByUid: inviter.uid,
      invitedByRole: 'super_admin',
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString(),
    };
    const createResponse = await fetch(invitationUrl, {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields: encodeFirestoreMap(invitation) }),
    });
    if (!createResponse.ok) throw new Error('تعذر إنشاء دعوة مدير المنصة.');

    const continueUrl = new URL(env.PLATFORM_CONTINUE_BASE || 'https://digital-school-platform.vercel.app');
    continueUrl.pathname = '/platform-admin/login.html';
    continueUrl.searchParams.set('flow', 'staff-invitation');
    continueUrl.searchParams.set('invitationId', invitationId);
    const invitationLinkResult = await generateAccountInvitationLink(email, continueUrl.toString(), env, adminToken);
    if (!invitationLinkResult.ok) {
      await fetch(invitationUrl.replace(`?documentId=${encodeURIComponent(invitationId)}`, `/${encodeURIComponent(invitationId)}`), {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${adminToken}` },
      }).catch(() => {});
      throw Object.assign(new Error(invitationLinkFailureMessage(invitationLinkResult.code)), { status: 502 });
    }
    return jsonResponse({
      success: true,
      invitationId,
      email,
      role: 'super_admin',
      invitationLink: invitationLinkResult.invitationLink,
    }, 202, env);
  } catch (error) {
    return jsonResponse({ error: error.message || 'تعذر دعوة مدير المنصة.' }, error.status || 500, env);
  }
}

async function handlePublicSchoolApplication(request, env) {
  let applicationUrl = '';
  let claimUrl = '';
  try {
    if (Number(request.headers.get('Content-Length') || 0) > 8192) {
      return jsonResponse({ error: 'بيانات الطلب أكبر من المسموح.' }, 413, env);
    }

    const limiter = env.SCHOOL_APPLICATION_LIMITER;
    if (!limiter) return jsonResponse({ error: 'خدمة تسجيل المدارس غير مكتملة الإعداد.' }, 503, env);
    const clientIp = request.headers.get('CF-Connecting-IP') || 'unknown';
    const ipLimit = await limiter.limit({ key: `school-application-ip:${clientIp}` });
    if (!ipLimit.success) {
      return jsonResponse({ error: 'تم إرسال طلبات كثيرة. انتظر دقيقة ثم حاول.' }, 429, env);
    }

    const rawBody = await request.text();
    if (new TextEncoder().encode(rawBody).length > 8192) {
      return jsonResponse({ error: 'بيانات الطلب أكبر من المسموح.' }, 413, env);
    }
    let body;
    try {
      body = JSON.parse(rawBody);
    } catch {
      return jsonResponse({ error: 'صيغة بيانات الطلب غير صحيحة.' }, 400, env);
    }
    const schoolSlug = String(body.schoolSlug || '').trim().toLowerCase();
    const schoolNameAr = String(body.schoolNameAr || '').trim();
    const schoolNameEn = String(body.schoolNameEn || '').trim();
    const applicantRole = String(body.applicantRole || '').trim();
    const applicantEmail = String(body.applicantEmail || '').trim().toLowerCase();
    const applicantName = String(body.applicantName || '').trim();
    const counterpartRole = String(body.counterpartRole || '').trim();
    const counterpartEmail = String(body.counterpartEmail || '').trim().toLowerCase();
    const counterpartName = String(body.counterpartName || '').trim();
    const phone = String(body.phone || '').trim();
    const expectedCounterpartRole = applicantRole === 'director' ? 'tech_specialist' : 'director';
    if (String(body.faxNumber || '').trim()) {
      return jsonResponse({ error: 'تعذر التحقق من طلب المدرسة.' }, 400, env);
    }
    if (body.acceptedTerms !== true || !['director', 'tech_specialist'].includes(applicantRole) ||
      counterpartRole !== expectedCounterpartRole ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(applicantEmail) ||
      applicantEmail.length > 254 || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(schoolSlug) ||
      schoolSlug.length > 63 || schoolNameAr.length < 2 || schoolNameAr.length > 160 ||
      schoolNameEn.length > 160 || applicantName.length < 2 || applicantName.length > 120 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(counterpartEmail) || counterpartEmail.length > 254 ||
      counterpartEmail === applicantEmail || counterpartName.length < 2 || counterpartName.length > 120 ||
      phone.length > 32) {
      return jsonResponse({ error: 'راجع اسم المدرسة والرابط وبيانات مقدم الطلب والطرف الثاني والموافقة على الشروط.' }, 400, env);
    }

    const projectId = env.FIREBASE_PROJECT_ID;
    const adminToken = await getFirebaseAdminAccessToken(env);
    const schoolUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/schools/${encodeURIComponent(schoolSlug)}`;
    const existingSchool = await fetch(schoolUrl, { headers: { Authorization: `Bearer ${adminToken}` } });
    if (existingSchool.ok) return jsonResponse({ error: 'هذا الرابط مستخدم بالفعل من مدرسة.' }, 409, env);
    if (existingSchool.status !== 404) throw new Error('تعذر التحقق من رابط المدرسة.');

    const applicationId = crypto.randomUUID();
    const createdAt = new Date().toISOString();
    claimUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/schoolSlugClaims?documentId=${encodeURIComponent(schoolSlug)}`;
    const claimResponse = await fetch(claimUrl, {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields: encodeFirestoreMap({
        schoolSlug,
        applicationId,
        applicantEmail,
        status: 'pending',
        createdAt,
      }) }),
    });
    if (!claimResponse.ok) {
      if (claimResponse.status === 409) return jsonResponse({ error: 'يوجد طلب سابق للرابط المقترح.' }, 409, env);
      throw new Error('تعذر حجز رابط المدرسة للطلب.');
    }

    applicationUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/schoolApplications?documentId=${encodeURIComponent(applicationId)}`;
    const application = {
      id: applicationId,
      schoolSlug,
      schoolNameAr,
      schoolNameEn,
      applicantRole,
      applicantName,
      applicantEmail,
      applicantEmailVerified: false,
      counterpartRole,
      counterpartName,
      counterpartEmail,
      counterpartEmailVerified: false,
      phone,
      acceptedTerms: true,
      status: 'pending',
      createdAt,
    };
    const applicationResponse = await fetch(applicationUrl, {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields: encodeFirestoreMap(application) }),
    });
    if (!applicationResponse.ok) throw new Error('تعذر حفظ طلب المدرسة.');

    const auditId = crypto.randomUUID();
    const auditUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/platformAuditLogs?documentId=${encodeURIComponent(auditId)}`;
    const auditResponse = await fetch(auditUrl, {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields: encodeFirestoreMap({
        action: 'school_application_submitted',
        applicationId,
        schoolSlug,
        actorType: 'public_applicant',
        actorUid: null,
        actorEmail: applicantEmail,
        createdAt,
      }) }),
    });
    if (!auditResponse.ok) throw new Error('تعذر تسجيل عملية إرسال الطلب.');

    return jsonResponse({ success: true, id: applicationId, schoolSlug }, 202, env);
  } catch (error) {
    if (applicationUrl || claimUrl) {
      const cleanupToken = await getFirebaseAdminAccessToken(env).catch(() => '');
      if (cleanupToken) {
        const cleanup = [];
        if (applicationUrl) cleanup.push(fetch(applicationUrl.replace(/\?documentId=.*$/, `/${encodeURIComponent(applicationUrl.split('documentId=')[1] || '')}`), {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${cleanupToken}` },
        }));
        if (claimUrl) cleanup.push(fetch(claimUrl.replace(/\?documentId=.*$/, `/${encodeURIComponent(new URL(claimUrl).searchParams.get('documentId') || '')}`), {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${cleanupToken}` },
        }));
        const results = await Promise.allSettled(cleanup);
        if (results.some((result) => result.status === 'rejected' || !result.value.ok)) {
          console.error('School application rollback was incomplete', { applicationId: new URL(applicationUrl || claimUrl).searchParams.get('documentId') });
        }
      }
    }
    return jsonResponse({ error: error.message || 'تعذر إرسال طلب المدرسة.' }, error.status || 500, env);
  }
}

async function handlePlatformListApplications(request, env) {
  try {
    const user = await verifyAuth(request, env);
    if (user.role !== 'super_admin') return jsonResponse({ error: 'هذه العملية مخصصة لمدير المنصة العام.' }, 403, env);
    const projectId = env.FIREBASE_PROJECT_ID;
    const adminToken = await getFirebaseAdminAccessToken(env);
    const collectionUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/schoolApplications`;
    const response = await fetch(collectionUrl, { headers: { Authorization: `Bearer ${adminToken}` } });
    if (!response.ok) throw new Error('تعذر تحميل طلبات المدارس.');
    const page = await response.json();
    const applications = (page.documents || []).map((document) => ({
      id: document.name.split('/').pop(),
      ...decodeFirestoreMap(document.fields || {}),
    })).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
    return jsonResponse({ applications }, 200, env);
  } catch (error) {
    return jsonResponse({ error: error.message || 'تعذر تحميل الطلبات.' }, error.status || 401, env);
  }
}

async function createPlatformAuditLog(projectId, adminToken, logId, fields) {
  const auditUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/platformAuditLogs?documentId=${encodeURIComponent(logId)}`;
  const response = await fetch(auditUrl, {
    method: 'POST',
    headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields: encodeFirestoreMap(fields) }),
  });
  if (!response.ok) throw new Error('تعذر تسجيل العملية في سجل تدقيق المنصة.');
}

async function handlePlatformRejectSchool(request, env) {
  try {
    const user = await verifyAuth(request, env);
    if (user.role !== 'super_admin') return jsonResponse({ error: 'هذه العملية مخصصة لمدير المنصة العام.' }, 403, env);
    const body = await request.json();
    const applicationId = String(body.applicationId || '').trim();
    const reason = String(body.reason || '').trim();
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(applicationId)) {
      return jsonResponse({ error: 'معرّف طلب المدرسة غير صالح؛ حدّث قائمة الطلبات وحاول مجددًا.' }, 400, env);
    }
    if ((reason.length > 0 && reason.length < 2) || reason.length > 500) {
      return jsonResponse({ error: 'اترك سبب الرفض فارغًا أو اكتب سببًا من حرفين إلى 500 حرف.' }, 400, env);
    }
    const projectId = env.FIREBASE_PROJECT_ID;
    const adminToken = await getFirebaseAdminAccessToken(env);
    const applicationUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/schoolApplications/${encodeURIComponent(applicationId)}`;
    const applicationResponse = await fetch(applicationUrl, { headers: { Authorization: `Bearer ${adminToken}` } });
    if (!applicationResponse.ok) return jsonResponse({ error: 'طلب المدرسة غير موجود.' }, 404, env);
    const application = decodeFirestoreMap((await applicationResponse.json()).fields || {});
    if (application.status !== 'pending') return jsonResponse({ error: 'تمت مراجعة طلب المدرسة بالفعل.' }, 409, env);
    const updateUrl = new URL(applicationUrl);
    ['status', 'rejectionReason', 'reviewedAt', 'reviewedByUid'].forEach((field) => updateUrl.searchParams.append('updateMask.fieldPaths', field));
    const reviewedAt = new Date().toISOString();
    const response = await fetch(updateUrl, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields: encodeFirestoreMap({
        status: 'rejected',
        rejectionReason: reason,
        reviewedAt,
        reviewedByUid: user.uid,
      }) }),
    });
    if (!response.ok) throw new Error('تعذر حفظ قرار رفض المدرسة.');
    const claimUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/schoolSlugClaims/${encodeURIComponent(application.schoolSlug || '')}`;
    const claimResponse = await fetch(claimUrl, { headers: { Authorization: `Bearer ${adminToken}` } });
    if (claimResponse.ok) {
      const claim = decodeFirestoreMap((await claimResponse.json()).fields || {});
      if (claim.applicationId === applicationId) {
        const deleteClaim = await fetch(claimUrl, { method: 'DELETE', headers: { Authorization: `Bearer ${adminToken}` } });
        if (!deleteClaim.ok) throw new Error('تم رفض الطلب لكن تعذر تحرير رابط المدرسة.');
      }
    }
    await createPlatformAuditLog(projectId, adminToken, `${applicationId}-rejected`, {
      action: 'school_application_rejected',
      applicationId,
      schoolSlug: application.schoolSlug || '',
      actorUid: user.uid,
      reason,
      createdAt: reviewedAt,
    });
    return jsonResponse({ success: true }, 200, env);
  } catch (error) {
    return jsonResponse({ error: error.message || 'تعذر رفض الطلب.' }, error.status || 500, env);
  }
}

async function handlePlatformApproveSchool(request, env) {
  try {
    const user = await verifyAuth(request, env);
    if (user.role !== 'super_admin') return jsonResponse({ error: 'هذه العملية مخصصة لمدير المنصة العام.' }, 403, env);
    const body = await request.json();
    const applicationId = String(body.applicationId || '').trim();
    if (!/^[0-9a-f-]{36}$/i.test(applicationId)) return jsonResponse({ error: 'معرّف الطلب غير صالح.' }, 400, env);

    const projectId = env.FIREBASE_PROJECT_ID;
    const adminToken = await getFirebaseAdminAccessToken(env);
    const applicationUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/schoolApplications/${encodeURIComponent(applicationId)}`;
    const applicationResponse = await fetch(applicationUrl, { headers: { Authorization: `Bearer ${adminToken}` } });
    if (!applicationResponse.ok) throw Object.assign(new Error('طلب المدرسة غير موجود.'), { status: 404 });
    const application = decodeFirestoreMap((await applicationResponse.json()).fields || {});
    if (application.status !== 'pending') throw Object.assign(new Error('تمت مراجعة طلب المدرسة بالفعل.'), { status: 409 });

    const schoolId = String(application.schoolSlug || '').trim();
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(schoolId)) throw new Error('اسم الرابط للمدرسة غير صالح.');
    const validRoles = ['director', 'tech_specialist'];
    const expectedCounterpartRole = application.applicantRole === 'director' ? 'tech_specialist' : 'director';
    const applicantEmail = String(application.applicantEmail || '').trim().toLowerCase();
    const counterpartEmail = String(application.counterpartEmail || '').trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(applicantEmail) ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(counterpartEmail) ||
      applicantEmail === counterpartEmail ||
      !validRoles.includes(application.applicantRole) ||
      application.counterpartRole !== expectedCounterpartRole ||
      String(application.applicantName || '').trim().length < 2 ||
      String(application.counterpartName || '').trim().length < 2 ||
      String(application.schoolNameAr || '').trim().length < 2) {
      throw new Error('يجب أن يتضمن الطلب بيانات صحيحة ومختلفة للمدير وأخصائي التطوير وبيانات المدرسة مكتملة.');
    }

    const schoolUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/schools/${encodeURIComponent(schoolId)}`;
    const existingSchool = await fetch(schoolUrl, { headers: { Authorization: `Bearer ${adminToken}` } });
    if (existingSchool.ok) throw Object.assign(new Error('هناك مدرسة تستخدم هذا الرابط بالفعل.'), { status: 409 });

    const schoolFields = {
      schoolId,
      slug: schoolId,
      nameAr: application.schoolNameAr,
      nameEn: application.schoolNameEn || '',
      phone: application.phone || '',
      academicYear: '2026/2027',
      branding: { primaryColor: '#0f172a', accentColor: '#d97706', logoUrl: '' },
      status: 'active',
      publicListing: true,
      isConfigured: false,
      createdAt: new Date().toISOString(),
      approvedAt: new Date().toISOString(),
      approvedByUid: user.uid,
    };
    const createSchoolResponse = await fetch(schoolUrl, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields: encodeFirestoreMap(schoolFields) }),
    });
    if (!createSchoolResponse.ok) throw new Error('تعذر إنشاء ملف المدرسة المعتمدة.');

    const people = [
      { name: application.applicantName, email: applicantEmail, role: application.applicantRole },
      { name: application.counterpartName, email: counterpartEmail, role: application.counterpartRole },
    ];

    const createdInvitations = [];
    const issuedInvitations = [];
    for (const person of people) {
      const invitationId = crypto.randomUUID();
      const invitationUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/accountInvitations?documentId=${encodeURIComponent(invitationId)}`;
      const invitation = {
        invitationId,
        email: person.email.toLowerCase(),
        displayName: person.name,
        role: person.role,
        schoolId,
        teacherInfo: {},
        status: 'pending',
        invitedByUid: user.uid,
        invitedByRole: 'super_admin',
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString(),
      };
      const invitationResponse = await fetch(invitationUrl, {
        method: 'POST',
        headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ fields: encodeFirestoreMap(invitation) }),
      });
      if (!invitationResponse.ok) {
        await Promise.all(createdInvitations.map((invitation) => fetch(invitation.url, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${adminToken}` },
        }).catch(() => {})));
        await fetch(schoolUrl, { method: 'DELETE', headers: { Authorization: `Bearer ${adminToken}` } }).catch(() => {});
        throw new Error('تم إنشاء المدرسة مؤقتًا لكن تعذر إنشاء دعوة حساب؛ أعد المحاولة.');
      }
      createdInvitations.push({
        id: invitationId,
        url: invitationUrl.replace(`?documentId=${encodeURIComponent(invitationId)}`, `/${encodeURIComponent(invitationId)}`),
      });
      const platformBase = env.PLATFORM_CONTINUE_BASE || 'https://digital-school-platform.vercel.app';
      const continueUrl = new URL(`${platformBase.replace(/\/$/, '')}/${encodeURIComponent(schoolId)}/login.html`);
      continueUrl.searchParams.set('flow', 'staff-invitation');
      continueUrl.searchParams.set('invitationId', invitationId);
      const invitationLinkResult = await generateAccountInvitationLink(person.email, continueUrl.toString(), env, adminToken);
      if (!invitationLinkResult.ok) {
        await Promise.all(createdInvitations.map((invitation) => fetch(invitation.url, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${adminToken}` },
        }).catch(() => {})));
        await fetch(schoolUrl, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${adminToken}` },
        }).catch(() => {});
        console.error('School invitation link generation failed', {
          applicationId,
          status: invitationLinkResult.status,
          code: invitationLinkResult.code,
        });
        throw Object.assign(new Error(`${invitationLinkFailureMessage(invitationLinkResult.code)} لم يكتمل اعتماد المدرسة؛ أعد المحاولة بعد إصلاح الإعداد.`), { status: 502 });
      }
      issuedInvitations.push({
        email: person.email,
        displayName: person.name,
        role: person.role,
        invitationLink: invitationLinkResult.invitationLink,
      });
    }

    const updateUrl = new URL(applicationUrl);
    ['status', 'reviewedAt', 'reviewedByUid', 'approvedSchoolId'].forEach((field) => updateUrl.searchParams.append('updateMask.fieldPaths', field));
    const reviewedAt = new Date().toISOString();
    const applicationUpdateResponse = await fetch(updateUrl, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields: encodeFirestoreMap({
        status: 'approved',
        reviewedAt,
        reviewedByUid: user.uid,
        approvedSchoolId: schoolId,
      }) }),
    });

    const claimUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/schoolSlugClaims/${encodeURIComponent(schoolId)}`;
    const claimUpdateUrl = new URL(claimUrl);
    ['status', 'approvedAt', 'approvedSchoolId'].forEach((field) => claimUpdateUrl.searchParams.append('updateMask.fieldPaths', field));
    const claimUpdateResponse = await fetch(claimUpdateUrl, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields: encodeFirestoreMap({
        status: 'approved',
        approvedAt: reviewedAt,
        approvedSchoolId: schoolId,
      }) }),
    });
    if (!claimUpdateResponse.ok) throw new Error('تم إنشاء المدرسة والدعوة لكن تعذر تثبيت حجز الرابط؛ راجع سجل المنصة.');

    await createPlatformAuditLog(projectId, adminToken, `${applicationId}-approved`, {
      action: 'school_application_approved',
      applicationId,
      schoolSlug: schoolId,
      actorUid: user.uid,
      createdAt: reviewedAt,
    });
    const schoolAuditUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/schools/${encodeURIComponent(schoolId)}/auditLogs?documentId=${encodeURIComponent(`onboarding-${applicationId}`)}`;
    const schoolAuditResponse = await fetch(schoolAuditUrl, {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields: encodeFirestoreMap({
        id: `onboarding-${applicationId}`,
        action: 'اعتماد المدرسة وإنشاء حسابي المدير وأخصائي التطوير',
        target: schoolId,
        details: 'اعتمد مدير المنصة الطلب وأنشأ رابط تفعيل منفصلًا للمدير وأخصائي التطوير لإرسالهما يدويًا.',
        operatorRole: 'super_admin',
        operatorId: user.uid,
        timestamp: reviewedAt,
        schoolId,
      }) }),
    });
    if (!schoolAuditResponse.ok) throw new Error('تم اعتماد المدرسة لكن تعذر حفظ سجل التدقيق الخاص بها.');

    return jsonResponse({
      success: true,
      schoolId,
      invitationsCreated: issuedInvitations.length,
      invitations: issuedInvitations,
    }, 200, env);
  } catch (error) {
    return jsonResponse({ error: error.message || 'تعذر اعتماد المدرسة.' }, error.status || 500, env);
  }
}

async function handlePlatformSchoolMigration(request, env) {
  try {
    const user = await verifyAuth(request, env);
    if (user.role !== 'super_admin') {
      return jsonResponse({ error: 'هذه العملية مخصصة لمدير المنصة العام فقط.' }, 403, env);
    }
    const body = await request.json();
    const sourceSchoolId = String(body.sourceSchoolId || 'sch_cairo_sec_01').trim();
    const targetSchoolId = String(body.targetSchoolId || 'zewail-school').trim();
    const targetSlug = String(body.targetSlug || targetSchoolId).trim();
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(targetSchoolId)) {
      return jsonResponse({ error: 'معرّف المدرسة الهدف غير صالح.' }, 400, env);
    }

    const projectId = env.FIREBASE_PROJECT_ID;
    const adminToken = await getFirebaseAdminAccessToken(env);
    let copiedDocuments = 0;
    let copiedCollections = 0;

    async function copyDocument(sourcePath, targetPath, documentTransform = null) {
      const sourceUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/${sourcePath}`;
      const sourceResponse = await fetch(sourceUrl, { headers: { Authorization: `Bearer ${adminToken}` } });
      if (!sourceResponse.ok) {
        if (sourceResponse.status === 404) return;
        throw new Error(`تعذر قراءة المستند ${sourcePath}`);
      }
      const sourceDocument = await sourceResponse.json();
      let fields = decodeFirestoreMap(sourceDocument.fields || {});
      fields = documentTransform ? documentTransform(fields) : fields;
      fields.schoolId = targetSchoolId;
      fields.slug = targetSlug;

      const targetUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/${targetPath}`;
      const writeResponse = await fetch(targetUrl, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ fields: encodeFirestoreMap(fields) }),
      });
      if (!writeResponse.ok) throw new Error(`تعذر نسخ المستند ${targetPath}`);
      copiedDocuments++;

      const idsUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/${sourcePath}:listCollectionIds`;
      const idsResponse = await fetch(idsUrl, {
        method: 'POST',
        headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
        body: '{}',
      });
      if (!idsResponse.ok) return;
      const idsData = await idsResponse.json();
      for (const collectionId of idsData.collectionIds || []) {
        copiedCollections++;
        await copyCollection(`${sourcePath}/${collectionId}`, `${targetPath}/${collectionId}`);
      }
    }

    async function copyCollection(sourceCollectionPath, targetCollectionPath) {
      let pageToken = '';
      do {
        const collectionUrl = new URL(`https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/${sourceCollectionPath}`);
        collectionUrl.searchParams.set('pageSize', '100');
        if (pageToken) collectionUrl.searchParams.set('pageToken', pageToken);
        const response = await fetch(collectionUrl, { headers: { Authorization: `Bearer ${adminToken}` } });
        if (!response.ok) throw new Error(`تعذر قراءة المجموعة ${sourceCollectionPath}`);
        const page = await response.json();
        for (const document of page.documents || []) {
          const relativePath = document.name.split('/documents/')[1];
          const documentId = relativePath.split('/').pop();
          const targetRelativePath = `${targetCollectionPath}/${documentId}`;
          await copyDocument(relativePath, targetRelativePath);
        }
        pageToken = page.nextPageToken || '';
      } while (pageToken);
    }

    await copyDocument(`schools/${sourceSchoolId}`, `schools/${targetSchoolId}`, (fields) => ({
      ...fields,
      status: 'active',
      publicListing: true,
      isConfigured: true,
      schoolId: targetSchoolId,
      slug: targetSlug,
    }));

    const usersUrl = new URL(`https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/users`);
    usersUrl.searchParams.set('pageSize', '100');
    let userPageToken = '';
    let updatedUsers = 0;
    do {
      if (userPageToken) usersUrl.searchParams.set('pageToken', userPageToken);
      const response = await fetch(usersUrl, { headers: { Authorization: `Bearer ${adminToken}` } });
      if (!response.ok) throw new Error('تعذر قراءة حسابات المستخدمين أثناء الهجرة.');
      const page = await response.json();
      for (const document of page.documents || []) {
        const fields = decodeFirestoreMap(document.fields || {});
        if (fields.schoolId !== sourceSchoolId) continue;
        fields.schoolId = targetSchoolId;
        fields.updatedAt = new Date().toISOString();
        const documentPath = document.name.split('/documents/')[1];
        const writeResponse = await fetch(`https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/${documentPath}`, {
          method: 'PATCH',
          headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ fields: encodeFirestoreMap(fields) }),
        });
        if (!writeResponse.ok) throw new Error('تعذر تحديث حساب مستخدم أثناء الهجرة.');
        updatedUsers++;
      }
      userPageToken = page.nextPageToken || '';
    } while (userPageToken);

    return jsonResponse({
      success: true,
      sourceSchoolId,
      targetSchoolId,
      targetSlug,
      copiedDocuments,
      copiedCollections,
      updatedUsers,
    }, 200, env);
  } catch (error) {
    return jsonResponse({ error: error.message || 'تعذر تنفيذ هجرة المدرسة.' }, error.status || 500, env);
  }
}

async function handleCompleteFirstLogin(request, env) {
  try {
    const user = await verifyAuth(request, env);
    if (user.role !== 'student' || !user.mustChangePassword) {
      return jsonResponse({ error: 'This account does not require an initial password change' }, 403, env);
    }
    const body = await request.json();
    const newPassword = String(body.newPassword || '');
    if (newPassword.length < 12 || !/[a-z]/.test(newPassword) || !/[A-Z]/.test(newPassword) ||
        !/\d/.test(newPassword) || !/[^A-Za-z0-9]/.test(newPassword)) {
      return jsonResponse({ error: 'Use at least 12 characters with upper/lowercase letters, a number, and a symbol' }, 400, env);
    }
    const adminToken = await getFirebaseAdminAccessToken(env);
    const projectId = env.FIREBASE_PROJECT_ID;
    const updateResponse = await fetch(`https://identitytoolkit.googleapis.com/v1/projects/${projectId}/accounts:update`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ localId: user.uid, password: newPassword, returnSecureToken: false }),
    });
    if (!updateResponse.ok) return jsonResponse({ error: 'Firebase could not update the password' }, 502, env);

    const profileUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/users/${encodeURIComponent(user.uid)}`;
    const profileResponse = await fetch(`${profileUrl}?updateMask.fieldPaths=passwordChangeRequired&updateMask.fieldPaths=passwordChangedAt`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields: {
        passwordChangeRequired: { booleanValue: false },
        passwordChangedAt: { timestampValue: new Date().toISOString() },
      } }),
    });
    if (!profileResponse.ok) return jsonResponse({ error: 'Password changed, but account setup could not be finalized; sign in again and retry' }, 502, env);
    return jsonResponse({ success: true }, 200, env);
  } catch (error) {
    return jsonResponse({ error: error.message || 'Initial password change failed' }, error.status || 401, env);
  }
}

// --------------------------------------------------------------------------
// Handler: Generate Signed Upload Parameters
// --------------------------------------------------------------------------
async function handleSignUpload(request, env) {
  try {
    const user = await verifyAuth(request, env);

    const body = await request.json();
    const { schoolId, albumId, assetType, fileName, fileType, fileSize } = body;

    // Strict role check: Only director, super_admin, or tech_specialist can manage media
    const role = user.role;
    const allowedRoles = ['director', 'super_admin', 'tech_specialist'];
    if (!allowedRoles.includes(role)) {
      return jsonResponse({
        error: 'Forbidden: Only School Administration and Technology Specialists can upload media.'
      }, 403, env);
    }

    if (!schoolId) {
      return jsonResponse({ error: 'Missing required schoolId' }, 400, env);
    }
    if (!canAccessSchool(user, schoolId)) {
      return jsonResponse({ error: 'Forbidden: School access denied' }, 403, env);
    }

    const { cloudName, apiKey, apiSecret } = getCloudinaryConfig(env);

    // Validate file size (max 10MB per image)
    const MAX_SIZE = 10 * 1024 * 1024;
    if (!Number.isInteger(fileSize) || fileSize < 1 || fileSize > MAX_SIZE) {
      return jsonResponse({ error: 'File size exceeds maximum permitted limit (10MB)' }, 400, env);
    }

    // Validate file mime-type
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    if (!allowedTypes.includes(fileType)) {
      return jsonResponse({ error: 'Unsupported file type. Allowed: JPEG, PNG, WEBP, SVG, GIF' }, 400, env);
    }

    const timestamp = Math.floor(Date.now() / 1000);
    const uniqueSuffix = crypto.randomUUID().slice(0, 8);
    const cleanFileName = (fileName || 'image')
      .replace(/[^a-zA-Z0-9_-]/g, '_')
      .replace(/_{2,}/g, '_')
      .toLowerCase();

    // Restricted folder structure
    let folder = `schools/${schoolId}/albums/${albumId || 'general'}`;
    if (assetType === 'branding') {
      folder = `schools/${schoolId}/branding`;
    }

    const publicId = `${folder}/${cleanFileName}_${timestamp}_${uniqueSuffix}`;

    // Signature calculation according to Cloudinary spec:
    // Parameters must be sorted alphabetically by key
    // public_id=...&timestamp=... (folder is already part of public_id or parameter)
    // Cloudinary standard parameters to sign:
    const paramsToSign = [
      `folder=${folder}`,
      `timestamp=${timestamp}`
    ].sort().join('&');

    const signature = await generateSha1Hex(paramsToSign + apiSecret);

    return jsonResponse({
      signature,
      timestamp,
      apiKey,
      cloudName,
      folder,
      publicId: `${cleanFileName}_${timestamp}_${uniqueSuffix}`,
      fullPublicId: publicId,
      uploadUrl: `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`
    }, 200, env);

  } catch (err) {
    return jsonResponse({ error: err.message }, err.status || 401, env);
  }
}

// --------------------------------------------------------------------------
// Handler: Secure Media Deletion
// --------------------------------------------------------------------------
async function handleDeleteMedia(request, env) {
  try {
    const user = await verifyAuth(request, env);
    const body = await request.json();
    const { publicId, schoolId } = body;

    const role = user.role;
    const allowedRoles = ['director', 'super_admin', 'tech_specialist'];
    if (!allowedRoles.includes(role)) {
      return jsonResponse({ error: 'Forbidden: Insufficient privileges' }, 403, env);
    }

    if (!publicId || !schoolId) {
      return jsonResponse({ error: 'Missing publicId or schoolId' }, 400, env);
    }
    if (!canAccessSchool(user, schoolId)) {
      return jsonResponse({ error: 'Forbidden: School access denied' }, 403, env);
    }

    // Security check: Must belong to this specific school path
    if (!publicId.startsWith(`schools/${schoolId}/`)) {
      return jsonResponse({ error: 'Cross-tenant deletion prohibited' }, 403, env);
    }

    const { cloudName, apiKey, apiSecret } = getCloudinaryConfig(env);
    const timestamp = Math.floor(Date.now() / 1000);

    const stringToSign = `public_id=${publicId}&timestamp=${timestamp}${apiSecret}`;
    const signature = await generateSha1Hex(stringToSign);

    const destroyUrl = `https://api.cloudinary.com/v1_1/${cloudName}/image/destroy`;
    const formData = new FormData();
    formData.append('public_id', publicId);
    formData.append('api_key', apiKey);
    formData.append('timestamp', timestamp.toString());
    formData.append('signature', signature);

    const destroyRes = await fetch(destroyUrl, {
      method: 'POST',
      body: formData
    });

    const destroyData = await destroyRes.json();
    if (!destroyRes.ok || destroyData.result !== 'ok') {
      return jsonResponse({ error: 'Cloudinary did not delete the requested image' }, 502, env);
    }
    return jsonResponse({ success: true, result: destroyData.result }, 200, env);

  } catch (err) {
    return jsonResponse({ error: err.message }, err.status || 401, env);
  }
}

// --------------------------------------------------------------------------
// Helper: SHA-1 Hex via Web Crypto
// --------------------------------------------------------------------------
async function generateSha1Hex(message) {
  const msgUint8 = new TextEncoder().encode(message);
  const hashBuffer = await crypto.subtle.digest('SHA-1', msgUint8);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// --------------------------------------------------------------------------
// Helper: Standard CORS & JSON responses
// --------------------------------------------------------------------------
function handleCors(env) {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': getCorsOrigin(env),
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Max-Age': '86400'
    }
  });
}

function jsonResponse(data, status = 200, env = null) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': getCorsOrigin(env),
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization'
    }
  });
}

function getCorsOrigin(env) {
  const requestOrigin = env?.REQUEST_ORIGIN || '';
  const allowedOrigins = String(env?.CORS_ORIGIN || '').split(',').map((origin) => origin.trim()).filter(Boolean);
  return requestOrigin && allowedOrigins.includes(requestOrigin) ? requestOrigin : 'null';
}

