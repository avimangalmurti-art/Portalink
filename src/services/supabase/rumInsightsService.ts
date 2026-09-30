import { requireSupabase } from './client';

export type TimingMetric = { count: number; p50: number | null; p90: number | null };
export type TimingRow = { route_kind: 'share' | 'profile' | 'project' | 'home'; boot_ms: TimingMetric; data_ms: TimingMetric; cover_ms: TimingMetric; pdf_ms: TimingMetric };
export type TimingSummary = { percentile_method: 'nearest-rank'; windows: Array<{ period: '24h' | '7d'; since: string; rows: TimingRow[] }> };

/** The worker decides platform ownership; no owner identity or tokens enter UI state. */
export async function getRumInsights(): Promise<TimingSummary | null> {
  let response: Response;
  try {
    const { data, error } = await requireSupabase().auth.getSession();
    if (error || !data.session?.access_token) return null;
    response = await fetch('/api/rum/summary', { headers: { authorization: `Bearer ${data.session.access_token}` }, cache: 'no-store', credentials: 'omit', redirect: 'error', signal: AbortSignal.timeout(10_000) });
  } catch { return null; }
  // This header is emitted only after server-side ownership verification. Keep
  // the entire section absent for guests, other creators and unset config.
  if (response.headers.get('x-portalink-rum-owner') !== 'true') return null;
  if (!response.ok) throw new Error('Load timings are not available yet.');
  const summary = await response.json() as TimingSummary;
  if (summary.percentile_method !== 'nearest-rank' || !Array.isArray(summary.windows)) throw new Error('Load timings could not be read.');
  return summary;
}
