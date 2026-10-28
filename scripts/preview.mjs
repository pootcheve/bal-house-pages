import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(fileURLToPath(new URL('../', import.meta.url)));
const port = Number(process.env.PORT || 4174);
const types = { '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.css':'text/css; charset=utf-8', '.svg':'image/svg+xml', '.webp':'image/webp', '.avif':'image/avif', '.png':'image/png', '.woff2':'font/woff2', '.xml':'application/xml', '.webmanifest':'application/manifest+json', '.txt':'text/plain; charset=utf-8' };

http.createServer(async (request, response) => {
  if (!['GET','HEAD'].includes(request.method)) { response.writeHead(405).end(); return; }
  try {
    const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    const parts = pathname.split('/');
    if (parts.some(part => part.startsWith('.') && part !== '') || ['scripts','content','node_modules'].includes(parts[1])) {
      response.writeHead(403).end(); return;
    }
    let file = path.resolve(root, '.' + pathname);
    if (file !== root && !file.startsWith(root + path.sep)) { response.writeHead(403).end(); return; }
    if ((await stat(file).catch(() => null))?.isDirectory()) file = path.join(file, 'index.html');
    let body;
    let status = 200;
    try { body = await readFile(file); }
    catch { body = await readFile(path.join(root, '404.html')); status = 404; file = '404.html'; }
    response.writeHead(status, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream', 'Cache-Control':'no-store' });
    response.end(request.method === 'HEAD' ? undefined : body);
  } catch { response.writeHead(400).end(); }
}).listen(port, '127.0.0.1', () => console.log(`Local: http://127.0.0.1:${port}/`));
