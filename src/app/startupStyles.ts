const STARTUP_STYLE_TIMEOUT_MS = 12_000;
const STYLE_SELECTOR = 'link[data-portalink-app-style]';

/** Keep the inline first scene until every initial app sheet can style React.
 * Development and the neutral public entries retain their normal CSS loading. */
export function waitForStartupStyles(): Promise<void> {
  let links = Array.from(document.querySelectorAll<HTMLLinkElement>(STYLE_SELECTOR));
  if (!links.length) return Promise.resolve();
  return new Promise(resolve => {
    let complete = false;
    let attempt = 0;
    let cleanup = () => { /* No listeners before the first attempt. */ };
    const ready = (link: HTMLLinkElement) => link.dataset.portalinkStyleStatus === 'ready'
      || (link.dataset.portalinkStyleStatus !== 'error' && Boolean(link.sheet));
    const activate = (link: HTMLLinkElement) => {
      link.media = 'all';
      link.dataset.portalinkStyleStatus = 'ready';
    };
    const showStatus = (failed: boolean) => {
      const preboot = document.getElementById('portalink-preboot');
      if (!preboot) return;
      let status = document.getElementById('portalink-preboot-status');
      if (!status) {
        status = document.createElement('div');
        status.id = 'portalink-preboot-status';
        status.append(document.createElement('p'), document.createElement('button'));
        preboot.append(status);
      }
      status.setAttribute('role', failed ? 'alert' : 'status');
      const copy = status.querySelector('p');
      const button = status.querySelector('button');
      if (!copy || !button) return;
      copy.textContent = failed
        ? 'Portalink could not finish opening. Check your connection and try again.' : 'Opening Portalink…';
      button.type = 'button';
      button.textContent = 'Try again';
      button.disabled = !failed;
      button.onclick = failed ? retry : null;
    };
    const finish = () => {
      if (complete || !links.every(ready)) return false;
      complete = true;
      cleanup();
      links.forEach(activate);
      // A failed CSS preload can already have rejected a cached lazy import.
      // Recover in a fresh module realm, before mounting any account surface.
      if (attempt > 0) {
        window.location.reload();
        return true;
      }
      document.getElementById('portalink-preboot-status')?.remove();
      resolve();
      return true;
    };
    const watch = () => {
      if (finish()) return;
      let active = true;
      let timer: number | undefined;
      const subscriptions = links.map(link => {
        const loaded = () => { if (active && !complete) { activate(link); finish(); } };
        const failed = () => { if (active && !complete) { link.dataset.portalinkStyleStatus = 'error'; window.clearTimeout(timer); showStatus(true); } };
        link.addEventListener('load', loaded);
        link.addEventListener('error', failed);
        return () => { link.removeEventListener('load', loaded); link.removeEventListener('error', failed); };
      });
      cleanup = () => { active = false; window.clearTimeout(timer); subscriptions.forEach(unsubscribe => unsubscribe()); };
      if (links.some(link => link.dataset.portalinkStyleStatus === 'error')) showStatus(true);
      else timer = window.setTimeout(() => { if (active && !complete) showStatus(true); }, STARTUP_STYLE_TIMEOUT_MS);
      // A cached sheet can finish between the first check and listener setup.
      finish();
    };
    function retry() {
      if (complete) return;
      cleanup();
      attempt++;
      links = links.map(link => {
        if (ready(link)) return link;
        const replacement = link.cloneNode(false) as HTMLLinkElement;
        replacement.media = 'print';
        delete replacement.dataset.portalinkStyleStatus;
        const href = new URL(link.href, document.baseURI);
        href.searchParams.set('portalink-style-retry', String(attempt));
        replacement.href = href.href;
        link.replaceWith(replacement);
        return replacement;
      });
      showStatus(false);
      watch();
    }
    watch();
  });
}
