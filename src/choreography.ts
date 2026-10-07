/** Site-wide choreography; no content is hidden until an animation is actually running. */
const pageRoot = document.documentElement;
const pageHero = document.querySelector<HTMLElement>('.hero');

const precisePointer = matchMedia('(hover: hover) and (pointer: fine)');
const entranceElements = new Set<HTMLElement>();
const visibleElements = new Set<HTMLElement>();
const playedElements = new Set<HTMLElement>();
const runningEntrances = new Set<HTMLElement>();
const transientAnimations = new Set<Animation>();
let heroTimer: ReturnType<typeof setTimeout> | undefined;
let redrawFrame = 0;
let rippleCount = 0;
const motionAllowed = () => window.zhuoguangMotion.enabled && !document.hidden;
const dock = document.querySelector<HTMLElement>('#motion-panel')!;
const replayButton = dock.querySelector<HTMLButtonElement>('[data-motion-command="replay"]')!;
function trackAnimation(
  target: Element,
  frames: Keyframe[],
  options: KeyframeAnimationOptions,
): void {
  if (!motionAllowed() || !target.animate) return;
  for (const active of transientAnimations) {
    if ((active.effect as KeyframeEffect | null)?.target === target) active.cancel();
  }
  const animation = target.animate(frames, options);
  transientAnimations.add(animation);
  animation.onfinish = animation.oncancel = () => transientAnimations.delete(animation);
}
function cancelMotion(): void {
  clearPointerLight();
  cancelLayoutMotion();
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
function updateDock(): void {
  const on = motionAllowed();
  replayButton.disabled = !on;
  pageRoot.toggleAttribute('data-motion-suspended', document.hidden);
  if (!on) cancelMotion();
  else for (const node of visibleElements) if (!playedElements.has(node)) enter(node);
}
function splitHeading(): void {
  const heading = document.querySelector<HTMLElement>('.hero h1');
  if (!heading || heading.dataset.lettered) return;
  heading.dataset.lettered = 'true';
  heading.setAttribute('aria-label', '以文琢玉，向光而生。');
  const walker = document.createTreeWalker(heading, NodeFilter.SHOW_TEXT);
  const texts: Text[] = [];
  while (walker.nextNode()) {
    const node = walker.currentNode as Text;
    if (node.textContent?.trim() && !node.parentElement?.closest('.tiny-seal')) texts.push(node);
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
function openScroll(): void {
  if (!pageHero || !motionAllowed()) return;
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

function enter(node: HTMLElement): void {
  if (!motionAllowed()) return;
  playedElements.add(node);
  if (node.dataset.layoutMoving === 'true' || pageRoot.dataset.pageTransition === 'active') return;
  runningEntrances.add(node);
  node.classList.add('is-entering');
}
const observer =
  'IntersectionObserver' in window
    ? new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            const node = entry.target as HTMLElement;
            node.classList.toggle('motion-visible', entry.isIntersecting);
            if (entry.isIntersecting) {
              visibleElements.add(node);
              if (!playedElements.has(node)) enter(node);
            } else {
              visibleElements.delete(node);
              node.classList.remove('is-entering');
              runningEntrances.delete(node);
            }
          });
        },
        { threshold: 0.12 },
      )
    : null;
function observeEntrances(scope: ParentNode = document): void {
  const groups: [string, string][] = [
    ['.journey-links>a,.home-directory>a,.page-related a', 'rise'],
    ['.page-heading,.home-intro', 'heading'],
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
    scope.querySelectorAll<HTMLElement>(selector).forEach((node, index) => {
      if (entranceElements.has(node)) return;
      entranceElements.add(node);
      node.dataset.entrance = effect;
      node.style.setProperty('--entrance-delay', `${Math.min(index % 3, 2) * 120}ms`);
      node.addEventListener('animationend', (event) => {
        if (event.target !== node) return;
        node.classList.remove('is-entering');
        runningEntrances.delete(node);
      });
      if (observer) observer.observe(node);
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

// Measure once before and once after a user-driven layout change. No frame polling.
const layoutPositions = new Map<string, DOMRect>();
const layoutAnimations = new Map<HTMLElement, Animation>();
function cancelLayoutMotion(): void {
  for (const [node, animation] of layoutAnimations) {
    animation.cancel();
    delete node.dataset.layoutMoving;
  }
  layoutAnimations.clear();
  layoutPositions.clear();
}
const inViewport = (rect: DOMRect) =>
  rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.top < innerHeight;
document.addEventListener('zhuoguang:layout-before', () => {
  layoutPositions.clear();
  if (motionAllowed())
    writingGrid?.querySelectorAll<HTMLElement>('[data-writing-id]').forEach((node) => {
      const rect = node.getBoundingClientRect();
      if (inViewport(rect)) layoutPositions.set(node.dataset.writingId!, rect);
    });
  // Keep the captured in-flight position, then cancel the old interpolation.
  for (const [node, animation] of layoutAnimations) {
    animation.cancel();
    delete node.dataset.layoutMoving;
  }
  layoutAnimations.clear();
});
document.addEventListener('zhuoguang:layout-after', () => {
  if (!motionAllowed() || !writingGrid) {
    layoutPositions.clear();
    return;
  }
  const measurements = [...writingGrid.querySelectorAll<HTMLElement>('[data-writing-id]')].map(
    (node) => ({ node, rect: node.getBoundingClientRect() }),
  );
  measurements.forEach(({ node, rect }, index) => {
    if (!inViewport(rect) || !node.animate) return;
    const before = layoutPositions.get(node.dataset.writingId!);
    const dx = before ? before.left - rect.left : 0;
    const dy = before ? before.top - rect.top : 20;
    const scaleX = before ? Math.min(1.3, Math.max(0.75, before.width / rect.width)) : 0.98;
    const scaleY = before ? Math.min(1.15, Math.max(0.85, before.height / rect.height)) : 0.98;
    if (
      before &&
      Math.abs(dx) + Math.abs(dy) < 1 &&
      Math.abs(scaleX - 1) + Math.abs(scaleY - 1) < 0.01
    ) {
      playedElements.add(node);
      return;
    }
    node.classList.remove('is-entering');
    runningEntrances.delete(node);
    node.dataset.layoutMoving = 'true';
    playedElements.add(node);
    const animation = node.animate(
      [
        {
          transform: `translate(${dx}px, ${dy}px) scale(${scaleX}, ${scaleY})`,
          transformOrigin: '0 0',
          opacity: before ? 1 : 0.2,
        },
        { transform: 'translate(0, 0) scale(1, 1)', transformOrigin: '0 0', opacity: 1 },
      ],
      {
        duration: before ? 520 : 420,
        delay: before ? 0 : Math.min(index, 3) * 45,
        easing: 'cubic-bezier(.16,1,.3,1)',
        fill: 'backwards',
      },
    );
    layoutAnimations.set(node, animation);
    const release = () => {
      if (layoutAnimations.get(node) !== animation) return;
      delete node.dataset.layoutMoving;
      layoutAnimations.delete(node);
    };
    animation.onfinish = animation.oncancel = release;
  });
  layoutPositions.clear();
});
addEventListener('resize', cancelLayoutMotion, { passive: true });

document.addEventListener('zhuoguang:replay', () => {
  if (!motionAllowed()) return;
  if (
    pageHero &&
    pageHero.getBoundingClientRect().bottom > 100 &&
    pageHero.getBoundingClientRect().top < innerHeight
  ) {
    document.querySelector<HTMLButtonElement>('#replay-scene')?.click();
  }
  for (const node of visibleElements) node.classList.remove('is-entering');
  requestAnimationFrame(() => {
    if (!motionAllowed()) return;
    for (const node of visibleElements) {
      void node.offsetWidth;
      enter(node);
    }
  });
});

// Light follows a pointer only on decorative surfaces; text and hit targets stay fixed.
let hoverFrame = 0;
let hovered: HTMLElement | null = null;
let hoverX = 50,
  hoverY = 50;
function clearPointerLight(): void {
  cancelAnimationFrame(hoverFrame);
  hoverFrame = 0;
  hovered?.classList.remove('has-pointer');
  hovered = null;
}
document.addEventListener('pointerleave', clearPointerLight);
addEventListener('blur', clearPointerLight);
document.addEventListener(
  'pointermove',
  (event) => {
    if (!motionAllowed() || !precisePointer.matches || event.pointerType === 'touch') return;
    const target = (event.target as Element | null)?.closest<HTMLElement>(
      '.journey-links>a,.activity-list article,.primary-link,.login-button',
    );
    if (hovered !== target) {
      hovered?.classList.remove('has-pointer');
      hovered = target ?? null;
    }
    if (!hovered) return;
    const rect = hovered.getBoundingClientRect();
    hoverX = ((event.clientX - rect.left) / Math.max(1, rect.width)) * 100;
    hoverY = ((event.clientY - rect.top) / Math.max(1, rect.height)) * 100;
    if (!hoverFrame)
      hoverFrame = requestAnimationFrame(() => {
        hoverFrame = 0;
        if (!hovered || !motionAllowed()) return;
        hovered.style.setProperty('--light-x', `${hoverX}%`);
        hovered.style.setProperty('--light-y', `${hoverY}%`);
        hovered.classList.add('has-pointer');
      });
  },
  { passive: true },
);
document.addEventListener(
  'pointerdown',
  (event) => {
    if (!motionAllowed() || rippleCount >= 5) return;
    const target = (event.target as Element | null)?.closest<HTMLElement>(
      'button:not(:disabled),.primary-link,.journey-links>a',
    );
    if (!target || target.closest('.motion-dock')) return;
    const rect = target.getBoundingClientRect();
    const ripple = document.createElement('span');
    ripple.className = 'ink-ripple';
    ripple.setAttribute('aria-hidden', 'true');
    ripple.style.left = `${event.clientX - rect.left}px`;
    ripple.style.top = `${event.clientY - rect.top}px`;
    target.classList.add('ripple-host');
    target.append(ripple);
    rippleCount++;
    ripple.addEventListener(
      'animationend',
      () => {
        if (ripple.isConnected) {
          ripple.remove();
          rippleCount = Math.max(0, rippleCount - 1);
        }
      },
      { once: true },
    );
  },
  { passive: true },
);

// Each dialog animates independently of whether the homepage hero is in view.
document.querySelectorAll<HTMLDialogElement>('dialog').forEach((dialog) => {
  new MutationObserver(() => {
    if (!dialog.open) {
      for (const active of transientAnimations) {
        const target = (active.effect as KeyframeEffect | null)?.target;
        if (target && (target === dialog || dialog.contains(target))) active.cancel();
      }
      return;
    }
    trackAnimation(
      dialog,
      [
        { opacity: 0, transform: 'perspective(1200px) translateY(35px) rotateX(-7deg) scale(.94)' },
        { opacity: 1, transform: 'perspective(1200px) translateY(0) rotateX(0) scale(1)' },
      ],
      { duration: 600, easing: 'cubic-bezier(.16,1,.3,1)' },
    );
  }).observe(dialog, { attributes: true, attributeFilter: ['open'] });
});
const readerBody = document.querySelector('#reader-body');
if (readerBody)
  new MutationObserver(() => {
    if (!readerBody.closest('dialog')?.open) return;
    const backwards = (readerBody as HTMLElement).dataset.turn === 'previous';
    const direction = backwards ? -1 : 1;
    trackAnimation(
      readerBody,
      [
        {
          opacity: 0.15,
          transform: `perspective(1400px) translateX(${direction * 28}px) rotateY(${direction * 9}deg)`,
          transformOrigin: backwards ? '100% 50%' : '0 50%',
        },
        {
          opacity: 1,
          transform: 'perspective(1400px) translateX(0) rotateY(0)',
          transformOrigin: backwards ? '100% 50%' : '0 50%',
        },
      ],
      { duration: 620, easing: 'cubic-bezier(.16,1,.3,1)' },
    );
  }).observe(readerBody, { childList: true });
document.querySelectorAll('details').forEach((details) =>
  details.addEventListener('toggle', () => {
    if (!details.open) return;
    const paragraph = details.querySelector('p');
    if (paragraph)
      trackAnimation(
        paragraph,
        [
          { opacity: 0, transform: 'translateY(-8px)' },
          { opacity: 1, transform: 'translateY(0)' },
        ],
        { duration: 350, easing: 'ease-out' },
      );
  }),
);
const feedback = document.querySelector('#save-status');
if (feedback)
  new MutationObserver(() => {
    if (feedback.textContent?.trim())
      trackAnimation(
        feedback,
        [
          { opacity: 0.2, transform: 'translateY(8px)' },
          { opacity: 1, transform: 'translateY(0)' },
        ],
        { duration: 400, easing: 'ease-out' },
      );
  }).observe(feedback, { childList: true, characterData: true, subtree: true });

document.addEventListener('zhuoguang:motionchange', updateDock);
document.addEventListener('visibilitychange', updateDock);
pageRoot.dataset.choreographyReady = 'true';
window.zhuoguangMotion.refresh();
updateDock();
openScroll();

if ('IntersectionObserver' in window) {
  const ambience = new IntersectionObserver((entries) => {
    entries.forEach((entry) =>
      entry.target.classList.toggle('ambient-active', entry.isIntersecting),
    );
  });
  document.querySelectorAll('.quote-section,.join-art').forEach((node) => ambience.observe(node));
}
