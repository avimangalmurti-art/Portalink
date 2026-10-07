import React, { useCallback, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { getRumInsights, type TimingMetric } from '../../services/supabase/rumInsightsService';
import { useAccountQuery } from './useAccountQuery';

const metrics = [['boot_ms', 'App start'], ['data_ms', 'First data'], ['cover_ms', 'First cover'], ['pdf_ms', 'First PDF page']] as const;
function metricLabel(value: TimingMetric) {
  const ms = (number: number | null) => number === null ? '—' : `${Math.round(number).toLocaleString()} ms`;
  return `${ms(value.p50)} / ${ms(value.p90)}`;
}

export default function LoadTimingInsights() {
  const auth = useAuth();
  const [period, setPeriod] = useState<'24h' | '7d'>('24h');
  const query = useCallback(() => auth.session?.isPrototype ? Promise.resolve(null) : getRumInsights(), [auth.session?.isPrototype]);
  const state = useAccountQuery(query);
  if (!auth.isAuthenticated || (!state.data && !state.error)) return null;
  const window = state.data?.windows.find(item => item.period === period);
  return <section aria-label="Site load timings" className="mt-8 border-t border-[var(--hairline)] pt-6">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h2 className="text-[15px] font-semibold">Site load timings</h2>
      <button type="button" onClick={state.retry} disabled={state.loading} className="shape-compact px-3 py-2 text-[13px] hover:bg-[var(--surface-hover)] focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]">Refresh timings</button>
    </div>
    <p className="mt-2 text-[12px] text-[var(--text-secondary)]">Median / 90th percentile, measured from navigation start. Only the platform owner can see this table.</p>
    <div role="group" aria-label="Timing period" className="side-panel-control-row my-4">
      {(['24h', '7d'] as const).map(value => <button key={value} type="button" aria-pressed={period === value} onClick={() => setPeriod(value)} className={`side-panel-primary-control px-4 text-[13px] focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] ${period === value ? 'bg-[var(--surface-selected)] text-[var(--accent-text)]' : 'text-[var(--text-secondary)] hover:bg-[var(--surface-hover)]'}`}>{value === '24h' ? 'Last 24 hours' : 'Last 7 days'}</button>)}
    </div>
    {state.error ? <p role="status" className="text-[13px] text-[var(--text-secondary)]">{state.error}</p> : window ? <div className="overflow-x-auto">
      <table className="w-full min-w-[540px] border-collapse text-left text-[12px] tabular-nums">
        <caption className="sr-only">{period === '24h' ? 'Last 24 hours' : 'Last 7 days'}: median and 90th percentile loading times in milliseconds.</caption>
        <thead><tr className="border-b border-[var(--hairline)]"><th scope="col" className="py-3 pr-3 font-semibold">Page</th>{metrics.map(([key, title]) => <th key={key} scope="col" className="px-2 py-3 font-semibold">{title}</th>)}</tr></thead>
        <tbody>{window.rows.map(row => <tr key={row.route_kind} className="border-b border-[var(--hairline)]"><th scope="row" className="py-3 pr-3 font-medium capitalize">{row.route_kind}</th>{metrics.map(([key]) => <td key={key} className="px-2 py-3"><span className="whitespace-nowrap">{metricLabel(row[key])}</span><span className="mt-1 block text-[10px] text-[var(--text-secondary)]">{row[key].count.toLocaleString()} samples</span></td>)}</tr>)}</tbody>
      </table>
    </div> : null}
    <p className="mt-3 text-[12px] text-[var(--text-secondary)]">A dash means no measurement yet. Page views report when visitors leave the page or hide the tab; samples are retained for 30 days.</p>
  </section>;
}
