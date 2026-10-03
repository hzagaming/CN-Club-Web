import { element } from './dom.js';
// Progressive animation: all content remains visible without JavaScript or motion.
const root = document.documentElement;
const hero = element('.hero');
const toggle = element('#motion-toggle');
const label = element('#motion-label');
const replay = element('#replay-scene');
const sceneStatus = element('#scene-status');
const finePointer = matchMedia('(hover: hover) and (pointer: fine)');
const layers = [...hero.querySelectorAll('[data-depth]')];
const activeAnimations = new Set();
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
    enabled = window.zhuoguangMotion.enabled;
    root.dataset.motion = enabled ? 'on' : 'off';
    toggle.hidden = false;
    toggle.disabled = false;
    replay.hidden = false;
    replay.disabled = !enabled;
    replay.title = !enabled ? '先开启动效后，即可重播山水展卷' : '重新播放山水展卷';
    sceneStatus.textContent = enabled ? '云起 · 山行 · 鹤归' : '动效已关闭，可点击开启完整动效';
    toggle.setAttribute('aria-pressed', String(!enabled));
    label.textContent = enabled ? '暂停动效' : '开启完整动效';
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
toggle.addEventListener('click', () => {
    window.zhuoguangMotion.toggle();
    if (enabled)
        unfoldScene();
});
document.addEventListener('zhuoguang:motionchange', applyPreference);
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
    document.dispatchEvent(new Event('zhuoguang:unfold'));
    for (const animation of activeAnimations)
        animation.cancel();
    activeAnimations.clear();
    play(element('.mountain-stack'), [
        { clipPath: 'inset(0 100% 0 0)', opacity: 0.3 },
        { clipPath: 'inset(0 0% 0 0)', opacity: 1 },
    ], { duration: 2300, easing: 'cubic-bezier(.16,1,.3,1)' });
    play(element('.sun'), [
        { opacity: 0, scale: '.65' },
        { opacity: 0.85, scale: '1' },
    ], { duration: 2000 });
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
