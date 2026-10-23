const CSS_FAILURE_PREFIX = 'Unable to preload CSS for ';
const STYLE_TIMEOUT_MS = 12_000;
const STYLE_RETRY_PARAMETER = 'portalink-module-style-retry';

function errorDetails(error: unknown): { name: string; message: string } | undefined {
  if (!error || typeof error !== 'object') return undefined;
  try {
    const candidate = error as { name?: unknown; message?: unknown };
    return typeof candidate.name === 'string' && typeof candidate.message === 'string'
      ? { name: candidate.name, message: candidate.message } : undefined;
  } catch {
    return undefined;
  }
}

function failedStyleUrl(error: unknown): string | undefined {
  const details = errorDetails(error);
  if (details?.name !== 'Error' || !details.message.startsWith(CSS_FAILURE_PREFIX)) return undefined;
  const href = details.message.slice(CSS_FAILURE_PREFIX.length);
  return href && !/\s/.test(href) ? href : undefined;
}

/** Only known import transport errors qualify; a component's ordinary TypeError does not. */
export function isModuleDownloadFailure(error: unknown): boolean {
  const details = errorDetails(error);
  if (!details) return false;
  if (failedStyleUrl(error)) return true;
  if (details.name === 'ChunkLoadError') {
    return /^Loading chunk [A-Za-z0-9_-]+ failed\.(?:\s*\((?:error|timeout|missing):[^\r\n]*\))?$/.test(details.message);
  }
  if (details.name !== 'TypeError') return false;
  return /^Failed to fetch dynamically imported module(?::\s*\S+)?$/.test(details.message)
    || /^error loading dynamically imported module(?::\s*\S+)?$/.test(details.message)
    || details.message === 'Importing a module script failed.';
}

type StyleWaiter = {
  resolve: () => void;
  reject: (error: unknown) => void;
  signal: AbortSignal;
  onAbort: () => void;
};

type StyleRepair = {
  link: HTMLLinkElement;
  status: 'pending' | 'fulfilled' | 'rejected';
  error?: unknown;
  waiters: Set<StyleWaiter>;
  start: () => void;
  finish: (error?: unknown) => void;
};

// An immutable asset gets one repair request in this document, shared by active owners.
// Failed imports cannot manufacture an unbounded series of cache-busting requests.
const styleRepairs = new Map<string, StyleRepair>();
const repairedLinks = new WeakMap<HTMLLinkElement, string>();
const observedStyles = new WeakMap<HTMLLinkElement, 'failed' | 'loaded'>();
const previouslyFailedStyles = new WeakSet<HTMLLinkElement>();

function isStaticStyleUrl(url: URL): boolean {
  return url.origin === window.location.origin && !url.username && !url.password && !url.hash
    && /^\/assets\/[A-Za-z0-9_.-]+\.css$/.test(url.pathname);
}

function isApplicationStyle(link: HTMLLinkElement): boolean {
  let url: URL;
  try { url = new URL(link.href, window.location.href); } catch { return false; }
  return isStaticStyleUrl(url) && (!url.search || repairedLinks.get(link) === url.href);
}

function observeStyleResult(event: Event): void {
  const link = event.target as HTMLLinkElement | null;
  if (link?.nodeName !== 'LINK' || !link.relList?.contains('stylesheet') || !isApplicationStyle(link)) return;
  if (event.type === 'error') previouslyFailedStyles.add(link);
  observedStyles.set(link, event.type === 'error' ? 'failed' : 'loaded');
}

// Resource load/error events do not bubble. Capture before lazy preloads start;
// Chrome may expose an empty truthy .sheet even when the HTTP request failed.
if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  document.addEventListener('error', observeStyleResult, true);
  document.addEventListener('load', observeStyleResult, true);
}

function requireReadyStyles(signal: AbortSignal): void {
  if (signal.aborted) throw abortError(signal);
  // Vite reports only the first rejected CSS preload, while marking all its
  // siblings as seen. A fulfilled import is unsafe if another sheet also failed.
  for (const link of document.querySelectorAll<HTMLLinkElement>('link[rel~="stylesheet"]')) {
    const observed = observedStyles.get(link);
    if (isApplicationStyle(link) && (observed === 'failed' || (observed !== 'loaded' && !link.sheet))) {
      throw new Error('Other application stylesheets are still unavailable.');
    }
  }
}

function abortError(signal: AbortSignal): unknown {
  return signal.reason ?? new DOMException('Screen loading was cancelled.', 'AbortError');
}

function createStyleRepair(source: HTMLLinkElement, url: URL): StyleRepair {
  const link = source.cloneNode(false) as HTMLLinkElement;
  // Browsers can hide the nonce attribute value while retaining its DOM property.
  if (source.nonce) link.nonce = source.nonce;
  const retryUrl = new URL(url.href);
  retryUrl.searchParams.set(STYLE_RETRY_PARAMETER, '1');
  link.href = retryUrl.href;
  repairedLinks.set(link, retryUrl.href);
  let timer: number | undefined;
  let started = false;
  const loaded = () => repair.finish();
  const failed = () => repair.finish(new Error('The screen stylesheet could not be recovered.'));
  const repair: StyleRepair = {
    link, status: 'pending', waiters: new Set(),
    finish(error) {
      if (repair.status !== 'pending') return;
      repair.status = error === undefined ? 'fulfilled' : 'rejected';
      repair.error = error;
      window.clearTimeout(timer);
      link.removeEventListener('load', loaded);
      link.removeEventListener('error', failed);
      for (const waiter of repair.waiters) {
        waiter.signal.removeEventListener('abort', waiter.onAbort);
        if (error === undefined) waiter.resolve(); else waiter.reject(error);
      }
      repair.waiters.clear();
    },
    start() {
      if (started || repair.status !== 'pending') return;
      started = true;
      link.addEventListener('load', loaded);
      link.addEventListener('error', failed);
      timer = window.setTimeout(failed, STYLE_TIMEOUT_MS);
      try {
        source.replaceWith(link);
      } catch (error) {
        repair.finish(error);
      }
    },
  };
  return repair;
}

function waitForRepair(repair: StyleRepair, signal: AbortSignal): Promise<void> {
  if (signal.aborted) return Promise.reject(abortError(signal));
  if (repair.status === 'fulfilled') return Promise.resolve();
  if (repair.status === 'rejected') return Promise.reject(repair.error);
  return new Promise((resolve, reject) => {
    const waiter: StyleWaiter = {
      resolve, reject, signal,
      onAbort() {
        signal.removeEventListener('abort', waiter.onAbort);
        repair.waiters.delete(waiter);
        reject(abortError(signal));
        // A closing screen cannot cancel a stylesheet another active owner still needs.
        if (!repair.waiters.size) repair.finish(abortError(signal));
      },
    };
    repair.waiters.add(waiter);
    signal.addEventListener('abort', waiter.onAbort, { once: true });
    if (signal.aborted) waiter.onAbort(); else repair.start();
  });
}

/** Vite remembers failed CSS preloads. Repair the exact stylesheet before retrying its import. */
export function recoverModuleStyles(error: unknown, signal: AbortSignal): Promise<void> {
  if (signal.aborted) return Promise.reject(abortError(signal));
  const href = failedStyleUrl(error);
  if (!href) return Promise.resolve();
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return Promise.reject(new Error('The screen stylesheet cannot be recovered here.'));
  }
  let url: URL;
  try {
    url = new URL(href, window.location.href);
  } catch {
    return Promise.reject(new Error('The screen stylesheet URL is invalid.'));
  }
  // Only emitted, same-origin static styles are eligible. Never fetch supplied/private URLs.
  if (!isStaticStyleUrl(url) || url.search) {
    return Promise.reject(new Error('The screen stylesheet is not an eligible application asset.'));
  }
  const existing = styleRepairs.get(url.href);
  const links = Array.from(document.querySelectorAll<HTMLLinkElement>('link[rel~="stylesheet"]'));
  const source = links.find(link => link.href === url.href)
    ?? (existing && links.includes(existing.link) ? existing.link : undefined);
  if (!source || source.isConnected === false || source.disabled) {
    return Promise.reject(new Error('The failed screen stylesheet is no longer available.'));
  }
  const recovered = existing?.link === source
    && (existing.status === 'fulfilled' || observedStyles.get(source) === 'loaded');
  const loadedAfterFailure = observedStyles.get(source) === 'loaded' && previouslyFailedStyles.has(source);
  if (recovered || loadedAfterFailure) {
    existing?.finish();
    try { requireReadyStyles(signal); return Promise.resolve(); } catch (error) { return Promise.reject(error); }
  }
  const repair = existing ?? createStyleRepair(source, url);
  if (!existing) styleRepairs.set(url.href, repair);
  return waitForRepair(repair, signal).then(() => requireReadyStyles(signal));
}
