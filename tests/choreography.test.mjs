import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { JSDOM } from 'jsdom';
const read = async (name) =>
  (await readFile(`js/${name}.js`, 'utf8'))
    .replace(/^import .*?;\n/gm, '')
    .replace(/^export /gm, '');
const boot = await read('motion-preferences');
const shared = await read('dom');
const motion = await read('motion');
const cards = await read('cards');
const score = await read('choreography');
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
async function setup(studio = false, reduced = false, page = 'index.html') {
  const html = await readFile(studio ? 'public/write.html' : `public/${page}`, 'utf8');
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
  w.Element.prototype.animate = function (keyframes) {
    const entry = {
      target: this,
      effect: { target: this },
      keyframes,
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
  w.eval(
    boot +
      '\n' +
      shared +
      '\n' +
      (studio ? '' : page === 'index.html' ? motion : cards) +
      '\n' +
      score,
  );
  w.document.dispatchEvent(new w.Event('DOMContentLoaded'));
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
    const heading = c.doc.querySelector('.home-intro');
    c.visible(heading);
    assert.equal(heading.classList.contains('is-entering'), true);
    const dialog = c.doc.querySelector('#login-dialog');
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
  const c = await setup(false, false, 'writings.html');
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
test('studio controls are independent and explicit full motion overrides system reduction', async () => {
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
    assert.equal(reduced.doc.querySelector('.motion-dock-state').disabled, false);
    assert.equal(reduced.doc.querySelector('.motion-dock button:last-child').disabled, true);
    assert.equal(reduced.animations.length, 0);
    assert.equal(reduced.doc.querySelector('.hero').classList.contains('is-unfolding'), false);
    reduced.doc.querySelector('[data-motion-preset="full"]').click();
    reduced.tick();
    assert.equal(reduced.doc.documentElement.dataset.motion, 'on');
    assert.equal(reduced.doc.documentElement.dataset.motionMode, 'full');
    assert.equal(reduced.doc.querySelector('.motion-dock button:last-child').disabled, false);
    assert.ok(reduced.animations.length > 0);
    reduced.doc.querySelector('[data-motion-preset="auto"]').click();
    assert.equal(reduced.doc.documentElement.dataset.motion, 'off');
  } finally {
    reduced.dom.window.close();
  }
});
test('backgrounding cancels one-shot effects and explicit replay restarts them', async () => {
  const c = await setup();
  try {
    const heading = c.doc.querySelector('.home-intro');
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

async function bootOnly(url, stored) {
  const html = await readFile('public/index.html', 'utf8');
  const dom = new JSDOM(html, { url, runScripts: 'outside-only' });
  dom.window.matchMedia = () => ({ matches: true, addEventListener() {} });
  if (stored) dom.window.localStorage.setItem('zhuoguang-motion', stored);
  dom.window.eval(boot);
  dom.window.document.dispatchEvent(new dom.window.Event('DOMContentLoaded'));
  return dom;
}
test('file preview exposes CSS motion controls without module execution or storage', async () => {
  const dom = await bootOnly('file:///club/index.html');
  try {
    const doc = dom.window.document;
    assert.equal(doc.querySelector('#motion-panel').hidden, false);
    assert.equal(doc.documentElement.dataset.choreographyReady, undefined);
    assert.equal(doc.documentElement.dataset.motion, 'off');
    assert.match(doc.querySelector('#motion-status').textContent, /系统减弱/);
    assert.match(doc.querySelector('#motion-startup-hint').textContent, /文件预览/);
    doc.querySelector('[data-motion-preset="full"]').click();
    assert.equal(doc.documentElement.dataset.motion, 'on');
    doc.querySelector('[data-motion-command="replay"]').click();
    assert.equal(doc.documentElement.classList.contains('css-replaying'), true);
    doc.querySelector('[data-motion-command="toggle"]').click();
    assert.equal(doc.documentElement.dataset.motion, 'off');
  } finally {
    dom.window.close();
  }
});
test('full-motion preview link overrides a previously saved pause without erasing it', async () => {
  const dom = await bootOnly('http://localhost/?motion=full', 'off');
  try {
    assert.equal(dom.window.document.documentElement.dataset.motion, 'on');
    assert.equal(dom.window.document.documentElement.dataset.motionMode, 'full');
    assert.equal(dom.window.localStorage.getItem('zhuoguang-motion'), 'off');
    assert.match(dom.window.document.querySelector('#motion-status').textContent, /完整动效已开启/);
    dom.window.document.querySelector('[data-motion-preset="full"]').click();
    assert.equal(dom.window.localStorage.getItem('zhuoguang-motion'), 'full');
  } finally {
    dom.window.close();
  }
});
test('every system reduced-motion CSS rule permits an explicit full-motion choice', async () => {
  const dom = new JSDOM('<!doctype html><html><head></head><body></body></html>');
  try {
    for (const name of ['style', 'classical', 'experience', 'motion', 'choreography']) {
      const style = dom.window.document.createElement('style');
      style.textContent = await readFile(`${name}.css`, 'utf8');
      dom.window.document.head.append(style);
      const mediaRules = [...style.sheet.cssRules].filter((rule) =>
        rule.conditionText?.includes('prefers-reduced-motion'),
      );
      assert.ok(mediaRules.length > 0, `${name}: reduced-motion guard exists`);
      for (const media of mediaRules)
        for (const rule of media.cssRules)
          for (const selector of rule.selectorText.split(','))
            assert.match(
              selector.trim(),
              /^html:not\(\[data-motion-mode=['"]full['"]\]\)/,
              `${name}: ${selector}`,
            );
    }
  } finally {
    dom.window.close();
  }
});

test('card tilt batches pointer events, caches geometry and cleans up on pause or removal', async () => {
  const c = await setup(false, false, 'writings.html');
  try {
    c.visible(c.doc.querySelector('.hero'), false);
    const grid = c.doc.querySelector('#writing-grid');
    grid.innerHTML = '<article class="writing-card">文字</article>';
    await flush();
    const card = grid.firstElementChild;
    let measurements = 0;
    card.getBoundingClientRect = () => {
      measurements++;
      return { left: 0, top: 0, width: 300, height: 400 };
    };
    const move = (x) =>
      card.dispatchEvent(
        new c.w.MouseEvent('pointermove', {
          bubbles: true,
          clientX: x,
          clientY: 100,
        }),
      );
    for (let x = 120; x <= 240; x += 20) move(x);
    assert.equal(measurements, 0);
    c.tick();
    assert.equal(measurements, 1);
    assert.equal(card.classList.contains('is-tilting'), true);
    assert.equal(card.style.getPropertyValue('--shine-x'), '80%');
    move(150);
    c.tick();
    assert.equal(measurements, 1);
    assert.equal(card.style.getPropertyValue('--shine-x'), '50%');
    move(200);
    c.w.zhuoguangMotion.setMode('off');
    c.tick();
    assert.equal(card.classList.contains('is-tilting'), false);
    assert.equal(card.style.getPropertyValue('--shine-x'), '50%');
    c.w.zhuoguangMotion.setMode('full');
    move(220);
    c.tick();
    assert.equal(measurements, 2);
    c.w.dispatchEvent(new c.w.Event('scroll'));
    assert.equal(card.classList.contains('is-tilting'), false);
    move(240);
    card.remove();
    c.tick();
    assert.equal(measurements, 2);
    assert.equal(card.classList.contains('is-tilting'), false);
  } finally {
    c.dom.window.close();
  }
});
test('reader turns follow navigation direction, replace pending turns and stop on close', async () => {
  const c = await setup(false, false, 'writings.html');
  try {
    const dialog = c.doc.querySelector('#reader-dialog');
    const body = c.doc.querySelector('#reader-body');
    dialog.open = true;
    body.dataset.turn = 'next';
    body.innerHTML = '<p>下一篇</p>';
    await flush();
    const first = c.animations.findLast((a) => a.target === body);
    assert.match(first.keyframes[0].transform, /translateX\(28px\)/);
    body.dataset.turn = 'previous';
    body.innerHTML = '<p>上一篇</p>';
    await flush();
    const second = c.animations.findLast((a) => a.target === body);
    assert.equal(first.cancelled, true);
    assert.match(second.keyframes[0].transform, /translateX\(-28px\)/);
    assert.equal(second.keyframes[0].transformOrigin, '100% 50%');
    dialog.open = false;
    await flush();
    assert.equal(second.cancelled, true);
    assert.ok(c.animations.filter((a) => a.target === dialog).every((a) => a.cancelled));
    const count = c.animations.length;
    body.innerHTML = '<p>关闭后更新</p>';
    await flush();
    assert.equal(c.animations.length, count);
  } finally {
    c.dom.window.close();
  }
});

test('library reflow animates shared card positions and cancels interrupted movement', async () => {
  const c = await setup(false, false, 'writings.html');
  try {
    const grid = c.doc.querySelector('#writing-grid');
    grid.innerHTML =
      '<article class="writing-card" data-writing-id="rain">雨</article><article class="writing-card" data-writing-id="moon">月</article>';
    await flush();
    let layout = 'cards',
      measurements = 0;
    const [rain, moon] = grid.children;
    [rain, moon].forEach(
      (node, index) =>
        (node.getBoundingClientRect = () => {
          measurements++;
          const top = layout === 'cards' ? 100 : 100 + index * 240;
          const left = layout === 'cards' ? index * 340 : 0;
          return {
            top,
            left,
            width: layout === 'cards' ? 300 : 650,
            height: 180,
            bottom: top + 180,
          };
        }),
    );
    const change = () => c.doc.dispatchEvent(new c.w.Event('zhuoguang:layout-before'));
    const changed = () => c.doc.dispatchEvent(new c.w.Event('zhuoguang:layout-after'));
    change();
    layout = 'list';
    changed();
    const first = c.animations.findLast((a) => a.target === moon);
    assert.match(first.keyframes[0].transform, /translate\(340px, -240px\)/);
    assert.equal(moon.dataset.layoutMoving, 'true');
    c.visible(moon);
    assert.equal(moon.classList.contains('is-entering'), false);
    change();
    layout = 'cards';
    changed();
    assert.equal(first.cancelled, true);
    const second = c.animations.findLast((a) => a.target === moon);
    assert.notEqual(first, second);
    assert.match(second.keyframes[0].transform, /translate\(-340px, 240px\)/);
    c.w.zhuoguangMotion.setMode('off');
    assert.equal(second.cancelled, true);
    assert.equal(moon.dataset.layoutMoving, undefined);
    const before = measurements;
    change();
    layout = 'list';
    changed();
    assert.equal(measurements, before);
    assert.equal(grid.textContent, '雨月');
  } finally {
    c.dom.window.close();
  }
});

test('reflow cleanup releases cards on completion and resize, leaving offscreen cards alone', async () => {
  const c = await setup(false, false, 'writings.html');
  try {
    const grid = c.doc.querySelector('#writing-grid');
    grid.innerHTML =
      '<article class="writing-card" data-writing-id="rain">雨</article><article class="writing-card" data-writing-id="moon">月</article>';
    await flush();
    const [rain, moon] = grid.children;
    let left = 0;
    rain.getBoundingClientRect = () => ({ top: 100, bottom: 300, left, width: 300, height: 200 });
    moon.getBoundingClientRect = () => ({ top: 5000, bottom: 5200, left, width: 300, height: 200 });
    const move = () => {
      c.doc.dispatchEvent(new c.w.Event('zhuoguang:layout-before'));
      left += 100;
      c.doc.dispatchEvent(new c.w.Event('zhuoguang:layout-after'));
    };
    move();
    assert.equal(
      c.animations.some((a) => a.target === moon),
      false,
    );
    c.animations.findLast((a) => a.target === rain).onfinish();
    assert.equal(rain.dataset.layoutMoving, undefined);
    move();
    const pending = c.animations.findLast((a) => a.target === rain);
    c.w.dispatchEvent(new c.w.Event('resize'));
    assert.equal(pending.cancelled, true);
    assert.equal(rain.dataset.layoutMoving, undefined);
  } finally {
    c.dom.window.close();
  }
});

test('cross-document transitions skip reduced motion and cancel immediately when paused', async () => {
  const dom = await bootOnly('http://localhost/');
  try {
    const w = dom.window,
      root = w.document.documentElement;
    let finish,
      rejectReady,
      skipped = 0;
    const transition = {
      skipTransition() {
        skipped++;
        rejectReady(new Error('Transition was skipped'));
      },
      ready: new Promise((_, reject) => {
        rejectReady = reject;
      }),
      finished: new Promise((resolve) => {
        finish = resolve;
      }),
    };
    const reveal = () => {
      const event = new w.Event('pagereveal');
      Object.defineProperty(event, 'viewTransition', { value: transition });
      w.dispatchEvent(event);
    };
    reveal();
    assert.equal(skipped, 1);
    assert.equal(root.dataset.pageTransition, undefined);
    w.zhuoguangMotion.setMode('full');
    reveal();
    assert.equal(root.dataset.pageTransition, 'active');
    w.zhuoguangMotion.setMode('off');
    assert.equal(skipped, 2);
    finish();
    await flush();
    assert.equal(root.dataset.pageTransition, undefined);
    w.dispatchEvent(new w.Event('pagereveal'));
    assert.equal(root.dataset.pageTransition, undefined);
  } finally {
    dom.window.close();
  }
});
