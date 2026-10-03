import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { JSDOM } from 'jsdom';
const html = await readFile('public/write.html', 'utf8');
const code = (
  await Promise.all(
    ['dom', 'write'].map(async (name) =>
      (await readFile(`js/${name}.js`, 'utf8'))
        .replace(/^import .*?;\n/gm, '')
        .replace(/^export /gm, ''),
    ),
  )
).join('\n');
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
function studio(failSave = false, signedIn = true) {
  const d = new JSDOM(html, {
    url: 'http://localhost/write.html',
    runScripts: 'outside-only',
    pretendToBeVisual: true,
  });
  const w = d.window;
  w.AbortSignal.timeout = () => new w.AbortController().signal;
  w.HTMLDialogElement.prototype.showModal = function () {
    this.open = true;
  };
  w.HTMLDialogElement.prototype.close = function () {
    this.open = false;
  };
  let saved = null;
  const user = { id: 1, account: 'reader', displayName: '社员', role: 'member' };
  w.fetch = async (path, options) => {
    let data;
    if (path === '/api/auth/session') data = { user: signedIn ? user : null, csrfToken: 'csrf' };
    else if (options.method === 'GET') data = { items: saved ? [saved] : [] };
    else {
      if (failSave)
        return { ok: false, json: async () => ({ error: { message: '服务暂时不可用' } }) };
      assert.equal(options.headers['X-CSRF-Token'], 'csrf');
      const input = JSON.parse(options.body);
      saved = path.endsWith('/submit')
        ? { ...saved, status: 'submitted', version: saved.version + 1 }
        : { ...input, status: 'draft', version: input.version + 1 };
      data = saved;
    }
    return { ok: true, json: async () => ({ data }) };
  };
  w.eval(code);
  return d;
}
function compose(d) {
  const doc = d.window.document;
  doc.querySelector('#draft-title').value = '新作';
  doc.querySelector('#draft-body').value = '我写下的第一句话。';
  doc.querySelector('#draft-body').dispatchEvent(new d.window.Event('input', { bubbles: true }));
  return doc;
}
test('studio saves then confirms submission, and submitted work is read-only', async () => {
  const d = studio();
  try {
    await flush();
    const doc = compose(d);
    assert.equal(doc.querySelector('#submit-draft').disabled, true);
    doc
      .querySelector('#writing-form')
      .dispatchEvent(new d.window.Event('submit', { cancelable: true }));
    await flush();
    assert.equal(doc.querySelector('#submit-draft').disabled, false);
    assert.equal(doc.querySelectorAll('#draft-list button').length, 1);
    doc.querySelector('#submit-draft').click();
    assert.equal(doc.querySelector('#confirm-submit').open, true);
    doc.querySelector('#confirm-send').click();
    await flush();
    assert.equal(doc.querySelector('#draft-body').readOnly, true);
    assert.match(doc.querySelector('#draft-state').textContent, /已提交/);
  } finally {
    d.window.close();
  }
});
test('failed save preserves unsaved writing and leaves the editor usable', async () => {
  const d = studio(true);
  try {
    await flush();
    const doc = compose(d);
    doc
      .querySelector('#writing-form')
      .dispatchEvent(new d.window.Event('submit', { cancelable: true }));
    await flush();
    assert.equal(doc.querySelector('#draft-body').value, '我写下的第一句话。');
    assert.equal(doc.querySelector('#draft-body').disabled, false);
    assert.match(doc.querySelector('#save-status').textContent, /不可用/);
    assert.match(doc.querySelector('#draft-state').textContent, /未保存/);
  } finally {
    d.window.close();
  }
});
test('anonymous visitors see a login route, not the editor', async () => {
  const d = studio(false, false);
  try {
    await flush();
    assert.equal(d.window.document.querySelector('#studio').hidden, true);
    assert.equal(d.window.document.querySelector('#studio-locked').hidden, false);
  } finally {
    d.window.close();
  }
});

test('account switch during editing cannot save a draft under a different member', async () => {
  const d = studio();
  try {
    await flush();
    const doc = compose(d);
    let posts = 0;
    d.window.fetch = async (_path, options) => {
      if (options.method === 'POST') posts++;
      return { ok: true, json: async () => ({ data: { user: { id: 2 }, csrfToken: 'other' } }) };
    };
    doc
      .querySelector('#writing-form')
      .dispatchEvent(new d.window.Event('submit', { cancelable: true }));
    await flush();
    assert.equal(posts, 0);
    assert.match(doc.querySelector('#save-status').textContent, /账号已改变/);
    assert.equal(doc.querySelector('#draft-body').value, '我写下的第一句话。');
  } finally {
    d.window.close();
  }
});
