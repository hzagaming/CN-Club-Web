import { mkdir, cp, copyFile } from 'node:fs/promises';
await mkdir('public', { recursive: true });
// Explicit allowlist: never publish SQL, PHP internals, tests, .env or database files.
for (const name of [
  'index.html',
  'index-lite.html',
  'style.css',
  'classical.css',
  'experience.css',
  'motion.css',
  'lite.css',
]) {
  await copyFile(name, `public/${name}`);
}
for (const name of ['assets', 'js']) await cp(name, `public/${name}`, { recursive: true });
console.log('已生成 public/，可静态托管或连接 PHP 路由。');
