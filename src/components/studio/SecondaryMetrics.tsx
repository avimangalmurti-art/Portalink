import React from 'react';
import { secondaryMetrics } from '../../data/studioAnalytics';

/**
 * Supporting figures only. These are deliberately not selectable — the primary
 * KPI cards are the sole control for what the stage shows — so this renders as a
 * dense description list rather than a row of controls.
 *
 * It rests as metadata at reduced emphasis and returns to full contrast on
 * hover or keyboard focus, so it is always readable without ever competing with
 * the analysis above it.
 */
export function SecondaryMetrics({
  isRecessed



}: { /** True while a piece is being inspected: these drop further back. */isRecessed: boolean;}) {
  return <dl className={`grid grid-cols-2 gap-x-4 gap-y-3 border-t border-[var(--studio-border)] px-4 py-3 transition-opacity duration-[180ms] hover:opacity-100 focus-within:opacity-100 sm:grid-cols-3 lg:grid-cols-6 ${isRecessed ? 'opacity-60' : 'opacity-80'}`}>
      {secondaryMetrics.map((metric) => <div key={metric.label} className="min-w-0">
          <dt className="truncate text-[11px] text-[var(--studio-text-muted)]">{metric.label}</dt>
          <dd className="mt-0.5 flex items-baseline gap-1 text-[13px] font-semibold tabular-nums text-[var(--studio-text)]">
            {metric.value}
            {'delta' in metric && metric.delta ? <span className="text-[10px] font-medium text-[var(--studio-positive)]">{metric.delta}</span> : null}
          </dd>
        </div>)}
    </dl>;
}
