import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
const root = resolve('public');
const types = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
};
http
  .createServer(async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'no-store');
    if (!['GET', 'HEAD'].includes(req.method)) {
      res.writeHead(405).end();
      return;
    }
    let pathname;
    try {
      pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    } catch {
      res.writeHead(400).end();
      return;
    }
    if (pathname.startsWith('/api/')) {
      res
        .writeHead(503, { 'Content-Type': 'application/json' })
        .end(JSON.stringify({ error: { message: 'PHP 账号服务未连接' } }));
      return;
    }
    const target = resolve(root, `.${pathname === '/' ? '/index.html' : pathname}`);
    if (!target.startsWith(root + sep)) {
      res.writeHead(403).end();
      return;
    }
    try {
      if (!(await stat(target)).isFile()) throw new Error();
      res.writeHead(200, { 'Content-Type': types[extname(target)] || 'application/octet-stream' });
      res.end(req.method === 'HEAD' ? undefined : await readFile(target));
    } catch {
      res
        .writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' })
        .end('这一页尚未写下。请返回首页。');
    }
  })
  .listen(Number(process.env.PORT || 5173), '127.0.0.1', () =>
    console.log('琢光预览：http://127.0.0.1:' + (process.env.PORT || 5173)),
  );
