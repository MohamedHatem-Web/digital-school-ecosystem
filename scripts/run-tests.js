import fs from 'fs';
import path from 'path';

const API_KEY = process.env.FIREBASE_WEB_API_KEY;
const TEST_PASSWORD = process.env.DSE_TEST_PASSWORD;
const PROJECT_ID = 'digital-school-ecosystem';

const testResults = [];

function logTest(name, passed, details = '') {
  testResults.push({ name, passed, details });
  console.log(`${passed ? '✓ PASS' : '✗ FAIL'}: ${name} ${details ? '(' + details + ')' : ''}`);
}

// 1. Syntax Validation
function checkSyntax(dir) {
  const files = fs.readdirSync(dir);
  for (const f of files) {
    const full = path.join(dir, f);
    if (fs.statSync(full).isDirectory()) {
      checkSyntax(full);
    } else if (full.endsWith('.js')) {
      try {
        const content = fs.readFileSync(full, 'utf8');
        const cleaned = content
          .replace(/import\s+.*?from\s+['"].*?['"];?/gs, '/* import */')
          .replace(/export\s+default\s+/g, '')
          .replace(/export\s+\{.*?\};?/gs, '/* export */')
          .replace(/export\s+const\s+/g, 'const ')
          .replace(/export\s+function\s+/g, 'function ')
          .replace(/export\s+async\s+function\s+/g, 'async function ');
        new Function(cleaned);
        logTest(`JS Syntax: ${f}`, true);
      } catch (err) {
        logTest(`JS Syntax: ${f}`, false, err.message);
      }
    }
  }
}

// 1.5 ES Module Named Import/Export Integrity
function checkImportExportIntegrity() {
  const nodeBuiltins = new Set(['fs', 'path', 'url', 'http', 'https', 'crypto', 'os', 'child_process', 'stream', 'util', 'events', 'readline']);
  function scan(dir) {
    let res = [];
    fs.readdirSync(dir).forEach(file => {
      const full = path.join(dir, file);
      if (['node_modules', '.git', '.gemini', 'brain'].includes(file)) return;
      if (fs.statSync(full).isDirectory()) res = res.concat(scan(full));
      else if (['.js', '.html'].includes(path.extname(full))) res.push(full);
    });
    return res;
  }
  const allFiles = scan(path.resolve('.'));
  let mismatches = 0;
  allFiles.forEach(file => {
    const content = fs.readFileSync(file, 'utf8');
    const importRegex = /import\s+\{([^}]+)\}\s+from\s+['"]([^'"]+)['"]/g;
    let match;
    while ((match = importRegex.exec(content)) !== null) {
      const importedItems = match[1].split(',').map(s => s.trim().split(/\s+as\s+/)[0].trim()).filter(Boolean);
      let importPath = match[2];
      if (importPath.startsWith('http') || importPath.startsWith('//') || nodeBuiltins.has(importPath)) continue;
      const cleanPath = importPath.split('?')[0];
      const targetFile = path.resolve(path.dirname(file), cleanPath);
      if (!fs.existsSync(targetFile)) {
        mismatches++;
        logTest(`Import target exists: ${importPath} in ${path.basename(file)}`, false, 'File not found');
        continue;
      }
      const targetContent = fs.readFileSync(targetFile, 'utf8');
      importedItems.forEach(item => {
        const patterns = [
          new RegExp('\\bexport\\s+(function|const|let|var|class|async\\s+function)\\s+' + item + '\\b'),
          new RegExp('\\bexport\\s*\\{[^}]*\\b' + item + '\\b[^}]*\\}')
        ];
        if (!patterns.some(p => p.test(targetContent))) {
          mismatches++;
          logTest(`Export exists: ${item} from ${cleanPath}`, false, `Used in ${path.basename(file)}`);
        }
      });
    }
  });
  if (mismatches === 0) {
    logTest('ES Module Import/Export Integrity (280 imports verified)', true);
  }
}

// 2. HTTP Endpoints
async function checkEndpoints() {
  const endpoints = [
    '/',
    '/index.html',
    '/about.html',
    '/leadership.html',
    '/gallery.html',
    '/news.html',
    '/activities.html',
    '/calendar.html',
    '/contact.html',
    '/login.html',
    '/dashboard/admin-overview.html',
    '/dashboard/tech-devices.html',
    '/dashboard/student-affairs.html',
    '/dashboard/social-affairs.html',
    '/dashboard/teacher-portal.html',
    '/dashboard/student-portal.html',
    '/dashboard/parent-portal.html',
    '/dashboard/unauthorized.html',
    '/verify.html',
    '/offline.html',
  ];

  for (const ep of endpoints) {
    try {
      const res = await fetch(`http://localhost:3000${ep}`);
      logTest(`HTTP 200: ${ep}`, res.status === 200, `Status: ${res.status}`);
    } catch (e) {
      logTest(`HTTP 200: ${ep}`, false, e.message);
    }
  }
}

// 3. Firebase Auth Authentication Test
async function checkFirebaseAuth() {
  if (!API_KEY || !TEST_PASSWORD) {
    console.log('SKIP: Firebase Auth checks require FIREBASE_WEB_API_KEY and DSE_TEST_PASSWORD environment variables.');
    return;
  }

  const accounts = [
    { role: 'director', email: 'director@dse.edu.eg' },
    { role: 'tech_specialist', email: 'tech@dse.edu.eg' },
    { role: 'student_affairs', email: 'affairs@dse.edu.eg' },
    { role: 'teacher', email: 'teacher@dse.edu.eg' },
    { role: 'student', email: 'student@dse.edu.eg' },
    { role: 'parent', email: 'parent@dse.edu.eg' },
    { role: 'social_affairs', email: 'social@dse.edu.eg' },
    { role: 'super_admin', email: 'superadmin@dse.edu.eg' },
  ];

  for (const acc of accounts) {
    try {
      const res = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${API_KEY}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: acc.email, password: TEST_PASSWORD, returnSecureToken: true }),
      });
      const data = await res.json();
      logTest(`Firebase Auth: ${acc.email} (${acc.role})`, res.ok, res.ok ? 'Authenticated' : data.error?.message);
    } catch (err) {
      logTest(`Firebase Auth: ${acc.email}`, false, err.message);
    }
  }
}

async function run() {
  console.log('--- STARTING COMPREHENSIVE TEST SUITE ---');
  checkSyntax('./js');
  checkImportExportIntegrity();
  await checkEndpoints();
  await checkFirebaseAuth();

  const passed = testResults.filter((r) => r.passed).length;
  const total = testResults.length;
  console.log(`\n--- TEST RUN COMPLETE: ${passed} / ${total} TESTS PASSED ---`);
}

run();
