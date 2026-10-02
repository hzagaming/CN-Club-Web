<?php
declare(strict_types=1);

function database_path(): string {
    return getenv('APP_DB_PATH') ?: dirname(__DIR__) . '/var/club.sqlite';
}
function database(): PDO {
    static $connection = null;
    if ($connection instanceof PDO) return $connection;
    if (!is_file(database_path())) throw new RuntimeException('Database is not initialized.');
    $connection = new PDO('sqlite:' . database_path(), null, null, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC]);
    $connection->exec('PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');
    return $connection;
}
function respond(array $data, int $status = 200): never {
    http_response_code($status);
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR);
    exit;
}
function fail(string $message, int $status): never {
    respond(['error' => ['message' => $message]], $status);
}
function current_user(PDO $db): ?array {
    if (!isset($_SESSION['user_id'])) return null;
    $statement = $db->prepare('SELECT id, account, display_name, role FROM users WHERE id = ? AND active = 1');
    $statement->execute([$_SESSION['user_id']]);
    $user = $statement->fetch();
    if (!$user) { unset($_SESSION['user_id']); return null; }
    return ['id' => (int)$user['id'], 'account' => $user['account'], 'displayName' => $user['display_name'], 'role' => $user['role']];
}
function csrf_token(): string {
    if (!isset($_SESSION['csrf'])) $_SESSION['csrf'] = bin2hex(random_bytes(32));
    return $_SESSION['csrf'];
}
function session_response(PDO $db): never {
    respond(['data' => ['user' => current_user($db), 'csrfToken' => csrf_token()]]);
}
/** Account and source address limits remain effective across cookie/session resets. */
function reserve_login_attempt(PDO $db, string $account): void {
    $buckets = [hash('sha256', 'account:' . strtolower($account)) => 8, hash('sha256', 'ip:' . ($_SERVER['REMOTE_ADDR'] ?? 'unknown')) => 40];
    $now = time();
    $db->exec('BEGIN IMMEDIATE');
    try {
        $db->prepare('DELETE FROM login_limits WHERE expires_at <= ?')->execute([$now]);
        foreach ($buckets as $bucket => $limit) {
            $find = $db->prepare('SELECT attempts, expires_at FROM login_limits WHERE bucket = ?');
            $find->execute([$bucket]);
            $row = $find->fetch();
            if ($row && (int)$row['attempts'] >= $limit) {
                $db->exec('ROLLBACK');
                header('Retry-After: ' . max(1, (int)$row['expires_at'] - $now));
                fail('尝试次数较多，请十五分钟后再试。', 429);
            }
        }
        foreach ($buckets as $bucket => $limit) {
            $db->prepare('INSERT INTO login_limits(bucket, attempts, expires_at) VALUES (?, 1, ?) ON CONFLICT(bucket) DO UPDATE SET attempts = attempts + 1')->execute([$bucket, $now + 900]);
        }
        $db->exec('COMMIT');
    } catch (Throwable $error) {
        $db->exec('ROLLBACK');
        throw $error;
    }
}
