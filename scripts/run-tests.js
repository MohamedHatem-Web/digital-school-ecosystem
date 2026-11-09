import fs from 'fs';
import path from 'path';

const API_KEY = 'AIzaSyBD4WFrHSJB5EjpFwsOnlPzNCxf91vEyQw';
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
    '/reset-password.html',
    '/dashboard/admin-overview.html',
    '/dashboard/media-gallery.html',
    '/dashboard/tech-devices.html',
    '/dashboard/tech-batches.html',
    '/dashboard/student-affairs.html',
    '/dashboard/teacher-portal.html',
    '/dashboard/student-portal.html',
    '/dashboard/parent-portal.html',
    '/dashboard/social-affairs.html',
    '/dashboard/unauthorized.html',
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
        body: JSON.stringify({ email: acc.email, password: 'Password@2026', returnSecureToken: true }),
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
  await checkEndpoints();
  await checkFirebaseAuth();

  const passed = testResults.filter((r) => r.passed).length;
  const total = testResults.length;
  console.log(`\n--- TEST RUN COMPLETE: ${passed} / ${total} TESTS PASSED ---`);
}

run();
