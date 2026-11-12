// ==========================================================================
// DIGITAL SCHOOL ECOSYSTEM — CLOUDFLARE WORKER GATEWAY
// Secure Cloudinary Signed Uploads & Media Deletion
// ==========================================================================

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // 1. CORS Preflight
    if (request.method === 'OPTIONS') {
      return handleCors(env);
    }

    // 2. Health check
    if (url.pathname === '/api/health') {
      return jsonResponse({ status: 'healthy', timestamp: new Date().toISOString() }, 200, env);
    }

    // 3. Media Upload Signature Endpoint
    if (url.pathname === '/api/media/sign-upload' && request.method === 'POST') {
      return handleSignUpload(request, env);
    }

    // 4. Media Deletion Endpoint
    if (url.pathname === '/api/media/delete' && request.method === 'POST') {
      return handleDeleteMedia(request, env);
    }

    if (url.pathname === '/api/admin/change-password' && request.method === 'POST') {
      return handleChangePassword(request, env);
    }

    return jsonResponse({ error: 'Endpoint Not Found' }, 404, env);
  }
};

// --------------------------------------------------------------------------
// Authorization & Token Verification
// --------------------------------------------------------------------------
let firebaseKeysCache = null;
let firebaseKeysExpiry = 0;
let firebaseAdminToken = null;
let firebaseAdminTokenExpiry = 0;

async function verifyAuth(request, env) {
  const authHeader = request.headers.get('Authorization') || '';
  if (!authHeader.startsWith('Bearer ')) {
    throw new Error('Missing or invalid Authorization header');
  }

  const token = authHeader.split('Bearer ')[1].trim();
  if (!token) {
    throw new Error('Empty token provided');
  }

  const parts = token.split('.');
  if (parts.length !== 3) {
    throw new Error('Malformed JWT token');
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
    if (status && status !== 'active') throw new Error('User account is inactive');

    return { uid: payload.sub, role, schoolId };
  } catch (err) {
    throw new Error('Firebase authentication failed: ' + err.message);
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
    scope: 'https://www.googleapis.com/auth/identitytoolkit https://www.googleapis.com/auth/datastore',
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
  const origin = env?.CORS_ORIGIN;
  return origin && origin !== '*' ? origin : 'null';
}

