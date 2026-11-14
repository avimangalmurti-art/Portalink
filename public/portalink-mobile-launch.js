(() => {
  const root = document.documentElement;
  const entry = document.currentScript?.dataset.launchEntry;
  const catalogueLaunch = entry === 'catalogue' && root.hasAttribute('data-mobile-catalogue-launch');
  function releaseCatalogueCanvas() {
    if (!catalogueLaunch) return;
    root.removeAttribute('data-mobile-catalogue-launch');
    const theme = root.dataset.appearance === 'dark' ? '#000000' : '#ffffff';
    document.querySelectorAll('meta[name="theme-color"]').forEach(tag => tag.setAttribute('content', theme));
  }
  if (!window.matchMedia('(max-width: 639px)').matches
    || (entry !== 'catalogue' && !root.hasAttribute('data-installed-home-launch'))) {
    releaseCatalogueCanvas();
    return;
  }

  const splash = document.createElement('div');
  splash.id = 'portalink-mobile-launch';
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

  if (catalogueLaunch) splash.setAttribute('data-mobile-catalogue-splash', '');
  splash.setAttribute('aria-label', 'Opening Portalink');
  Object.assign(splash.style, {
    position: 'fixed', inset: '0', zIndex: '1002', display: 'grid', placeItems: 'center',
    backgroundColor: catalogueLaunch ? '#ffffff' : '#fdffff',
  });

  const still = '/portalink-launch-still.webp?v=0e55dfbd';
  const frame = document.createElement('img');
  frame.alt = '';
  frame.width = 512;
  frame.height = 724;
  Object.assign(frame.style, {
    display: 'block', width: '100vw', maxWidth: '70.7182dvh', height: 'auto',
    aspectRatio: '512 / 724',
    background: `#fdffff url("${still}") center / contain no-repeat`,
  });
  splash.append(frame);
  document.body.append(splash);

  let timeout = window.setTimeout(finish, 1500);
  function finish() {
    window.clearTimeout(timeout);
    frame.removeEventListener('load', loaded);
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
  frame.addEventListener('load', loaded, { once: true });
  frame.addEventListener('error', finish, { once: true });
  window.addEventListener('pagehide', finish, { once: true });
  frame.src = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    ? still : '/portalink-launch-animation.webp?v=1069a07c';
})();
