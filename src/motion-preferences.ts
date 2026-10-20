/** Classic, dependency-free boot script: runs before modules and also from file://. */
type MotionMode = 'auto' | 'full' | 'off';
interface Window {
  zhuoguangMotion: {
    mode: MotionMode;
    enabled: boolean;
    setMode(mode: MotionMode): void;
    toggle(): void;
    refresh(): void;
  };
}
(() => {
  const html = document.documentElement;
  const system = matchMedia('(prefers-reduced-motion: reduce)');
  let mode: MotionMode = 'auto';
  try {
    const stored = localStorage.getItem('zhuoguang-motion');
    if (stored === 'off' || stored === 'full') mode = stored;
    else if (stored === 'on') mode = 'full';
  } catch {
    /* Storage is optional. */
  }
  const query = new URL(location.href).searchParams.get('motion');
  if (query === 'full' || query === 'auto' || query === 'off') mode = query;
  type PageTransition = {
    skipTransition(): void;
    ready?: Promise<void>;
    finished: Promise<void>;
  };
  const pageTransitions = new Set<PageTransition>();
  function refresh(): void {
    const on = mode === 'full' || (mode === 'auto' && !system.matches);
    if (!on) pageTransitions.forEach((transition) => transition.skipTransition());
    html.dataset.motion = on ? 'on' : 'off';
    html.dataset.motionMode = mode;
    html.dataset.motionBoot = 'ready';
    window.zhuoguangMotion.mode = mode;
    window.zhuoguangMotion.enabled = on;
    const status = document.querySelector('#motion-status');
    if (status)
      status.textContent =
        mode === 'off'
          ? '动画已暂停'
          : mode === 'auto' && system.matches
            ? '系统减弱动效 · 可手动开启完整动效'
            : mode === 'full'
              ? '完整动效已开启'
              : '动效已开启 · 跟随系统';
    const hint = document.querySelector('#motion-startup-hint');
    if (hint)
      hint.textContent =
        location.protocol === 'file:'
          ? '当前为文件预览，CSS 动效可用；完整交互请访问本地预览服务。'
          : html.dataset.choreographyReady === 'true'
            ? 'CSS 与交互动效已就绪'
            : html.dataset.motionChecked === 'true'
              ? 'CSS 动效可用 · 交互动效未连接，请刷新页面或通过本地服务访问。'
              : 'CSS 动效已就绪 · 正在连接交互动效';
    document
      .querySelectorAll<HTMLButtonElement>('[data-motion-preset]')
      .forEach((button) =>
        button.setAttribute('aria-pressed', String(button.dataset.motionPreset === mode)),
      );
    document
      .querySelectorAll<HTMLButtonElement>('[data-motion-command="toggle"]')
      .forEach((button) => {
        button.textContent = on ? '暂停动效' : '开启动效';
        button.setAttribute('aria-pressed', String(!on));
      });
    document
      .querySelectorAll<HTMLButtonElement>('[data-motion-command="replay"]')
      .forEach((button) => (button.disabled = !on));
    html.classList.remove('css-replaying');
    document.dispatchEvent(new Event('zhuoguang:motionchange'));
  }
  function setMode(next: MotionMode): void {
    mode = next;
    try {
      localStorage.setItem('zhuoguang-motion', mode);
    } catch {
      /* Session choice still applies. */
    }
    refresh();
  }
  window.zhuoguangMotion = {
    mode,
    enabled: false,
    setMode,
    toggle: () => setMode(window.zhuoguangMotion.enabled ? 'off' : 'full'),
    refresh,
  };
  // These listeners live in the head's classic script, before the first paint.
  const handlePageTransition = (event: Event) => {
    const transition = (event as Event & { viewTransition?: PageTransition }).viewTransition;
    if (!transition) return;
    // Skipping a native transition rejects ready, including normal pageswap teardown.
    void transition.ready?.catch(() => {});
    if (!window.zhuoguangMotion.enabled) {
      transition.skipTransition();
      return;
    }
    pageTransitions.add(transition);
    if (event.type === 'pagereveal') html.dataset.pageTransition = 'active';
    const finish = () => {
      pageTransitions.delete(transition);
      if (pageTransitions.size === 0) delete html.dataset.pageTransition;
    };
    void transition.finished.then(finish, finish);
  };
  addEventListener('pageswap', handlePageTransition);
  addEventListener('pagereveal', handlePageTransition);
  refresh();
  system.addEventListener('change', refresh);
  function replayVisible(): void {
    if (!window.zhuoguangMotion.enabled) return;
    if (html.dataset.choreographyReady !== 'true') {
      html.classList.remove('css-replaying');
      void html.offsetWidth;
      html.classList.add('css-replaying');
    }
    document.dispatchEvent(new Event('zhuoguang:replay'));
  }
  const bindControls = () => {
    const panel = document.querySelector<HTMLElement>('#motion-panel');
    if (panel) panel.hidden = false;
    document.querySelectorAll<HTMLButtonElement>('[data-motion-preset]').forEach((button) =>
      button.addEventListener('click', () => {
        setMode(button.dataset.motionPreset as MotionMode);
        replayVisible();
      }),
    );
    document
      .querySelectorAll('[data-motion-command="toggle"]')
      .forEach((button) => button.addEventListener('click', () => window.zhuoguangMotion.toggle()));
    document
      .querySelectorAll('[data-motion-command="replay"]')
      .forEach((button) => button.addEventListener('click', replayVisible));
    refresh();
    setTimeout(() => {
      html.dataset.motionChecked = 'true';
      refresh();
    }, 3500);
  };
  if (document.readyState === 'loading')
    document.addEventListener('DOMContentLoaded', bindControls, { once: true });
  else bindControls();
})();
