import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { JSDOM } from 'jsdom';
const html = await readFile('public/writings.html', 'utf8');
const homeHtml = await readFile('public/index.html', 'utf8');
const load = async (name) =>
  (await readFile(`js/${name}.js`, 'utf8'))
    .replace(/^import .*?;\n/gm, '')
    .replace(/^export /gm, '');
const source = (await Promise.all(['dom', 'auth', 'site', 'main'].map(load))).join('\n');
const motionSource = (await Promise.all(['motion-preferences', 'dom', 'motion'].map(load))).join(
  '\n',
);
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
function page(url = 'http://localhost/writings.html', response, markup = html) {
  const dom = new JSDOM(markup, { url, runScripts: 'outside-only', pretendToBeVisual: true });
  const w = dom.window;
  w.matchMedia = () => ({ matches: false, addEventListener() {} });
  w.ResizeObserver = class {
    observe() {}
  };
  w.HTMLDialogElement.prototype.showModal = function () {
    this.open = true;
  };
  w.HTMLDialogElement.prototype.close = function () {
    this.open = false;
    this.dispatchEvent(new w.Event('close'));
  };
  w.AbortSignal.timeout = () => new w.AbortController().signal;
  w.fetch =
    response ||
    (async () => ({ ok: false, json: async () => ({ error: { message: 'offline' } }) }));
  return dom;
}
test('search, category filters, empty state and reset compose correctly', async () => {
  const d = page();
  try {
    d.window.eval(source);
    const doc = d.window.document;
    assert.equal(doc.querySelectorAll('.writing-card').length, 3);
    doc.querySelector('[data-filter="诗歌"]').click();
    assert.equal(doc.querySelectorAll('.writing-card').length, 1);
    const search = doc.querySelector('#writing-search');
    search.value = '找不到';
    search.dispatchEvent(new d.window.Event('input'));
    assert.equal(doc.querySelector('#writing-empty').hidden, false);
    doc.querySelector('#reset-search').click();
    assert.equal(doc.querySelectorAll('.writing-card').length, 3);
    search.value = '先写下来';
    search.dispatchEvent(new d.window.Event('input'));
    assert.equal(doc.querySelectorAll('.writing-card').length, 1);
    await flush();
    assert.match(doc.querySelector('#auth-description').textContent, /静态预览/);
  } finally {
    d.window.close();
  }
});
test('deep links, reading preferences, shelf and share fallback work together', async () => {
  const d = page('http://localhost/writings.html?article=moon');
  try {
    d.window.eval(source);
    const doc = d.window.document;
    assert.equal(doc.querySelector('#reader-dialog').open, true);
    assert.match(doc.querySelector('#reader-title').textContent, /月光/);
    assert.equal(doc.querySelector('#reader-body').dataset.turn, 'open');
    doc.querySelector('#next-writing').click();
    assert.equal(doc.querySelector('#reader-body').dataset.turn, 'next');
    doc.querySelector('#previous-writing').click();
    assert.equal(doc.querySelector('#reader-body').dataset.turn, 'previous');
    doc.querySelector('#save-writing').click();
    assert.deepEqual(JSON.parse(d.window.localStorage.getItem('zhuoguang-saved')), ['moon']);
    doc.querySelector('#reading-size').click();
    assert.equal(doc.querySelector('#reader-body').classList.contains('large-type'), true);
    doc.querySelector('#share-writing').click();
    await flush();
    assert.equal(doc.querySelector('#share-fallback').hidden, false);
    assert.match(doc.querySelector('#share-url').value, /article=moon/);
    doc.querySelector('#reader-dialog').close();
    assert.equal(new URL(d.window.location.href).searchParams.has('article'), false);
    doc.querySelector('[data-filter=saved]').click();
    assert.equal(doc.querySelectorAll('.writing-card').length, 1);
  } finally {
    d.window.close();
  }
});
test('unavailable browser storage does not break reading or local-session collection', () => {
  const d = page();
  try {
    Object.defineProperty(d.window, 'localStorage', {
      get() {
        throw new Error('blocked');
      },
    });
    d.window.eval(source);
    const doc = d.window.document;
    doc.querySelector('[data-read]').click();
    doc.querySelector('#save-writing').click();
    assert.match(doc.querySelector('#library-feedback').textContent, /刷新后不会保留/);
    doc.querySelector('#reading-direction').click();
    assert.equal(doc.querySelector('#reader-body').classList.contains('vertical-reading'), true);
  } finally {
    d.window.close();
  }
});
test('PHP session connects the form, logs in with CSRF and logs out', async () => {
  const calls = [];
  const member = { id: 1, account: 'reader', displayName: '读者', role: 'member' };
  const d = page('http://localhost/', async (url, options) => {
    calls.push([url, options]);
    return {
      ok: true,
      json: async () => ({
        data: { user: url.endsWith('login') ? member : null, csrfToken: 'test-csrf' },
      }),
    };
  });
  try {
    d.window.eval(source);
    await flush();
    const doc = d.window.document;
    assert.equal(doc.querySelector('#account').disabled, false);
    doc.querySelector('#account').value = 'reader';
    doc.querySelector('#password').value = 'safe-test-password';
    doc
      .querySelector('#login-form')
      .dispatchEvent(new d.window.Event('submit', { cancelable: true }));
    await flush();
    assert.equal(doc.querySelector('#member-name').textContent, '读者');
    assert.equal(doc.querySelector('#password').value, '');
    assert.equal(
      calls.find(([url]) => url.endsWith('/login'))[1].headers['X-CSRF-Token'],
      'test-csrf',
    );
    doc.querySelector('#logout-button').click();
    await flush();
    assert.equal(doc.querySelector('#member-panel').hidden, true);
  } finally {
    d.window.close();
  }
});
test('scene selection, replay and pause respect reduced motion', () => {
  const d = page('http://localhost/', undefined, homeHtml);
  try {
    const w = d.window,
      doc = w.document,
      queries = new Map();
    w.matchMedia = (query) => {
      if (!queries.has(query))
        queries.set(query, {
          matches: query.includes('pointer: fine'),
          addEventListener(type, fn) {
            this.change = fn;
          },
        });
      return queries.get(query);
    };
    let plays = 0;
    w.Element.prototype.animate = () => {
      plays++;
      return {
        cancel() {
          this.oncancel?.();
        },
      };
    };
    w.eval(motionSource);
    assert.equal(doc.documentElement.dataset.motion, 'on');
    doc.querySelector('[data-scene-choice=moon]').click();
    assert.equal(doc.querySelector('.hero').dataset.scene, 'moon');
    w.zhuoguangMotion.refresh();
    assert.match(doc.querySelector('#scene-status').textContent, /三盏浮灯/);
    const before = plays;
    doc.querySelector('#replay-scene').click();
    assert.ok(plays > before);
    doc.querySelector('#motion-toggle').click();
    assert.equal(doc.documentElement.dataset.motion, 'off');
    assert.equal(doc.querySelector('#replay-scene').disabled, true);
    const reduced = queries.get('(prefers-reduced-motion: reduce)');
    reduced.matches = true;
    reduced.change();
    assert.equal(doc.querySelector('#motion-toggle').disabled, false);
    doc.querySelector('#motion-toggle').click();
    assert.equal(doc.documentElement.dataset.motion, 'on');
    assert.equal(doc.documentElement.dataset.motionMode, 'full');
    assert.equal(doc.querySelector('#replay-scene').disabled, false);
    w.zhuoguangMotion.setMode('auto');
    assert.equal(doc.documentElement.dataset.motion, 'off');
  } finally {
    d.window.close();
  }
});
test('public output excludes server, SQL, database and credentials; backup is script-free', async () => {
  const entries = await readdir('public');
  for (const entry of ['server', 'database', 'var', '.env', 'node_modules', 'src'])
    assert.equal(entries.includes(entry), false);
  const lite = await readFile('public/index-lite.html', 'utf8');
  assert.doesNotMatch(lite, /<script/i);
  const dom = new JSDOM(html);
  const ids = [...dom.window.document.querySelectorAll('[id]')].map((el) => el.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const el of dom.window.document.querySelectorAll(
    '[aria-labelledby],[aria-controls],label[for]',
  )) {
    for (const id of (
      el.getAttribute('aria-labelledby') ||
      el.getAttribute('aria-controls') ||
      el.getAttribute('for')
    ).split(' '))
      assert.ok(ids.includes(id), id);
  }
  dom.window.close();
});
