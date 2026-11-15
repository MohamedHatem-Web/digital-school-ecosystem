const EXCLUDED_STATUSES = new Set(['transferred_out', 'archived', 'withdrawn', 'graduated', 'homeschooled']);

const LANGUAGE_ALIASES = new Map([
  ['فرنساوي', 'فرنساوي'],
  ['فرنسي', 'فرنساوي'],
  ['الفرنسية', 'فرنساوي'],
  ['ألماني', 'ألماني'],
  ['الماني', 'ألماني'],
  ['الألمانية', 'ألماني'],
  ['الالمانية', 'ألماني'],
  ['إيطالي', 'إيطالي'],
  ['ايطالي', 'إيطالي'],
  ['الإيطالية', 'إيطالي'],
  ['الايطالية', 'إيطالي'],
]);

function getStudentGrade(student) {
  const explicitGrade = String(student.gradeName || student.stage || '').trim();
  if (explicitGrade) return explicitGrade;
  return String(student.grade || '').split(/\s*[—–-]\s*/)[0].trim();
}

function normalizeGender(value) {
  const gender = String(value || '').trim();
  if (['ذكر', 'ولد', 'ذكر'].includes(gender)) return 'ذكر';
  if (['أنثى', 'انثى', 'بنت'].includes(gender)) return 'أنثى';
  return '';
}

function normalizeReligion(value) {
  const religion = String(value || '').trim();
  if (['مسيحي', 'مسيحية', 'مسيحيه'].includes(religion)) return 'مسيحي';
  if (['مسلم', 'مسلمة', 'مسلمه'].includes(religion)) return 'مسلم';
  return religion;
}

function hashKey(value) {
  let hash = 2166136261;
  for (const character of value) {
    hash ^= character.codePointAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function splitIntoSections(students, sectionSize) {
  const sections = [];
  for (let index = 0; index < students.length; index += sectionSize) {
    sections.push(students.slice(index, index + sectionSize));
  }
  return sections;
}

export function buildClassAllocation(students, { grade, academicYear, maxPerGender = 25 } = {}) {
  const targetGrade = String(grade || '').trim();
  const targetYear = String(academicYear || '').trim();
  if (!targetGrade || !/^\d{4}\/\d{4}$/.test(targetYear)) {
    throw new Error('حدد الصف والعام الدراسي بصيغة صحيحة.');
  }
  if (!Number.isInteger(maxPerGender) || maxPerGender < 1) {
    throw new Error('الحد الأقصى لكل نوع يجب أن يكون رقمًا صحيحًا موجبًا.');
  }

  const candidates = (students || []).filter((student) =>
    getStudentGrade(student) === targetGrade &&
    (!student.academicYear || student.academicYear === targetYear) &&
    !EXCLUDED_STATUSES.has(student.status || 'enrolled'));
  const missingData = [];
  const groups = new Map();

  for (const student of candidates) {
    const gender = normalizeGender(student.gender);
    const religion = normalizeReligion(student.religion);
    const rawLanguage = String(student.secondLanguage || '').trim();
    const secondLanguage = LANGUAGE_ALIASES.get(rawLanguage);
    if (!gender || !religion || !secondLanguage) {
      missingData.push({
        code: String(student.code || student.studentCode || ''),
        name: String(student.name || student.studentName || ''),
        missing: [!gender && 'النوع', !religion && 'الديانة', !secondLanguage && 'اللغة الثانية'].filter(Boolean),
      });
      continue;
    }

    const key = `${targetGrade}|${secondLanguage}|${religion}`;
    if (!groups.has(key)) groups.set(key, { secondLanguage, religion, boys: [], girls: [] });
    groups.get(key)[gender === 'ذكر' ? 'boys' : 'girls'].push(student);
  }

  const classes = [];
  const assignments = [];
  const sortedGroups = [...groups.entries()].sort(([left], [right]) => left.localeCompare(right, 'ar'));

  sortedGroups.forEach(([groupKey, group], groupIndex) => {
    const sortByName = (left, right) =>
      String(left.name || left.studentName || '').localeCompare(String(right.name || right.studentName || ''), 'ar');
    const boysSections = splitIntoSections(group.boys.sort(sortByName), maxPerGender);
    const girlsSections = splitIntoSections(group.girls.sort(sortByName), maxPerGender);
    const sectionCount = Math.max(boysSections.length, girlsSections.length);
    const groupHash = hashKey(groupKey);

    for (let index = 0; index < sectionCount; index += 1) {
      const sectionNumber = String(index + 1).padStart(2, '0');
      const sectionName = `${targetGrade} — ${group.secondLanguage} — ${group.religion} — فصل ${index + 1}`;
      const classId = `alloc_${targetYear.replace('/', '_')}_${groupIndex + 1}_${groupHash}_${sectionNumber}`;
      const boys = boysSections[index] || [];
      const girls = girlsSections[index] || [];
      const classRecord = {
        id: classId,
        name: sectionName,
        grade: targetGrade,
        academicYear: targetYear,
        secondLanguage: group.secondLanguage,
        religion: group.religion,
        boysCount: boys.length,
        girlsCount: girls.length,
        studentCount: boys.length + girls.length,
        allocationManaged: true,
      };
      classes.push(classRecord);

      for (const student of [...boys, ...girls]) {
        assignments.push({
          code: String(student.code || student.studentCode || ''),
          classId,
          className: sectionName,
          grade: sectionName,
          gradeName: targetGrade,
          academicYear: targetYear,
          secondLanguage: group.secondLanguage,
          religion: group.religion,
        });
      }
    }
  });

  return {
    grade: targetGrade,
    academicYear: targetYear,
    classes,
    assignments,
    missingData,
    eligibleCount: assignments.length,
  };
}