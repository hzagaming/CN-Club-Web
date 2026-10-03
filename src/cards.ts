import { element } from './dom.js';
const finePointer = matchMedia('(hover: hover) and (pointer: fine)');
let enabled = window.zhuoguangMotion.enabled;
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
let tiltedCard: HTMLElement | null = null;
let tiltFrame = 0;
let tiltRect: DOMRect | null = null;
let tiltPointerX = 0,
  tiltPointerY = 0;
function resetTilt() {
  cancelAnimationFrame(tiltFrame);
  tiltFrame = 0;
  tiltRect = null;
  if (!tiltedCard) return;
  tiltedCard.classList.remove('is-tilting');
  tiltedCard = null;
}
function updateTilt() {
  tiltFrame = 0;
  if (!tiltedCard?.isConnected || !enabled || document.hidden || !finePointer.matches) {
    resetTilt();
    return;
  }
  // Cache the card geometry until pointer exit or scrolling changes its position.
  tiltRect ??= tiltedCard.getBoundingClientRect();
  const px = clamp((tiltPointerX - tiltRect.left) / Math.max(1, tiltRect.width), 0, 1);
  const py = clamp((tiltPointerY - tiltRect.top) / Math.max(1, tiltRect.height), 0, 1);
  tiltedCard.style.setProperty('--tilt-x', `${(0.5 - py) * 5}deg`);
  tiltedCard.style.setProperty('--tilt-y', `${(px - 0.5) * 6}deg`);
  tiltedCard.style.setProperty('--shine-x', `${px * 100}%`);
  tiltedCard.style.setProperty('--shine-y', `${py * 100}%`);
  tiltedCard.classList.add('is-tilting');
}
const grid = element('#writing-grid');
new MutationObserver(resetTilt).observe(grid, { childList: true });
addEventListener('scroll', resetTilt, { passive: true });
addEventListener('resize', resetTilt, { passive: true });
addEventListener('blur', resetTilt);
grid.addEventListener(
  'pointermove',
  (event) => {
    if (!enabled || !finePointer.matches || event.pointerType === 'touch') return;
    const card = (event.target as Element | null)?.closest<HTMLElement>('.writing-card');
    if (!card) {
      resetTilt();
      return;
    }
    if (tiltedCard !== card) {
      resetTilt();
      tiltedCard = card;
    }
    tiltPointerX = event.clientX;
    tiltPointerY = event.clientY;
    if (!tiltFrame) tiltFrame = requestAnimationFrame(updateTilt);
  },
  { passive: true },
);
grid.addEventListener('pointerleave', resetTilt);
grid.addEventListener('focusin', resetTilt);

document.addEventListener('zhuoguang:motionchange', () => {
  enabled = window.zhuoguangMotion.enabled;
  if (!enabled) resetTilt();
});
finePointer.addEventListener('change', resetTilt);
document.addEventListener('visibilitychange', () => {
  if (document.hidden) resetTilt();
});
