// ==========================================================================
// DIGITAL SCHOOL ECOSYSTEM (VANILLA EDITION)
// Universal PDF Export Utility
// Converts HTML elements or dynamic templates into official printable A4 PDFs
// ==========================================================================

import { getSchoolProfile } from '../services/school-service.js';

/**
 * Common print CSS styles for crisp, vector A4 document printing
 */
export const PRINT_CSS = `
  @page {
    size: A4 portrait;
    margin: 15mm;
  }
  @page :left {
    margin-right: 15mm;
  }
  @page :right {
    margin-left: 15mm;
  }
  * {
    box-sizing: border-box;
    -webkit-print-color-adjust: exact !important;
    print-color-adjust: exact !important;
  }
  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Tahoma, Arial, sans-serif;
    color: #0f172a;
    background: #ffffff !important;
    margin: 0;
    padding: 0;
    direction: rtl;
    line-height: 1.5;
  }
  .print-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    border-bottom: 2px solid #0f172a;
    padding-bottom: 12px;
    margin-bottom: 20px;
  }
  .print-header-col {
    font-size: 12px;
    font-weight: 700;
    line-height: 1.6;
  }
  .print-header-col.left {
    text-align: left;
    direction: ltr;
  }
  .print-title {
    text-align: center;
    margin-bottom: 20px;
  }
  .print-title h1 {
    font-size: 20px;
    font-weight: 800;
    margin: 0 0 4px 0;
    color: #0f172a;
  }
  .print-title p {
    font-size: 12px;
    color: #64748b;
    margin: 0;
  }
  table.print-table {
    width: 100%;
    border-collapse: collapse;
    margin-bottom: 24px;
    font-size: 12px;
    page-break-inside: auto;
  }
  table.print-table tr {
    page-break-inside: avoid;
    page-break-after: auto;
  }
  table.print-table th,
  table.print-table td {
    border: 1px solid #cbd5e1;
    padding: 8px 10px;
    text-align: right;
  }
  table.print-table th {
    background-color: #f1f5f9 !important;
    color: #0f172a;
    font-weight: 700;
  }
  .print-footer {
    margin-top: 36px;
    border-top: 1px dashed #cbd5e1;
    padding-top: 16px;
    display: flex;
    justify-content: space-between;
    align-items: flex-end;
    font-size: 12px;
    font-weight: 700;
  }
  .signature-block {
    text-align: center;
    min-width: 150px;
  }
  .signature-line {
    margin-top: 40px;
    border-top: 1px dashed #0f172a;
    width: 140px;
    margin-inline: auto;
  }
  .official-seal-box {
    border: 2px dashed #94a3b8;
    border-radius: 50%;
    width: 90px;
    height: 90px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 11px;
    color: #64748b;
    text-align: center;
    line-height: 1.2;
    margin-inline: auto;
  }
  .no-print {
    display: none !important;
  }
`;

/**
 * Print arbitrary HTML content as a standardized official PDF document
 * @param {Object} options
 * @param {string} options.title - Document title (e.g. 'تقرير أداء الطالب')
 * @param {string} [options.subtitle] - Subtitle or department
 * @param {string} options.contentHtml - The main body HTML
 * @param {string} [options.signatureTitle='مدير عام المدرسة'] - Signature label
 * @param {boolean} [options.includeSeal=true] - Whether to show the stamp ring
 */
export async function printHtmlAsPdf({
  title,
  subtitle = '',
  contentHtml,
  signatureTitle = 'مدير عام المدرسة',
  includeSeal = true
}) {
  const profile = await getSchoolProfile().catch(() => null);
  const schoolName = profile?.nameAr || 'المدرسة الثانوية الرسمية المعتمدة';
  const adminName = profile?.administration || 'إدارة المعادي التعليمية';
  const dateStr = new Intl.DateTimeFormat('ar-EG', { dateStyle: 'full' }).format(new Date());

  const printWindow = window.open('', '_blank');
  if (!printWindow) {
    alert('يرجى السماح بالنوافذ المنبثقة لإنشاء ملف الـ PDF وطباعته.');
    return;
  }

  const fullHtml = `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="UTF-8">
  <title>${title} — ${schoolName}</title>
  <style>${PRINT_CSS}</style>
</head>
<body>
  <div class="print-header">
    <div class="print-header-col">
      جمهورية مصر العربية<br>
      وزارة التربية والتعليم والتعليم الفني<br>
      ${adminName}<br>
      ${schoolName}
    </div>
    <div class="print-header-col left">
      العام الدراسي: 2026/2027<br>
      تاريخ الاستخراج: ${dateStr}<br>
      مستند رسمي معتمد
    </div>
  </div>

  <div class="print-title">
    <h1>${title}</h1>
    ${subtitle ? `<p>${subtitle}</p>` : ''}
  </div>

  <div class="print-body">
    ${contentHtml}
  </div>

  <div class="print-footer">
    <div class="signature-block">
      <span>مسؤول شؤون الطلاب</span>
      <div class="signature-line"></div>
    </div>
    ${includeSeal ? `
    <div class="official-seal-box">
      خاتم شعار الجمهورية<br>(معتمد)
    </div>` : ''}
    <div class="signature-block">
      <span>${signatureTitle}</span>
      <div class="signature-line"></div>
    </div>
  </div>

  <script>
    window.addEventListener('load', () => {
      setTimeout(() => {
        window.print();
      }, 250);
    });
  </script>
</body>
</html>`;

  printWindow.document.open();
  printWindow.document.write(fullHtml);
  printWindow.document.close();
}

/**
 * Print a DOM element by selector or reference as a clean PDF
 * @param {string|HTMLElement} target - Element to print
 * @param {string} [title='مستند رسمي'] - Title for print header
 */
export async function exportElementToPdf(target, title = 'مستند رسمي') {
  const el = typeof target === 'string' ? document.querySelector(target) : target;
  if (!el) {
    console.error(`exportElementToPdf: Target element not found`, target);
    return;
  }
  await printHtmlAsPdf({
    title,
    contentHtml: el.innerHTML,
  });
}

