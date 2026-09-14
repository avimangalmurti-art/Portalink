import React from 'react';
import { EyeIcon, FileTextIcon, HeadphonesIcon } from 'lucide-react';
import { retentionEntries } from '../../data/studioAnalytics';
import type { StageView } from '../../utils/studioQuery';

/**
 * The detail half of the analytics workspace. It sits beside the visualization
 * rather than beneath it, so the relationship is spatial: pick a piece here,
 * read its curve there.
 *
 * At rest a row is a navigator entry — icon, title, value. The bar, the signal
 * label, and the metadata are revealed on hover, focus, or selection, so the
 * panel stays quiet until the user engages with it. When the stage is already
 * ranking retention, the values leave this panel entirely rather than being
 * printed twice in the same view.
 */
export function ContentRetention({
  view,
  onSelectPiece,
  onChangeView





}: {view: StageView;onSelectPiece: (piece: string) => void; /** The panel heading is itself a control, exactly like a KPI card. */onChangeView: (view: StageView) => void;}) {
  const selectedPiece = view.kind === 'retention' ? view.piece : null;
  const isRanking = view.kind === 'ranking' && view.metric === 'depth';
  // The feature is active whenever the stage is showing retention — either the
  // ranking across pieces or one piece's curve.
  const isFeatureActive = view.kind === 'retention' || isRanking;
  return <section aria-label="Content retention" className={`group/panel flex min-h-0 w-full flex-col transition-opacity duration-[180ms] ease-out hover:opacity-100 focus-within:opacity-100 motion-reduce:transition-none ${isFeatureActive ? '' : 'opacity-[0.78]'}`}>
      {/* Clicking the heading puts retention across all pieces on the stage. */}
      <button type="button" onClick={() => onChangeView({
      kind: 'ranking',
      metric: 'depth'
    })} aria-pressed={isFeatureActive} className="flex shrink-0 flex-col items-start gap-0.5 rounded-[9px] px-2 py-1.5 text-left transition-colors duration-150 hover:bg-[var(--studio-inset)] active:bg-[var(--studio-pressed)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--studio-focus-ring)] motion-reduce:transition-none">
        <span className="flex min-w-0 items-center gap-2">
          <h2 className={`min-w-0 text-[15px] font-semibold leading-tight ${isFeatureActive ? 'text-[var(--studio-text)]' : 'text-[var(--studio-text-muted)]'}`}>Content retention</h2>
          {/* Selection is carried by the dot as well as the weight, never by
             colour alone. */}
          <span aria-hidden="true" data-keep-color="" className="h-1.5 w-1.5 shrink-0 rounded-full" style={{
          backgroundColor: isFeatureActive ? 'var(--studio-gaze)' : 'transparent'
        }} />
        </span>
        <span className="text-[12px] text-[var(--studio-text-tertiary)]">Select content to inspect its curve</span>
      </button>
      <ul className="scrollbar-slim m-0 mt-1.5 min-h-0 flex-1 list-none overflow-y-auto p-0">
        {retentionEntries.map((entry) => {
        const MeasureIcon = entry.measure === 'Listening depth' ? HeadphonesIcon : entry.measure === 'Reading depth' ? FileTextIcon : EyeIcon;
        const isSelected = entry.piece === selectedPiece;
        const isSimulating = entry.status === 'simulating';
        const signal = isSimulating ? 'Simulating' : entry.signal === 'issue' ? 'Page 21' : entry.signal === 'strong' ? 'Strong' : entry.piece === 'Loop Studies Vol. 1' ? 'Drop late' : 'Stable';
        // Meaning decides the dot: green strong, amber diagnostic, yellow
        // pending, neutral stable.
        const signalColor = isSimulating ? 'var(--studio-pending)' : entry.signal === 'issue' ? 'var(--studio-warning)' : entry.signal === 'strong' ? 'var(--studio-success)' : entry.piece === 'Loop Studies Vol. 1' ? 'var(--studio-warning)' : 'var(--studio-neutral-series)';
        const isAudio = entry.measure === 'Listening depth';
        // While another piece is being inspected, the rest of the list becomes
        // context rather than competition.
        const isDimmed = selectedPiece !== null && !isSelected;
        return <li key={entry.piece} className="list-none">
              <button type="button" onClick={() => onSelectPiece(entry.piece)} aria-current={isSelected ? 'true' : undefined} className={`group/row flex h-[46px] w-full cursor-pointer items-center gap-2.5 rounded-[9px] px-2 text-left transition-[background-color,opacity] duration-150 ease-out hover:bg-[var(--studio-inset)] hover:opacity-100 focus-visible:opacity-100 active:bg-[var(--studio-pressed)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--studio-focus-ring)] motion-reduce:transition-none ${isDimmed ? 'opacity-[0.6]' : ''}`} style={isSelected ? {
            // Neutral block only: the accent lives in the label, not the edge.
            backgroundColor: 'var(--studio-panel-b)'
          } : undefined}>
                {/* Media type as a micro-colour: cyan for listening. */}
                <MeasureIcon data-keep-color="" className="h-4 w-4 shrink-0" style={{
              color: isAudio ? 'var(--studio-audio)' : 'var(--studio-text-tertiary)'
            }} aria-hidden="true" />
                <span className="min-w-0 flex-1">
                  <span data-keep-color={isSelected ? '' : undefined} className={`block truncate text-[14px] leading-tight ${isSelected ? 'font-semibold' : 'font-medium'}`} style={isSelected ? {
                color: 'var(--studio-accent)'
              } : undefined}>{entry.piece}</span>
                  {/* Revealed detail: the signal, and the piece's own metadata
                   once it is the thing being looked at. */}
                  <span className={`mt-0.5 flex items-center gap-1.5 overflow-hidden text-[12px] leading-tight text-[var(--studio-text-tertiary)] transition-opacity duration-150 ease-out group-hover/row:opacity-100 group-focus-visible/row:opacity-100 motion-reduce:transition-none ${isSelected ? 'opacity-100' : 'opacity-0'}`}>
                    <span aria-hidden="true" data-keep-color="" className="h-1.5 w-1.5 shrink-0 rounded-full" style={{
                  backgroundColor: signalColor
                }} />
                    <span className="truncate">{signal}{isSelected ? ` · ${entry.meta}` : ''}</span>
                  </span>
                </span>
                {/* A processing piece states its state rather than inventing a
                 percentage. When the stage already ranks these values, the
                 panel drops them so nothing is printed twice. */}
                {!isRanking && <span className="flex w-[58px] shrink-0 flex-col items-end gap-1">
                    {entry.completion !== null ? <>
                        <span className={`text-[14px] font-semibold leading-none tabular-nums ${isSelected ? 'text-[var(--studio-text)]' : ''}`}>{entry.completion}%</span>
                        <span aria-hidden="true" className={`block h-1 w-full overflow-hidden rounded-full transition-opacity duration-150 ease-out group-hover/row:opacity-100 group-focus-visible/row:opacity-100 motion-reduce:transition-none ${isSelected ? 'opacity-100' : 'opacity-0'}`} style={{
                  backgroundColor: 'var(--analytics-neutral)'
                }}>
                          {/* Retention reads neutral-to-purple; a diagnostic
                       drop keeps its amber signal. */}
                          <span data-keep-color="" className="block h-full rounded-full" style={{
                    width: `${entry.completion}%`,
                    backgroundColor: entry.signal === 'issue' ? 'var(--studio-warning)' : isSelected ? 'var(--studio-gaze)' : 'var(--studio-neutral-series)'
                  }} />
                        </span>
                      </> : <span className="text-[12px] leading-none text-[var(--studio-text-tertiary)]">Simulating</span>}
                  </span>}
                {isRanking && entry.completion === null && <span className="shrink-0 text-[12px] text-[var(--studio-text-tertiary)]">Simulating</span>}
              </button>
            </li>;
      })}
      </ul>
    </section>;
}
