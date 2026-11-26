// Lightweight Native Static Web Server (Zero External Dependencies)
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PORT = Number(process.env.PORT) || 3000;

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
};

const PLATFORM_PAGE_ROUTES = new Map([
  ['/platform/about', '/platform-about.html'],
  ['/platform/guide', '/platform-guide.html'],
  ['/platform/terms', '/platform-terms.html'],
  ['/platform/start', '/platform-start.html'],
]);

const server = http.createServer((req, res) => {
  let reqPath = decodeURI(req.url.split('?')[0]);
  if (PLATFORM_PAGE_ROUTES.has(reqPath)) reqPath = PLATFORM_PAGE_ROUTES.get(reqPath);
  const tenantActualRequest = req.headers['x-dse-tenant-actual'];
  const reservedPublicPaths = new Set(['/login.html', '/about.html', '/activities.html', '/calendar.html', '/contact.html', '/gallery.html', '/leadership.html', '/news.html', '/offline.html', '/verify.html']);
  if (!tenantActualRequest && (reservedPublicPaths.has(reqPath) || reqPath === '/dashboard' || reqPath.startsWith('/dashboard/'))) {
    res.writeHead(302, { Location: '/', 'Cache-Control': 'no-store' });
    res.end();
    return;
  }
  if (reqPath === '/platform-admin' || reqPath === '/platform-admin/') reqPath = '/platform-admin/login.html';
  else if (reqPath === '/' || reqPath === '/index.html') reqPath = '/index.html';
  else {
    const segments = reqPath.split('/').filter(Boolean);
    const reserved = new Set(['index.html', 'login.html', 'about.html', 'activities.html', 'calendar.html', 'contact.html', 'gallery.html', 'leadership.html', 'news.html', 'offline.html', 'verify.html', 'dashboard', 'js', 'css', 'images', 'evidence', 'api', 'platform', 'platform-admin']);
    if (!reserved.has(segments[0]) && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(segments[0] || '')) {
      if (segments.length === 1) reqPath = '/index.html';
      else reqPath = `/${segments.slice(1).join('/')}`;
    }
  }

  let filePath = path.join(__dirname, reqPath);

  // Clean URL resolution: if /about or /login requested without extension, serve .html
  if (!path.extname(filePath)) {
    if (fs.existsSync(filePath + '.html')) {
      filePath = filePath + '.html';
    } else if (fs.existsSync(path.join(filePath, 'index.html'))) {
      filePath = path.join(filePath, 'index.html');
    }
  }

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end('<h1>404 — الصفحة غير موجودة</h1>');
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    const headers = {
      'Content-Type': contentType,
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'SAMEORIGIN',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      'Service-Worker-Allowed': '/',
    };

    if (['.html', '.js', '.css', '.json', '.webmanifest'].includes(ext)) {
      headers['Cache-Control'] = 'no-cache, no-store, must-revalidate, max-age=0';
      headers['Pragma'] = 'no-cache';
      headers['Expires'] = '0';
    } else if (['.png', '.jpg', '.svg', '.webp', '.ico'].includes(ext)) {
      headers['Cache-Control'] = 'public, max-age=86400';
    }

    res.writeHead(200, headers);
    fs.createReadStream(filePath).pipe(res);
  });
});

server.listen(PORT, () => {
  console.log(`Vanilla Web Server is running at http://localhost:${PORT}`);
});

