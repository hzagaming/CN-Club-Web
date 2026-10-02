<?php
declare(strict_types=1);
// Use: php -S 127.0.0.1:8080 -t public server/router.php
header("Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'");
$path = rawurldecode(parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?: '/');
if (str_starts_with($path, '/api/')) { require __DIR__ . '/api.php'; return; }
$root = realpath(dirname(__DIR__) . '/public');
$file = $root ? realpath($root . ($path === '/' ? '/index.html' : $path)) : false;
if (!$root || !$file || !str_starts_with($file, $root . DIRECTORY_SEPARATOR) || !is_file($file)) {
    http_response_code(404);
    header('Content-Type: text/plain; charset=utf-8');
    echo '这一页尚未写下。请返回首页。';
    return;
}
$types = ['html' => 'text/html; charset=utf-8', 'css' => 'text/css; charset=utf-8', 'js' => 'text/javascript; charset=utf-8', 'svg' => 'image/svg+xml'];
$extension = pathinfo($file, PATHINFO_EXTENSION);
if (!isset($types[$extension])) { http_response_code(404); return; }
if (!in_array($_SERVER['REQUEST_METHOD'], ['GET','HEAD'], true)) { http_response_code(405); return; }
header('Content-Type: ' . $types[$extension]);
header('X-Content-Type-Options: nosniff');
header('Referrer-Policy: strict-origin-when-cross-origin');
header('Cache-Control: no-cache');
if ($_SERVER['REQUEST_METHOD'] !== 'HEAD') readfile($file);
