// Backend integration boundary. Keep disabled until a real service is available.
export const authConfig = Object.freeze({ enabled: false, baseUrl: '/api/auth' });

export async function login({ account, password }) {
  if (!authConfig.enabled) throw new Error('社员登录尚未开放');
  const response = await fetch(`${authConfig.baseUrl}/login`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ account, password }),
  });
  if (!response.ok) throw new Error('登录未成功，请检查账号或稍后重试');
  return response.json();
}
