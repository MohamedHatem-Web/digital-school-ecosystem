// ==========================================================================
// DIGITAL SCHOOL ECOSYSTEM (VANILLA EDITION)
// Export to Excel/CSV & Official Printable Reports Engine
// ==========================================================================

import { getSchoolProfile } from '../services/school-service.js';

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
        <div class="seal-box">
          خاتم شعار الجمهورية<br>أو ختم المدرسة
        </div>
        <div style="text-align: center;">
          يعتمد، مدير عام المدرسة<br><br><br>
          ................................
        </div>
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

      <script>
        window.onload = function() { window.print(); };
      </script>
    </body>
    </html>
  `);
  printWindow.document.close();
}
