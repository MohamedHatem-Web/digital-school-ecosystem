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
  const timestamp = Date.now().toString(36).toUpperCase();
  const rand = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `${prefix}-${new Date().getFullYear()}-${timestamp}-${rand}`;
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
};

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

