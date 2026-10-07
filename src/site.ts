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
  if (!['/', '/index.html'].includes(url.pathname) && !url.pathname.endsWith('/index.html'))
    return null;
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
