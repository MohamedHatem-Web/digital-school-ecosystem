export const ATTENDANCE_WARNING_STAGES = [
  { key: 'warning_first', label: 'الإنذار الأول', scatteredDays: 15, consecutiveDays: 5 },
  { key: 'warning_second', label: 'الإنذار الثاني', scatteredDays: 25, consecutiveDays: 8 },
  { key: 'dismissal', label: 'قرار الفصل', scatteredDays: 30, consecutiveDays: 10 },
];

const UNEXCUSED_STATUSES = new Set(['absent', 'absent_unexcused']);

export function applyAbsenceExcuses(records, excuses, date, academicYear) {
  return records.map((record) => {
    if (!UNEXCUSED_STATUSES.has(record.status) && record.status !== 'absent_excused') return record;
    const attendanceDate = String(record.date || date || '');
    const hasApprovedExcuse = (excuses || []).some((excuse) =>
      String(excuse.studentCode) === String(record.studentCode) &&
      excuse.approved === true &&
      (!excuse.academicYear || excuse.academicYear === academicYear) &&
      String(excuse.startDate || '') <= attendanceDate &&
      String(excuse.endDate || '') >= attendanceDate
    );
    return { ...record, status: hasApprovedExcuse ? 'absent_excused' : 'absent_unexcused' };
  });
}

export function calculateAbsenceRisk(records, academicYear) {
  const schoolDates = new Map();
  for (const record of records || []) {
    if (record.academicYear && record.academicYear !== academicYear) continue;
    if (!record.date || !record.studentCode) continue;
    const code = String(record.studentCode);
    if (!schoolDates.has(code)) schoolDates.set(code, new Map());
    schoolDates.get(code).set(String(record.date), record.status);
  }

  const results = [];
  schoolDates.forEach((attendanceByDate, studentCode) => {
    const dates = [...attendanceByDate.keys()].sort();
    const absentDates = dates.filter((date) => UNEXCUSED_STATUSES.has(attendanceByDate.get(date)));
    let consecutiveDays = 0;
    let longestConsecutiveDays = 0;
    for (const date of dates) {
      if (UNEXCUSED_STATUSES.has(attendanceByDate.get(date))) {
        consecutiveDays += 1;
        longestConsecutiveDays = Math.max(longestConsecutiveDays, consecutiveDays);
      } else {
        consecutiveDays = 0;
      }
    }

    const absenceDays = absentDates.length;
    const events = [];
    for (const stage of ATTENDANCE_WARNING_STAGES) {
      const reached = absenceDays >= stage.scatteredDays || longestConsecutiveDays >= stage.consecutiveDays;
      const approaching = !reached && (
        absenceDays >= stage.scatteredDays - 1 ||
        longestConsecutiveDays >= stage.consecutiveDays - 1
      );
      if (reached || approaching) {
        events.push({
          stage: stage.key,
          label: stage.label,
          status: reached ? 'reached' : 'approaching',
          absenceDays,
          consecutiveDays,
          longestConsecutiveDays,
        });
      }
    }
    if (events.length) results.push({ studentCode, absenceDays, consecutiveDays, longestConsecutiveDays, absentDates, events });
  });
  return results;
}

export function getAcademicYearDateRange(academicYear) {
  const match = String(academicYear || '').match(/^(\d{4})\/(\d{4})$/);
  if (!match) throw new Error('السنة الدراسية غير صالحة.');
  return {
    startDate: `${match[1]}-09-01`,
    endDate: `${match[2]}-08-31`,
  };
}
