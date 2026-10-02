import { element } from './dom.js';
import { initializeAuth } from './auth.js';

const writings = [
  {
    id: 'rain',
    category: '散文',
    label: '散文随笔',
    title: '听雨，听见旧时光',
    art: 'rain',
    cover: '檐下听雨',
    excerpt: '雨落在屋檐上，也落进记忆里。那些被日常藏起的片刻，在一场雨中慢慢清晰。',
    body: [
      '下雨的时候，世界似乎把声音放轻了。走廊尽头的树，被洗出一层新绿。雨水顺着叶尖落下来，一滴，又一滴，像一句还没有说完的话。',
      '我把书翻到折角的那一页，却没有急着读。窗外有人撑伞走过，伞面轻轻相碰，笑声便从雨声里冒出来。原来值得记下的事，也可以这样小。',
      '等到雨停，我想写下的，已经不是雨了。是此刻的风，是身边的人，是我们尚未来得及察觉，就正在成为回忆的今天。',
    ],
  },
  {
    id: 'moon',
    category: '诗歌',
    label: '诗词短章',
    title: '向晚，借一寸月光',
    art: 'moon',
    cover: '借月一行',
    excerpt: '把没有说出口的话，折成一叶小舟。沿着晚风，送往月亮升起的地方。',
    body: [
      '晚风翻过书页\n停在一个没有写完的句子上\n我借来一寸月光\n替它点一盏灯',
      '操场渐渐安静\n树影把白日收进怀里\n还有一颗不肯睡去的心\n在纸上，练习发亮',
      '若你恰好也望向窗外\n不必问我写了什么\n今夜的月亮\n是我们共同的落款',
    ],
  },
  {
    id: 'letter',
    category: '故事',
    label: '小说故事',
    title: '那封未寄出的信',
    art: 'letter',
    cover: '纸短情长',
    excerpt: '旧书里夹着一封没有地址的信。故事的开头，只有一句：“给未来的你。”',
    body: [
      '整理社团书柜时，我从一本旧诗集中找到了一封信。信封没有邮票，只写着五个字：给未来的你。',
      '信里没有什么秘密。写信的人说，自己总怕写得不好，稿纸用掉了许多，却从未交出一篇文章。直到有人对他说：“先写下来，文字会慢慢找到自己的路。”',
      '末尾空了好几行，像是在等待回信。我拿起笔，想了很久，终于在下面写道：“今天，我也开始了。”',
      '合上书的时候，阳光恰好落在书脊上。那封没有寄出的信，好像终于抵达了某个地方。',
    ],
  },
];

const savedWritings = new Set<string>();
try {
  const stored = JSON.parse(localStorage.getItem('zhuoguang-saved') || '[]');
  if (Array.isArray(stored))
    stored.forEach((id) => {
      if (writings.some((item) => item.id === id)) savedWritings.add(id);
    });
} catch {
  /* Corrupt or unavailable storage must not block reading. */
}
const grid = element('#writing-grid');
const search = element<HTMLInputElement>('#writing-search');
let currentFilter = 'all';
let currentWriting = 0;
let lastFocused: HTMLElement | null = null;

function renderWritings() {
  const query = search.value.trim().toLocaleLowerCase();
  const matches = writings.filter(
    (item) =>
      (currentFilter === 'all' ||
        (currentFilter === 'saved'
          ? savedWritings.has(item.id)
          : item.category === currentFilter)) &&
      [item.title, item.label, item.excerpt, ...item.body]
        .join(' ')
        .toLocaleLowerCase()
        .includes(query),
  );
  grid.replaceChildren();
  matches.forEach((item) => {
    const article = document.createElement('article');
    article.className = 'writing-card';
    // All interpolated values below are local editorial constants.
    article.innerHTML = `<div class="card-art art-${item.art}" aria-hidden="true"><span>${item.cover}</span><i class="card-stamp">琢光<br>文藏</i><small class="card-colophon">一纸清欢 · 半卷流年</small></div><div class="card-copy"><span class="card-category">${item.label} · 示范作品</span><h3><button class="card-title" data-read="${item.id}">${item.title}</button></h3><p>${item.excerpt}</p><div class="card-bottom"><span>约一分钟 · 静心读完</span><button class="read-button" data-read="${item.id}" aria-label="阅读${item.title}">阅读全文 ↗</button></div></div>`;
    grid.append(article);
  });
  element('#saved-count').textContent = String(savedWritings.size);
  element('#writing-empty h3').textContent =
    currentFilter === 'saved' && !search.value.trim()
      ? '藏书尚空，等一篇心动的文字'
      : '这一页，暂未寻到';
  element('#writing-empty').hidden = matches.length > 0;
  element('#clear-search').hidden = search.value.length === 0;
  element('#writing-results').textContent =
    `共 ${matches.length} 篇${currentFilter === 'all' ? '文字' : currentFilter === 'saved' ? '藏书' : currentFilter} · 示范篇目`;
}
function setFilter(filter: string) {
  currentFilter = filter;
  document.querySelectorAll<HTMLButtonElement>('[data-filter]').forEach((button) => {
    const active = button.dataset.filter === filter;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
  });
  renderWritings();
}
document
  .querySelectorAll<HTMLButtonElement>('[data-filter]')
  .forEach((button) =>
    button.addEventListener('click', () => setFilter(button.dataset.filter ?? 'all')),
  );
search.addEventListener('input', renderWritings);
element('#clear-search').addEventListener('click', () => {
  search.value = '';
  renderWritings();
  search.focus();
});
element('#reset-search').addEventListener('click', () => {
  search.value = '';
  setFilter('all');
  search.focus();
});
renderWritings();

function openDialog(id: string) {
  closeMenu();
  lastFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  element<HTMLDialogElement>(`#${id}`).showModal();
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
    document.body.classList.remove('modal-open');
    if (dialog.id === 'reader-dialog') clearArticleLink();
    if (lastFocused?.isConnected) lastFocused.focus({ preventScroll: true });
    else element<HTMLInputElement>('#writing-search').focus({ preventScroll: true });
  });
});
const reader = element<HTMLDialogElement>('#reader-dialog');
const readerBody = element('#reader-body');
function showWriting(index: number) {
  if (!writings[index]) return;
  currentWriting = index;
  const item = writings[index];
  element('#reader-category').textContent = `${item.label} · 示范作品`;
  element('#reader-title').textContent = item.title;
  readerBody.replaceChildren(
    ...item.body.map((text) => {
      const p = document.createElement('p');
      p.textContent = text;
      return p;
    }),
  );
  element('#reader-position').textContent = `${index + 1} / ${writings.length}`;
  element<HTMLButtonElement>('#previous-writing').disabled = index === 0;
  element<HTMLButtonElement>('#next-writing').disabled = index === writings.length - 1;
  updateLibraryControls();
  reader.scrollTop = 0;
  readerBody.scrollTop = 0;
  readerBody.scrollLeft = 0;
}
grid.addEventListener('click', (event) => {
  const button = (event.target as Element | null)?.closest<HTMLElement>('[data-read]');
  if (!button) return;
  showWriting(writings.findIndex((item) => item.id === button.dataset.read));
  openDialog('reader-dialog');
});
for (const [selector, offset] of [
  ['#previous-writing', -1],
  ['#next-writing', 1],
] as const) {
  element(selector).addEventListener('click', () => {
    const next = currentWriting + offset;
    if (next < 0 || next >= writings.length) return;
    showWriting(next);
    readerBody.focus({ preventScroll: true });
  });
}
document
  .querySelectorAll<HTMLButtonElement>('[data-login]')
  .forEach((button) => button.addEventListener('click', () => openDialog('login-dialog')));
void initializeAuth();
element('#join-button').addEventListener('click', () => openDialog('join-dialog'));

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

const directionButton = element('#reading-direction');
const sizeButton = element('#reading-size');
function applyReadingPreference(button: HTMLElement, key: 'vertical' | 'large', enabled: boolean) {
  button.setAttribute('aria-pressed', String(enabled));
  if (key === 'vertical') {
    button.textContent = enabled ? '切换横排阅读' : '切换竖排阅读';
    readerBody.classList.toggle('vertical-reading', enabled);
    element('#reading-hint').textContent = enabled
      ? '竖排阅读 · 从右向左，横向滚动翻阅'
      : '横排阅读 · 可调整字号';
    readerBody.scrollLeft = 0;
  } else {
    button.textContent = enabled ? '恢复字号' : '放大字号';
    readerBody.classList.toggle('large-type', enabled);
  }
}
for (const [button, key] of [
  [directionButton, 'vertical'],
  [sizeButton, 'large'],
] as const) {
  try {
    applyReadingPreference(button, key, localStorage.getItem(`zhuoguang-${key}`) === 'true');
  } catch {
    /* Storage is optional. */
  }
  button.addEventListener('click', () => {
    const enabled = button.getAttribute('aria-pressed') !== 'true';
    applyReadingPreference(button, key, enabled);
    try {
      localStorage.setItem(`zhuoguang-${key}`, String(enabled));
    } catch {
      /* Private mode remains usable. */
    }
  });
}
const sections = [...document.querySelectorAll('main section[id]')];
const links = [...navigation.querySelectorAll<HTMLAnchorElement>('a')];
const progress = element('.page-progress span');
let scrollPending = false;
function updateScrollState() {
  const available = document.documentElement.scrollHeight - innerHeight;
  progress.style.transform = `scaleX(${available > 0 ? Math.min(1, Math.max(0, scrollY / available)) : 0})`;
  const current = sections.filter((section) => section.getBoundingClientRect().top <= 150).at(-1);
  links.forEach((link) => {
    if (current && link.hash === `#${current.id}`) link.setAttribute('aria-current', 'location');
    else link.removeAttribute('aria-current');
  });
  scrollPending = false;
}
addEventListener(
  'scroll',
  () => {
    if (!scrollPending) {
      scrollPending = true;
      requestAnimationFrame(updateScrollState);
    }
  },
  { passive: true },
);
addEventListener('resize', updateScrollState);
if ('ResizeObserver' in window) new ResizeObserver(updateScrollState).observe(document.body);
updateScrollState();

// Local reading shelf and shareable links; no account or remote storage required.
function updateLibraryControls() {
  const item = writings[currentWriting];
  const saved = savedWritings.has(item.id);
  const button = element('#save-writing');
  button.setAttribute('aria-pressed', String(saved));
  button.textContent = saved ? '已入藏 · 移出' : '收入藏书';
  element<HTMLSelectElement>('#reader-contents').value = item.id;
  element('#library-feedback').textContent = '';
  element('#share-fallback').hidden = true;
  const url = new URL(location.href);
  url.searchParams.set('article', item.id);
  history.replaceState(null, '', url);
}
function clearArticleLink() {
  const url = new URL(location.href);
  if (url.searchParams.has('article')) {
    url.searchParams.delete('article');
    history.replaceState(null, '', url);
  }
}
const contents = element<HTMLSelectElement>('#reader-contents');
writings.forEach((item, index) => {
  const option = document.createElement('option');
  option.value = item.id;
  option.textContent = `${['壹', '贰', '叁'][index]} · ${item.title}`;
  contents.append(option);
});
contents.addEventListener('change', () => {
  const index = writings.findIndex((item) => item.id === contents.value);
  if (index !== -1) showWriting(index);
});
element('#save-writing').addEventListener('click', () => {
  const id = writings[currentWriting].id;
  if (savedWritings.has(id)) savedWritings.delete(id);
  else savedWritings.add(id);
  let persisted = true;
  try {
    localStorage.setItem('zhuoguang-saved', JSON.stringify([...savedWritings]));
  } catch {
    persisted = false;
  }
  updateLibraryControls();
  renderWritings();
  element('#library-feedback').textContent = persisted
    ? savedWritings.has(id)
      ? '已收入本机藏书，可在「我的藏书」重读。'
      : '已从藏书移除。'
    : '本次页面中的藏书已更新；浏览器未允许保存，刷新后不会保留。';
});
element<HTMLButtonElement>('#share-writing').addEventListener('click', async () => {
  const articleId = writings[currentWriting].id;
  const url = new URL(location.href);
  url.searchParams.set('article', articleId);
  const shareButton = element<HTMLButtonElement>('#share-writing');
  shareButton.disabled = true;
  try {
    await navigator.clipboard.writeText(url.href);
    if (reader.open && writings[currentWriting].id === articleId) {
      element('#library-feedback').textContent =
        '篇目链接已复制。对方需能访问该站点；本机预览地址仅供本机使用。';
    }
  } catch {
    if (reader.open && writings[currentWriting].id === articleId) {
      element('#share-fallback').hidden = false;
      const input = element<HTMLInputElement>('#share-url');
      input.value = url.href;
      input.focus();
      input.select();
    }
  } finally {
    shareButton.disabled = false;
  }
});
function openLinkedWriting() {
  const id = new URL(location.href).searchParams.get('article');
  if (!id) {
    if (reader.open) reader.close();
    return;
  }
  const index = writings.findIndex((item) => item.id === id);
  if (index === -1) {
    clearArticleLink();
    return;
  }
  showWriting(index);
  if (!reader.open) openDialog('reader-dialog');
}
addEventListener('popstate', openLinkedWriting);
openLinkedWriting();
