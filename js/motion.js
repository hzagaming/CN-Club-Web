import { element } from './dom.js';
// Progressive animation: all content remains visible without JavaScript or motion.
const root = document.documentElement;
const hero = element('.hero');
const toggle = element('#motion-toggle');
const label = element('#motion-label');
const replay = element('#replay-scene');
const sceneStatus = element('#scene-status');
const reduced = matchMedia('(prefers-reduced-motion: reduce)');
const finePointer = matchMedia('(hover: hover) and (pointer: fine)');
const layers = [...hero.querySelectorAll('[data-depth]')];
const activeAnimations = new Set();
let optedOut = false;
try {
    optedOut = localStorage.getItem('zhuoguang-motion') === 'off';
}
catch {
    /* Optional preference. */
}
let enabled = false;
let sceneVisible = true;
let frame = 0;
let targetX = 0, targetY = 0, x = 0, y = 0, scrollDepth = 0, targetScroll = 0;
let heroTop = 0, heroHeight = 1;
let tiltedCard = null;
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
function play(element, frames, options = {}) {
    if (!enabled || document.hidden || typeof element.animate !== 'function')
        return;
    const animation = element.animate(frames, {
        duration: 850,
        easing: 'cubic-bezier(.22,1,.36,1)',
        ...options,
    });
    activeAnimations.add(animation);
    const forget = () => activeAnimations.delete(animation);
    animation.onfinish = forget;
    animation.oncancel = forget;
}
function resetTilt() {
    if (!tiltedCard)
        return;
    tiltedCard.classList.remove('is-tilting');
    tiltedCard = null;
}
function suspend() {
    cancelAnimationFrame(frame);
    frame = 0;
    resetTilt();
    for (const animation of activeAnimations)
        animation.cancel();
    activeAnimations.clear();
}
function syncScene() {
    hero.classList.toggle('scene-active', enabled && sceneVisible && !document.hidden);
    if (!enabled || !sceneVisible || document.hidden) {
        suspend();
        return;
    }
    schedule();
}
function applyPreference() {
    enabled = !optedOut && !reduced.matches;
    root.dataset.motion = enabled ? 'on' : 'off';
    toggle.hidden = false;
    toggle.disabled = reduced.matches;
    replay.hidden = false;
    replay.disabled = !enabled;
    replay.title = !enabled ? '先开启动效后，即可重播山水展卷' : '重新播放山水展卷';
    sceneStatus.textContent = reduced.matches
        ? '已遵循系统的减少动态效果设置'
        : enabled
            ? '云起 · 山行 · 鹤归'
            : '动效已暂停，可在右上角开启';
    toggle.setAttribute('aria-pressed', String(!enabled));
    label.textContent = reduced.matches ? '系统已减弱动效' : enabled ? '暂停动效' : '开启动效';
    if (!enabled) {
        x = y = targetX = targetY = scrollDepth = targetScroll = 0;
        layers.forEach((layer) => {
            layer.style.removeProperty('--layer-x');
            layer.style.removeProperty('--layer-y');
        });
    }
    syncScene();
}
function tick() {
    frame = 0;
    if (!enabled || !sceneVisible || document.hidden)
        return;
    x += (targetX - x) * 0.075;
    y += (targetY - y) * 0.075;
    scrollDepth += (targetScroll - scrollDepth) * 0.075;
    const amplitude = finePointer.matches ? 1 : 0.3;
    for (const layer of layers) {
        const depth = Number(layer.dataset.depth);
        layer.style.setProperty('--layer-x', `${(x * depth * amplitude).toFixed(2)}px`);
        layer.style.setProperty('--layer-y', `${((y * 0.6 + scrollDepth * 0.8) * depth * amplitude).toFixed(2)}px`);
    }
    if (Math.abs(targetX - x) + Math.abs(targetY - y) + Math.abs(targetScroll - scrollDepth) > 0.002)
        schedule();
}
function schedule() {
    if (!frame && enabled && sceneVisible && !document.hidden)
        frame = requestAnimationFrame(tick);
}
function measure() {
    const rect = hero.getBoundingClientRect();
    heroTop = rect.top + scrollY;
    heroHeight = rect.height || 1;
    updateScroll();
}
function updateScroll() {
    targetScroll = clamp((scrollY - heroTop) / heroHeight, 0, 1);
    schedule();
}
hero.addEventListener('pointermove', (event) => {
    if (!enabled || !finePointer.matches || event.pointerType === 'touch')
        return;
    const r = hero.getBoundingClientRect();
    targetX = clamp(((event.clientX - r.left) / r.width) * 2 - 1, -1, 1);
    targetY = clamp(((event.clientY - r.top) / r.height) * 2 - 1, -1, 1);
    schedule();
}, { passive: true });
hero.addEventListener('pointerleave', () => {
    targetX = targetY = 0;
    schedule();
});
addEventListener('scroll', updateScroll, { passive: true });
addEventListener('resize', measure, { passive: true });
if ('ResizeObserver' in window)
    new ResizeObserver(measure).observe(hero);
if ('IntersectionObserver' in window) {
    new IntersectionObserver((entries) => {
        sceneVisible = entries[0].isIntersecting;
        syncScene();
    }).observe(hero);
    const ambience = new IntersectionObserver((entries) => {
        entries.forEach((entry) => entry.target.classList.toggle('ambient-active', entry.isIntersecting));
    });
    document
        .querySelectorAll('.quote-section,.join-art')
        .forEach((element) => ambience.observe(element));
    const reveal = new IntersectionObserver((entries) => {
        for (const entry of entries) {
            if (!entry.isIntersecting)
                continue;
            reveal.unobserve(entry.target);
            const isBook = entry.target.classList.contains('section-side');
            play(entry.target, isBook
                ? [
                    { opacity: 0.35, transform: 'perspective(1000px) rotateY(-9deg) translateY(20px)' },
                    { opacity: 1, transform: 'perspective(1000px) rotateY(0deg) translateY(0)' },
                ]
                : [
                    { opacity: 0.3, transform: 'translateY(24px)' },
                    { opacity: 1, transform: 'translateY(0)' },
                ], { duration: isBook ? 1100 : 800 });
        }
    }, { threshold: 0.12 });
    document
        .querySelectorAll('.section-side,.about-content,.section-heading,.activity-list article,.join>div:first-child,.guide-grid,.writing-card')
        .forEach((element) => reveal.observe(element));
}
const grid = element('#writing-grid');
grid.addEventListener('pointermove', (event) => {
    if (!enabled || !finePointer.matches || event.pointerType === 'touch')
        return;
    const card = event.target?.closest('.writing-card');
    if (!card) {
        resetTilt();
        return;
    }
    if (tiltedCard !== card) {
        resetTilt();
        tiltedCard = card;
    }
    const r = card.getBoundingClientRect();
    const px = clamp((event.clientX - r.left) / r.width, 0, 1);
    const py = clamp((event.clientY - r.top) / r.height, 0, 1);
    card.style.setProperty('--tilt-x', `${(0.5 - py) * 5}deg`);
    card.style.setProperty('--tilt-y', `${(px - 0.5) * 6}deg`);
    card.style.setProperty('--shine-x', `${px * 100}%`);
    card.style.setProperty('--shine-y', `${py * 100}%`);
    card.classList.add('is-tilting');
}, { passive: true });
grid.addEventListener('pointerleave', resetTilt);
grid.addEventListener('focusin', resetTilt);
new MutationObserver(() => {
    resetTilt();
    [...grid.children].forEach((card, index) => play(card, [
        { opacity: 0.4, transform: 'translateY(15px)' },
        { opacity: 1, transform: 'translateY(0)' },
    ], { duration: 500, delay: index * 60 }));
}).observe(grid, { childList: true });
// Native dialog semantics and focus management remain in main.js.
document.querySelectorAll('dialog').forEach((dialog) => {
    new MutationObserver(() => {
        if (dialog.open) {
            resetTilt();
            play(dialog, [
                {
                    opacity: 0.4,
                    transform: 'perspective(1200px) translateY(20px) rotateX(-3deg) scale(.98)',
                },
                { opacity: 1, transform: 'none' },
            ], { duration: 400 });
        }
    }).observe(dialog, { attributes: true, attributeFilter: ['open'] });
});
toggle.addEventListener('click', () => {
    optedOut = !optedOut;
    try {
        localStorage.setItem('zhuoguang-motion', optedOut ? 'off' : 'on');
    }
    catch {
        /* Session toggle still works. */
    }
    applyPreference();
    if (enabled)
        unfoldScene();
});
reduced.addEventListener('change', applyPreference);
finePointer.addEventListener('change', () => {
    targetX = targetY = 0;
    resetTilt();
    schedule();
});
document.addEventListener('visibilitychange', () => {
    root.toggleAttribute('data-motion-suspended', document.hidden);
    syncScene();
});
measure();
applyPreference();
unfoldScene();
function unfoldScene() {
    if (!enabled || document.hidden || !sceneVisible)
        return;
    for (const animation of activeAnimations)
        animation.cancel();
    activeAnimations.clear();
    play(element('.mountain-stack'), [
        { clipPath: 'inset(0 100% 0 0)', opacity: 0.3 },
        { clipPath: 'inset(0 0% 0 0)', opacity: 1 },
    ], { duration: 2300, easing: 'cubic-bezier(.16,1,.3,1)' });
    play(element('.hero h1'), [
        { clipPath: 'inset(0 0 100% 0)', transform: 'translateY(18px)' },
        { clipPath: 'inset(0 0 0% 0)', transform: 'translateY(0)' },
    ], { duration: 1500 });
    play(element('.sun'), [
        { opacity: 0, scale: '.65' },
        { opacity: 0.85, scale: '1' },
    ], { duration: 2000 });
    play(element('.hero .tiny-seal'), [
        { opacity: 0, scale: '1.7', rotate: '-16deg' },
        { opacity: 1, scale: '1', rotate: '0deg' },
    ], { duration: 700, delay: 850, fill: 'backwards' });
    document.querySelectorAll('.gold-ridge path').forEach((line, index) => play(line, [
        { strokeDashoffset: '1', opacity: 0 },
        { strokeDashoffset: '0', opacity: 0.65 },
    ], { duration: 2400, delay: index * 250, easing: 'ease-in-out' }));
    play(element('.scene-console'), [
        { opacity: 0.3, transform: 'translateY(12px)' },
        { opacity: 1, transform: 'translateY(0)' },
    ], { duration: 1100 });
}
replay.addEventListener('click', unfoldScene);
document.querySelectorAll('[data-scene-choice]').forEach((button) => {
    button.addEventListener('click', () => {
        if (hero.dataset.scene === button.dataset.sceneChoice)
            return;
        hero.dataset.scene = button.dataset.sceneChoice ?? 'dawn';
        document.querySelectorAll('[data-scene-choice]').forEach((other) => {
            other.setAttribute('aria-pressed', String(other === button));
        });
        if (enabled)
            unfoldScene();
        sceneStatus.textContent = {
            dawn: '晨岚 · 一轮初日照山河',
            moon: '月白 · 半卷清光入梦来',
            ink: '墨染 · 山水无言自成诗',
        }[button.dataset.sceneChoice];
    });
});
