const ABSENT_STATUSES = new Set(['absent', 'absent_unexcused', 'absent_excused']);
const REVIEW_DECISIONS = new Set(['confirm', 'correct']);

export function reconcileLessonAttendance(records = [], arrivalRecords = []) {
  const arrivalByCode = new Map(arrivalRecords.map((record) => [String(record.studentCode), record.status]));
  return records.map((record) => {
    const arrivalStatus = arrivalByCode.get(String(record.studentCode)) || '';
    const classStatus = record.status === 'escaped' ? (record.classStatus || 'absent_unexcused') : record.status;
    const wasOnCampus = arrivalStatus === 'present';
    if (wasOnCampus && ABSENT_STATUSES.has(classStatus)) {
      const escapeReview = record.classStatus === classStatus && ['confirmed', 'rejected'].includes(record.escapeReview)
        ? record.escapeReview
        : 'pending';
      return {
        ...record,
        classStatus,
        arrivalStatus,
        escapeReview,
        status: escapeReview === 'confirmed' ? 'escaped' : classStatus,
      };
    }
    return {
      ...record,
      status: classStatus,
      arrivalStatus,
      escapeReview: record.escapeReview === 'confirmed' ? 'retracted' : '',
    };
  });
}

export function applyEscapeAttendanceDecision(record, decision, { reviewedBy = '', reviewedByRole = '', note = '', reviewedAt = new Date().toISOString() } = {}) {
  if (!REVIEW_DECISIONS.has(decision)) throw new Error('إجراء المراجعة غير صالح.');
  return {
    ...record,
    status: decision === 'confirm' ? 'escaped' : record.classStatus || 'absent_unexcused',
    escapeReview: decision === 'confirm' ? 'confirmed' : 'rejected',
    reviewedBy,
    reviewedByRole,
    reviewedAt,
    reviewNote: String(note || '').trim(),
  };
}