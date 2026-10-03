"use strict";
/** Site-wide choreography; no content is hidden until an animation is actually running. */
const pageRoot = document.documentElement;
const pageHero = document.querySelector('.hero');
const systemMotion = matchMedia('(prefers-reduced-motion: reduce)');
const precisePointer = matchMedia('(hover: hover) and (pointer: fine)');
const entranceElements = new Set();
const visibleElements = new Set();
const playedElements = new Set();
const runningEntrances = new Set();
const transientAnimations = new Set();
let heroTimer;
let redrawFrame = 0;
let rippleCount = 0;
let storedPause = false;
try {
    storedPause = localStorage.getItem('zhuoguang-motion') === 'off';
}
catch {
    /* Optional. */
}
if (!pageHero)
    pageRoot.dataset.motion = systemMotion.matches || storedPause ? 'off' : 'on';
const motionAllowed = () => pageRoot.dataset.motion === 'on' && !systemMotion.matches && !document.hidden;
const dock = document.createElement('div');
dock.className = 'motion-dock';
dock.setAttribute('role', 'group');
dock.setAttribute('aria-label', '全站动效控制');
const stateButton = document.createElement('button');
stateButton.type = 'button';
stateButton.className = 'motion-dock-state';
const replayButton = document.createElement('button');
replayButton.type = 'button';
replayButton.textContent = '重播此屏 ↻';
dock.append(stateButton, replayButton);
document.body.append(dock);
function trackAnimation(target, frames, options) {
    if (!motionAllowed() || !target.animate)
        return;
    const animation = target.animate(frames, options);
    transientAnimations.add(animation);
    animation.onfinish = animation.oncancel = () => transientAnimations.delete(animation);
}
function cancelMotion() {
    clearTimeout(heroTimer);
    cancelAnimationFrame(redrawFrame);
    pageHero?.classList.remove('is-unfolding');
    runningEntrances.forEach((node) => node.classList.remove('is-entering'));
    runningEntrances.clear();
    transientAnimations.forEach((animation) => animation.cancel());
    transientAnimations.clear();
    document.querySelectorAll('.ink-ripple').forEach((node) => node.remove());
    rippleCount = 0;
}
function updateDock() {
    const on = motionAllowed();
    stateButton.textContent = systemMotion.matches
        ? '系统已减弱动效'
        : pageRoot.dataset.motion === 'on'
            ? '动效已开启 · 暂停'
            : '动效已暂停 · 开启';
    stateButton.disabled = systemMotion.matches;
    stateButton.setAttribute('aria-pressed', String(pageRoot.dataset.motion !== 'on'));
    replayButton.disabled = !on;
    pageRoot.toggleAttribute('data-motion-suspended', document.hidden);
    if (!on)
        cancelMotion();
    else
        for (const node of visibleElements)
            if (!playedElements.has(node))
                enter(node);
}
stateButton.addEventListener('click', () => {
    if (systemMotion.matches)
        return;
    const homeToggle = document.querySelector('#motion-toggle');
    if (homeToggle)
        homeToggle.click();
    else {
        pageRoot.dataset.motion = pageRoot.dataset.motion === 'on' ? 'off' : 'on';
        try {
            localStorage.setItem('zhuoguang-motion', pageRoot.dataset.motion);
        }
        catch {
            /* Session only. */
        }
        updateDock();
    }
});
function splitHeading() {
    const heading = document.querySelector('.hero h1');
    if (!heading || heading.dataset.lettered)
        return;
    heading.dataset.lettered = 'true';
    heading.setAttribute('aria-label', '以文琢玉，向光而生。');
    const walker = document.createTreeWalker(heading, NodeFilter.SHOW_TEXT);
    const texts = [];
    while (walker.nextNode()) {
        const node = walker.currentNode;
        if (node.textContent?.trim() && !node.parentElement?.closest('.tiny-seal'))
            texts.push(node);
    }
    let index = 0;
    texts.forEach((node) => {
        const fragment = document.createDocumentFragment();
        for (const character of node.data) {
            if (/\s/.test(character)) {
                fragment.append(character);
                continue;
            }
            const span = document.createElement('span');
            span.className = 'ink-character';
            span.textContent = character;
            span.setAttribute('aria-hidden', 'true');
            span.style.setProperty('--glyph-delay', `${index++ * 85}ms`);
            fragment.append(span);
        }
        node.replaceWith(fragment);
    });
}
function openScroll() {
    if (!pageHero || !motionAllowed())
        return;
    clearTimeout(heroTimer);
    pageHero.classList.remove('is-unfolding');
    cancelAnimationFrame(redrawFrame);
    redrawFrame = requestAnimationFrame(() => {
        // Force a new animation generation only for explicit replay, not per frame.
        void pageHero.offsetWidth;
        pageHero.classList.add('is-unfolding');
        heroTimer = setTimeout(() => pageHero.classList.remove('is-unfolding'), 3400);
    });
}
if (pageHero) {
    splitHeading();
    const shutter = document.createElement('div');
    shutter.className = 'scroll-shutters';
    shutter.setAttribute('aria-hidden', 'true');
    shutter.append(document.createElement('i'), document.createElement('i'));
    pageHero.querySelector('.landscape')?.append(shutter);
    const brush = document.createElement('div');
    brush.className = 'ink-brush-trail';
    brush.setAttribute('aria-hidden', 'true');
    pageHero.querySelector('.landscape')?.append(brush);
    document.addEventListener('zhuoguang:unfold', openScroll);
}
function enter(node) {
    if (!motionAllowed())
        return;
    playedElements.add(node);
    runningEntrances.add(node);
    node.classList.add('is-entering');
}
const observer = 'IntersectionObserver' in window
    ? new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
            const node = entry.target;
            node.classList.toggle('motion-visible', entry.isIntersecting);
            if (entry.isIntersecting) {
                visibleElements.add(node);
                if (!playedElements.has(node))
                    enter(node);
            }
            else {
                visibleElements.delete(node);
                node.classList.remove('is-entering');
                runningEntrances.delete(node);
            }
        });
    }, { threshold: 0.12 })
    : null;
function observeEntrances(scope = document) {
    const groups = [
        ['.journey-links>a', 'rise'],
        ['.section-side', 'book'],
        ['.about-content', 'rise'],
        ['.section-heading', 'heading'],
        ['.writing-card', 'card'],
        ['.activity-list article', 'line'],
        ['.quote-section', 'quote'],
        ['.join>div:first-child', 'rise'],
        ['.join-art', 'window'],
        ['.guide-intro,.guide-questions details', 'rise'],
        ['.studio-heading,.studio-layout', 'rise'],
    ];
    for (const [selector, effect] of groups) {
        scope.querySelectorAll(selector).forEach((node, index) => {
            if (entranceElements.has(node))
                return;
            entranceElements.add(node);
            node.dataset.entrance = effect;
            node.style.setProperty('--entrance-delay', `${Math.min(index % 3, 2) * 120}ms`);
            node.addEventListener('animationend', (event) => {
                if (event.target !== node)
                    return;
                node.classList.remove('is-entering');
                runningEntrances.delete(node);
            });
            if (observer)
                observer.observe(node);
            else {
                node.classList.add('motion-visible');
                visibleElements.add(node);
                enter(node);
            }
        });
    }
}
observeEntrances();
const writingGrid = document.querySelector('#writing-grid');
if (writingGrid)
    new MutationObserver(() => {
        for (const node of entranceElements)
            if (!node.isConnected) {
                observer?.unobserve(node);
                entranceElements.delete(node);
                visibleElements.delete(node);
                playedElements.delete(node);
                runningEntrances.delete(node);
            }
        observeEntrances(writingGrid);
    }).observe(writingGrid, { childList: true });
replayButton.addEventListener('click', () => {
    if (!motionAllowed())
        return;
    if (pageHero &&
        pageHero.getBoundingClientRect().bottom > 100 &&
        pageHero.getBoundingClientRect().top < innerHeight) {
        document.querySelector('#replay-scene')?.click();
    }
    for (const node of visibleElements)
        node.classList.remove('is-entering');
    requestAnimationFrame(() => {
        if (!motionAllowed())
            return;
        for (const node of visibleElements) {
            void node.offsetWidth;
            enter(node);
        }
    });
});
// Light follows a pointer only on decorative surfaces; text and hit targets stay fixed.
let hoverFrame = 0;
let hovered = null;
let hoverX = 50, hoverY = 50;
document.addEventListener('pointermove', (event) => {
    if (!motionAllowed() || !precisePointer.matches || event.pointerType === 'touch')
        return;
    const target = event.target?.closest('.journey-links>a,.activity-list article,.primary-link,.login-button');
    if (hovered !== target) {
        hovered?.classList.remove('has-pointer');
        hovered = target ?? null;
    }
    if (!hovered)
        return;
    const rect = hovered.getBoundingClientRect();
    hoverX = ((event.clientX - rect.left) / Math.max(1, rect.width)) * 100;
    hoverY = ((event.clientY - rect.top) / Math.max(1, rect.height)) * 100;
    if (!hoverFrame)
        hoverFrame = requestAnimationFrame(() => {
            hoverFrame = 0;
            if (!hovered || !motionAllowed())
                return;
            hovered.style.setProperty('--light-x', `${hoverX}%`);
            hovered.style.setProperty('--light-y', `${hoverY}%`);
            hovered.classList.add('has-pointer');
        });
}, { passive: true });
document.addEventListener('pointerdown', (event) => {
    if (!motionAllowed() || rippleCount >= 5)
        return;
    const target = event.target?.closest('button:not(:disabled),.primary-link,.journey-links>a');
    if (!target || target.closest('.motion-dock'))
        return;
    const rect = target.getBoundingClientRect();
    const ripple = document.createElement('span');
    ripple.className = 'ink-ripple';
    ripple.setAttribute('aria-hidden', 'true');
    ripple.style.left = `${event.clientX - rect.left}px`;
    ripple.style.top = `${event.clientY - rect.top}px`;
    target.classList.add('ripple-host');
    target.append(ripple);
    rippleCount++;
    ripple.addEventListener('animationend', () => {
        if (ripple.isConnected) {
            ripple.remove();
            rippleCount = Math.max(0, rippleCount - 1);
        }
    }, { once: true });
}, { passive: true });
// Each dialog animates independently of whether the homepage hero is in view.
document.querySelectorAll('dialog').forEach((dialog) => {
    new MutationObserver(() => {
        if (!dialog.open)
            return;
        trackAnimation(dialog, [
            { opacity: 0, transform: 'perspective(1200px) translateY(35px) rotateX(-7deg) scale(.94)' },
            { opacity: 1, transform: 'perspective(1200px) translateY(0) rotateX(0) scale(1)' },
        ], { duration: 600, easing: 'cubic-bezier(.16,1,.3,1)' });
    }).observe(dialog, { attributes: true, attributeFilter: ['open'] });
});
const readerBody = document.querySelector('#reader-body');
if (readerBody)
    new MutationObserver(() => {
        trackAnimation(readerBody, [
            { opacity: 0.1, transform: 'translateX(24px)' },
            { opacity: 1, transform: 'translateX(0)' },
        ], { duration: 500, easing: 'cubic-bezier(.2,.8,.2,1)' });
    }).observe(readerBody, { childList: true });
document.querySelectorAll('details').forEach((details) => details.addEventListener('toggle', () => {
    if (!details.open)
        return;
    const paragraph = details.querySelector('p');
    if (paragraph)
        trackAnimation(paragraph, [
            { opacity: 0, transform: 'translateY(-8px)' },
            { opacity: 1, transform: 'translateY(0)' },
        ], { duration: 350, easing: 'ease-out' });
}));
const feedback = document.querySelector('#save-status');
if (feedback)
    new MutationObserver(() => {
        if (feedback.textContent?.trim())
            trackAnimation(feedback, [
                { opacity: 0.2, transform: 'translateY(8px)' },
                { opacity: 1, transform: 'translateY(0)' },
            ], { duration: 400, easing: 'ease-out' });
    }).observe(feedback, { childList: true, characterData: true, subtree: true });
document.addEventListener('zhuoguang:motionchange', updateDock);
systemMotion.addEventListener('change', () => {
    if (!pageHero) {
        try {
            storedPause = localStorage.getItem('zhuoguang-motion') === 'off';
        }
        catch {
            /* Optional. */
        }
        pageRoot.dataset.motion = systemMotion.matches || storedPause ? 'off' : 'on';
    }
    updateDock();
});
document.addEventListener('visibilitychange', updateDock);
updateDock();
openScroll();
