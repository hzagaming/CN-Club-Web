<?php
declare(strict_types=1);
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }
require __DIR__ . '/bootstrap.php';
try {
    $command = $argv[1] ?? '';
    if ($command === 'init') {
        $directory = dirname(database_path());
        if (!is_dir($directory)) mkdir($directory, 0700, true);
        $db = new PDO('sqlite:' . database_path(), null, null, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
        $db->exec(file_get_contents(dirname(__DIR__) . '/database/schema.sql'));
        chmod(database_path(), 0600);
        echo "数据库已初始化。\n";
    } elseif ($command === 'create-user') {
        [$account, $name, $role] = [$argv[2] ?? '', $argv[3] ?? '', $argv[4] ?? 'member'];
        if (!preg_match('/\A[A-Za-z0-9_.-]{3,64}\z/', $account) || strlen($name) < 1 || strlen($name) > 240 || !in_array($role, ['member','editor','admin'], true)) throw new RuntimeException('账号需为 3–64 位字母、数字、下划线、点或横线；请填写姓名和有效角色。');
        // Read one password from standard input: never put it in command arguments.
        if (stream_isatty(STDIN)) throw new RuntimeException('请通过标准输入管道传入密码，避免终端回显。参见 README。');
        $password = rtrim(fgets(STDIN, 130) ?: '', "\r\n");
        if (strlen($password) < 12 || strlen($password) > 72) throw new RuntimeException('密码需为 12–72 字节。');
        $statement = database()->prepare('INSERT INTO users(account, display_name, password_hash, role) VALUES (?, ?, ?, ?)');
        $statement->execute([$account, $name, password_hash($password, PASSWORD_DEFAULT), $role]);
        echo "账号已创建。\n";
    } else {
        fwrite(STDERR, "用法：php server/manage.php init | create-user <account> <name> [member|editor|admin]\n");
        exit(1);
    }
} catch (Throwable $error) { fwrite(STDERR, $error->getMessage() . "\n"); exit(1); }
