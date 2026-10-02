import { element } from './dom.js';
let csrfToken = '';
async function request(path, payload) {
    const response = await fetch(`/api/auth/${path}`, {
        method: payload ? 'POST' : 'GET',
        credentials: 'same-origin',
        headers: payload
            ? { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken }
            : { Accept: 'application/json' },
        body: payload ? JSON.stringify(payload) : undefined,
        signal: AbortSignal.timeout(8000),
    });
    const result = (await response.json());
    if (!response.ok || !result.data)
        throw new Error(result.error?.message || '服务暂时不可用，请稍后重试。');
    return result.data;
}
export async function login(account, password) {
    const session = await request('login', { account, password });
    csrfToken = session.csrfToken;
    return session;
}
export async function initializeAuth() {
    const form = element('#login-form');
    const account = element('#account');
    const password = element('#password');
    const submit = element('#login-submit');
    const feedback = element('#auth-feedback');
    const description = element('#auth-description');
    const panel = element('#member-panel');
    const logout = element('#logout-button');
    function display(session) {
        csrfToken = session.csrfToken;
        form.hidden = Boolean(session.user);
        panel.hidden = !session.user;
        document.querySelectorAll('[data-login]').forEach((button) => {
            button.textContent = session.user ? '我的书斋 ↗' : '社员登录 ↗';
        });
        description.textContent = session.user
            ? '欢迎回到琢光，愿你今天也有新的发现。'
            : '使用文学社分配的账号登录。暂不开放自助注册。';
        if (session.user)
            element('#member-name').textContent = session.user.displayName;
    }
    try {
        const session = await request('session');
        display(session);
    }
    catch {
        description.textContent = '当前为静态预览，账号服务未连接。你仍可阅读和收藏作品。';
        submit.textContent = '登录服务未连接';
        return;
    }
    account.disabled = password.disabled = submit.disabled = false;
    account.required = password.required = true;
    account.maxLength = 64;
    password.maxLength = 72;
    account.placeholder = '请输入社员账号';
    password.placeholder = '请输入密码';
    submit.textContent = '进入书斋';
    form.addEventListener('submit', async (event) => {
        event.preventDefault();
        if (submit.disabled || !form.reportValidity())
            return;
        submit.disabled = true;
        submit.textContent = '正在登录…';
        feedback.textContent = '';
        try {
            // Refresh CSRF/session first: another tab may have changed the session.
            csrfToken = (await request('session')).csrfToken;
            display(await login(account.value.trim(), password.value));
            password.value = '';
            feedback.textContent = '已登录。';
            logout.focus();
        }
        catch (error) {
            feedback.textContent = error instanceof Error ? error.message : '登录未成功，请稍后重试。';
        }
        finally {
            submit.disabled = false;
            submit.textContent = '进入书斋';
        }
    });
    logout.addEventListener('click', async () => {
        logout.disabled = true;
        feedback.textContent = '';
        try {
            csrfToken = (await request('session')).csrfToken;
            display(await request('logout', {}));
            password.value = '';
            feedback.textContent = '已退出登录。';
            account.focus();
        }
        catch {
            feedback.textContent = '退出未成功，请检查网络后重试。';
        }
        finally {
            logout.disabled = false;
        }
    });
}
