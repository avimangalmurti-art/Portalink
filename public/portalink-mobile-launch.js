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
  const readyKind = new URLSearchParams(window.location.search).get('view') === 'portal'
    && /^\/(?:share\/[^/]+|[^/]+)\/c\/[^/]+$/i.test(window.location.pathname.replace(/\/+$/, ''))
    ? 'portal' : 'catalogue';
  const frame = document.createElement(useVideo ? 'video' : 'img');
  frame.width = 512;
  frame.height = useVideo ? 720 : 724;
  Object.assign(frame.style, {
    display: 'block', width: webCatalogueLaunch ? 'min(100vw, 407px)' : '100vw', maxWidth: '70.7182dvh', height: 'auto',
    aspectRatio: useVideo ? '512 / 720' : '512 / 724',
    background: `#fdffff url("${still}") center / contain no-repeat`,
  });

  let timeout;
  let contentTimeout;
  let readinessObserver;
  let finished = false;
  let mediaComplete = false;
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
  if (webCatalogueLaunch) {
    // Match the platform opening: clip the actual media bounds and cover tiny
    // decoded/composited perimeter seams before the app stylesheet arrives.
    const viewport = document.createElement('div');
    viewport.setAttribute('data-web-splash-frame', '');
    viewport.setAttribute('aria-hidden', 'true');
    Object.assign(viewport.style, {
      position: 'relative', width: 'min(100vw, 407px)', maxWidth: '70.7182dvh',
      aspectRatio: useVideo ? '512 / 720' : '512 / 724',
      overflow: 'hidden', background: '#ffffff', colorScheme: 'light',
    });
    Object.assign(frame.style, {
      position: 'absolute', inset: '0', width: '100%', maxWidth: 'none', height: '100%',
      objectFit: 'fill', border: '0', outline: '0', boxShadow: 'none', pointerEvents: 'none',
      clipPath: 'inset(2px)',
    });
    const edge = document.createElement('span');
    edge.setAttribute('data-web-splash-edge', '');
    Object.assign(edge.style, {
      position: 'absolute', inset: '0', zIndex: '1', pointerEvents: 'none',
      boxShadow: 'inset 0 0 3px 4px #ffffff',
    });
    viewport.append(frame, edge);
    splash.append(viewport);
  } else splash.append(frame);
  const progress = webCatalogueLaunch ? document.createElement('span') : null;
  if (progress) {
    progress.className = 'portalink-splash-loading-mark premium-media-loading-mark';
    progress.setAttribute('aria-hidden', 'true');
    progress.style.display = 'none';
    splash.append(progress);
  }
  document.body.append(splash);

  function finish() {
    if (finished) return;
    finished = true;
    window.clearTimeout(timeout);
    window.clearTimeout(contentTimeout);
    readinessObserver?.disconnect();
    if (useVideo) {
      frame.removeEventListener('ended', completeMedia);
      frame.removeEventListener('playing', playing);
      frame.removeEventListener('waiting', waiting);
      document.removeEventListener('visibilitychange', syncVideoVisibility);
      frame.pause();
    } else frame.removeEventListener('load', loaded);
    frame.removeEventListener('error', completeMedia);
    window.removeEventListener('pagehide', finish);
    splash.remove();
    releaseCatalogueCanvas();
    window.dispatchEvent(new Event('portalink:splash-exited'));
  }
  function releaseWhenReady() {
    if (!mediaComplete || finished) return;
    if (!webCatalogueLaunch || document.querySelector(`[data-web-launch-ready="${readyKind}"], [data-web-launch-ready="error"]`)) {
      finish();
      return;
    }
    splash.setAttribute('data-web-launch-waiting', '');
    progress.style.display = 'block';
    // A failed application chunk must still yield to the normal loading/error UI.
    contentTimeout ??= window.setTimeout(finish, 12000);
  }
  function completeMedia() {
    if (finished || mediaComplete) return;
    mediaComplete = true;
    window.clearTimeout(timeout);
    if (useVideo) frame.pause();
    releaseWhenReady();
  }
  function loaded() {
    window.clearTimeout(timeout);
    const duration = 1000;
    // Let Home's compositor hide its overlay on time. On shared links, keep the
    // white canvas until the document and viewer theme can switch together.
    if (!catalogueLaunch) splash.animate?.({ opacity: [1, 0] }, { duration, easing: 'step-end', fill: 'forwards' });
    timeout = window.setTimeout(completeMedia, duration);
  }
  function updateVideoTimeout() {
    window.clearTimeout(timeout);
    if (!mediaComplete && waitingForPlayback && !document.hidden) timeout = window.setTimeout(completeMedia, 8000);
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
    if (mediaComplete) return;
    if (document.hidden) {
      window.clearTimeout(timeout);
      frame.pause();
      waitingForPlayback = true;
      return;
    }
    updateVideoTimeout();
    frame.play()?.catch(error => {
      if (!document.hidden && error?.name !== 'AbortError') completeMedia();
    });
  }

  frame.addEventListener('error', completeMedia, { once: true });
  window.addEventListener('pagehide', finish, { once: true });
  if (webCatalogueLaunch && typeof MutationObserver !== 'undefined') {
    readinessObserver = new MutationObserver(releaseWhenReady);
    readinessObserver.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-web-launch-ready'] });
  }
  if (useVideo) {
    // Only a stalled or failed video can exit early. Hidden tabs may delay autoplay.
    frame.addEventListener('ended', completeMedia, { once: true });
    frame.addEventListener('playing', playing);
    frame.addEventListener('waiting', waiting);
    document.addEventListener('visibilitychange', syncVideoVisibility);
    frame.src = '/portalink-splash-mobile.mp4?v=9c1a9457';
    syncVideoVisibility();
  } else {
    timeout = window.setTimeout(completeMedia, 1500);
    frame.addEventListener('load', loaded, { once: true });
    frame.src = reducedMotion ? still : '/portalink-launch-animation.webp?v=1069a07c';
  }
})();
