<?php
declare(strict_types=1);
// Called only after the shared API session is initialized.
$user = current_user($db);
if (!$user) fail('请先登录后再进入书斋。', 401);
function manuscript(PDO $db, string $id, int $author): array {
    $query = $db->prepare('SELECT id, title, category, body, status, version, updated_at, submitted_at FROM manuscripts WHERE id = ? AND author_id = ?');
    $query->execute([$id, $author]);
    $row = $query->fetch();
    if (!$row) fail('未找到这篇稿件。', 404);
    return $row;
}
if ($method === 'GET') {
    if (isset($_GET['id'])) {
        if (!is_string($_GET['id']) || strlen($_GET['id']) > 80) fail('稿件编号无效。', 422);
        respond(['data' => manuscript($db, $_GET['id'], $user['id'])]);
    }
    $query = $db->prepare('SELECT id, title, category, status, version, updated_at FROM manuscripts WHERE author_id = ? ORDER BY updated_at DESC, id ASC');
    $query->execute([$user['id']]);
    respond(['data' => ['items' => $query->fetchAll()]]);
}
if (!hash_equals(csrf_token(), $_SERVER['HTTP_X_CSRF_TOKEN'] ?? '')) fail('页面会话已更新，请刷新后重试。', 403);
if (!str_starts_with(strtolower($_SERVER['CONTENT_TYPE'] ?? ''), 'application/json')) fail('请使用 JSON 请求。', 415);
$raw = file_get_contents('php://input', false, null, 0, 65537);
if ($raw === false || strlen($raw) > 65536) fail('稿件过大，请缩短后重试。', 413);
try { $input = json_decode($raw, true, 32, JSON_THROW_ON_ERROR); }
catch (JsonException) { fail('请求格式无效。', 400); }
if (!is_array($input) || !is_string($input['id'] ?? null) || !preg_match('/\A[a-zA-Z0-9-]{16,80}\z/', $input['id']) || !is_int($input['version'] ?? null) || $input['version'] < 0) fail('稿件编号或版本无效。', 422);
$id = $input['id'];
$version = $input['version'];
if ($path === '/api/manuscripts/submit') {
    $row = manuscript($db, $id, $user['id']);
    if ($row['status'] === 'submitted' && (int)$row['version'] === $version + 1) respond(['data' => $row]);
    if ($row['status'] !== 'draft' || (int)$row['version'] !== $version) fail('稿件已变更，请重新打开后再提交。', 409);
    if (trim($row['body']) === '') fail('请先写下正文并保存。', 422);
    $query = $db->prepare("UPDATE manuscripts SET status = 'submitted', submitted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP, version = version + 1 WHERE id = ? AND author_id = ? AND version = ? AND status = 'draft'");
    $query->execute([$id, $user['id'], $version]);
    if ($query->rowCount() !== 1) fail('稿件已变更，请重新打开后再提交。', 409);
    respond(['data' => manuscript($db, $id, $user['id'])]);
}
if (!is_string($input['title'] ?? null) || !is_string($input['body'] ?? null) || !is_string($input['category'] ?? null)) fail('请完整填写作品信息。', 422);
$title = trim($input['title']);
$body = $input['body'];
if ($title === '' || strlen($title) > 240 || strlen($body) > 40000 || !in_array($input['category'], ['essay','poetry','story'], true)) fail('标题需为 1–60 字，正文最多 10000 字，请选择有效体裁。', 422);
// Unicode character limits, without requiring mbstring.
if (preg_match_all('/./us', $title) > 60 || preg_match_all('/./us', $body) > 10000) fail('标题最多 60 字，正文最多 10000 字。', 422);
if ($version === 0) {
    $db->exec('BEGIN IMMEDIATE');
    try {
        $count = $db->prepare('SELECT COUNT(*) FROM manuscripts WHERE author_id = ?');
        $count->execute([$user['id']]);
        if ((int)$count->fetchColumn() >= 100) { $db->exec('ROLLBACK'); fail('书斋暂限一百篇稿件，请联系管理员。', 422); }
        $query = $db->prepare('INSERT INTO manuscripts(id, author_id, title, category, body) VALUES (?, ?, ?, ?, ?) ON CONFLICT(id) DO NOTHING');
        $query->execute([$id, $user['id'], $title, $input['category'], $body]);
        $changed = $query->rowCount();
        $db->exec('COMMIT');
    } catch (Throwable $error) { $db->exec('ROLLBACK'); throw $error; }
} else {
    // Ownership and version are part of the write predicate, preventing cross-account writes and stale overwrites.
    manuscript($db, $id, $user['id']);
    $query = $db->prepare("UPDATE manuscripts SET title = ?, category = ?, body = ?, version = version + 1, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND author_id = ? AND version = ? AND status = 'draft'");
    $query->execute([$title, $input['category'], $body, $id, $user['id'], $version]);
    $changed = $query->rowCount();
}
if ($changed !== 1) fail('稿件已变更或已经提交。请先复制当前文字，再重新打开服务端版本。', 409);
respond(['data' => manuscript($db, $id, $user['id'])], $version === 0 ? 201 : 200);
