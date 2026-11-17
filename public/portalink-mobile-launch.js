(() => {
  const root = document.documentElement;
  const entry = document.currentScript?.dataset.launchEntry;
  const mobileCatalogueLaunch = entry === 'catalogue' && root.hasAttribute('data-mobile-catalogue-launch');
  const webCatalogueLaunch = entry === 'catalogue' && root.hasAttribute('data-web-catalogue-launch');
  const catalogueLaunch = mobileCatalogueLaunch || webCatalogueLaunch;
  function releaseCatalogueCanvas() {
    if (webCatalogueLaunch) root.removeAttribute('data-web-catalogue-launch');
    if (!mobileCatalogueLaunch) return;
    root.removeAttribute('data-mobile-catalogue-launch');
    const theme = root.dataset.appearance === 'dark' ? '#000000' : '#ffffff';
    document.querySelectorAll('meta[name="theme-color"]').forEach(tag => tag.setAttribute('content', theme));
  }
  if (!webCatalogueLaunch && (!window.matchMedia('(max-width: 639px)').matches
    || (entry !== 'catalogue' && !root.hasAttribute('data-installed-home-launch')))) {
    releaseCatalogueCanvas();
    return;
  }

  const splash = document.createElement('div');
  splash.id = webCatalogueLaunch ? 'portalink-web-launch' : 'portalink-mobile-launch';
  splash.setAttribute('role', 'status');
  if (entry === 'catalogue' && root.hasAttribute('data-mobile-project-launch')) {
    const app = document.getElementById('root');
    if (!app) {
      root.removeAttribute('data-mobile-project-launch');
      return;
    }
    const finish = () => {
      observer.disconnect();
      window.removeEventListener('pagehide', finish);
      root.removeAttribute('data-mobile-project-launch');
      splash.remove();
      window.dispatchEvent(new Event('portalink:splash-exited'));
    };
    const ready = () => { if (app.querySelector('.app-shell')) finish(); };
    const observer = new MutationObserver(ready);
    if (app.querySelector('.app-shell')) {
      finish();
      return;
    }
    splash.setAttribute('aria-label', 'Opening project');
    const mark = document.createElement('span');
    mark.setAttribute('aria-hidden', 'true');
    splash.append(mark);
    document.body.append(splash);
    observer.observe(app, { childList: true, subtree: true });
    window.addEventListener('pagehide', finish, { once: true });
    return;
  }

  if (mobileCatalogueLaunch) splash.setAttribute('data-mobile-catalogue-splash', '');
  if (webCatalogueLaunch) splash.setAttribute('data-web-catalogue-splash', '');
  splash.setAttribute('aria-label', 'Opening Portalink');
  Object.assign(splash.style, {
    position: 'fixed', inset: '0', zIndex: '1002', display: 'grid', placeItems: 'center',
    backgroundColor: catalogueLaunch ? '#ffffff' : '#fdffff',
  });

  const still = '/portalink-launch-still.webp?v=0e55dfbd';
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const useVideo = webCatalogueLaunch && !reducedMotion;
  const frame = document.createElement(useVideo ? 'video' : 'img');
  frame.width = 512;
  frame.height = useVideo ? 720 : 724;
  Object.assign(frame.style, {
    display: 'block', width: webCatalogueLaunch ? 'min(100vw, 407px)' : '100vw', maxWidth: '70.7182dvh', height: 'auto',
    aspectRatio: useVideo ? '512 / 720' : '512 / 724',
    background: `#fdffff url("${still}") center / contain no-repeat`,
  });

  let timeout;
  let finished = false;
  let waitingForPlayback = useVideo;
  if (useVideo) {
    frame.poster = still;
    frame.preload = 'auto';
    frame.muted = true;
    frame.defaultMuted = true;
    frame.playsInline = true;
    frame.setAttribute('aria-hidden', 'true');
  } else {
    frame.alt = '';
  }
  splash.append(frame);
  document.body.append(splash);

  function finish() {
    if (finished) return;
    finished = true;
    window.clearTimeout(timeout);
    if (useVideo) {
      frame.removeEventListener('ended', finish);
      frame.removeEventListener('playing', playing);
      frame.removeEventListener('waiting', waiting);
      document.removeEventListener('visibilitychange', syncVideoVisibility);
      frame.pause();
    } else frame.removeEventListener('load', loaded);
    frame.removeEventListener('error', finish);
    window.removeEventListener('pagehide', finish);
    splash.remove();
    releaseCatalogueCanvas();
    window.dispatchEvent(new Event('portalink:splash-exited'));
  }
  function loaded() {
    window.clearTimeout(timeout);
    const duration = 1000;
    // Let Home's compositor hide its overlay on time. On shared links, keep the
    // white canvas until the document and viewer theme can switch together.
    if (!catalogueLaunch) splash.animate?.({ opacity: [1, 0] }, { duration, easing: 'step-end', fill: 'forwards' });
    timeout = window.setTimeout(finish, duration);
  }
  function updateVideoTimeout() {
    window.clearTimeout(timeout);
    if (waitingForPlayback && !document.hidden) timeout = window.setTimeout(finish, 8000);
  }
  function playing() {
    waitingForPlayback = false;
    updateVideoTimeout();
  }
  function waiting() {
    waitingForPlayback = true;
    updateVideoTimeout();
  }
  function syncVideoVisibility() {
    if (document.hidden) {
      window.clearTimeout(timeout);
      frame.pause();
      waitingForPlayback = true;
      return;
    }
    updateVideoTimeout();
    frame.play()?.catch(error => {
      if (!document.hidden && error?.name !== 'AbortError') finish();
    });
  }

  frame.addEventListener('error', finish, { once: true });
  window.addEventListener('pagehide', finish, { once: true });
  if (useVideo) {
    // Only a stalled or failed video can exit early. Hidden tabs may delay autoplay.
    frame.addEventListener('ended', finish, { once: true });
    frame.addEventListener('playing', playing);
    frame.addEventListener('waiting', waiting);
    document.addEventListener('visibilitychange', syncVideoVisibility);
    frame.src = '/portalink-splash-mobile.mp4?v=9c1a9457';
    syncVideoVisibility();
  } else {
    timeout = window.setTimeout(finish, 1500);
    frame.addEventListener('load', loaded, { once: true });
    frame.src = reducedMotion ? still : '/portalink-launch-animation.webp?v=1069a07c';
  }
})();
