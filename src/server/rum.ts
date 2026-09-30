/** Anonymous, deliberately low-cardinality timings. Never accept URLs or identities. */
export const RUM_ROUTES = ['share', 'profile', 'project', 'home'] as const;
export const RUM_METRICS = ['boot_ms', 'data_ms', 'cover_ms', 'pdf_ms'] as const;
const VIEWPORT_BUCKETS = ['<400', '400-639', '640-1023', '1024-1439', '1440+'] as const;
const CONNECTIONS = ['slow-2g', '2g', '3g', '4g', 'unknown'] as const;
const PAYLOAD_KEYS = ['route_kind', ...RUM_METRICS, 'vw_bucket', 'conn', 'version'];
const DAY_MS = 86_400_000;
const MAX_BODY_BYTES = 1_024;
const RESPONSE_HEADERS = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store',
  'x-content-type-options': 'nosniff',
};

type RouteKind = typeof RUM_ROUTES[number];
type Metric = typeof RUM_METRICS[number];
export type RumPayload = {
  route_kind: RouteKind;
  boot_ms: number | null;
  data_ms: number | null;
  cover_ms: number | null;
  pdf_ms: number | null;
  vw_bucket: typeof VIEWPORT_BUCKETS[number];
  conn: typeof CONNECTIONS[number];
  version: string;
};

interface RumStatement {
  bind(...values: unknown[]): RumStatement;
  all<T = unknown>(): Promise<{ results?: T[] }>;
  run(): Promise<unknown>;
}

export interface RumDatabase {
  prepare(sql: string): RumStatement;
}

type RumOptions = { now?: () => number; random?: () => number; uuid?: () => string };
type MetricSummary = { count: number; p50: number | null; p90: number | null };
type RouteSummary = { route_kind: RouteKind } & Record<Metric, MetricSummary>;
type AggregateRow = {
  period: '24h' | '7d';
  route_kind: RouteKind;
  metric: Metric;
  count: number;
  p50: number;
  p90: number;
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: RESPONSE_HEADERS });
}

function unavailable(): Response {
  return json({ error: 'Load timings are not available yet.' }, 503);
}

export function validateRumPayload(value: unknown): RumPayload | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const candidate = value as Record<string, unknown>;
  const keys = Object.keys(candidate);
  if (keys.length !== PAYLOAD_KEYS.length || keys.some(key => !PAYLOAD_KEYS.includes(key))) return null;
  if (!RUM_ROUTES.includes(candidate.route_kind as RouteKind)
    || !VIEWPORT_BUCKETS.includes(candidate.vw_bucket as RumPayload['vw_bucket'])
    || !CONNECTIONS.includes(candidate.conn as RumPayload['conn'])
    || typeof candidate.version !== 'string' || !/^[a-f0-9]{7,64}$/.test(candidate.version)) return null;
  if (RUM_METRICS.some(metric => {
    const duration = candidate[metric];
    return duration !== null && (typeof duration !== 'number' || !Number.isFinite(duration) || duration < 0 || duration > DAY_MS);
  })) return null;
  // Construct an allowlisted record rather than retaining the submitted object.
  return {
    route_kind: candidate.route_kind as RouteKind,
    boot_ms: candidate.boot_ms as number | null,
    data_ms: candidate.data_ms as number | null,
    cover_ms: candidate.cover_ms as number | null,
    pdf_ms: candidate.pdf_ms as number | null,
    vw_bucket: candidate.vw_bucket as RumPayload['vw_bucket'],
    conn: candidate.conn as RumPayload['conn'],
    version: candidate.version,
  };
}

async function readPayload(request: Request): Promise<RumPayload | Response> {
  const declaredSize = Number(request.headers.get('content-length'));
  if (declaredSize > MAX_BODY_BYTES) return json({ error: 'Timing payload is too large.' }, 413);
  if (!request.body) return json({ error: 'Invalid timing payload.' }, 400);
  const reader = request.body.getReader();
  const bytes = new Uint8Array(MAX_BODY_BYTES);
  let length = 0;
  try {
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      if (length + chunk.value.byteLength > MAX_BODY_BYTES) {
        await reader.cancel();
        return json({ error: 'Timing payload is too large.' }, 413);
      }
      bytes.set(chunk.value, length);
      length += chunk.value.byteLength;
    }
    const decoded = new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(0, length));
    const payload = validateRumPayload(JSON.parse(decoded));
    return payload ?? json({ error: 'Invalid timing payload.' }, 400);
  } catch {
    return json({ error: 'Invalid timing payload.' }, 400);
  } finally {
    reader.releaseLock();
  }
}

/** No Supabase session or request identifiers are read, stored, or logged here. */
export async function handleRumIngest(request: Request, db?: RumDatabase, options: RumOptions = {}): Promise<Response> {
  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed.' }), { status: 405, headers: { ...RESPONSE_HEADERS, allow: 'POST' } });
  }
  const origin = request.headers.get('origin');
  if (origin && origin !== new URL(request.url).origin) return json({ error: 'Origin not allowed.' }, 403);
  const payload = await readPayload(request);
  if (payload instanceof Response) return payload;
  if (!db) return unavailable();
  const now = (options.now ?? Date.now)();
  try {
    await db.prepare(`INSERT INTO page_timings
      (id, at, route_kind, boot_ms, data_ms, cover_ms, pdf_ms, vw_bucket, conn, version)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind((options.uuid ?? (() => crypto.randomUUID()))(), new Date(now).toISOString(),
        payload.route_kind, payload.boot_ms, payload.data_ms, payload.cover_ms, payload.pdf_ms,
        payload.vw_bucket, payload.conn, payload.version).run();
  } catch {
    // In particular, an unapplied migration does not create schema at runtime.
    return unavailable();
  }
  if ((options.random ?? Math.random)() < 0.01) {
    try {
      await db.prepare('DELETE FROM page_timings WHERE at < ?').bind(new Date(now - 30 * DAY_MS).toISOString()).run();
    } catch {
      // A transient retention failure must not cause retries of an accepted beacon.
    }
  }
  return new Response(null, { status: 204, headers: RESPONSE_HEADERS });
}

/** Exact nearest-rank definition shared by the SQL aggregation's tests. */
export function nearestRank(values: readonly number[], percentile: number): number | null {
  if (values.length === 0) return null;
  if (!Number.isFinite(percentile) || percentile <= 0 || percentile > 1) throw new RangeError('Invalid percentile.');
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.ceil(percentile * sorted.length) - 1];
}

// The indexed seven-day scan and window functions stay inside D1. The worker
// receives at most 2 windows × 4 routes × 4 metrics, never raw visitor rows.
export const RUM_SUMMARY_SQL = `WITH
  recent AS (
    SELECT at, route_kind, boot_ms, data_ms, cover_ms, pdf_ms
    FROM page_timings WHERE at >= ? AND at <= ?
  ),
  windows(period, since) AS (VALUES ('24h', ?), ('7d', ?)),
  metrics(metric) AS (VALUES ('boot_ms'), ('data_ms'), ('cover_ms'), ('pdf_ms')),
  expanded AS (
    SELECT windows.period, recent.route_kind, metrics.metric,
      CASE metrics.metric
        WHEN 'boot_ms' THEN recent.boot_ms WHEN 'data_ms' THEN recent.data_ms
        WHEN 'cover_ms' THEN recent.cover_ms WHEN 'pdf_ms' THEN recent.pdf_ms
      END AS duration
    FROM recent JOIN windows ON recent.at >= windows.since CROSS JOIN metrics
  ),
  ranked AS (
    SELECT period, route_kind, metric, duration,
      ROW_NUMBER() OVER (PARTITION BY period, route_kind, metric ORDER BY duration) AS rank,
      COUNT(*) OVER (PARTITION BY period, route_kind, metric) AS count
    FROM expanded WHERE duration IS NOT NULL
  )
  SELECT period, route_kind, metric, MAX(count) AS count,
    MAX(CASE WHEN rank = (count * 50 + 99) / 100 THEN duration END) AS p50,
    MAX(CASE WHEN rank = (count * 90 + 99) / 100 THEN duration END) AS p90
  FROM ranked GROUP BY period, route_kind, metric`;

/** Caller must verify a real Supabase session and the configured owner first. */
export async function readRumSummary(db?: RumDatabase, options: Pick<RumOptions, 'now'> = {}): Promise<Response> {
  if (!db) return unavailable();
  const now = (options.now ?? Date.now)();
  const sevenDays = new Date(now - 7 * DAY_MS).toISOString();
  const oneDay = new Date(now - DAY_MS).toISOString();
  try {
    const result = await db.prepare(RUM_SUMMARY_SQL)
      .bind(sevenDays, new Date(now).toISOString(), oneDay, sevenDays).all<AggregateRow>();
    const periods = [{ period: '24h' as const, since: oneDay }, { period: '7d' as const, since: sevenDays }];
    const windows = periods.map(window => ({
      ...window,
      rows: RUM_ROUTES.map(route_kind => {
        const row = { route_kind } as RouteSummary;
        for (const metric of RUM_METRICS) {
          const aggregate = result.results?.find(value => value.period === window.period && value.route_kind === route_kind && value.metric === metric);
          row[metric] = aggregate ? { count: aggregate.count, p50: aggregate.p50, p90: aggregate.p90 } : { count: 0, p50: null, p90: null };
        }
        return row;
      }),
    }));
    return json({ percentile_method: 'nearest-rank', windows });
  } catch {
    return unavailable();
  }
}
