"""Real PHP + SQLite HTTP integration checks. Creates only a temporary database."""
import http.cookiejar
import json
import os
from pathlib import Path
import secrets
import shutil
import socket
import sqlite3
import subprocess
import tempfile
import time
import urllib.error
import urllib.request

ROOT = Path(__file__).resolve().parent.parent
PHP = os.environ.get('PHP_BIN', 'php')
if not shutil.which(PHP):
    raise SystemExit('未找到 PHP。请安装 PHP 8.3+（PDO SQLite），或设置 PHP_BIN。')

with tempfile.TemporaryDirectory(prefix='zhuoguang-test-') as folder:
    db_path = Path(folder) / 'test.sqlite'
    env = {**os.environ, 'APP_DB_PATH': str(db_path), 'APP_ENV': 'development'}
    def cli(*args, password=None):
        return subprocess.run([PHP, 'server/manage.php', *args], input=password, text=True, cwd=ROOT, env=env, capture_output=True)
    assert cli('init').returncode == 0
    assert cli('init').returncode == 0, 'initialization must be idempotent'
    password = secrets.token_urlsafe(24)
    assert cli('create-user', 'reader', '测试读者', 'member', password=password + '\n').returncode == 0
    assert cli('create-user', 'reader', '重复账号', password=password + '\n').returncode != 0
    with sqlite3.connect(db_path) as db:
        assert db.execute('SELECT password_hash FROM users').fetchone()[0] != password
        assert db.execute('PRAGMA user_version').fetchone()[0] == 2
        try:
            db.execute("INSERT INTO users(account,display_name,password_hash,role) VALUES ('invalid','x','x','owner')")
            raise AssertionError('SQL role constraint missing')
        except sqlite3.IntegrityError:
            pass
    with socket.socket() as sock:
        sock.bind(('127.0.0.1', 0))
        port = sock.getsockname()[1]
    with open(Path(folder) / 'server.log', 'w+') as log:
        process = subprocess.Popen([PHP, '-d', f'session.save_path={folder}', '-S', f'127.0.0.1:{port}', '-t', 'public', 'server/router.php'], cwd=ROOT, env=env, stdout=log, stderr=log)
        jar = http.cookiejar.CookieJar()
        client = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))
        base = f'http://127.0.0.1:{port}'
        def request(path, data=None, token=None, method=None, raw=None, opener=client):
            headers = {}
            if token: headers['X-CSRF-Token'] = token
            if data is not None or raw is not None: headers['Content-Type'] = 'application/json'
            body = json.dumps(data).encode() if data is not None else raw
            req = urllib.request.Request(base + path, data=body, headers=headers, method=method)
            try: result = opener.open(req, timeout=8)
            except urllib.error.HTTPError as error: result = error
            text = result.read().decode()
            try: content = json.loads(text)
            except json.JSONDecodeError: content = text
            return result.status, content, result.headers
        try:
            for _ in range(100):
                try:
                    if request('/')[0] == 200: break
                except OSError: time.sleep(0.05)
            else: raise AssertionError('PHP server failed to start')
            status, session, headers = request('/api/auth/session')
            assert status == 200 and session['data']['user'] is None
            csrf = session['data']['csrfToken']
            assert len(csrf) == 64 and 'HttpOnly' in headers['Set-Cookie'] and 'SameSite=Lax' in headers['Set-Cookie']
            before_cookie = next(iter(jar)).value
            assert request('/api/auth/login', method='GET')[0] == 405
            assert request('/api/auth/login', {'account': 'reader', 'password': password})[0] == 403
            assert request('/api/auth/login', raw=b'{', token=csrf)[0] == 400
            assert request('/api/auth/login', raw=b' ' * 9000, token=csrf)[0] == 413
            assert request('/api/auth/login', {'account': [], 'password': password}, csrf)[0] == 422
            assert request('/api/auth/login', {'account': "' OR 1=1 --", 'password': password}, csrf)[0] == 422
            assert request('/api/auth/login', {'account': 'reader', 'password': 'wrong'}, csrf)[0] == 401
            status, logged, _ = request('/api/auth/login', {'account': 'reader', 'password': password}, csrf)
            assert status == 200 and logged['data']['user']['displayName'] == '测试读者'
            assert 'password_hash' not in logged['data']['user']
            assert next(iter(jar)).value != before_cookie, 'session fixation protection'
            assert logged['data']['csrfToken'] != csrf, 'CSRF rotation'
            assert request('/api/auth/session')[1]['data']['user']['account'] == 'reader'
            write_csrf = logged['data']['csrfToken']
            draft = {'id': 'draft-integration-0001', 'version': 0, 'title': '我的第一篇', 'category': 'essay', 'body': '窗外的风，翻过书页。'}
            assert request('/api/manuscripts', draft)[0] == 403
            code, result, _ = request('/api/manuscripts', draft, write_csrf)
            assert code == 201 and result['data']['version'] == 1
            assert request('/api/manuscripts')[1]['data']['items'][0]['title'] == draft['title']
            assert request('/api/manuscripts?id=' + draft['id'])[1]['data']['body'] == draft['body']
            assert request('/api/manuscripts', draft, write_csrf)[0] == 409
            draft['version'] = 1
            draft['body'] = '修改过的正文。'
            code, result, _ = request('/api/manuscripts', draft, write_csrf)
            assert code == 200 and result['data']['version'] == 2
            assert request('/api/manuscripts/submit', {'id': draft['id'], 'version': 1}, write_csrf)[0] == 409
            code, submitted, _ = request('/api/manuscripts/submit', {'id': draft['id'], 'version': 2}, write_csrf)
            assert code == 200 and submitted['data']['status'] == 'submitted'
            assert request('/api/manuscripts/submit', {'id': draft['id'], 'version': 2}, write_csrf)[0] == 200
            draft['version'] = 3
            assert request('/api/manuscripts', draft, write_csrf)[0] == 409
            assert cli('create-user', 'other', '另一位社员', password=password + '\n').returncode == 0
            other = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
            token2 = request('/api/auth/session', opener=other)[1]['data']['csrfToken']
            other_session = request('/api/auth/login', {'account': 'other', 'password': password}, token2, opener=other)[1]['data']
            assert request('/api/manuscripts', opener=other)[1]['data']['items'] == []
            assert request('/api/manuscripts?id=' + draft['id'], opener=other)[0] == 404
            assert request('/api/manuscripts', draft, other_session['csrfToken'], opener=other)[0] == 404
            assert request('/api/manuscripts/submit', {'id': draft['id'], 'version': 3}, other_session['csrfToken'], opener=other)[0] == 404

            assert request('/api/auth/logout', {}, csrf)[0] == 403
            assert request('/api/auth/logout', {}, logged['data']['csrfToken'])[1]['data']['user'] is None
            assert request('/api/manuscripts')[0] == 401
            status, session, _ = request('/api/auth/session')
            csrf = session['data']['csrfToken']
            with sqlite3.connect(db_path) as db: db.execute('UPDATE users SET active = 0 WHERE account = ?', ('reader',))
            assert request('/api/auth/login', {'account': 'reader', 'password': password}, csrf)[0] == 401
            with sqlite3.connect(db_path) as db: db.execute('UPDATE users SET active = 1 WHERE account = ?', ('reader',))
            # Rate limit persists even if a client discards its cookie.
            assert request('/api/auth/login', {'account': 'missing', 'password': 'wrong'}, csrf)[0] == 401
            with sqlite3.connect(db_path) as db: db.execute('UPDATE login_limits SET attempts = 100')
            new_client = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
            token = request('/api/auth/session', opener=new_client)[1]['data']['csrfToken']
            status, _, headers = request('/api/auth/login', {'account': 'missing', 'password': 'wrong'}, token, opener=new_client)
            assert status == 429 and int(headers['Retry-After']) > 0
            with sqlite3.connect(db_path) as db: db.execute('UPDATE login_limits SET expires_at = 0')
            assert request('/api/auth/login', {'account': 'missing', 'password': 'wrong'}, token, opener=new_client)[0] == 401
            for path in ['/database/schema.sql', '/server/bootstrap.php', '/var/club.sqlite', '/.env', '/%2e%2e/server/api.php']:
                assert request(path)[0] == 404, f'private path exposed: {path}'
            assert request('/index-lite.html')[0] == 200
            assert request('/js/main.js')[0] == 200
            assert request('/api/unknown')[0] == 404
            print('PASS: real PHP/SQLite initialization, account hashing, login/logout, CSRF, session rotation, validation, rate limiting, manuscript lifecycle, ownership isolation and stale-write protection')
        finally:
            process.terminate()
            try: process.wait(timeout=5)
            except subprocess.TimeoutExpired: process.kill(); process.wait()
