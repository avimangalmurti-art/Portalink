import React from 'react';
import { kpisForPeriod, type ReportingPeriodId } from '../../data/studioAnalytics';
import { isKpiActive, kpiStageView } from '../../utils/studioQuery';
import type { PrimaryKpiId, StageView } from '../../utils/studioQuery';

/**
 * The four headline figures — and the product's only visible control for the
 * primary metric on the stage. Each card is a real button whose action and
 * selected state both derive from `kpiStageView`, so no separate selection state
 * exists to drift out of sync.
 *
 * A card states where the metric stands now: label, value, and change. How it
 * moved day to day belongs to the visualization below, which is the whole reason
 * the card is a control — so the card carries no chart of its own.
 *
 * The selected card emerges because the others recede, not because it is
 * decorated: no outline, no glow, just contrast, a quiet accent edge, and the
 * metric's own dot.
 */
export const kpiAccents: Record<PrimaryKpiId, string> = {
  gaze: 'var(--studio-gaze)',
  views: 'var(--studio-accent)',
  engagement: 'var(--studio-coral)',
  audience: 'var(--studio-affinity)'
};
export function StudioKpiStrip({
  view,
  periodId,
  isRecessed,
  onChangeView







}: {view: StageView; /** The active reporting window, owned by the page's period filter. */periodId: ReportingPeriodId; /** True while a piece is being inspected: the strip becomes context. */isRecessed: boolean;onChangeView: (view: StageView) => void;}) {
  const kpis = kpisForPeriod(periodId);
  return <ul className={`m-0 grid list-none grid-cols-2 gap-2.5 p-0 transition-opacity duration-[180ms] ease-out hover:opacity-100 focus-within:opacity-100 motion-reduce:transition-none lg:grid-cols-4 ${isRecessed ? 'opacity-[0.6]' : ''}`}>
      {kpis.map((kpi) => {
      const id = kpi.id as PrimaryKpiId;
      const isSelected = isKpiActive(id, view);
      const accent = kpiAccents[id];
      return <li key={kpi.id} className="list-none">
            {/* An unselected card rests below full contrast and comes forward
             under the pointer or keyboard focus, so attention follows intent
             before anything is committed. */}
            {/* Selection is a neutral block plus an accent-coloured, heavier
             label — never an accent edge or outline. */}
            <button type="button" onClick={() => onChangeView(kpiStageView(id))} aria-pressed={isSelected} className={`flex h-full w-full cursor-pointer flex-col justify-between rounded-[11px] px-3 py-2.5 text-left transition-[background-color,opacity] duration-150 ease-out focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--studio-focus-ring)] motion-reduce:transition-none ${isSelected ? 'bg-[var(--studio-panel-b)] hover:bg-[var(--studio-pressed)]' : 'opacity-[0.72] hover:bg-[var(--studio-panel-b)] hover:opacity-100 focus-visible:opacity-100'}`}>
              <span className="flex items-center gap-1.5">
                {/* The metric's identity, and the only colour on a resting card. */}
                <span aria-hidden="true" data-keep-color="" className="h-1.5 w-1.5 shrink-0 rounded-full" style={{
              backgroundColor: accent,
              opacity: isSelected ? 1 : 0.65
            }} />
                <span data-keep-color={isSelected ? '' : undefined} className={`min-w-0 flex-1 truncate text-[13px] ${isSelected ? 'font-semibold' : 'font-medium text-[var(--studio-text-muted)]'}`} style={isSelected ? {
              color: 'var(--studio-accent)'
            } : undefined}>{kpi.label}</span>
              </span>
              <span className="mt-1.5 flex items-baseline gap-1.5">
                <span className={`text-[32px] font-semibold leading-none tabular-nums tracking-[-0.02em] ${isSelected ? 'text-[var(--studio-text)]' : 'text-[var(--studio-text)]/[0.82]'}`}>{kpi.value}</span>
                {kpi.suffix && <span className="text-[13px] text-[var(--studio-text-muted)]">{kpi.suffix}</span>}
                {kpi.delta && <span data-keep-color="" className="text-[13px] font-semibold tabular-nums" style={{
              color: 'var(--studio-success)',
              opacity: isSelected ? 1 : 0.75
            }}>{kpi.delta}</span>}
              </span>
            </button>
          </li>;
    })}
    </ul>;
}
