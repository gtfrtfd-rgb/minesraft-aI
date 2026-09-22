/* ============================================================
   server.js — минимальный статический сервер без зависимостей.
   Запуск:  npm start   (или: node server.js)
   Порт:    PORT=3000 npm start
   ============================================================ */
'use strict';

const http = require('node:http');
const fs   = require('node:fs');
const path = require('node:path');
const url  = require('node:url');

const PORT = Number(process.env.PORT) || 8080;
const HOST = process.env.HOST || '0.0.0.0';
const ROOT = path.resolve(__dirname);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js':   'application/javascript; charset=utf-8',
  '.mjs':  'application/javascript; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map':  'application/json; charset=utf-8',
  '.svg':  'image/svg+xml',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif':  'image/gif',
  '.webp': 'image/webp',
  '.ico':  'image/x-icon',
  '.txt':  'text/plain; charset=utf-8',
  '.wasm': 'application/wasm'
};

function send(res, status, body, extraHeaders) {
  const headers = Object.assign(
    {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-store'
    },
    extraHeaders || {}
  );
  res.writeHead(status, headers);
  res.end(body);
}

function resolveSafe(pathname) {
  // убираем query/hash
  let p = pathname;
  // нормализуем и запрещаем выход за пределы ROOT
  const rel = path.normalize(p).replace(/^([/\\])+/, '');
  const abs = path.resolve(ROOT, rel);
  if (abs !== ROOT && !abs.startsWith(ROOT + path.sep)) return null;
  return abs;
}

const server = http.createServer((req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return send(res, 405, 'Method Not Allowed', { 'Allow': 'GET, HEAD' });
  }

  let pathname;
  try {
    pathname = decodeURIComponent(url.parse(req.url).pathname || '/');
  } catch {
    return send(res, 400, 'Bad Request');
  }

  if (pathname === '/' || pathname === '') pathname = '/index.html';

  const filePath = resolveSafe(pathname);
  if (!filePath) return send(res, 403, 'Forbidden');

  fs.stat(filePath, (err, stat) => {
    if (err || !stat.isFile()) {
      return send(res, 404, '404 Not Found');
    }

    const ext  = path.extname(filePath).toLowerCase();
    const type = MIME[ext] || 'application/octet-stream';

    res.writeHead(200, {
      'Content-Type':   type,
      'Content-Length': stat.size,
      'Cache-Control':  'no-store'
    });

    if (req.method === 'HEAD') return res.end();

    const stream = fs.createReadStream(filePath);
    stream.on('error', () => {
      if (!res.headersSent) send(res, 500, 'Internal Server Error');
      else res.destroy();
    });
    stream.pipe(res);
  });
});

server.on('error', (e) => {
  if (e.code === 'EADDRINUSE') {
    console.error(`[server] порт ${PORT} занят. Задайте другой: PORT=3000 npm start`);
  } else {
    console.error('[server] ошибка:', e);
  }
  process.exit(1);
});

server.listen(PORT, HOST, () => {
  console.log(`[server] Minecraft Web запущен: http://localhost:${PORT}`);
  console.log(`[server] корень: ${ROOT}`);
  console.log('[server] Ctrl+C для остановки');
});

// Аккуратное завершение
function shutdown() {
  console.log('\n[server] остановка…');
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 3000).unref();
}
process.on('SIGINT',  shutdown);
process.on('SIGTERM', shutdown);