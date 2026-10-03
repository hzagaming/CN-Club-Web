import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { JSDOM } from 'jsdom';
const read = async (name) =>
  (await readFile(`js/${name}.js`, 'utf8'))
    .replace(/^import .*?;\n/gm, '')
    .replace(/^export /gm, '');
const shared = await read('dom');
const motion = await read('motion');
const score = await read('choreography');
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
async function setup(studio = false, reduced = false) {
  const html = await readFile(studio ? 'public/write.html' : 'public/index.html', 'utf8');
  const dom = new JSDOM(html, {
    url: 'http://localhost/',
    runScripts: 'outside-only',
    pretendToBeVisual: true,
  });
  const w = dom.window,
    observed = [],
    animations = [],
    frames = new Map();
  let frameId = 0;
  const media = new Map();
  w.matchMedia = (q) => {
    if (!media.has(q))
      media.set(q, {
        matches: q.includes('reduced') ? reduced : q.includes('pointer: fine'),
        handlers: [],
        addEventListener(_, fn) {
          this.handlers.push(fn);
        },
      });
    return media.get(q);
  };
  w.requestAnimationFrame = (fn) => {
    frames.set(++frameId, fn);
    return frameId;
  };
  w.cancelAnimationFrame = (id) => frames.delete(id);
  w.ResizeObserver = class {
    observe() {}
  };
  w.IntersectionObserver = class {
    constructor(callback) {
      this.callback = callback;
      this.targets = new Set();
      observed.push(this);
    }
    observe(node) {
      this.targets.add(node);
    }
    unobserve(node) {
      this.targets.delete(node);
    }
  };
  w.Element.prototype.animate = function () {
    const entry = {
      target: this,
      cancelled: false,
      cancel() {
        this.cancelled = true;
        this.oncancel?.();
      },
    };
    animations.push(entry);
    return entry;
  };
  const hero = w.document.querySelector('.hero');
  if (hero)
    hero.getBoundingClientRect = () => ({
      top: 0,
      left: 0,
      width: 1200,
      height: 700,
      bottom: 700,
      right: 1200,
    });
  w.eval(shared + '\n' + (studio ? '' : motion) + '\n' + score);
  const tick = () => {
    const pending = [...frames.values()];
    frames.clear();
    pending.forEach((fn) => fn());
  };
  tick();
  const visible = (node, value = true) =>
    observed.forEach((observer) => {
      if (observer.targets.has(node)) observer.callback([{ target: node, isIntersecting: value }]);
    });
  return { dom, w, doc: w.document, animations, tick, visible, media };
}
test('headings unfold and section/dialog animations work after the hero leaves view', async () => {
  const c = await setup();
  try {
    assert.ok(c.doc.querySelectorAll('.ink-character').length >= 10);
    assert.equal(c.doc.querySelectorAll('.scroll-shutters').length, 1);
    c.visible(c.doc.querySelector('.hero'), false);
    const heading = c.doc.querySelector('.section-heading');
    c.visible(heading);
    assert.equal(heading.classList.contains('is-entering'), true);
    const dialog = c.doc.querySelector('#reader-dialog');
    dialog.open = true;
    await flush();
    assert.ok(c.animations.some((a) => a.target === dialog && !a.cancelled));
    c.doc.querySelector('.motion-dock-state').click();
    assert.equal(c.doc.documentElement.dataset.motion, 'off');
    assert.equal(heading.classList.contains('is-entering'), false);
    assert.ok(c.animations.filter((a) => a.target === dialog).every((a) => a.cancelled));
  } finally {
    c.dom.window.close();
  }
});
test('newly filtered cards are observed and paused content remains readable', async () => {
  const c = await setup();
  try {
    const grid = c.doc.querySelector('#writing-grid');
    grid.innerHTML = '<article class="writing-card">一篇文字</article>';
    await flush();
    const card = grid.firstElementChild;
    c.visible(card);
    assert.equal(card.dataset.entrance, 'card');
    assert.equal(card.classList.contains('is-entering'), true);
    c.doc.querySelector('.motion-dock-state').click();
    assert.equal(card.classList.contains('is-entering'), false);
    assert.equal(card.textContent, '一篇文字');
    c.doc.querySelector('.motion-dock-state').click();
    c.doc.querySelector('.motion-dock button:last-child').click();
    c.tick();
    assert.equal(card.classList.contains('is-entering'), true);
  } finally {
    c.dom.window.close();
  }
});
test('studio has independent motion controls and system reduction disables motion', async () => {
  const c = await setup(true);
  try {
    assert.equal(c.doc.documentElement.dataset.motion, 'on');
    c.doc.querySelector('.motion-dock-state').click();
    assert.equal(c.doc.documentElement.dataset.motion, 'off');
    assert.equal(c.w.localStorage.getItem('zhuoguang-motion'), 'off');
  } finally {
    c.dom.window.close();
  }
  const reduced = await setup(false, true);
  try {
    assert.equal(reduced.doc.querySelector('.motion-dock-state').disabled, true);
    assert.equal(reduced.doc.querySelector('.motion-dock button:last-child').disabled, true);
    assert.equal(reduced.animations.length, 0);
    assert.equal(reduced.doc.querySelector('.hero').classList.contains('is-unfolding'), false);
  } finally {
    reduced.dom.window.close();
  }
});
test('backgrounding cancels one-shot effects and explicit replay restarts them', async () => {
  const c = await setup();
  try {
    const heading = c.doc.querySelector('.section-heading');
    c.visible(heading);
    Object.defineProperty(c.doc, 'hidden', { value: true, configurable: true });
    c.doc.dispatchEvent(new c.w.Event('visibilitychange'));
    assert.equal(heading.classList.contains('is-entering'), false);
    assert.equal(c.doc.documentElement.hasAttribute('data-motion-suspended'), true);
    Object.defineProperty(c.doc, 'hidden', { value: false, configurable: true });
    c.doc.dispatchEvent(new c.w.Event('visibilitychange'));
    c.doc.querySelector('.motion-dock button:last-child').click();
    c.tick();
    assert.equal(heading.classList.contains('is-entering'), true);
  } finally {
    c.dom.window.close();
  }
});
