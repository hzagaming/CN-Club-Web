import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';
import { JSDOM } from 'jsdom';
const pages = ['index', 'writings', 'about', 'activities', 'join', 'guide', 'write'];
const sources = Object.fromEntries(
  await Promise.all(
    ['dom', 'auth', 'site', 'motion-preferences', 'choreography'].map(async (name) => [
      name,
      (await readFile(`js/${name}.js`, 'utf8'))
        .replace(/^import .*?;\n/gm, '')
        .replace(/^export /gm, ''),
    ]),
  ),
);
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

test('every page has valid local destinations, unique IDs and correctly scoped feature modules', async () => {
  const documents = new Map();
  try {
    for (const name of [...pages, 'index-lite']) {
      const d = new JSDOM(await readFile(`public/${name}.html`, 'utf8'), {
        url: `http://localhost/${name}.html`,
      });
      documents.set(`${name}.html`, d);
    }
    for (const [file, d] of documents) {
      const doc = d.window.document;
      assert.equal(doc.querySelectorAll('h1').length, 1, file);
      const ids = [...doc.querySelectorAll('[id]')].map((node) => node.id);
      assert.equal(new Set(ids).size, ids.length, `${file}: IDs`);
      for (const node of doc.querySelectorAll('[aria-labelledby],[aria-controls],label[for]')) {
        for (const attribute of ['aria-labelledby', 'aria-controls', 'for']) {
          for (const id of (node.getAttribute(attribute) || '').split(' ').filter(Boolean))
            assert.ok(doc.getElementById(id), `${file}: ${attribute} ${id}`);
        }
      }
      for (const node of doc.querySelectorAll(
        'a[href],script[src],link[rel=stylesheet],img[src]',
      )) {
        const url = new URL(
          node.getAttribute('href') || node.getAttribute('src'),
          d.window.location,
        );
        if (url.origin !== 'http://localhost') continue;
        const path = url.pathname.slice(1) || 'index.html';
        await access(`public/${path}`);
        if (url.hash && documents.has(path))
          assert.ok(
            documents
              .get(path)
              .window.document.getElementById(decodeURIComponent(url.hash.slice(1))),
            `${file} → ${path}${url.hash}`,
          );
      }
      if (file !== 'index-lite.html') {
        const nav = doc.querySelector('#navigation,.studio-nav');
        for (const href of [
          'index.html',
          'writings.html',
          'about.html',
          'activities.html',
          'join.html',
          'write.html',
        ])
          assert.ok(nav.querySelector(`a[href="${href}"]`), `${file} navigation → ${href}`);
        const active = nav.querySelector('[aria-current=page]');
        if (file !== 'guide.html') assert.equal(active?.getAttribute('href'), file);
      }
      assert.equal(!!doc.querySelector('script[src^="js/main.js"]'), file === 'writings.html');
      // main imports site itself; a differently versioned second script would bind controls twice.
      if (file === 'writings.html')
        assert.equal(doc.querySelector('script[src^="js/site.js"]'), null);
      assert.equal(!!doc.querySelector('script[src^="js/motion.js"]'), file === 'index.html');
    }
    const home = documents.get('index.html').window.document;
    for (const id of ['about', 'writings', 'activities', 'join'])
      assert.equal(home.querySelector(`#${id}`), null);
    assert.equal(home.querySelectorAll('.home-directory a').length, 5);
  } finally {
    for (const d of documents.values()) d.window.close();
  }
});

test('every public content page independently opens navigation and login, preserving current-page state', async () => {
  for (const name of pages.filter((name) => name !== 'write')) {
    const d = new JSDOM(await readFile(`public/${name}.html`, 'utf8'), {
      url: `http://localhost/${name}.html`,
      runScripts: 'outside-only',
      pretendToBeVisual: true,
    });
    try {
      const w = d.window,
        doc = w.document;
      w.matchMedia = () => ({ matches: true, addEventListener() {} });
      w.fetch = async () => ({ ok: false, json: async () => ({ error: { message: 'offline' } }) });
      w.AbortSignal.timeout = () => new w.AbortController().signal;
      w.HTMLDialogElement.prototype.showModal = function () {
        this.open = true;
      };
      w.HTMLDialogElement.prototype.close = function () {
        this.open = false;
        this.dispatchEvent(new w.Event('close'));
      };
      w.eval(sources['motion-preferences']);
      w.eval(
        sources.dom +
          '\n' +
          sources.auth +
          '\n' +
          sources.site +
          '\nwindow.legacyDestination = getLegacyDestination;',
      );
      w.eval(`(() => { ${sources.choreography} })()`);
      doc.dispatchEvent(new w.Event('DOMContentLoaded'));
      doc.querySelector('.menu-toggle').click();
      assert.equal(doc.querySelector('#navigation').classList.contains('open'), true, name);
      doc.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Escape' }));
      assert.equal(doc.querySelector('#navigation').classList.contains('open'), false, name);
      const button = doc.querySelector('[data-login]');
      button.focus();
      button.click();
      assert.equal(doc.querySelector('#login-dialog').open, true, name);
      doc.querySelector('#login-dialog [data-close]').click();
      assert.equal(doc.querySelector('#login-dialog').open, false, name);
      assert.equal(doc.activeElement, button, name);
      await flush();
      assert.match(doc.querySelector('#auth-description').textContent, /静态预览/);
      if (name === 'join') {
        assert.match(doc.querySelector('#joining-status').textContent, /筹备/);
        assert.equal(doc.querySelector('#join-dialog'), null);
      }
      if (name === 'index') {
        for (const [before, after] of [
          ['index.html#about', 'about.html'],
          ['index.html#join', 'join.html'],
          ['?article=moon&motion=full', 'writings.html?article=moon&motion=full'],
        ]) {
          const result = w.legacyDestination(new w.URL(before, 'http://localhost/'));
          assert.equal(result.href, `http://localhost/${after}`);
        }
        assert.equal(w.legacyDestination(new w.URL('http://localhost/index.html#main')), null);
        for (const [before, after] of [
          ['CN-Club-Web/#about', 'CN-Club-Web/about.html'],
          [
            'CN-Club-Web/?article=moon&motion=full',
            'CN-Club-Web/writings.html?article=moon&motion=full',
          ],
          ['CN-Club-Web/index.html#join', 'CN-Club-Web/join.html'],
        ]) {
          assert.equal(
            w.legacyDestination(new w.URL(before, 'http://localhost/')).href,
            `http://localhost/${after}`,
          );
        }
        assert.equal(
          w.legacyDestination(new w.URL('http://localhost/CN-Club-Web/about.html#about')),
          null,
        );
      }
    } finally {
      d.window.close();
    }
  }
});

test('page progress tracks scrolling and layout changes; return to top respects motion and restores focus', async () => {
  const d = new JSDOM(await readFile('public/about.html', 'utf8'), {
    url: 'http://localhost/CN-Club-Web/about.html',
    runScripts: 'outside-only',
    pretendToBeVisual: true,
  });
  try {
    const w = d.window;
    const doc = w.document;
    w.matchMedia = () => ({ matches: false, addEventListener() {} });
    w.fetch = async () => ({ ok: false, json: async () => ({}) });
    w.AbortSignal.timeout = () => new w.AbortController().signal;
    let resize;
    w.ResizeObserver = class {
      constructor(callback) {
        resize = callback;
      }
      observe() {}
    };
    let frame;
    let scheduled = 0;
    w.requestAnimationFrame = (callback) => {
      scheduled++;
      frame = callback;
      return scheduled;
    };
    w.cancelAnimationFrame = () => {
      frame = null;
    };
    const render = () => {
      const callback = frame;
      frame = null;
      callback?.();
    };
    Object.defineProperty(doc.documentElement, 'scrollHeight', { value: 2400, configurable: true });
    w.innerHeight = 800;
    w.scrollY = 0;
    w.eval([sources.dom, sources.auth, sources.site].join('\n'));
    render();
    const button = doc.querySelector('.return-top');
    const marker = doc.querySelector('.page-progress');
    assert.equal(button.hidden, true);
    assert.equal(marker.style.transform, 'scaleX(0)');
    w.scrollY = 800;
    const before = scheduled;
    w.dispatchEvent(new w.Event('scroll'));
    w.dispatchEvent(new w.Event('scroll'));
    assert.equal(scheduled, before + 1, 'scroll updates share one frame');
    render();
    assert.equal(button.hidden, false);
    assert.equal(marker.style.transform, 'scaleX(0.5)');
    let request;
    w.scrollTo = (options) => {
      request = options;
    };
    for (const [mode, behavior] of [
      ['off', 'instant'],
      ['on', 'smooth'],
    ]) {
      doc.documentElement.dataset.motion = mode;
      button.focus();
      button.click();
      assert.equal(request.behavior, behavior);
      assert.equal(request.top, 0);
      assert.equal(doc.activeElement, doc.querySelector('h1'));
    }
    Object.defineProperty(doc.documentElement, 'scrollHeight', { value: 800 });
    resize();
    render();
    assert.equal(marker.style.transform, 'scaleX(0)');
    assert.equal(button.hidden, true, 'short pages need no return control');
    await flush();
  } finally {
    d.window.close();
  }
});
