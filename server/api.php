<?php
declare(strict_types=1);
require __DIR__ . '/bootstrap.php';
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');

try {
    $path = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH);
    $method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
    $methods = ['/api/auth/session' => 'GET', '/api/auth/login' => 'POST', '/api/auth/logout' => 'POST'];
    if (!isset($methods[$path])) fail('接口不存在。', 404);
    if ($method !== $methods[$path]) { header('Allow: ' . $methods[$path]); fail('请求方法不支持。', 405); }
    $db = database();
    ini_set('session.use_strict_mode', '1');
    ini_set('session.use_only_cookies', '1');
    session_name('zhuoguang_session');
    $secure = getenv('APP_ENV') === 'production' || (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off');
    session_set_cookie_params(['lifetime' => 0, 'path' => '/', 'secure' => $secure, 'httponly' => true, 'samesite' => 'Lax']);
    session_start();
    if (isset($_SESSION['last_seen']) && time() - (int)$_SESSION['last_seen'] > 7200) {
        $_SESSION = [];
        session_regenerate_id(true);
    }
    $_SESSION['last_seen'] = time();
    if ($method === 'GET') session_response($db);
    $token = $_SERVER['HTTP_X_CSRF_TOKEN'] ?? '';
    if (!$token || !hash_equals(csrf_token(), $token)) fail('页面会话已更新，请重试。', 403);
    if ($path === '/api/auth/logout') {
        $_SESSION = [];
        session_regenerate_id(true);
        session_response($db);
    }
    if (!str_starts_with(strtolower($_SERVER['CONTENT_TYPE'] ?? ''), 'application/json')) fail('请使用 JSON 请求。', 415);
    if ((int)($_SERVER['CONTENT_LENGTH'] ?? 0) > 8192) fail('请求过大。', 413);
    $raw = file_get_contents('php://input', false, null, 0, 8193);
    if ($raw === false || strlen($raw) > 8192) fail('请求过大。', 413);
    try { $input = json_decode($raw, true, 32, JSON_THROW_ON_ERROR); }
    catch (JsonException) { fail('请求格式无效。', 400); }
    if (!is_array($input) || !is_string($input['account'] ?? null) || !is_string($input['password'] ?? null)) fail('请填写账号和密码。', 422);
    $account = trim($input['account']);
    $password = $input['password'];
    if (!preg_match('/\A[A-Za-z0-9_.-]{3,64}\z/', $account) || strlen($password) < 1 || strlen($password) > 72) fail('账号或密码格式不正确。', 422);
    reserve_login_attempt($db, $account);
    $query = $db->prepare('SELECT id, password_hash, active FROM users WHERE account = ?');
    $query->execute([$account]);
    $user = $query->fetch();
    // Fixed dummy bcrypt hash makes unknown-account checks perform password verification too.
    $dummy = '$2y$12$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2uheWG/igi.';
    $valid = password_verify($password, $user ? $user['password_hash'] : $dummy);
    if (!$user || !$valid || (int)$user['active'] !== 1) fail('账号或密码不正确。', 401);
    if (password_needs_rehash($user['password_hash'], PASSWORD_DEFAULT)) {
        $db->prepare('UPDATE users SET password_hash = ? WHERE id = ?')->execute([password_hash($password, PASSWORD_DEFAULT), $user['id']]);
    }
    $db->prepare('DELETE FROM login_limits WHERE bucket = ?')->execute([hash('sha256', 'account:' . strtolower($account))]);
    session_regenerate_id(true);
    $_SESSION = ['user_id' => (int)$user['id'], 'csrf' => bin2hex(random_bytes(32)), 'last_seen' => time()];
    session_response($db);
} catch (Throwable $error) {
    error_log('Zhuoguang API error: ' . $error->getMessage());
    fail('账号服务暂不可用，请稍后重试。', 503);
}
