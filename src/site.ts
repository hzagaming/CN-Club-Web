import { element } from './dom.js';
import { initializeAuth } from './auth.js';
const dialogReturnFocus = new WeakMap<
  HTMLDialogElement,
  { node: HTMLElement | null; readingId?: string }
>();
export function openDialog(id: string) {
  closeMenu();
  const node = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const dialog = element<HTMLDialogElement>(`#${id}`);
  dialogReturnFocus.set(dialog, { node, readingId: node?.dataset.read });
  dialog.showModal();
  document.body.classList.add('modal-open');
}
document.querySelectorAll<HTMLDialogElement>('dialog').forEach((dialog) => {
  dialog
    .querySelectorAll('[data-close]')
    .forEach((button) => button.addEventListener('click', () => dialog.close()));
  let pointerStartedOutside = false;
  function isOutside(event: MouseEvent) {
    const r = dialog.getBoundingClientRect();
    return (
      event.target === dialog &&
      (event.clientX < r.left ||
        event.clientX > r.right ||
        event.clientY < r.top ||
        event.clientY > r.bottom)
    );
  }
  dialog.addEventListener('pointerdown', (event) => {
    pointerStartedOutside = isOutside(event);
  });
  dialog.addEventListener('click', (event) => {
    if (pointerStartedOutside && isOutside(event)) dialog.close();
    pointerStartedOutside = false;
  });
  dialog.addEventListener('close', () => {
    if (dialog.open) return;
    const anotherDialog = document.querySelector('dialog[open]');
    document.body.classList.toggle('modal-open', Boolean(anotherDialog));
    if (anotherDialog) return;
    const origin = dialogReturnFocus.get(dialog);
    const replacement = origin?.readingId
      ? [...document.querySelectorAll<HTMLElement>('[data-read]')].find(
          (node) => node.dataset.read === origin.readingId,
        )
      : null;
    const target = origin?.node?.isConnected
      ? origin.node
      : replacement ||
        document.querySelector<HTMLElement>('#writing-search') ||
        document.querySelector<HTMLElement>('[data-login]');
    target?.focus({ preventScroll: true });
  });
});
document
  .querySelectorAll<HTMLButtonElement>('[data-login]')
  .forEach((button) => button.addEventListener('click', () => openDialog('login-dialog')));
void initializeAuth();

const menu = element('.menu-toggle');
const navigation = element('#navigation');
function closeMenu() {
  menu.setAttribute('aria-expanded', 'false');
  menu.setAttribute('aria-label', '打开导航');
  navigation.classList.remove('open');
}
menu.addEventListener('click', () => {
  const expanded = menu.getAttribute('aria-expanded') !== 'true';
  menu.setAttribute('aria-expanded', String(expanded));
  menu.setAttribute('aria-label', expanded ? '关闭导航' : '打开导航');
  navigation.classList.toggle('open', expanded);
});
navigation
  .querySelectorAll<HTMLAnchorElement>('a')
  .forEach((link) => link.addEventListener('click', closeMenu));
document.addEventListener('click', (event) => {
  if (
    !navigation.contains(event.target as Node | null) &&
    !menu.contains(event.target as Node | null)
  )
    closeMenu();
});
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && menu.getAttribute('aria-expanded') === 'true') {
    closeMenu();
    menu.focus();
  }
});
element('.header').addEventListener('focusout', (event) => {
  if (
    !(event.currentTarget as HTMLElement).contains(
      (event as FocusEvent).relatedTarget as Node | null,
    )
  )
    closeMenu();
});
matchMedia('(max-width: 640px)').addEventListener('change', closeMenu);
element('#year').textContent = String(new Date().getFullYear());

// Keep old section and article bookmarks usable after the move to separate pages.
export function getLegacyDestination(url: URL): URL | null {
  if (!url.pathname.endsWith('/') && !url.pathname.endsWith('/index.html')) return null;
  const routes: Record<string, string> = {
    '#about': 'about.html',
    '#writings': 'writings.html',
    '#activities': 'activities.html',
    '#join': 'join.html',
    '#submission-title': 'guide.html',
  };
  const destination = url.searchParams.has('article') ? 'writings.html' : routes[url.hash];
  return destination ? new URL(destination + url.search, url) : null;
}
function followLegacyLink(): void {
  if (document.body.dataset.page !== 'home') return;
  const destination = getLegacyDestination(new URL(location.href));
  if (destination) location.replace(destination);
}
addEventListener('hashchange', followLegacyLink);
followLegacyLink();
if (new URL(location.href).searchParams.get('login') === '1') openDialog('login-dialog');

// A quiet reading marker; update only after scrolling or a layout change.
const progress = document.createElement('div');
progress.className = 'page-progress';
progress.setAttribute('aria-hidden', 'true');
const returnTop = document.createElement('button');
returnTop.type = 'button';
returnTop.className = 'return-top';
returnTop.innerHTML = '<span aria-hidden="true">↑</span><span>回卷首</span>';
returnTop.setAttribute('aria-label', '返回页面顶部');
returnTop.hidden = true;
document.body.append(progress, returnTop);
let progressFrame = 0;
function updateProgress(): void {
  progressFrame = 0;
  const distance = Math.max(0, document.documentElement.scrollHeight - innerHeight);
  const position = Math.max(0, Math.min(scrollY, distance));
  progress.style.transform = `scaleX(${distance ? position / distance : 0})`;
  const shouldHide = position < Math.min(400, innerHeight / 2);
  // Keep the focused control in place until focus moves away.
  returnTop.hidden = shouldHide && document.activeElement !== returnTop;
}
function scheduleProgress(): void {
  if (!progressFrame && !document.hidden) progressFrame = requestAnimationFrame(updateProgress);
}
addEventListener('scroll', scheduleProgress, { passive: true });
addEventListener('resize', scheduleProgress);
addEventListener('pageshow', scheduleProgress);
returnTop.addEventListener('blur', scheduleProgress);
if ('ResizeObserver' in window) new ResizeObserver(scheduleProgress).observe(document.body);
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    cancelAnimationFrame(progressFrame);
    progressFrame = 0;
  } else scheduleProgress();
});
returnTop.addEventListener('click', () => {
  const heading = document.querySelector<HTMLElement>('main h1');
  if (heading) {
    heading.setAttribute('tabindex', '-1');
    heading.focus({ preventScroll: true });
  }
  scrollTo({
    top: 0,
    behavior: document.documentElement.dataset.motion === 'on' ? 'smooth' : 'instant',
  });
});
scheduleProgress();
