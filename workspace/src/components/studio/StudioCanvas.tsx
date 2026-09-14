import React, { useState } from 'react';
import { ArrowLeftIcon, SparklesIcon } from 'lucide-react';
import { contentReach, getReportingPeriod, retentionCurves, retentionEntries, timeSeriesForPeriod, type ReportingPeriodId } from '../../data/studioAnalytics';
import type { StageView } from '../../utils/studioQuery';
import { useElementSize } from '../../hooks/useElementSize';
import { InterfaceIcon } from '../ui/InterfaceIcon';
type StudioCanvasProps = {
  view: StageView;
  /** The active reporting window, owned by the page's period filter. */
  periodId: ReportingPeriodId;
  /** True when the current stage came from an AI question. */
  isGenerated: boolean;
  onChangeView: (view: StageView) => void;
  onSelectPiece: (piece: string) => void;
  /** Returns the stage to the selected metric's series over the active period. */
  onBackToWeekly: () => void;
};

/**
 * One analytical stage. Each visualization carries a single dominant accent —
 * purple for attention, blue for reach — with other semantic colours reserved
 * for anomalies, AI annotation, and positive signals.
 */
export function StudioCanvas({
  view,
  periodId,
  isGenerated,
  onChangeView,
  onSelectPiece,
  onBackToWeekly
}: StudioCanvasProps) {
  return <section aria-label="Visualization" className="flex min-h-0 min-w-0 flex-1 flex-col">
      {/* Keyed on metric and window so the hovered point resets when either
         changes. */}
      {view.kind === 'timeseries' && <TimeSeriesStage key={`${view.metric}:${periodId}`} view={view} periodId={periodId} isGenerated={isGenerated} />}
      {view.kind === 'ranking' && <RankingStage view={view} isGenerated={isGenerated} onChangeView={onChangeView} onSelectPiece={onSelectPiece} />}
      {view.kind === 'retention' && <RetentionStage piece={view.piece} isGenerated={isGenerated} onBackToWeekly={onBackToWeekly} />}
      {view.kind === 'comparison' && <ComparisonStage view={view} isGenerated={isGenerated} onChangeView={onChangeView} />}
    </section>;
}
function StageHeader({
  title,
  summary,
  isGenerated,
  children





}: {title: string;summary: string;isGenerated: boolean;children?: React.ReactNode;}) {
  return <header className="flex shrink-0 flex-wrap items-start justify-between gap-3 pb-2">
      <div className="min-w-0">
        <h2 className="text-[18px] font-semibold leading-tight">{title}</h2>
        <p className="mt-0.5 text-[13px] text-[var(--studio-text-muted)]">{summary}</p>
        {/* AI provenance: the glyph carries the colour, the text stays grey. */}
        {isGenerated && <p className="mt-1 flex items-center gap-1.5 text-[11px] text-[var(--studio-text-tertiary)]">
            <SparklesIcon data-keep-color="" className="h-3 w-3 shrink-0" style={{
          color: 'var(--studio-indigo)'
        }} aria-hidden="true" />
            Generated from the question
          </p>}
      </div>
      {children}
    </header>;
}

/** A compact desktop pull-down for switching the metric on the stage. */
function MetricSelect({
  label,
  value,
  options,
  onChange








}: {label: string;value: string;options: {id: string;label: string;}[];onChange: (id: string) => void;}) {
  return <label className="flex shrink-0 items-center gap-2">
      <span className="text-[11px] uppercase tracking-[0.05em] text-[var(--studio-text-tertiary)]">{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)} className="h-8 cursor-pointer rounded-[8px] border border-[var(--studio-hairline-strong)] bg-[var(--studio-inset)] px-2 text-[12px] font-medium text-[var(--studio-text)] transition-colors duration-150 hover:bg-[var(--studio-pressed)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--studio-focus-ring)]">
        {options.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
      </select>
    </label>;
}

/** Room reserved below the plot for the axis labels, and above it for the peak. */
const AXIS_HEIGHT = 26;
const PLOT_INSET = 28;

/**
 * One accent owns the stage at a time: whichever metric is selected. Gaze is
 * purple, reach blue, engagement coral, audience rose, listening cyan — and a
 * retention inspection takes retention's own purple.
 */
function seriesColor(metric: string) {
  return metric === 'gaze' ? 'var(--studio-gaze)' : metric === 'plays' ? 'var(--studio-audio)' : metric === 'followers' ? 'var(--studio-affinity)' : 'var(--studio-accent)';
}
function TimeSeriesStage({
  view,
  periodId,
  isGenerated






}: {view: Extract<StageView, {kind: 'timeseries';}>;periodId: ReportingPeriodId;isGenerated: boolean;}) {
  const series = timeSeriesForPeriod(view.metric, periodId);
  const periodLabel = getReportingPeriod(periodId).label;
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const accent = seriesColor(view.metric);
  const peak = Math.max(...series.points.map((point) => point.value));
  // The chart is measured rather than fixed, so it grows into whatever height
  // the workspace has left. A 1:1 viewBox keeps strokes and points undistorted.
  const box = useElementSize<HTMLDivElement>();
  const width = Math.max(box.width, 320);
  const height = Math.max(box.height - AXIS_HEIGHT, 120);
  const step = width / (series.points.length - 1);
  const coordinates = series.points.map((point, index) => ({
    x: index * step,
    y: height - point.value / peak * (height - PLOT_INSET),
    point
  }));
  const line = coordinates.map((coordinate) => `${coordinate.x},${coordinate.y}`).join(' ');
  const selected = selectedIndex === null ? null : coordinates[selectedIndex];
  return <>
      {/* The KPI cards select the metric and own its value and trend, so the
         chart states only what it is responsible for: temporal behaviour. The
         reporting period comes from the header control. */}
      <StageHeader title={series.label} summary={`Measured in ${series.unit}`} isGenerated={isGenerated} />
      <div ref={box.ref} className="min-h-0 min-w-0 flex-1">
        <svg viewBox={`0 0 ${width} ${height + AXIS_HEIGHT}`} className="block h-full w-full" role="img" aria-label={`${series.label} over the ${periodLabel.toLowerCase()}: ${series.points.map((point) => `${point.label} ${point.value}`).join(', ')}`}>
          {[0.25, 0.5, 0.75, 1].map((fraction) => <line key={fraction} x1={0} x2={width} y1={height - fraction * (height - PLOT_INSET)} y2={height - fraction * (height - PLOT_INSET)} stroke="var(--studio-hairline)" strokeWidth="0.5" />)}
          <polygon points={`0,${height} ${line} ${width},${height}`} fill={accent} fillOpacity="0.12" />
          <polyline points={line} fill="none" stroke={accent} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
          {coordinates.map((coordinate, index) => {
          const isSelected = selectedIndex === index;
          return <g key={coordinate.point.label}>
                {/* Focused point takes the interaction blue. */}
                <circle cx={coordinate.x} cy={coordinate.y} r={isSelected ? 5 : 3.5} fill={isSelected ? 'var(--studio-accent)' : accent} />
                <circle tabIndex={0} role="button" aria-label={`${coordinate.point.label}: ${coordinate.point.value} ${series.unit}`} onFocus={() => setSelectedIndex(index)} onBlur={() => setSelectedIndex((current) => current === index ? null : current)} onMouseEnter={() => setSelectedIndex(index)} onMouseLeave={() => setSelectedIndex((current) => current === index ? null : current)} cx={coordinate.x} cy={coordinate.y} r="14" fill="transparent" className="cursor-pointer focus:outline-none" />
                <text x={coordinate.x} y={height + 18} textAnchor="middle" fontSize="12" fill={isSelected ? 'var(--studio-text)' : 'var(--studio-text-tertiary)'}>{coordinate.point.label}</text>
              </g>;
        })}
        </svg>
      </div>
      {/* Neutral tooltip surface; colour only on the series dot. The slot is
         reserved so hovering a point never shifts the chart, and it carries no
         standing instruction — the interaction speaks for itself. */}
      <div className="flex min-h-[28px] shrink-0 items-center">
        {selected && <span className="inline-flex items-center gap-2 rounded-[8px] border border-[var(--studio-hairline-strong)] bg-[var(--studio-elevated)] px-2.5 py-1">
            <span aria-hidden="true" data-keep-color="" className="h-1.5 w-1.5 rounded-full" style={{
          backgroundColor: accent
        }} />
            <span className="text-[13px] text-[var(--studio-text-muted)]">{selected.point.label}</span>
            <span className="text-[13px] font-semibold tabular-nums text-[var(--studio-text)]">{selected.point.value} {series.unit === 'hours' ? 'hrs' : ''}</span>
          </span>}
      </div>
    </>;
}
function RankingStage({
  view,
  isGenerated,
  onChangeView,
  onSelectPiece







}: {view: Extract<StageView, {kind: 'ranking';}>;isGenerated: boolean;onChangeView: (view: StageView) => void;onSelectPiece: (piece: string) => void;}) {
  const rows = view.metric === 'depth' ? retentionEntries.filter((entry) => entry.completion !== null).sort((a, b) => (b.completion ?? 0) - (a.completion ?? 0)).map((entry) => ({
    title: entry.piece,
    value: entry.completion as number,
    display: `${entry.completion}%`,
    signal: entry.signal,
    isAudio: entry.measure === 'Listening depth',
    selectable: true
  })) : contentReach.map((entry) => ({
    title: entry.title,
    value: entry.value,
    display: `${entry.value.toLocaleString()} ${entry.unit}`,
    signal: undefined,
    isAudio: false,
    selectable: false
  }));
  const peak = Math.max(...rows.map((row) => row.value));
  return <>
      <StageHeader title={view.metric === 'depth' ? 'Attention held by content' : 'Reach by content'} summary={view.metric === 'depth' ? 'Share of each piece the average audience reaches' : 'Views recorded against each piece'} isGenerated={isGenerated}>
        <MetricSelect label="Metric" value={view.metric} options={[{
        id: 'depth',
        label: 'Retention'
      }, {
        id: 'views',
        label: 'Views'
      }]} onChange={(metric) => onChangeView({
        kind: 'ranking',
        metric: metric as 'depth' | 'views'
      })} />
      </StageHeader>
      <ul className="scrollbar-slim m-0 min-h-0 flex-1 list-none overflow-y-auto p-0 pt-2">
        {rows.map((row) => {
        // Attention is purple; reach is blue. Anomalies keep their own signal.
        // Engagement owns this stage, so its coral leads; a diagnostic keeps its
        // amber signal and the rest stay tonal rather than rainbow.
        const barColor = view.metric === 'views' ? row.value === peak ? 'var(--studio-accent)' : 'var(--studio-neutral-series)' : row.signal === 'issue' ? 'var(--studio-warning)' : row.value === peak ? 'var(--studio-coral)' : 'var(--studio-coral-low)';
        return <li key={row.title} className="mb-3 list-none last:mb-0">
              <button type="button" disabled={!row.selectable} onClick={() => onSelectPiece(row.title)} className="w-full cursor-pointer rounded-[8px] px-1 py-1 text-left transition-colors duration-150 hover:bg-[var(--studio-inset)] disabled:cursor-default disabled:hover:bg-transparent focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--studio-focus-ring)]">
                <span className="flex items-baseline justify-between gap-3">
                  <span className="flex min-w-0 items-baseline gap-1.5">
                    {/* Media-type micro-colour, 4px and nothing more. */}
                    {row.isAudio && <span aria-hidden="true" data-keep-color="" className="h-1 w-1 shrink-0 translate-y-[-2px] rounded-full" style={{
                  backgroundColor: 'var(--studio-audio)'
                }} />}
                    <span className="min-w-0 truncate text-[13px] font-medium">{row.title}</span>
                  </span>
                  <span className="flex shrink-0 items-baseline gap-1.5">
                    <span className="text-[13px] font-semibold tabular-nums">{row.display}</span>
                    {row.signal === 'strong' && <span aria-label="Strong" data-keep-color="" className="h-1.5 w-1.5 rounded-full" style={{
                  backgroundColor: 'var(--studio-success)'
                }} />}
                  </span>
                </span>
                <span aria-hidden="true" className="mt-1.5 block h-2.5 w-full overflow-hidden rounded-[3px]" style={{
              backgroundColor: 'var(--analytics-neutral)'
            }}>
                  <span data-keep-color="" className="block h-full rounded-[3px] transition-[width] duration-200 ease-out" style={{
                width: `${row.value / peak * 100}%`,
                backgroundColor: barColor
              }} />
                </span>
              </button>
            </li>;
      })}
      </ul>
    </>;
}
/** Returns the stage to the metric series, without leaving the workspace. */
function BackToWeekly({
  onBackToWeekly


}: {onBackToWeekly: () => void;}) {
  return <button type="button" onClick={onBackToWeekly} className="inline-flex h-8 shrink-0 cursor-pointer items-center gap-1.5 rounded-[8px] border border-[var(--studio-hairline-strong)] px-2.5 text-[13px] font-medium text-[var(--studio-text-muted)] transition-colors duration-150 hover:bg-[var(--studio-inset)] hover:text-[var(--studio-text)] active:bg-[var(--studio-pressed)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--studio-focus-ring)]">
      <InterfaceIcon icon={ArrowLeftIcon} size="sm" weight="medium" mirroredInRtl />
      Weekly overview
    </button>;
}
function RetentionStage({
  piece,
  isGenerated,
  onBackToWeekly




}: {piece: string;isGenerated: boolean;onBackToWeekly: () => void;}) {
  const entry = retentionEntries.find((item) => item.piece === piece);
  const curve = retentionCurves[piece];
  const box = useElementSize<HTMLDivElement>();
  if (!entry || !curve) {
    return <>
        <StageHeader title={piece} summary="No retention curve available for this piece yet." isGenerated={isGenerated}>
          <BackToWeekly onBackToWeekly={onBackToWeekly} />
        </StageHeader>
        <p className="flex flex-1 items-center justify-center gap-2 text-center text-[14px] text-[var(--studio-text-muted)]">
          {/* Pending baseline reads yellow, and only on the dot. */}
          <span aria-hidden="true" data-keep-color="" className="h-1.5 w-1.5 shrink-0 rounded-full" style={{
          backgroundColor: 'var(--studio-pending)'
        }} />
          {entry?.note ?? 'Not enough viewing data yet.'}
        </p>
      </>;
  }
  const isAudio = entry.measure === 'Listening depth';
  const curveColor = isAudio ? 'var(--studio-audio)' : 'var(--studio-gaze)';
  const width = Math.max(box.width, 320);
  const height = Math.max(box.height - AXIS_HEIGHT, 120);
  const step = width / (curve.points.length - 1);
  const coordinates = curve.points.map((point, index) => ({
    x: index * step,
    y: height - point.percent / 100 * (height - PLOT_INSET),
    point
  }));
  const annotationIndex = curve.points.findIndex((point) => point.position === curve.annotation.position);
  const annotationX = annotationIndex >= 0 ? annotationIndex * step : null;
  const isAnomaly = entry.signal === 'issue';
  return <>
      <StageHeader title={`${piece} — audience retention`} summary={`${entry.meta} · ${entry.measure} ${entry.completion}%`} isGenerated={isGenerated}>
        <BackToWeekly onBackToWeekly={onBackToWeekly} />
      </StageHeader>
      <div ref={box.ref} className="min-h-0 min-w-0 flex-1">
        <svg viewBox={`0 0 ${width} ${height + AXIS_HEIGHT}`} className="block h-full w-full" role="img" aria-label={`${piece} retention: ${curve.points.map((point) => `${curve.axisLabel} ${point.position} at ${point.percent}%`).join(', ')}`}>
          {[0.25, 0.5, 0.75, 1].map((fraction) => <line key={fraction} x1={0} x2={width} y1={height - fraction * (height - PLOT_INSET)} y2={height - fraction * (height - PLOT_INSET)} stroke="var(--studio-hairline)" strokeWidth="0.5" />)}
          <polyline points={coordinates.map((coordinate) => `${coordinate.x},${coordinate.y}`).join(' ')} fill="none" stroke={curveColor} strokeWidth="2" strokeLinejoin="round" />
          {coordinates.map((coordinate) => <circle key={coordinate.point.position} cx={coordinate.x} cy={coordinate.y} r="3" fill={curveColor} fillOpacity="0.55" />)}
          {/* The anomaly is a point, not a fill: orange marks page 21 alone. */}
          {annotationX !== null && <>
              <line x1={annotationX} x2={annotationX} y1={0} y2={height} stroke={isAnomaly ? 'var(--studio-warning)' : 'var(--studio-neutral-series)'} strokeWidth="1" strokeDasharray="3 3" />
              <circle cx={annotationX} cy={coordinates[annotationIndex].y} r="4.5" fill={isAnomaly ? 'var(--studio-warning)' : entry.signal === 'strong' ? 'var(--studio-success)' : curveColor} />
            </>}
          {coordinates.map((coordinate) => <text key={`label-${coordinate.point.position}`} x={coordinate.x} y={height + 18} textAnchor="middle" fontSize="12" fill="var(--studio-text-tertiary)">{coordinate.point.position}</text>)}
        </svg>
      </div>
      <div className="mt-1 flex shrink-0 flex-wrap items-center justify-between gap-2">
        <p className="text-[12px] uppercase tracking-[0.05em] text-[var(--studio-text-tertiary)]">{curve.axisLabel}</p>
        <p data-keep-color="" className="text-[13px] font-medium" style={{
        color: isAnomaly ? 'var(--studio-warning)' : entry.signal === 'strong' ? 'var(--studio-success)' : 'var(--studio-text-muted)'
      }}>{curve.annotation.label}</p>
      </div>
      {/* AI interpretation: an indigo edge and glyph, on a neutral surface. */}
      <div className="mt-2 flex shrink-0 items-start gap-2 rounded-[8px] border-l-2 py-1.5 pl-2.5 pr-2" style={{
      backgroundColor: 'var(--studio-indigo-soft)',
      borderLeftColor: 'var(--studio-indigo)'
    }}>
        <SparklesIcon data-keep-color="" className="mt-0.5 h-3 w-3 shrink-0" style={{
        color: 'var(--studio-indigo)'
      }} aria-hidden="true" />
        <p className="min-w-0 text-[13px] leading-[1.5] text-[var(--studio-text-muted)]">
          <span className="mr-1.5 font-semibold uppercase tracking-[0.05em] text-[var(--studio-text-tertiary)]">AI insight</span>
          {entry.note}
        </p>
      </div>
    </>;
}
function ComparisonStage({
  view,
  isGenerated,
  onChangeView






}: {view: Extract<StageView, {kind: 'comparison';}>;isGenerated: boolean;onChangeView: (view: StageView) => void;}) {
  const rows = view.pieces.map((piece) => {
    const entry = retentionEntries.find((item) => item.piece === piece);
    const reach = contentReach.find((item) => item.title === piece);
    const value = view.metric === 'depth' ? entry?.completion ?? null : reach?.value ?? null;
    return {
      piece,
      value,
      signal: entry?.signal,
      display: value === null ? '—' : view.metric === 'depth' ? `${value}%` : `${value.toLocaleString()} views`,
      meta: entry?.meta ?? ''
    };
  });
  const peak = Math.max(1, ...rows.map((row) => row.value ?? 0));
  return <>
      <StageHeader title="Newest three pieces compared" summary={view.metric === 'depth' ? 'Retention depth side by side' : 'Recorded views side by side'} isGenerated={isGenerated}>
        <MetricSelect label="Metric" value={view.metric} options={[{
        id: 'depth',
        label: 'Retention'
      }, {
        id: 'views',
        label: 'Views'
      }]} onChange={(metric) => onChangeView({
        ...view,
        metric: metric as 'depth' | 'views'
      })} />
      </StageHeader>
      <div className="grid min-h-0 flex-1 grid-cols-3 items-end gap-4 pb-1 pt-6">
        {rows.map((row) => {
        // Leader keeps the semantic accent; the rest are neutral greys.
        const barColor = row.value === null ? 'var(--studio-hairline-strong)' : row.signal === 'issue' ? 'var(--studio-warning)' : row.value === peak ? 'var(--studio-gaze)' : 'var(--studio-neutral-series)';
        return <div key={row.piece} className="flex h-full min-w-0 flex-col justify-end">
              <p className="mb-1.5 flex items-baseline justify-center gap-1.5 text-[13px] font-semibold tabular-nums">
                {row.display}
                {row.signal === 'strong' && <span aria-label="Strong" data-keep-color="" className="h-1.5 w-1.5 rounded-full" style={{
              backgroundColor: 'var(--studio-success)'
            }} />}
              </p>
              <span aria-hidden="true" data-keep-color="" className="block w-full rounded-t-[4px]" style={{
            height: `${row.value === null ? 2 : Math.max(row.value / peak * 100, 4)}%`,
            backgroundColor: barColor
          }} />
              <p className="mt-2 truncate text-center text-[12px] text-[var(--studio-text-muted)]" title={row.piece}>{row.piece}</p>
              <p className="truncate text-center text-[11px] text-[var(--studio-text-tertiary)]">{row.meta}</p>
            </div>;
      })}
      </div>
    </>;
}
