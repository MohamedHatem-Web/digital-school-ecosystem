// ==========================================================================
// DIGITAL SCHOOL ECOSYSTEM (VANILLA EDITION)
// Export to Excel/CSV & Official Printable Reports Engine
// ==========================================================================

import { getSchoolProfile } from '../services/school-service.js';
import { generateQRCodeUrl, generateVerificationToken, buildVerificationUrl } from '../services/qr-service.js';

// Export to CSV with UTF-8 BOM for flawless Arabic Excel opening
export function exportToCsv(filename, headers, rows) {
  const BOM = '\uFEFF';
  const csvContent = [
    headers.map((h) => `"${h.replace(/"/g, '""')}"`).join(','),
    ...rows.map((row) =>
      row.map((field) => `"${String(field || '').replace(/"/g, '""')}"`).join(',')
    ),
  ].join('\r\n');

  const blob = new Blob([BOM + csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', `${filename}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

// Export Tablet Inventory List to CSV
export function exportDevicesToCsv(devices = [], filename = 'كشف_حصر_أجهزة_التابلت') {
  const headers = [
    'رقم IMEI للجهاز',
    'الرقم التسلسلي (Serial Number)',
    'موديل التابلت',
    'حالة الجهاز',
    'اسم الطالب المستلم',
    'كود الطالب',
    'تاريخ التسليم',
    'مسؤول التسليم والتطوير'
  ];
  const rows = devices.map((d) => [
    d.imei || '',
    d.serialNumber || '',
    d.model || 'تابلت مدرسي معتمد (سامسونج T505)',
    d.status === 'delivered' ? 'تم التسليم رسمياً بمحضر استلام' : 'بالمخزن المدرسي (جاهز للتسليم)',
    d.assignedStudentName || '',
    d.assignedStudentCode || '',
    d.deliveredDate || '',
    d.deliveredBy || 'م. حسام الدين عبد العزيز'
  ]);
  exportToCsv(filename, headers, rows);
}

// Export Official Comprehensive Student Register to CSV (Excel compatible with UTF-8 BOM)
export function exportStudentsToCsv(students = [], filename = 'دفتر_سجل_قيد_الطلاب_المعتمد') {
  const headers = [
    'م',
    'كود الطالب بوزارة التربية والتعليم',
    'اسم الطالب الرباعي (حسب شهادة الميلاد)',
    'الرقم القومي للطالب (14 رقم)',
    'تاريخ الميلاد',
    'السن في 1 أكتوبر',
    'النوع',
    'الديانة',
    'الصف والمرحلة والفصل',
    'اسم ولي الأمر',
    'صلة القرابة',
    'الرقم القومي لولي الأمر',
    'هاتف ولي الأمر',
    'هاتف الطالب',
    'العنوان ومحل الإقامة',
    'حالة القيد بالمدرسة',
    'تاريخ القيد',
    'الأشقاء بالمدرسة'
  ];

  const rows = students.map((s, idx) => [
    idx + 1,
    s.code || '',
    s.name || '',
    s.nationalId ? `\t${s.nationalId}` : '', // Tab prefix ensures Excel treats 14-digit NID as text without scientific notation
    s.birthDate || '',
    s.ageOct1 || '',
    s.gender || 'ذكر',
    s.religion || 'مسلم',
    s.grade || '',
    s.parentInfo?.parentName || '',
    s.parentInfo?.parentRelation || 'أب',
    s.parentInfo?.parentNationalId ? `\t${s.parentInfo.parentNationalId}` : '',
    s.parentInfo?.parentPhone || s.parentInfo?.phone || '',
    s.studentPhone || '',
    s.address || '',
    s.status === 'enrolled' ? 'مقيد منتظم' : (s.status || 'منتظم'),
    s.registeredDate || '',
    Array.isArray(s.siblingCodes) ? s.siblingCodes.join(' - ') : ''
  ]);

  exportToCsv(filename, headers, rows);
}

// Print Official Ministry Students Registry Book (سجل 31 شؤون طلاب وقوائم القيد الرسمية)
export async function printOfficialStudentsRegister(students = []) {
  const profile = await getSchoolProfile();
  const schoolName = profile?.nameAr || 'مدرسة د. أحمد زويل الرسمية للغات';
  const adminName = profile?.administration || 'إدارة المستقبل التعليمية';
  const dateStr = new Intl.DateTimeFormat('ar-EG', { dateStyle: 'full' }).format(new Date());

  const boysCount = students.filter(s => (s.gender || 'ذكر') === 'ذكر').length;
  const girlsCount = students.filter(s => s.gender === 'أنثى').length;

  const printWindow = window.open('', '_blank');
  if (!printWindow) {
    alert('يرجى السماح بالنوافذ المنبثقة لطباعة سجل شؤون الطلاب الرسمي.');
    return;
  }

  printWindow.document.write(`
    <!DOCTYPE html>
    <html lang="ar" dir="rtl">
    <head>
      <meta charset="UTF-8">
      <title>سجل قيد وبطاقات شؤون الطلاب المعتمد — ${schoolName}</title>
      <style>
        @page { size: A4 landscape; margin: 12mm; }
        body {
          font-family: 'Cairo', 'Segoe UI', Tahoma, sans-serif;
          color: #0f172a;
          background: #ffffff;
          margin: 0;
          padding: 10px;
          direction: rtl;
          font-size: 11px;
        }
        .register-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          border-bottom: 2px solid #0f172a;
          padding-bottom: 10px;
          margin-bottom: 12px;
        }
        .header-title-box { text-align: center; }
        .header-title-box h1 { font-size: 16px; margin: 0 0 4px 0; font-weight: 800; }
        .header-title-box h2 { font-size: 13px; margin: 0; color: #475569; font-weight: 700; }
        .data-summary-bar {
          display: flex;
          justify-content: space-between;
          background: #f1f5f9;
          padding: 6px 12px;
          border-radius: 4px;
          margin-bottom: 10px;
          font-weight: 700;
          font-size: 11px;
        }
        table.gov-table {
          width: 100%;
          border-collapse: collapse;
          margin-bottom: 16px;
        }
        table.gov-table th, table.gov-table td {
          border: 1px solid #334155;
          padding: 5px 6px;
          text-align: center;
        }
        table.gov-table th {
          background: #0f2b5c;
          color: #ffffff;
          font-size: 10px;
          font-weight: 700;
        }
        table.gov-table tr:nth-child(even) { background: #f8fafc; }
        .student-name-col { text-align: start !important; font-weight: 700; }
        .signatures-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          text-align: center;
          margin-top: 25px;
          page-break-inside: avoid;
        }
        .sig-block { padding: 8px; }
        .sig-role { font-weight: 800; font-size: 12px; margin-bottom: 30px; }
        .sig-line { border-bottom: 1px dashed #64748b; width: 60%; margin: 0 auto 6px; }
      </style>
    </head>
    <body>
      <div class="register-header">
        <div>
          <div>جمهورية مصر العربية</div>
          <div>وزارة التربية والتعليم والتعليم الفني</div>
          <div>${adminName}</div>
          <div><strong>${schoolName}</strong></div>
        </div>
        <div class="header-title-box">
          <h1>سجل قيد الطلاب وبيانات الحالة الرسمية</h1>
          <h2>(دفتر 31 شؤون طلاب — العام الدراسي 2026 / 2027)</h2>
        </div>
        <div style="text-align: end;">
          <div>تاريخ الطباعة: ${dateStr}</div>
          <div>خاتم شعار الجمهورية: معتمد</div>
        </div>
      </div>

      <div class="data-summary-bar">
        <span>إجمالي المقيدين بالسجل: ${students.length} طالب</span>
        <span>بنين: ${boysCount}</span>
        <span>بنات: ${girlsCount}</span>
        <span>المرحلة: التعليم الثانوي العام</span>
      </div>

      <table class="gov-table">
        <thead>
          <tr>
            <th style="width: 30px;">م</th>
            <th style="width: 80px;">كود الوزارة</th>
            <th style="width: 190px;">اسم الطالب الرباعي</th>
            <th style="width: 110px;">الرقم القومي (14 رقم)</th>
            <th style="width: 75px;">تاريخ الميلاد</th>
            <th style="width: 90px;">السن في 1 / 10</th>
            <th style="width: 45px;">النوع</th>
            <th style="width: 45px;">الديانة</th>
            <th style="width: 95px;">الفصل</th>
            <th style="width: 140px;">ولي الأمر والصفة</th>
            <th style="width: 90px;">هاتف ولي الأمر</th>
            <th>محل السكن</th>
            <th style="width: 70px;">حالة القيد</th>
          </tr>
        </thead>
        <tbody>
          ${students.map((s, idx) => `
            <tr>
              <td>${idx + 1}</td>
              <td style="font-family: monospace; font-weight: 700;">${s.code || '—'}</td>
              <td class="student-name-col">${s.name}</td>
              <td style="font-family: monospace;">${s.nationalId || '—'}</td>
              <td>${s.birthDate || '—'}</td>
              <td>${s.ageOct1 || '—'}</td>
              <td>${s.gender || 'ذكر'}</td>
              <td>${s.religion || 'مسلم'}</td>
              <td>${s.grade || 'أولى ثانوي'}</td>
              <td>${s.parentInfo?.parentName || 'مسجل'}${s.parentInfo?.parentRelation ? ` (${s.parentInfo.parentRelation})` : ''}</td>
              <td style="font-family: monospace;">${s.parentInfo?.parentPhone || s.parentInfo?.phone || '—'}</td>
              <td>${s.address || 'القاهرة'}</td>
              <td>${s.status === 'enrolled' ? 'مقيد' : (s.status || 'منتظم')}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>

      <div class="signatures-grid">
        <div class="sig-block">
          <div class="sig-role">مسؤول قيد شؤون الطلاب</div>
          <div class="sig-line"></div>
          <small>أ. محمود عبد الرحمن سالم</small>
        </div>
        <div class="sig-block">
          <div class="sig-role">وكيل شؤون الطلاب والمشرف</div>
          <div class="sig-line"></div>
          <small>يعتمد،،،</small>
        </div>
        <div class="sig-block">
          <div class="sig-role">مدير عام المدرسة</div>
          <div class="sig-line"></div>
          <small>د. طارق محمود المنشاوي</small>
        </div>
      </div>

      <script>
        window.onload = function() {
          window.print();
        };
      </script>
    </body>
    </html>
  `);
  printWindow.document.close();
}

// Print Official Institutional Document
export async function printOfficialDocument({ title, subtitle, tableHeaders, tableRows, signatureTitle = 'مدير عام المدرسة' }) {
  const profile = await getSchoolProfile();
  const schoolName = profile?.nameAr || 'المدرسة الثانوية الرسمية';
  const adminName = profile?.administration || 'الإدارة التعليمية المعتمدة';
  const dateStr = new Intl.DateTimeFormat('ar-EG', { dateStyle: 'full' }).format(new Date());

  const printWindow = window.open('', '_blank');
  if (!printWindow) {
    alert('يرجى السماح بالنوافذ المنبثقة لطباعة المستند الرسمي.');
    return;
  }

  printWindow.document.write(`
    <!DOCTYPE html>
    <html lang="ar" dir="rtl">
    <head>
      <meta charset="UTF-8">
      <title>${title} — ${schoolName}</title>
      <style>
        @page { size: A4 portrait; margin: 20mm; }
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Tahoma, Arial, sans-serif; margin: 0; color: #000; direction: rtl; }
        .header { display: flex; justify-content: space-between; border-bottom: 2px solid #000; padding-bottom: 12px; margin-bottom: 20px; }
        .header-col { font-size: 13px; line-height: 1.5; font-weight: bold; }
        .doc-title { text-align: center; margin-bottom: 24px; }
        .doc-title h1 { margin: 0; font-size: 20px; }
        .doc-title p { margin: 4px 0 0; font-size: 13px; color: #444; }
        table { width: 100%; border-collapse: collapse; margin-bottom: 30px; font-size: 12px; }
        th, td { border: 1px solid #000; padding: 8px 10px; text-align: start; }
        th { background-color: #f0f0f0; }
        .signatures { display: flex; justify-content: space-between; margin-top: 50px; padding-inline: 40px; font-size: 14px; font-weight: bold; }
        .signature-box { text-align: center; }
        .signature-line { margin-top: 40px; border-top: 1px dashed #000; width: 180px; }
      </style>
    </head>
    <body>
      <div class="header">
        <div class="header-col">
          جمهورية مصر العربية<br>
          وزارة التربية والتعليم والتعليم الفني<br>
          ${adminName}<br>
          ${schoolName}
        </div>
        <div class="header-col text-end" style="text-align: left;">
          العام الدراسي: 2026/2027<br>
          تاريخ التحرير: ${dateStr}
        </div>
      </div>

      <div class="doc-title">
        <h1>${title}</h1>
        ${subtitle ? `<p>${subtitle}</p>` : ''}
      </div>

      <table>
        <thead>
          <tr>
            ${tableHeaders.map((h) => `<th>${h}</th>`).join('')}
          </tr>
        </thead>
        <tbody>
          ${tableRows.length > 0
            ? tableRows.map((row) => `<tr>${row.map((cell) => `<td>${cell}</td>`).join('')}</tr>`).join('')
            : `<tr><td colspan="${tableHeaders.length}" style="text-align: center; padding: 20px;">لا توجد سجلات مسجلة</td></tr>`
          }
        </tbody>
      </table>

      <div class="signatures">
        <div class="signature-box">
          الموظف المختص<br>
          <div class="signature-line"></div>
        </div>
        <div class="signature-box">
          يعتمد، ${signatureTitle}<br>
          <div class="signature-line"></div>
        </div>
      </div>

      <script>
        window.onload = function() {
          window.print();
        };
      </script>
    </body>
    </html>
  `);

  printWindow.document.close();
}

/**
 * Print Official Student Enrollment Certificate (إفادة قيد رسمية معتمدة)
 */
export async function printEnrollmentCertificate(student = {}) {
  const profile = await getSchoolProfile();
  const schoolName = profile?.nameAr || 'المدرسة الثانوية الرسمية';
  const adminName = profile?.administration || 'الإدارة التعليمية';
  const dateStr = new Intl.DateTimeFormat('ar-EG', { dateStyle: 'full' }).format(new Date());

  const verifyToken = generateVerificationToken('ENR', student.code || '');
  const verifyUrl = buildVerificationUrl('enrollment', verifyToken);
  const qrUrl = generateQRCodeUrl(verifyUrl, 140);

  const printWindow = window.open('', '_blank');
  if (!printWindow) {
    alert('يرجى السماح بالنوافذ المنبثقة لطباعة الإفادة الرسمية.');
    return;
  }

  printWindow.document.write(`
    <!DOCTYPE html>
    <html lang="ar" dir="rtl">
    <head>
      <meta charset="UTF-8">
      <title>إفادة قيد رسمية — ${student.name || 'طالب'}</title>
      <style>
        @page { size: A4 portrait; margin: 25mm 20mm; }
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Tahoma, Arial, sans-serif; margin: 0; color: #0f172a; direction: rtl; line-height: 1.8; }
        .header { display: flex; justify-content: space-between; border-bottom: 2px solid #0f172a; padding-bottom: 15px; margin-bottom: 30px; }
        .header-col { font-size: 13px; line-height: 1.6; font-weight: bold; }
        .title-box { text-align: center; margin-bottom: 30px; }
        .title-box h1 { margin: 0; font-size: 24px; font-weight: 800; text-decoration: underline; }
        .cert-body { font-size: 15px; text-align: justify; margin-bottom: 40px; }
        .cert-data-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin: 25px 0; padding: 20px; background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 6px; }
        .data-item { font-size: 14px; }
        .data-item strong { color: #0f172a; }
        .signatures { display: flex; justify-content: space-between; margin-top: 60px; padding-inline: 40px; font-weight: bold; font-size: 14px; }
        .seal-box { width: 120px; height: 120px; border: 2px dashed #94a3b8; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 12px; color: #64748b; text-align: center; margin: 0 auto; }
      </style>
    </head>
    <body>
      <div class="header">
        <div class="header-col">
          جمهورية مصر العربية<br>
          وزارة التربية والتعليم والتعليم الفني<br>
          ${adminName}<br>
          ${schoolName}
        </div>
        <div class="header-col" style="text-align: left;">
          العام الدراسي: 2026 / 2027<br>
          تاريخ الاستخراج: ${dateStr}
        </div>
      </div>

      <div class="title-box">
        <h1>إفـادة قـيـد مـدرسـي رسـمـيـة</h1>
      </div>

      <div class="cert-body">
        تشهد إدارة <strong>${schoolName}</strong> التابعة لإدارة <strong>${adminName}</strong> التعليمية بأن الطالب الموضحة بياناته أدناه:
        
        <div class="cert-data-grid">
          <div class="data-item">اسم الطالب: <strong>${student.name || '—'}</strong></div>
          <div class="data-item">كود الطالب بالوزارة: <strong>${student.code || '—'}</strong></div>
          <div class="data-item">الرقم القومي: <strong>${student.nationalId || '—'}</strong></div>
          <div class="data-item">الصف الدراسي: <strong>${student.grade || 'الصف الأول الثانوي'}</strong></div>
          <div class="data-item">حالة القيد: <strong>مقيد ومنتظم بالدراسة للعام 2026/2027</strong></div>
          <div class="data-item">الديانة / الجنسية: <strong>مصري</strong></div>
        </div>

        مقيد بالدراسة لدينا ومنتظم بالحضور، وقد أُعطيت له هذه الإفادة بناءً على طلبه لتقديمها إلى الجهات المعنية الرسمية دون أدنى مسؤولية على إدارة المدرسة تجاه حقوق الغير.
      </div>

      <div class="signatures">
        <div style="text-align: center;">
          مسؤول شؤون الطلاب<br><br><br>
          ................................
        </div>
        <div class="seal-box" style="flex-direction:column;">
          <img src="${qrUrl}" alt="QR" style="width:100px;height:100px;margin-bottom:4px;">
          <span style="font-size:9px;font-weight:400;">رمز التحقق:<br><code style="letter-spacing:1px;">${verifyToken}</code></span>
        </div>
        <div style="text-align: center;">
          يعتمد، مدير عام المدرسة<br><br><br>
          ................................
        </div>
      </div>

      <div style="text-align:center;margin-top:30px;padding-top:12px;border-top:1px dashed #cbd5e1;font-size:11px;color:#94a3b8;">
        مستند صادر إلكترونيًا من المنظومة الرقمية الموحدة (DSE) — يُتحقق من صحته بمسح رمز QR أو إدخال رمز التحقق في verify.html
      </div>

      <script>
        window.onload = function() { window.print(); };
      </script>
    </body>
    </html>
  `);
  printWindow.document.close();
}

/**
 * Print Official Ministry Tablet Handover Protocol (محضر تسليم تابلت وزاري رسمي)
 */
export async function printTabletHandoverProtocol({ student = {}, device = {}, operatorName = 'مسؤول التطوير التكنولوجي' }) {
  const profile = await getSchoolProfile();
  const schoolName = profile?.nameAr || 'المدرسة الثانوية الرسمية';
  const adminName = profile?.administration || 'الإدارة التعليمية';
  const dateStr = new Intl.DateTimeFormat('ar-EG', { dateStyle: 'full' }).format(new Date());

  const verifyToken = generateVerificationToken('TAB', device.imei || '');
  const verifyUrl = buildVerificationUrl('tablet_receipt', verifyToken);
  const qrUrl = generateQRCodeUrl(verifyUrl, 130);

  const printWindow = window.open('', '_blank');
  if (!printWindow) {
    alert('يرجى السماح بالنوافذ المنبثقة لطباعة محضر التسليم.');
    return;
  }

  printWindow.document.write(`
    <!DOCTYPE html>
    <html lang="ar" dir="rtl">
    <head>
      <meta charset="UTF-8">
      <title>محضر تسليم تابلت وزاري — ${device.imei || ''}</title>
      <style>
        @page { size: A4 portrait; margin: 20mm; }
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Tahoma, Arial, sans-serif; margin: 0; color: #000; direction: rtl; line-height: 1.6; }
        .header { display: flex; justify-content: space-between; border-bottom: 2px solid #000; padding-bottom: 12px; margin-bottom: 20px; font-weight: bold; font-size: 13px; }
        .title { text-align: center; margin-bottom: 20px; }
        .title h1 { margin: 0; font-size: 20px; font-weight: 800; }
        .title h2 { margin: 4px 0 0; font-size: 14px; color: #333; }
        .spec-box { border: 1px solid #000; padding: 15px; margin-bottom: 20px; font-size: 13px; background: #fafafa; }
        .spec-row { display: flex; justify-content: space-between; margin-bottom: 8px; }
        .legal-notice { font-size: 12px; line-height: 1.8; text-align: justify; margin-bottom: 30px; border-top: 1px dashed #666; padding-top: 15px; }
        .signatures { display: flex; justify-content: space-between; margin-top: 40px; font-weight: bold; font-size: 13px; text-align: center; }
      </style>
    </head>
    <body>
      <div class="header">
        <div>
          جمهورية مصر العربية<br>
          وزارة التربية والتعليم والتعليم الفني<br>
          ${adminName}<br>
          ${schoolName}
        </div>
        <div style="text-align: left;">
          العام الدراسي: 2026/2027<br>
          تاريخ المحضر: ${dateStr}
        </div>
      </div>

      <div class="title">
        <h1>محضر تسليم جهاز تابلت مدرسي وزاري (عهدة شخصية)</h1>
        <h2>طبقاً للكتاب الدوري والقرارات الوزارية المنظمة لمنظومة التعليم الثانوي التكنولوجي</h2>
      </div>

      <div class="spec-box">
        <div class="spec-row">
          <span>اسم الطالب الرباعي: <strong>${student.name || device.assignedStudentName || '—'}</strong></span>
          <span>كود الطالب الموحد: <strong>${student.code || device.assignedStudentCode || '—'}</strong></span>
        </div>
        <div class="spec-row">
          <span>الرقم القومي للطالب: <strong>${student.nationalId || '—'}</strong></span>
          <span>الصف الدراسي: <strong>${student.grade || 'الصف الأول الثانوي'}</strong></span>
        </div>
        <div class="spec-row">
          <span>رقم IMEI للجهاز: <strong style="font-family: monospace; font-size: 15px;">${device.imei || '—'}</strong></span>
          <span>الرقم التسلسلي (Serial): <strong>${device.serialNumber || '—'}</strong></span>
        </div>
        <div class="spec-row">
          <span>طراز الجهاز وموديله: <strong>${device.model || 'تابلت مدرسي معتمد'}</strong></span>
          <span>رقم دفعة الاستلام: <strong>${device.batchId || 'دفعة وزارية'}</strong></span>
        </div>
      </div>

      <div class="legal-notice">
        <strong>إقرار وتعهد ولي الأمر:</strong><br>
        أقر أنا الموقع أدناه، ولي أمر الطالب المذكور، بأنني قد استلمت جهاز الحاسب اللوحي (التابلت) بملحقاته كاملة (الشاحن، الكابل، الجراب، القلم) بحالة سليمة وصالحة للعمل تماماً ومثبت عليه التطبيقات الوزارية والمنصة التعليمية المعتمدة. وأتعهد بالمحافظة عليه وسداد قسط التأمين الإجباري السنوي بمكاتب البريد، وعدم العبث بنظام التشغيل أو إجراء أي تعديل برمجي (Rooting/Flashing) يُخل بضمان الجهاز، كما ألتزم بتسليمه للمدرسة حال التحويل أو الانقطاع أو بناءً على تعليمات الوزارة.
      </div>

      <div class="signatures">
        <div>
          المستلم (ولي الأمر)<br>
          الاسم: ...............................<br>
          الرقم القومي: ........................<br>
          التوقيع: .............................
        </div>
        <div>
          قسم التطوير التكنولوجي<br>
          الاسم: <strong>${operatorName}</strong><br>
          التوقيع: .............................
        </div>
        <div>
          يعتمد، مدير عام المدرسة<br>
          الاسم: ...............................<br>
          التوقيع والخاتم: ......................
        </div>
      </div>

      <div style="display:flex;align-items:center;justify-content:space-between;margin-top:30px;padding:15px;border:1px solid #cbd5e1;border-radius:6px;background:#f8fafc;">
        <div style="font-size:11px;color:#64748b;line-height:1.6;">
          <strong>التحقق الرقمي من المحضر:</strong><br>
          امسح رمز QR أو أدخل رمز التحقق:<br>
          <code style="letter-spacing:2px;font-size:13px;color:#0f172a;font-weight:700;">${verifyToken}</code><br>
          <span style="font-size:10px;">مستند صادر إلكترونياً من المنظومة الرقمية الموحدة (DSE)</span>
        </div>
        <img src="${qrUrl}" alt="QR" style="width:100px;height:100px;">
      </div>

      <script>
        window.onload = function() { window.print(); };
      </script>
    </body>
    </html>
  `);
  printWindow.document.close();
}

/**
 * Print Official Student ID Card (كارنيه وبطاقة الطالب المدرسية المعتمدة مع QR Code)
 */
export async function printStudentIdCard(student = {}) {
  const profile = await getSchoolProfile();
  const schoolName = profile?.nameAr || 'المدرسة الثانوية الرسمية';
  const adminName = profile?.administration || 'الإدارة التعليمية';
  const academicYear = profile?.academicYear || '2026/2027';

  const verifyToken = generateVerificationToken('STU', student.code || '');
  const verifyUrl = buildVerificationUrl('student', verifyToken);
  const qrUrl = generateQRCodeUrl(verifyUrl, 100);

  const printWindow = window.open('', '_blank');
  if (!printWindow) {
    alert('يرجى السماح بالنوافذ المنبثقة لطباعة كارنيه الطالب.');
    return;
  }

  printWindow.document.write(`
    <!DOCTYPE html>
    <html lang="ar" dir="rtl">
    <head>
      <meta charset="UTF-8">
      <title>كارنيه الطالب المعتمد — ${student.name || ''}</title>
      <style>
        @page { size: A4 portrait; margin: 15mm; }
        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Tahoma, Arial, sans-serif;
          margin: 0;
          padding: 20px;
          background: #f1f5f9;
          direction: rtl;
          color: #0f172a;
        }
        .print-actions {
          text-align: center;
          margin-bottom: 25px;
        }
        .print-btn {
          background: #2563eb;
          color: #fff;
          border: none;
          padding: 10px 24px;
          border-radius: 6px;
          font-weight: bold;
          font-size: 14px;
          cursor: pointer;
        }
        .cards-wrapper {
          display: flex;
          justify-content: center;
          align-items: center;
          gap: 30px;
          flex-wrap: wrap;
        }
        /* Standard ID Card format: 85.6mm x 53.98mm (CR80) */
        .id-card {
          width: 86mm;
          height: 54mm;
          border-radius: 10px;
          box-shadow: 0 4px 15px rgba(0,0,0,0.15);
          position: relative;
          overflow: hidden;
          background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%);
          color: #ffffff;
          padding: 10px 14px;
          box-sizing: border-box;
          border: 1px solid #334155;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
        }
        .card-front-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          border-bottom: 1px solid rgba(255,255,255,0.15);
          padding-bottom: 5px;
        }
        .school-info {
          font-size: 8px;
          line-height: 1.3;
        }
        .school-info strong {
          font-size: 9.5px;
          color: #f59e0b;
        }
        .card-type-badge {
          background: #2563eb;
          color: #fff;
          font-size: 8px;
          padding: 2px 6px;
          border-radius: 4px;
          font-weight: bold;
        }
        .card-body {
          display: flex;
          gap: 10px;
          align-items: center;
          margin-top: 4px;
        }
        .photo-placeholder {
          width: 52px;
          height: 65px;
          background: #334155;
          border: 1.5px solid #64748b;
          border-radius: 6px;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          font-size: 8px;
          color: #94a3b8;
          text-align: center;
          flex-shrink: 0;
        }
        .student-details {
          flex: 1;
          font-size: 8.5px;
          line-height: 1.45;
        }
        .student-name-row {
          font-size: 11px;
          font-weight: 800;
          color: #38bdf8;
          margin-bottom: 2px;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          max-width: 175px;
        }
        .detail-row {
          display: flex;
          justify-content: space-between;
          margin-bottom: 1.5px;
        }
        .detail-label {
          color: #94a3b8;
        }
        .detail-value {
          font-weight: 700;
          color: #ffffff;
        }
        .code-box {
          background: rgba(245, 158, 11, 0.15);
          border: 1px dashed #f59e0b;
          padding: 1px 4px;
          border-radius: 3px;
          color: #fbbf24;
          font-family: monospace;
          font-weight: 800;
        }
        .card-footer {
          border-top: 1px solid rgba(255,255,255,0.15);
          padding-top: 4px;
          display: flex;
          justify-content: space-between;
          align-items: center;
          font-size: 7.5px;
          color: #94a3b8;
        }
        /* Back Card */
        .card-back {
          background: #ffffff;
          color: #0f172a;
          border: 1px solid #cbd5e1;
        }
        .back-content {
          display: flex;
          gap: 10px;
          height: 100%;
          align-items: center;
        }
        .back-qr {
          width: 72px;
          height: 72px;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          border: 1px solid #e2e8f0;
          border-radius: 6px;
          padding: 2px;
          background: #f8fafc;
        }
        .back-qr img {
          width: 58px;
          height: 58px;
        }
        .back-info {
          flex: 1;
          font-size: 7.5px;
          line-height: 1.4;
          color: #334155;
        }
        .back-instructions {
          margin: 0;
          padding-right: 14px;
          list-style: square;
        }
        .stamp-box {
          border-top: 1px dashed #94a3b8;
          margin-top: 6px;
          padding-top: 3px;
          display: flex;
          justify-content: space-between;
          font-size: 7px;
          font-weight: 700;
        }

        @media print {
          body { background: transparent; padding: 0; }
          .print-actions { display: none; }
          .cards-wrapper { gap: 15mm; margin-top: 10mm; }
          .id-card { box-shadow: none; page-break-inside: avoid; }
        }
      </style>
    </head>
    <body>
      <div class="print-actions">
        <button class="print-btn" onclick="window.print()">🖨️ اضغط هنا لطباعة كارنيه الطالب (وجه وخلفية)</button>
        <p style="margin: 8px 0 0; font-size: 12px; color: #64748b;">مُصمم للطباعة على بطاقة PVC القياسية (CR80) أو ورقة A4 وتغليفها حرارياً</p>
      </div>

      <div class="cards-wrapper">
        <!-- وجه الكارنيه -->
        <div class="id-card">
          <div class="card-front-header">
            <div class="school-info">
              وزارة التربية والتعليم والتعليم الفني<br>
              <strong>${schoolName}</strong>
            </div>
            <div class="card-type-badge">بطاقة تحقيق شخصية مدرسية</div>
          </div>

          <div class="card-body">
            <div class="photo-placeholder">
              <span style="font-size: 20px;">🎓</span>
              <span>صورة الطالب 4×6</span>
            </div>
            <div class="student-details">
              <div class="student-name-row">${student.name || 'اسم الطالب'}</div>
              <div class="detail-row">
                <span class="detail-label">كود الوزارة الموحد:</span>
                <span class="code-box">${student.code || '—'}</span>
              </div>
              <div class="detail-row">
                <span class="detail-label">الرقم القومي:</span>
                <span class="detail-value" style="font-family: monospace;">${student.nationalId || '—'}</span>
              </div>
              <div class="detail-row">
                <span class="detail-label">الصف والفصل:</span>
                <span class="detail-value">${student.grade || 'الصف الأول الثانوي'}</span>
              </div>
              <div class="detail-row">
                <span class="detail-label">العام الدراسي:</span>
                <span class="detail-value">${academicYear}</span>
              </div>
            </div>
          </div>

          <div class="card-footer">
            <span>المنظومة الرقمية الموحدة DSE</span>
            <span>مدير عام المدرسة: د. طارق محمود</span>
          </div>
        </div>

        <!-- ظهر الكارنيه -->
        <div class="id-card card-back">
          <div class="back-content">
            <div class="back-qr">
              <img src="${qrUrl}" alt="QR">
              <span style="font-size: 6px; font-family: monospace; color: #475569; margin-top: 2px;">${verifyToken}</span>
            </div>
            <div class="back-info">
              <strong style="display: block; margin-bottom: 2px; color: #0f172a; font-size: 8px;">تعليمات وضوابط استخدام البطاقة:</strong>
              <ul class="back-instructions">
                <li>هذه البطاقة شخصية ورسمية وتعتبر إثبات قيد للطالب.</li>
                <li>يجب حملها يومياً وإبرازها عند بوابة المدرسة وخلال الامتحانات.</li>
                <li>في حالة العثور على البطاقة يُرجى تسليمها لإدارة المدرسة.</li>
              </ul>
              <div style="margin-top: 3px; font-size: 7.5px;">
                <strong>طوارئ ولي الأمر:</strong> <code style="font-size: 8px; font-weight: bold;">${student.parentInfo?.parentPhone || student.parentInfo?.phone || '—'}</code>
              </div>
              <div class="stamp-box">
                <span>توقيع شؤون الطلاب: ............</span>
                <span>خاتم شعار المدرسة: معتمد</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <script>
        window.onload = function() {
          setTimeout(function() { window.print(); }, 400);
        };
      </script>
    </body>
    </html>
  `);
  printWindow.document.close();
}

/**
 * Print Official Student Honor & Excellence Certificate (شهادة تقدير وتفوق أكاديمي معتمدة)
 */
export async function printHonorCertificate({ student = {}, reason = 'التفوق العلمي والأكاديمي والتميز في الأنشطة المدرسية وحسن السير والسلوك', term = 'العام الدراسي 2026 / 2027' } = {}) {
  const profile = await getSchoolProfile();
  const schoolName = profile?.nameAr || 'المدرسة الثانوية الرسمية';
  const adminName = profile?.administration || 'الإدارة التعليمية';

  const verifyToken = generateVerificationToken('HONOR', student.code || '');
  const verifyUrl = buildVerificationUrl('honor_certificate', verifyToken);
  const qrUrl = generateQRCodeUrl(verifyUrl, 110);

  const printWindow = window.open('', '_blank');
  if (!printWindow) {
    if (typeof window.showToast === 'function') {
      window.showToast('يرجى السماح بالنوافذ المنبثقة لطباعة شهادة التقدير.', 'warning');
    }
    return;
  }

  printWindow.document.write(`
    <!DOCTYPE html>
    <html lang="ar" dir="rtl">
    <head>
      <meta charset="UTF-8">
      <title>شهادة تقدير وتفوق — ${student.name || ''}</title>
      <style>
        @page { size: A4 landscape; margin: 10mm; }
        body {
          font-family: 'Amiri', -apple-system, BlinkMacSystemFont, 'Segoe UI', Tahoma, Arial, sans-serif;
          margin: 0;
          padding: 12mm;
          background: #ffffff;
          color: #0f172a;
          direction: rtl;
        }
        .cert-border-outer {
          border: 4px double #d97706;
          padding: 8px;
          height: 100%;
          box-sizing: border-box;
          position: relative;
        }
        .cert-border-inner {
          border: 1.5px solid #b45309;
          padding: 24px 30px;
          height: 100%;
          box-sizing: border-box;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          text-align: center;
          background: radial-gradient(circle at center, #ffffff 60%, #fffbeb 100%);
        }
        .cert-top-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          border-bottom: 1.5px solid #e2e8f0;
          padding-bottom: 12px;
        }
        .gov-col {
          text-align: start;
          font-size: 13px;
          font-weight: 700;
          line-height: 1.4;
          color: #1e293b;
        }
        .crest-col {
          font-size: 32px;
        }
        .date-col {
          text-align: end;
          font-size: 12px;
          color: #475569;
          line-height: 1.4;
        }
        .cert-main-title {
          font-size: 32px;
          font-weight: 900;
          color: #b45309;
          margin: 12px 0 4px 0;
          letter-spacing: -0.5px;
        }
        .cert-sub-title {
          font-size: 16px;
          color: #475569;
          margin: 0 0 16px 0;
          font-weight: 600;
        }
        .honor-text-intro {
          font-size: 18px;
          color: #334155;
          margin-bottom: 10px;
        }
        .student-name-display {
          font-size: 34px;
          font-weight: 900;
          color: #0f172a;
          margin: 8px 0;
          text-decoration: underline;
          text-decoration-color: #f59e0b;
          text-underline-offset: 8px;
        }
        .student-class-display {
          font-size: 16px;
          font-weight: 700;
          color: #2563eb;
          margin-bottom: 14px;
        }
        .honor-reason {
          font-size: 16px;
          color: #1e293b;
          max-width: 800px;
          margin: 0 auto 20px auto;
          line-height: 1.7;
        }
        .cert-footer-grid {
          display: flex;
          justify-content: space-between;
          align-items: flex-end;
          padding-top: 15px;
          border-top: 1.5px solid #e2e8f0;
        }
        .sig-block {
          text-align: center;
          font-size: 14px;
          font-weight: 700;
          color: #0f172a;
        }
        .sig-line {
          width: 140px;
          border-bottom: 1px dashed #64748b;
          margin: 35px auto 6px auto;
        }
        .qr-verify-box {
          display: flex;
          align-items: center;
          gap: 12px;
          text-align: start;
          background: #ffffff;
          padding: 6px 12px;
          border: 1px solid #e2e8f0;
          border-radius: 8px;
        }
        .qr-verify-text {
          font-size: 10px;
          color: #64748b;
          line-height: 1.4;
        }
      </style>
    </head>
    <body>
      <div class="cert-border-outer">
        <div class="cert-border-inner">
          <div class="cert-top-header">
            <div class="gov-col">
              جمهورية مصر العربية<br>
              وزارة التربية والتعليم والتعليم الفني<br>
              ${adminName}<br>
              <strong>${schoolName}</strong>
            </div>
            <div class="crest-col">🦅</div>
            <div class="date-col">
              العام الدراسي: ${term}<br>
              رقم التوثيق: <code style="font-size: 13px; font-weight: 700;">${verifyToken}</code><br>
              خاتم شعار الجمهورية: معتمد
            </div>
          </div>

          <div>
            <h1 class="cert-main-title">📜 شهادة تقدير وتفوق أكاديمي</h1>
            <p class="cert-sub-title">Certificate of Academic Excellence & Honor</p>

            <div class="honor-text-intro">تتشرف إدارة المدرسة وأسرة هيئة التدريس بمنح هذه الشهادة للطالب / الطالبة:</div>
            <div class="student-name-display">${student.name || 'اسم الطالب المتميز'}</div>
            <div class="student-class-display">${student.grade || 'الصف الأول الثانوي'} — كود الوزارة: (${student.code || '—'})</div>

            <p class="honor-reason">
              تقديراً لجهوده المتميزة وتفوقه الباهر في ${reason}، وإعراباً عن فخر المدرسة واعتزازها به كنموذج يحتذى به بين زملائه، متمنين له دوام الرفعة والريادة في مسيرته العلمية والمهنية.
            </p>
          </div>

          <div class="cert-footer-grid">
            <div class="sig-block">
              <div>المعلم المشرف / رائد الفصل</div>
              <div class="sig-line"></div>
              <small style="color: #64748b;">أ. محمد إبراهيم حسن</small>
            </div>

            <div class="qr-verify-box">
              <img src="${qrUrl}" alt="QR" style="width: 70px; height: 70px;">
              <div class="qr-verify-text">
                <strong>التحقق الرقمي الرسمي:</strong><br>
                وثيقة معتمدة ومسجلة بالسجل الأكاديمي الرقمي.<br>
                امسح الرمز أو تحقق عبر verify.html
              </div>
            </div>

            <div class="sig-block">
              <div>يعتمد، مدير عام المدرسة</div>
              <div class="sig-line"></div>
              <small style="color: #64748b;">د. طارق محمود المنشاوي</small>
            </div>
          </div>
        </div>
      </div>

      <script>
        window.onload = function() {
          setTimeout(function() { window.print(); }, 400);
        };
      </script>
    </body>
    </html>
  `);
  printWindow.document.close();
}

/**
 * Print Official Ministry Absence Warning Letter (إنذار غياب رسمي لولي الأمر)
 */
export async function printAbsenceWarningLetter({ student = {}, days = 3, warningNumber = 'الأول' } = {}) {
  const profile = await getSchoolProfile();
  const schoolName = profile?.nameAr || 'المدرسة الثانوية الرسمية';
  const adminName = profile?.administration || 'الإدارة التعليمية';
  const dateStr = new Intl.DateTimeFormat('ar-EG', { dateStyle: 'full' }).format(new Date());

  const verifyToken = generateVerificationToken('WARN', student.code || '');
  const verifyUrl = buildVerificationUrl('absence_warning', verifyToken);
  const qrUrl = generateQRCodeUrl(verifyUrl, 100);

  const printWindow = window.open('', '_blank');
  if (!printWindow) {
    if (typeof window.showToast === 'function') {
      window.showToast('يرجى السماح بالنوافذ المنبثقة لطباعة إنذار الغياب.', 'warning');
    }
    return;
  }

  printWindow.document.write(`
    <!DOCTYPE html>
    <html lang="ar" dir="rtl">
    <head>
      <meta charset="UTF-8">
      <title>إنذار غياب رسمي — ${student.name || ''}</title>
      <style>
        @page { size: A4 portrait; margin: 20mm; }
        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Tahoma, Arial, sans-serif;
          margin: 0;
          color: #000000;
          direction: rtl;
          line-height: 1.6;
        }
        .header {
          display: flex;
          justify-content: space-between;
          border-bottom: 2px solid #000;
          padding-bottom: 12px;
          margin-bottom: 20px;
          font-size: 13px;
          font-weight: 700;
        }
        .title-box {
          text-align: center;
          margin-bottom: 22px;
        }
        .title-box h1 {
          font-size: 21px;
          font-weight: 800;
          margin: 0 0 6px 0;
          color: #991b1b;
        }
        .title-box p {
          margin: 0;
          font-size: 13px;
          color: #333333;
        }
        .info-table {
          width: 100%;
          border-collapse: collapse;
          margin-bottom: 20px;
          font-size: 13px;
        }
        .info-table th, .info-table td {
          border: 1px solid #000;
          padding: 8px 12px;
          text-align: start;
        }
        .info-table th {
          background-color: #f3f4f6;
          font-weight: 700;
          width: 25%;
        }
        .legal-notice {
          font-size: 13.5px;
          text-align: justify;
          line-height: 1.8;
          margin-bottom: 30px;
        }
        .signatures-row {
          display: flex;
          justify-content: space-between;
          margin-top: 40px;
          font-weight: 700;
          font-size: 13px;
          text-align: center;
        }
        .sig-block {
          width: 180px;
        }
        .sig-space {
          height: 45px;
        }
        .footer-verify {
          margin-top: 40px;
          padding: 12px 16px;
          border: 1px solid #cbd5e1;
          border-radius: 6px;
          display: flex;
          justify-content: space-between;
          align-items: center;
          font-size: 11px;
          color: #475569;
          background: #f8fafc;
        }
      </style>
    </head>
    <body>
      <div class="header">
        <div>
          جمهورية مصر العربية<br>
          وزارة التربية والتعليم والتعليم الفني<br>
          ${adminName}<br>
          <strong>${schoolName}</strong>
        </div>
        <div style="text-align: left;">
          قسم شؤون الطلاب والانضباط المدرسي<br>
          التاريخ: ${dateStr}<br>
          العام الدراسي: 2026 / 2027
        </div>
      </div>

      <div class="title-box">
        <h1>إنذار غياب رسمي لولي الأمر (الإنذار ${warningNumber})</h1>
        <p>طبقاً للكتاب الدوري وقانون التعليم رقم 139 لسنة 1981 ولائحة التحفيز التربوي والانضباط المدرسي</p>
      </div>

      <table class="info-table">
        <tr>
          <th>اسم الطالب الرباعي:</th>
          <td><strong>${student.name || '—'}</strong></td>
          <th>كود الطالب الوزاري:</th>
          <td><code>${student.code || '—'}</code></td>
        </tr>
        <tr>
          <th>الرقم القومي:</th>
          <td>${student.nationalId || '—'}</td>
          <th>الصف والفصل:</th>
          <td>${student.grade || 'الصف الأول الثانوي'}</td>
        </tr>
        <tr>
          <th>اسم ولي الأمر:</th>
          <td>${student.parentInfo?.parentName || 'مسجل بالمدرسة'}</td>
          <th>هاتف ولي الأمر:</th>
          <td>${student.parentInfo?.parentPhone || student.parentInfo?.phone || '—'}</td>
        </tr>
        <tr>
          <th>أيام الغياب المرصودة:</th>
          <td colspan="3"><strong style="color: #991b1b;">${days} أيام غياب بدون عذر مقبول معتمد</strong></td>
        </tr>
      </table>

      <div class="legal-notice">
        <strong>السيد ولي أمر الطالب المحترم،،،</strong><br>
        تحية طيبة وبعد،<br>
        نحيط سيادتكم علماً بأن نجلكم المذكور عاليه قد انقطع عن الحضور للمدرسة وتجاوز النسبة المقررة قانوناً للغياب بدون تقديم عذر طبي أو رسمي تقبله إدارة المدرسة.<br>
        وبناءً على المادة (19) من قانون التعليم ولائحة الانضباط المدرسي المعتمدة، ننذر سيادتكم بسرعة الحضور إلى مقر المدرسة (مكتب الخدمة الاجتماعية وشؤون الطلاب) خلال <strong>48 ساعة</strong> من تاريخ استلام هذا الإنذار لتسوية الموقف، وإلا ستضطر إدارة المدرسة آسفةً لاتخاذ الإجراءات القانونية المقررة والتي قد تصل إلى الحرمان من دخول الامتحانات أو الفصل وإعادة القيد.
      </div>

      <div class="signatures-row">
        <div class="sig-block">
          مسؤول شؤون الطلاب<br>
          <div class="sig-space"></div>
          أ. محمود عبد الرحمن سالم
        </div>
        <div class="sig-block">
          الأخصائي الاجتماعي<br>
          <div class="sig-space"></div>
          أ. نادية مصطفى الشريف
        </div>
        <div class="sig-block">
          يعتمد، مدير عام المدرسة<br>
          <div class="sig-space"></div>
          د. طارق محمود المنشاوي
        </div>
      </div>

      <div class="footer-verify">
        <div>
          <strong>التحقق الرقمي الرسمي من السجل:</strong><br>
          رمز التوثيق: <code style="font-weight: 800; font-size: 13px;">${verifyToken}</code><br>
          مستند إداري صادر رسمياً عبر المنظومة المدرسية الموحدة DSE
        </div>
        <img src="${qrUrl}" alt="QR" style="width: 75px; height: 75px;">
      </div>

      <script>
        window.onload = function() {
          setTimeout(function() { window.print(); }, 400);
        };
      </script>
    </body>
    </html>
  `);
  printWindow.document.close();
}
