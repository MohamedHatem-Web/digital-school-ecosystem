// ==========================================================================
// DIGITAL SCHOOL ECOSYSTEM (VANILLA EDITION)
// QR Code Service — Document Verification & Digital Signatures
// ==========================================================================

/**
 * Generates a QR Code as a Data URL using the public qrserver.com API.
 * Works entirely client-side (no server needed).
 *
 * @param {string} data - The data to encode (URL, token, text)
 * @param {number} size - QR code size in pixels (default 200)
 * @returns {string} URL to the QR code image
 */
import { db, doc, getDoc, setDoc, updateDoc, serverTimestamp } from '../firebase.js';
import { getCurrentUser } from '../auth.js';

export function generateQRCodeUrl(data, size = 200) {
  const encoded = encodeURIComponent(data);
  return `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encoded}&format=svg&margin=8`;
}

/**
 * Build a full verification URL for a document
 * @param {string} type - Document type ('gate_pass', 'enrollment', 'tablet_receipt', 'attendance')
 * @param {string} token - The unique verification token
 * @returns {string} Full verification URL
 */
export function buildVerificationUrl(type, token) {
  // Use current origin for local/dev, or the production domain
  const base = window.location.origin || 'https://digital-school-ecosystem.web.app';
  return `${base}/verify.html?type=${encodeURIComponent(type)}&token=${encodeURIComponent(token)}`;
}

/**
 * Generate a verification token for a document
 * @param {string} prefix - Token prefix (GP for gate pass, ENR for enrollment, etc.)
 * @param {string} identifier - Unique identifier (student code, document id, etc.)
 * @returns {string} Verification token
 */
export function generateVerificationToken(prefix, identifier) {
  const randomBytes = new Uint8Array(16);
  crypto.getRandomValues(randomBytes);
  const randomPart = [...randomBytes].map((value) => value.toString(16).padStart(2, '0')).join('').toUpperCase();
  return `${String(prefix || 'DOC').toUpperCase()}-${new Date().getFullYear()}-${randomPart}`;
}

/**
 * Document types that support QR verification
 */
export const VERIFIABLE_DOCUMENT_TYPES = {
  gate_pass: {
    label: 'تصريح خروج مبكر',
    icon: '🚪',
    prefix: 'GP',
  },
  enrollment: {
    label: 'إفادة قيد رسمية',
    icon: '🎓',
    prefix: 'ENR',
  },
  tablet_receipt: {
    label: 'محضر استلام تابلت',
    icon: '📱',
    prefix: 'TAB',
  },
  attendance_cert: {
    label: 'شهادة انتظام حضور',
    icon: '📋',
    prefix: 'ATT',
  },
  transfer_cert: {
    label: 'مستند تحويل مدرسي',
    icon: '🔄',
    prefix: 'TRF',
  },
  disciplinary: {
    label: 'إنذار سلوكي',
    icon: '⚠️',
    prefix: 'DSC',
  },
  student: {
    label: 'كارنيه طالب',
    icon: '🪪',
    prefix: 'STU',
  },
  honor_certificate: {
    label: 'شهادة تقدير وتفوق',
    icon: '🏅',
    prefix: 'HONOR',
  },
  report_card: {
    label: 'بيان درجات',
    icon: '📊',
    prefix: 'RC',
  },
  warning: {
    label: 'إنذار رسمي',
    icon: '⚠️',
    prefix: 'WARN',
  },
};

const DOCUMENT_ISSUER_ROLES = new Set([
  'director', 'student_affairs', 'teacher', 'social_affairs', 'tech_specialist', 'super_admin',
]);

export async function registerVerifiedDocument({
  token,
  documentType,
  documentTitle,
  studentName = '',
  studentCode = '',
  grade = '',
  className = '',
  schoolName = '',
  academicYear = '',
  status = 'valid',
  issuedAt = new Date().toISOString(),
}, schoolId = '') {
  const user = getCurrentUser();
  if (!user || !DOCUMENT_ISSUER_ROLES.has(user.role)) {
    throw new Error('يجب تسجيل الدخول بحساب مخول لإصدار مستند قابل للتحقق.');
  }
  if (!token || !VERIFIABLE_DOCUMENT_TYPES[documentType]) {
    throw new Error('نوع المستند أو رمز التحقق غير صالح.');
  }
  if (!String(studentCode || '').trim() || !String(studentName || '').trim()) {
    throw new Error('لا يمكن تسجيل مستند رسمي دون اسم الطالب وكوده.');
  }
  const resolvedSchoolId = user.schoolId || schoolId;
  if (!resolvedSchoolId) throw new Error('تعذر تحديد المدرسة المصدرة للمستند.');
  const record = {
    token,
    documentType,
    documentTitle: documentTitle || VERIFIABLE_DOCUMENT_TYPES[documentType].label,
    studentName: String(studentName || '').trim(),
    studentCode: String(studentCode || '').trim(),
    grade: String(grade || '').trim(),
    className: String(className || '').trim(),
    schoolName: String(schoolName || '').trim(),
    academicYear: String(academicYear || '').trim(),
    schoolId: resolvedSchoolId,
    issuerName: String(user.displayName || 'إدارة المدرسة').trim(),
    issuerRole: user.role,
    issuedAt,
    status,
  };
  await setDoc(doc(db, 'documentVerifications', token), {
    ...record,
    serverCreatedAt: serverTimestamp(),
  });
  return record;
}

export async function getVerifiedDocument(token) {
  const safeToken = String(token || '').trim().toUpperCase();
  if (!safeToken) return null;
  const snapshot = await getDoc(doc(db, 'documentVerifications', safeToken));
  return snapshot.exists() ? { id: snapshot.id, ...snapshot.data() } : null;
}

export async function updateVerifiedDocumentStatus(token, status, timestamps = {}) {
  if (!['pending', 'valid', 'used', 'revoked'].includes(status)) {
    throw new Error('حالة التحقق المطلوبة غير صالحة.');
  }
  const allowedTimestamps = {};
  ['approvedAt', 'usedAt', 'revokedAt'].forEach((key) => {
    if (timestamps[key]) allowedTimestamps[key] = timestamps[key];
  });
  await updateDoc(doc(db, 'documentVerifications', String(token || '').trim().toUpperCase()), {
    status,
    ...allowedTimestamps,
    updatedAt: serverTimestamp(),
  });
}

/**
 * Render a printable document section with QR verification code
 * @param {Object} options
 * @param {string} options.documentTitle - Title of the document
 * @param {string} options.documentType - Type key from VERIFIABLE_DOCUMENT_TYPES
 * @param {string} options.token - Verification token
 * @param {string} options.schoolName - School name
 * @param {string} options.issuedBy - Name of the issuer
 * @param {string} options.issuedDate - Issue date
 * @param {string} options.bodyHtml - Main document body HTML
 * @returns {string} Complete printable HTML string
 */
export function renderVerifiedDocument({
  documentTitle,
  documentType,
  token,
  schoolName = 'المدرسة الثانوية الرسمية الرقمية — إدارة القاهرة الجديدة التعليمية',
  issuedBy,
  issuedDate,
  bodyHtml,
}) {
  const verifyUrl = buildVerificationUrl(documentType, token);
  const qrUrl = generateQRCodeUrl(verifyUrl, 160);
  const docMeta = VERIFIABLE_DOCUMENT_TYPES[documentType] || { label: 'مستند رسمي', icon: '📄' };

  return `
<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="UTF-8">
  <title>${documentTitle}</title>
  <style>
    @media print {
      body { margin: 0; padding: 20mm; }
      .no-print { display: none !important; }
    }
    body {
      font-family: 'Segoe UI', Tahoma, sans-serif;
      max-width: 800px;
      margin: 0 auto;
      padding: 40px;
      color: #1a1a2e;
      line-height: 1.8;
    }
    .doc-header {
      text-align: center;
      border-bottom: 3px double #0a1628;
      padding-bottom: 16px;
      margin-bottom: 24px;
    }
    .doc-header h1 {
      font-size: 18px;
      color: #0a1628;
      margin: 0 0 4px 0;
    }
    .doc-header h2 {
      font-size: 22px;
      color: #1e40af;
      margin: 8px 0;
    }
    .doc-header .doc-number {
      font-size: 13px;
      color: #64748b;
    }
    .doc-body {
      font-size: 15px;
      margin: 24px 0;
    }
    .doc-footer {
      margin-top: 40px;
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
      border-top: 2px solid #e2e8f0;
      padding-top: 20px;
    }
    .doc-signature {
      text-align: center;
    }
    .doc-signature .sig-label {
      font-size: 12px;
      color: #64748b;
    }
    .doc-signature .sig-name {
      font-weight: 800;
      font-size: 14px;
      margin-top: 4px;
    }
    .doc-qr {
      text-align: center;
    }
    .doc-qr img {
      width: 120px;
      height: 120px;
    }
    .doc-qr .qr-label {
      font-size: 10px;
      color: #64748b;
      margin-top: 4px;
    }
    .doc-qr .qr-token {
      font-family: monospace;
      font-size: 11px;
      color: #0a1628;
      font-weight: 700;
      letter-spacing: 1px;
    }
    .doc-watermark {
      font-size: 11px;
      text-align: center;
      color: #94a3b8;
      margin-top: 24px;
      border-top: 1px dashed #cbd5e1;
      padding-top: 12px;
    }
  </style>
</head>
<body>
  <div class="doc-header">
    <h1>جمهورية مصر العربية — وزارة التربية والتعليم والتعليم الفني</h1>
    <h1>${schoolName}</h1>
    <h2>${docMeta.icon} ${documentTitle}</h2>
    <div class="doc-number">رمز التحقق الرقمي: <strong style="letter-spacing: 2px; font-family: monospace;">${token}</strong></div>
  </div>

  <div class="doc-body">
    ${bodyHtml}
  </div>

  <div class="doc-footer">
    <div class="doc-signature">
      <div class="sig-label">صادر بمعرفة ومسؤولية:</div>
      <div class="sig-name">${issuedBy}</div>
      <div class="sig-label">بتاريخ: ${issuedDate}</div>
    </div>
    <div class="doc-qr">
      <img src="${qrUrl}" alt="QR Code - رمز التحقق" />
      <div class="qr-label">امسح الرمز للتحقق الرقمي الفوري</div>
      <div class="qr-token">${token}</div>
    </div>
  </div>

  <div class="doc-watermark">
    مستند صادر إلكترونيًا من المنظومة الرقمية الموحدة للمؤسسات التعليمية (DSE) — لا يحتاج إلى توقيع يدوي أو خاتم ورقي — يُتحقق من صحته بمسح رمز الـ QR أعلاه.
  </div>

  <div class="no-print" style="text-align: center; margin-top: 30px;">
    <button onclick="window.print()" style="padding: 12px 32px; font-size: 16px; background: #0a1628; color: white; border: none; border-radius: 8px; cursor: pointer; font-weight: 700;">
      🖨️ طباعة المستند
    </button>
  </div>
</body>
</html>`;
}

