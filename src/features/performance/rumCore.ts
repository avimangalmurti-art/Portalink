import { handleFromPath } from '../sharing/shareModel';
export type RumRouteKind = 'share' | 'profile' | 'project' | 'home';
export type RumMetric = 'boot_ms' | 'data_ms' | 'cover_ms' | 'pdf_ms';
export type RumViewport = '<400' | '400-639' | '640-1023' | '1024-1439' | '1440+';
export type RumConnection = 'slow-2g' | '2g' | '3g' | '4g' | 'unknown';
export type RumPayload = {
  route_kind: RumRouteKind;
  boot_ms: number | null; data_ms: number | null; cover_ms: number | null; pdf_ms: number | null;
  vw_bucket: RumViewport; conn: RumConnection; version: string;
};

/** Classification never returns a URL or a creator/project identifier. Other
 * product destinations are deliberately outside this four-kind measurement. */
export function rumRouteKind(pathname: string): RumRouteKind | null {
  const path = pathname.replace(/\/+$/, '') || '/';
  if (/^\/(?:share|p)\/[^/]+\/c\/[^/]+\/[^/]+$/.test(path)) return 'project';
  if (handleFromPath(path)) return 'share';
  if (/^\/share\/[^/]+(?:\/c\/[^/]+)?$/.test(path)) return 'share';
  if (/^\/p\/[^/]+(?:\/c\/[^/]+)?$/.test(path)) return 'profile';
  return path === '/' || /^\/feed\/[^/]+$/.test(path) ? 'home' : null;
}

export function rumViewportBucket(width: number): RumViewport {
  return width < 400 ? '<400' : width < 640 ? '400-639' : width < 1024 ? '640-1023' : width < 1440 ? '1024-1439' : '1440+';
}

export function rumConnection(value: unknown): RumConnection {
  return value === 'slow-2g' || value === '2g' || value === '3g' || value === '4g' ? value : 'unknown';
}

function duration(value: number): number | null {
  return Number.isFinite(value) && value >= 0 && value <= 86_400_000 ? Math.round(value) : null;
}

type CollectorOptions = {
  now: () => number;
  version: string;
  viewport: () => number;
  connection: () => unknown;
  send: (payload: RumPayload) => void;
  onMark?: (metric: RumMetric, at: number) => void;
};

/** Input timestamps use the document clock; emitted durations use the current
 * view's origin. The initial view retains navigationStart as its origin. The
 * pathname is retained only in memory for lifecycle matching, never emitted. */
export function createRumCollector(options: CollectorOptions) {
  let sequence = 0;
  let started = false;
  let view: { token: number; pathname: string; origin: number; sent: boolean; payload: RumPayload } | null = null;
  const flush = () => {
    if (!view || view.sent) return;
    view.sent = true;
    // Transport failure must not interrupt navigation or retry a page view.
    try { options.send({ ...view.payload }); } catch { /* Best-effort telemetry. */ }
  };
  return {
    begin(pathname: string, at = options.now()) {
      if (view?.pathname === pathname) return view.token;
      flush();
      const origin = started ? at : 0;
      started = true;
      const routeKind = rumRouteKind(pathname);
      view = routeKind && /^[a-f0-9]{7,64}$/.test(options.version) ? {
        token: ++sequence, pathname, origin, sent: false,
        payload: { route_kind: routeKind, boot_ms: duration(at - origin), data_ms: null, cover_ms: null, pdf_ms: null,
          vw_bucket: rumViewportBucket(options.viewport()), conn: rumConnection(options.connection()), version: options.version },
      } : null;
      if (view && view.payload.boot_ms !== null) options.onMark?.('boot_ms', at);
      return view?.token ?? null;
    },
    token: () => view?.token ?? null,
    pathname: () => view?.pathname ?? null,
    mark(metric: Exclude<RumMetric, 'boot_ms'>, token: number | null, at = options.now()) {
      if (!view || token !== view.token || view.sent) return;
      if (metric === 'cover_ms' && view.payload.route_kind !== 'share' && view.payload.route_kind !== 'profile') return;
      if (metric === 'pdf_ms' && view.payload.route_kind !== 'project') return;
      const value = duration(at - view.origin);
      if (value === null || (view.payload[metric] !== null && view.payload[metric] <= value)) return;
      view.payload[metric] = value;
      options.onMark?.(metric, at);
    },
    flush,
  };
}

/** Only portfolio/feed read endpoints qualify; auth, uploads, interaction
 * mutations and telemetry must never win the first-data measurement. */
export function isRumContentRead(url: string, method: string): boolean {
  let pathname: string;
  try { pathname = new URL(url).pathname; } catch { return false; }
  if (method.toUpperCase() === 'GET') return /^\/rest\/v1\/(?:profiles|portfolio_categories|projects|project_attachments)$/.test(pathname);
  return method.toUpperCase() === 'POST' && /^\/rest\/v1\/rpc\/(?:shared_profile_bundle|project_feed_page|search_public_content)$/.test(pathname);
}
