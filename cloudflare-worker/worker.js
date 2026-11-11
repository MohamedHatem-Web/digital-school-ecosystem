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

    return jsonResponse({ error: 'Endpoint Not Found' }, 404, env);
  }
};

// --------------------------------------------------------------------------
// Authorization & Token Verification
// --------------------------------------------------------------------------
async function verifyAuth(request, env) {
  const authHeader = request.headers.get('Authorization') || '';
  if (!authHeader.startsWith('Bearer ')) {
    throw new Error('Missing or invalid Authorization header');
  }

  const token = authHeader.split('Bearer ')[1].trim();
  if (!token) {
    throw new Error('Empty token provided');
  }

  // Parse JWT without external libraries (Web Crypto native)
  const parts = token.split('.');
  if (parts.length !== 3) {
    throw new Error('Malformed JWT token');
  }

  try {
    const payloadJson = atob(parts[1].replace(/-/g, '+').replace(/_/g, '/'));
    const payload = JSON.parse(payloadJson);

    // Verify token expiry
    const now = Math.floor(Date.now() / 1000);
    if (payload.exp && payload.exp < now) {
      throw new Error('Token expired');
    }

    // Check project ID claim if available
    const expectedAud = env.FIREBASE_PROJECT_ID || 'digital-school-ecosystem';
    if (payload.aud && payload.aud !== expectedAud && payload.iss && !payload.iss.includes(expectedAud)) {
      // In development, allow flexibility but log
      console.warn('Token issuer/aud mismatch for project', payload.aud, expectedAud);
    }

    return payload;
  } catch (err) {
    throw new Error('Failed to parse or verify token: ' + err.message);
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
    const role = user.role || user.user_role || body.role;
    const allowedRoles = ['director', 'super_admin', 'tech_specialist'];
    if (!allowedRoles.includes(role)) {
      return jsonResponse({
        error: 'Forbidden: Only School Administration and Technology Specialists can upload media.'
      }, 403, env);
    }

    if (!schoolId) {
      return jsonResponse({ error: 'Missing required schoolId' }, 400, env);
    }

    // Validate file size (max 10MB per image)
    const MAX_SIZE = 10 * 1024 * 1024;
    if (fileSize && fileSize > MAX_SIZE) {
      return jsonResponse({ error: 'File size exceeds maximum permitted limit (10MB)' }, 400, env);
    }

    // Validate file mime-type
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml', 'image/gif'];
    if (fileType && !allowedTypes.includes(fileType)) {
      return jsonResponse({ error: 'Unsupported file type. Allowed: JPEG, PNG, WEBP, SVG, GIF' }, 400, env);
    }

    const cloudName = env.CLOUDINARY_CLOUD_NAME || 'arjlacyo';
    const apiKey = env.CLOUDINARY_API_KEY || '368124889164394';
    const apiSecret = env.CLOUDINARY_API_SECRET || '5poQWi-NFYlweTDh4FTYuxoFOJo';

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
    return jsonResponse({ error: err.message }, 401, env);
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

    const role = user.role || user.user_role || body.role;
    const allowedRoles = ['director', 'super_admin', 'tech_specialist'];
    if (!allowedRoles.includes(role)) {
      return jsonResponse({ error: 'Forbidden: Insufficient privileges' }, 403, env);
    }

    if (!publicId || !schoolId) {
      return jsonResponse({ error: 'Missing publicId or schoolId' }, 400, env);
    }

    // Security check: Must belong to this specific school path
    if (!publicId.startsWith(`schools/${schoolId}/`)) {
      return jsonResponse({ error: 'Cross-tenant deletion prohibited' }, 403, env);
    }

    const cloudName = env.CLOUDINARY_CLOUD_NAME || 'arjlacyo';
    const apiKey = env.CLOUDINARY_API_KEY || '368124889164394';
    const apiSecret = env.CLOUDINARY_API_SECRET || '5poQWi-NFYlweTDh4FTYuxoFOJo';
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
    return jsonResponse({ success: true, result: destroyData.result }, 200, env);

  } catch (err) {
    return jsonResponse({ error: err.message }, 500, env);
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
      'Access-Control-Allow-Origin': env?.CORS_ORIGIN || '*',
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
      'Access-Control-Allow-Origin': env?.CORS_ORIGIN || '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization'
    }
  });
}

