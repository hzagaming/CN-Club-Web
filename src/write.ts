import { element } from './dom.js';
import type { Member } from './auth.js';

type Category = 'essay' | 'poetry' | 'story';
interface Manuscript {
  id: string;
  title: string;
  category: Category;
  body: string;
  status: 'draft' | 'submitted';
  version: number;
  updated_at?: string;
}
interface Session {
  user: Member | null;
  csrfToken: string;
}
const title = element<HTMLInputElement>('#draft-title');
const category = element<HTMLSelectElement>('#draft-category');
const body = element<HTMLTextAreaElement>('#draft-body');
const form = element<HTMLFormElement>('#writing-form');
const feedback = element('#save-status');
const list = element('#draft-list');
const saveButton = element<HTMLButtonElement>('#save-draft');
const submitButton = element<HTMLButtonElement>('#submit-draft');
const confirm = element<HTMLDialogElement>('#confirm-submit');
let memberId: number | null = null;
let current: Manuscript = blank();
let dirty = false;
let busy = false;
let listRequest = 0;

function blank(): Manuscript {
  const random = [...crypto.getRandomValues(new Uint8Array(16))]
    .map((value) => value.toString(16).padStart(2, '0'))
    .join('');
  return {
    id: `draft-${random}`,
    title: '',
    category: 'essay',
    body: '',
    status: 'draft',
    version: 0,
  };
}
async function api<T>(path: string, payload?: unknown): Promise<T> {
  let csrf = '';
  if (payload !== undefined) {
    const session = await api<Session>('/api/auth/session');
    if (!session.user || session.user.id !== memberId)
      throw new Error('登录账号已改变或会话已过期。请先下载文字备份，再重新登录。');
    csrf = session.csrfToken;
  }
  const response = await fetch(path, {
    method: payload === undefined ? 'GET' : 'POST',
    credentials: 'same-origin',
    headers:
      payload === undefined
        ? { Accept: 'application/json' }
        : { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf },
    body: payload === undefined ? undefined : JSON.stringify(payload),
    signal: AbortSignal.timeout(12000),
  }).catch(() => {
    throw new Error('网络连接未完成，请重试。未保存的文字仍在当前页面。');
  });
  const result = (await response.json().catch(() => {
    throw new Error('书斋服务暂时无法连接，请稍后重试。');
  })) as { data?: T; error?: { message?: string } };
  if (!response.ok || result.data === undefined)
    throw new Error(result.error?.message || '服务暂不可用，请稍后重试。');
  return result.data;
}
function message(error: unknown): void {
  feedback.textContent =
    error instanceof Error ? error.message : '操作未完成，文字仍保留在页面中。';
}
function controls(): void {
  const locked = busy || current.status === 'submitted';
  title.disabled = category.disabled = locked;
  body.disabled = busy;
  body.readOnly = current.status === 'submitted';
  saveButton.disabled = locked || (!dirty && current.version > 0);
  saveButton.setAttribute('aria-busy', String(busy));
  form.setAttribute('aria-busy', String(busy));
  saveButton.textContent = busy ? '处理中…' : '保存草稿';
  submitButton.disabled = locked || dirty || current.version === 0 || !body.value.trim();
  element<HTMLButtonElement>('#new-draft').disabled = busy;
  element<HTMLButtonElement>('#refresh-drafts').disabled = busy;
  list.querySelectorAll('button').forEach((button) => (button.disabled = busy));
  element('#word-count').textContent = `${[...body.value].length} / 10000 字`;
  element('#draft-state').textContent =
    current.status === 'submitted'
      ? '已提交 · 只读'
      : dirty
        ? '有未保存的修改'
        : current.version
          ? '已保存到服务器'
          : '新稿 · 尚未保存';
  list
    .querySelectorAll<HTMLButtonElement>('button')
    .forEach((button) =>
      button.setAttribute('aria-current', String(button.dataset.id === current.id)),
    );
}
function show(draft: Manuscript): void {
  current = draft;
  title.value = draft.title;
  category.value = draft.category;
  body.value = draft.body;
  dirty = false;
  controls();
}
function canLeave(): boolean {
  return !dirty || window.confirm('当前文字尚未保存。确定放弃这些修改吗？');
}
async function refreshList(): Promise<void> {
  const status = element('#list-status');
  const requestNumber = ++listRequest;
  status.textContent = '正在取笺…';
  try {
    const result = await api<{ items: Omit<Manuscript, 'body'>[] }>('/api/manuscripts');
    if (requestNumber !== listRequest) return;
    list.replaceChildren();
    result.items.forEach((item) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.dataset.id = item.id;
      const heading = document.createElement('span');
      heading.textContent = item.title;
      const state = document.createElement('small');
      state.textContent = item.status === 'submitted' ? '已提交 · 只读' : '草稿';
      button.append(heading, state);
      button.addEventListener('click', async () => {
        if (busy || !canLeave()) return;
        busy = true;
        controls();
        feedback.textContent = '';
        try {
          show(await api<Manuscript>(`/api/manuscripts?id=${encodeURIComponent(item.id)}`));
        } catch (error) {
          message(error);
        } finally {
          busy = false;
          controls();
        }
      });
      list.append(button);
    });
    status.textContent = result.items.length
      ? `共 ${result.items.length} 篇稿笺`
      : '还没有稿笺，从右侧开始第一篇。';
    controls();
  } catch {
    if (requestNumber === listRequest) status.textContent = '稿件列表加载失败，请点击刷新重试。';
  }
}
form.addEventListener('input', () => {
  dirty = true;
  controls();
});
form.addEventListener('change', () => {
  dirty = true;
  controls();
});
form.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (busy || current.status === 'submitted' || !form.reportValidity()) return;
  busy = true;
  controls();
  feedback.textContent = '';
  try {
    const result = await api<Manuscript>('/api/manuscripts', {
      id: current.id,
      version: current.version,
      title: title.value,
      category: category.value,
      body: body.value,
    });
    show(result);
    feedback.textContent = '草稿已保存到你的书斋。';
    await refreshList();
  } catch (error) {
    message(error);
  } finally {
    busy = false;
    controls();
  }
});
element('#new-draft').addEventListener('click', () => {
  if (busy || !canLeave()) return;
  show(blank());
  feedback.textContent = '';
  title.focus();
});
element('#refresh-drafts').addEventListener('click', () => {
  if (!busy) void refreshList();
});
submitButton.addEventListener('click', () => {
  if (!submitButton.disabled) confirm.showModal();
});
element('#cancel-send').addEventListener('click', () => confirm.close());
element('#confirm-send').addEventListener('click', async () => {
  if (busy || dirty || current.status !== 'draft' || current.version === 0) return;
  confirm.close();
  busy = true;
  controls();
  feedback.textContent = '';
  try {
    show(
      await api<Manuscript>('/api/manuscripts/submit', {
        id: current.id,
        version: current.version,
      }),
    );
    feedback.textContent = '已进入服务端稿箱，尚未公开发布。';
    await refreshList();
  } catch (error) {
    message(error);
  } finally {
    busy = false;
    controls();
  }
});
element('#export-draft').addEventListener('click', () => {
  const blob = new Blob([`${title.value || '未题名'}\n\n${body.value}\n`], {
    type: 'text/plain;charset=utf-8',
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = '琢光-稿笺备份.txt';
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});
window.addEventListener('beforeunload', (event) => {
  if (dirty || busy) {
    event.preventDefault();
    event.returnValue = '';
  }
});
async function start(): Promise<void> {
  try {
    const session = await api<Session>('/api/auth/session');
    if (!session.user) throw new Error('尚未登录，请先返回主页登录。');
    memberId = session.user.id;
    element('#studio-member').textContent = `${session.user.displayName}的书斋`;
    element('#studio').hidden = false;
    element('#studio-status').textContent = '书斋已连接，落笔吧。';
    show(blank());
    await refreshList();
  } catch (error) {
    element('#studio-status').textContent =
      error instanceof Error ? error.message : '书斋暂时不可用。';
    element('#studio-locked').hidden = false;
  }
}
void start();
