import { OPTIONAL_COLLECTION_ENABLED } from '../launch/adultLaunch';
import { createRumCollector, isRumContentRead, type RumMetric } from './rumCore';

declare global {
  interface Window {
    __PORTALINK_RUM_BOOT_MS__?: number;
    __PORTALINK_RUM_PRELOAD_DATA__?: { pathname: string; at: number };
  }
}

let collector: ReturnType<typeof createRumCollector> | null = null;
const markNames: Record<RumMetric, string> = {
  boot_ms: 'portalink:app-boot-start', data_ms: 'portalink:first-data-response',
  cover_ms: 'portalink:first-cover-painted', pdf_ms: 'portalink:first-pdf-page-rendered',
};

function adoptEarlyData() {
  const early = window.__PORTALINK_RUM_PRELOAD_DATA__;
  if (!early || !collector) return;
  delete window.__PORTALINK_RUM_PRELOAD_DATA__;
  if (early.pathname === collector.pathname()) collector.mark('data_ms', collector.token(), early.at);
}

/** Called by both entries before React mounts. Sampling is 100%; prototype
 * sessions stay silent. No identifiers, storage or global fetch interception. */
export function initializeRum(version: string, enabled: boolean) {
  if (!OPTIONAL_COLLECTION_ENABLED || collector || !enabled || typeof window === 'undefined' || !/^[a-f0-9]{7,64}$/.test(version)) return;
  collector = createRumCollector({
    now: () => performance.now(), version, viewport: () => window.innerWidth,
    connection: () => (navigator as Navigator & { connection?: { effectiveType?: string } }).connection?.effectiveType,
    send: payload => {
      if (typeof navigator.sendBeacon === 'function') navigator.sendBeacon('/api/rum', new Blob([JSON.stringify(payload)], { type: 'application/json' }));
    },
    onMark: (metric, at) => {
      try { performance.mark(markNames[metric], { startTime: at }); } catch { /* Old browsers can still send timing values. */ }
    },
  });
  collector.begin(window.location.pathname, window.__PORTALINK_RUM_BOOT_MS__ ?? performance.now());
  adoptEarlyData();
  const flush = () => { adoptEarlyData(); collector?.flush(); };
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flush(); });
  window.addEventListener('pagehide', flush);
}

export function beginRumPageView(pathname: string) {
  adoptEarlyData();
  collector?.begin(pathname);
}

/** The token is captured when work starts, so a late response from an old
 * route cannot become the first data/paint of a newer route. */
export function rumViewToken() {
  return typeof window !== 'undefined' && collector?.pathname() === window.location.pathname ? collector.token() : null;
}

export function markRumData(token: number | null, at?: number) {
  adoptEarlyData();
  if (token === rumViewToken()) collector?.mark('data_ms', token, at);
}

export function markRumCover(token: number | null) {
  adoptEarlyData();
  if (token === rumViewToken()) collector?.mark('cover_ms', token);
}

export function markRumPdf(token: number | null) {
  adoptEarlyData();
  if (token === rumViewToken()) collector?.mark('pdf_ms', token);
}

export const rumSupabaseFetch: typeof fetch = async (input, init) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  const method = init?.method ?? (typeof input === 'object' && 'method' in input ? input.method : 'GET');
  const token = isRumContentRead(url, method) ? rumViewToken() : null;
  const response = await fetch(input, init);
  if (token !== null && response.ok) markRumData(token);
  return response;
};
