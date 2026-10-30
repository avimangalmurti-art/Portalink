import React, { lazy, Suspense, useCallback, useRef, useState } from 'react';
import { ArrowUpRightIcon, BookmarkIcon, CalendarDaysIcon, CheckIcon, EyeIcon, FileTextIcon } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useServices } from '../../contexts/ServicesContext';
import { InterfaceIcon } from '../../components/ui/InterfaceIcon';
import { ErrorState, LoadingState } from '../../components/ui/StateViews';
import { worldOutline } from '../../data/worldOutline';
import type { SaveInsights } from '../../types/creatorSaves';
import { useAccountQuery } from './useAccountQuery';
import { READ_PERIODS, type ReadPeriod } from '../reads/readSignal';
import { ProjectCover } from '../../components/media/ProjectCover';
import { getProjectCoverPreview } from '../../utils/projectPresentation';
import { usePresentation } from '../../presentation/usePresentation';
import { useMobileScreenActive } from '../../presentation/mobile/MobileBackNavigation';
import { useHomePullRefresh } from '../../components/home/useHomePullRefresh';
import './insights.css';

const LoadTimingInsights = lazy(() => import('./LoadTimingInsights'));
const metrics = [
  { key: 'opened', label: 'Opens', unit: 'project opens', icon: EyeIcon },
  { key: 'finished', label: 'Completed', unit: 'completed reads', icon: CheckIcon },
  { key: 'saved', label: 'Page saves', unit: 'current page saves', icon: BookmarkIcon },
] as const;
const sources = [['own-link', 'Your link'], ['messages', 'Messages'], ['linkedin', 'LinkedIn'], ['other', 'Other']] as const;
type Metric = typeof metrics[number]['key'];
type SavesState = { data?: SaveInsights; loading: boolean; refreshing?: boolean; error?: string; retry: () => void };
const compactCount = (value: number) => value >= 10_000 ? value.toLocaleString(undefined, { notation: 'compact', maximumFractionDigits: 0 }) : value.toLocaleString();

/** Both frames use the same private data presentation and retain their initial periods. */
export function MobileInsights({ saves, initialPeriod = '7d' }: { saves: SavesState; initialPeriod?: ReadPeriod }) {
  const isMobile = usePresentation() === 'mobile';
  const screenActive = useMobileScreenActive();
  const surfaceRef = useRef<HTMLDivElement>(null);
  const { reads, projects } = useServices();
  const navigate = useNavigate();
  const [period, setPeriod] = useState<ReadPeriod>(initialPeriod);
  const periodLabel = READ_PERIODS.find(item => item.key === period)?.label ?? '7 days';
  const query = useCallback(() => reads ? reads.list(period) : Promise.reject(new Error('Reads are not available yet.')), [reads, period]);
  const state = useAccountQuery(query, reads ? { key: `reads:list:${period}`, scope: reads } : undefined);
  const coverQuery = useCallback(async () => {
    const ids = [...new Set((state.data ?? []).map(row => row.profileId))];
    return (await Promise.all(ids.map(id => projects.listProjects(id)))).flat();
  }, [projects, state.data]);
  const covers = useAccountQuery(coverQuery);
  const [metric, setMetric] = useState<Metric>('opened');
  const [showAll, setShowAll] = useState(false);
  const rows = state.data ?? [];
  const activeMetric = metrics.find(item => item.key === metric) ?? metrics[0];
  const totals = rows.reduce((sum, row) => ({ opened: sum.opened + row.opened, finished: sum.finished + row.finished, saved: sum.saved + row.saved }), { opened: 0, finished: 0, saved: 0 });
  const ranked = [...rows].sort((a, b) => b[metric] - a[metric] || a.title.localeCompare(b.title));
  const chartRows = ranked.slice(0, 8);
  const maximum = Math.max(1, ...chartRows.map(row => row[metric]));
  const average = rows.length ? totals[metric] / rows.length : 0;
  const refRows = sources.map(([key, label]) => ({ key, label, count: rows.reduce((sum, row) => sum + (row.refs[key] ?? 0), 0) })).filter(row => Number.isFinite(row.count) && row.count > 0).sort((a, b) => b.count - a.count);
  const refMaximum = Math.max(1, ...refRows.map(row => row.count));
  const openProject = (id: string) => navigate(`/insights?project=${encodeURIComponent(id)}&period=${period}`);
  const refresh = () => { state.retry(); covers.retry(); saves.retry(); };
  const busy = Boolean(state.loading || state.refreshing || covers.loading || covers.refreshing || saves.loading || saves.refreshing);
  const pullLabel = useHomePullRefresh(surfaceRef, isMobile && screenActive, busy, refresh, undefined,
    () => surfaceRef.current?.closest<HTMLElement>('.mobile-insights-scroll')?.scrollTop ?? Infinity);
  const metricControls = !state.loading && !state.error ? <div className="insights-metrics" data-ui-shape="capsule" role="group" aria-label="Insight metric">
    {metrics.map(item => <button data-ui-shape="action" data-system-color="" data-insights-series={item.key} type="button" key={item.key} aria-pressed={metric === item.key} onClick={() => setMetric(item.key)}><InterfaceIcon icon={item.icon} size="xs" /><span>{item.label}</span></button>)}
  </div> : null;
  return <div ref={surfaceRef} className="creator-insights" data-insights-metric={metric} aria-busy={isMobile && busy || undefined}>
    <div className="insights-period">
      {isMobile ? <><label className="insights-period-picker" title={`Insights period: ${periodLabel}`}>
        <InterfaceIcon icon={CalendarDaysIcon} size="sm" />
        <select aria-label="Insights period" title={`Insights period: ${periodLabel}`} value={period} onChange={event => setPeriod(event.target.value as ReadPeriod)}>{READ_PERIODS.map(item => <option key={item.key} value={item.key}>{item.label}</option>)}</select>
      </label>{metricControls}</> : <>
        <select data-ui-shape="action" aria-label="Insights period" value={period} onChange={event => setPeriod(event.target.value as ReadPeriod)}>{READ_PERIODS.map(item => <option key={item.key} value={item.key}>{item.label}</option>)}</select>
        <button data-ui-shape="action" type="button" onClick={refresh} disabled={state.loading || state.refreshing || saves.loading || saves.refreshing}>Refresh</button>
      </>}
    </div>
    {isMobile && <div className="insights-refresh-status" role="status" aria-live="polite">{pullLabel || (busy && !state.loading && !saves.loading ? 'Refreshing insights…' : '')}</div>}
    {state.loading ? <LoadingState kind="insights" label="Loading insights" /> : state.error ? <ErrorState title="Unable to load reads" description={state.error} onRetry={state.retry} /> : <>
      {!isMobile && metricControls}
      <section className="insights-activity" aria-label="Project activity">
        <h2 className="insights-section-title">Project activity</h2>
        <div className="insights-data-surface">
          <p className="insights-eyebrow">{metric === 'saved' ? 'Current totals' : periodLabel}</p>
          {/* Alternatives reserve the same summary height for every metric, including large totals. */}
          <h3 className="insights-headline">{metrics.map(item => <span key={item.key} aria-hidden={metric !== item.key || undefined}><strong>{totals[item.key].toLocaleString()}</strong><span>{item.unit}</span></span>)}</h3>
          <div className="insights-chart-caption"><strong>By project</strong><span>{rows.length > 8 ? 'Top 8 projects' : `${rows.length} ${rows.length === 1 ? 'project' : 'projects'}`}</span></div>
          {chartRows.length ? <>
            <div className="insights-chart-frame">
              <div className="insights-chart" role="group" aria-label={`${activeMetric.label} by project`}>
                <div className="insights-grid" aria-hidden="true">{[0, 1, 2, 3, 4].map(line => <i key={line} />)}</div>
                <div className="insights-average-line" aria-hidden="true" style={{ bottom: `calc(24px + (100% - 24px) * ${average / maximum})` }} />
                {chartRows.map((row, index) => <button data-system-color="" type="button" key={row.projectId} aria-label={`${row.title}: ${row[metric]} ${metric === 'opened' ? 'opens' : metric === 'finished' ? 'completed reads' : 'page saves'}. Open project insights`} onClick={() => openProject(row.projectId)}>
                  <span className="insights-bar-track"><span className="insights-bar" data-zero={row[metric] === 0 || undefined} style={{ height: `${row[metric] / maximum * 100}%` }} /><span className="insights-bar-count">{compactCount(row[metric])}</span></span>
                  <span className="insights-bar-label" title={row.title}>{index + 1}</span>
                </button>)}
              </div>
              <div className="insights-axis" aria-hidden="true"><span>{compactCount(maximum)}</span><span>{compactCount(maximum / 2)}</span><span>0</span></div>
            </div>
            <p className="insights-average"><i aria-hidden="true" />Average per project <strong>{average.toLocaleString(undefined, { maximumFractionDigits: 1 })}</strong><span>Across all {rows.length} {rows.length === 1 ? 'project' : 'projects'}</span></p>
          </> : <p className="insights-empty">No project reads yet. Insights will appear here when your work is read.</p>}
          <dl className="insights-totals" aria-label="Metric totals">{metrics.map(item => <div key={item.key} data-insights-series={item.key}><dt><i aria-hidden="true" />{item.label}</dt><dd aria-label={totals[item.key].toLocaleString()} title={totals[item.key].toLocaleString()}>{compactCount(totals[item.key])}</dd></div>)}</dl>
          <p className="insights-total-context">Opens and completed: {periodLabel.toLowerCase()}. Page saves: current bookmarks.</p>
        </div>
        <p className="insights-note insights-metric-note"><span aria-hidden={metric === 'saved' || undefined}>Opens count anonymous visits, not unique people. Completed reads are included in opens. Daily trends are not available.</span><span aria-hidden={metric !== 'saved' || undefined}>Page saves are current bookmarks, not saves made during this period.</span></p>
        {state.fetchedAt != null && <p className="insights-updated">Updated <time dateTime={new Date(state.fetchedAt).toISOString()}>{new Date(state.fetchedAt).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</time></p>}
      </section>
      <div className="insights-details-grid">
        <section className="insights-section" aria-label="Top projects">
          <header><h2 className="insights-section-title">Top projects</h2><span>{metric === 'saved' ? 'Current page saves' : periodLabel}</span></header>
          <div className="insights-data-surface insights-ranked-surface">
            {ranked.length ? <ol className="insights-list">{(showAll ? ranked : ranked.slice(0, 3)).map((row, index) => <li key={row.projectId}>
              <button data-ui-shape="row" type="button" onClick={() => openProject(row.projectId)}>
                <span className="mobile-insights-project-art" aria-hidden="true">{(() => { const project = covers.data?.find(item => item.id === row.projectId); return project ? <ProjectCover source={project.cover} thumbnail={project.coverThumbnail} previewSource={getProjectCoverPreview(project)} alt={project.coverAlt || project.title} kind={project.coverKind} frame={project.coverFrame} pageNumber={project.coverPageNumber} sizes="68px" fallbackAttachments={project.attachments} /> : <InterfaceIcon icon={FileTextIcon} />; })()}<small>{index + 1}</small></span>
                <span className="insights-row-text"><strong>{row.title}</strong><span className="insights-row-value"><span className="insights-progress" aria-hidden="true"><i style={{ width: `${row[metric] / maximum * 100}%` }} /></span><span>{row[metric].toLocaleString()} <span className="insights-row-unit">{metric === 'opened' ? 'opens' : metric === 'finished' ? 'completed' : 'page saves'}</span></span></span></span>
                <InterfaceIcon icon={ArrowUpRightIcon} size="xs" />
              </button>
            </li>)}</ol> : <p className="insights-note">Your projects will appear here once reads are available.</p>}
            {ranked.length > 3 && <button className="insights-show-all" data-ui-shape="action" type="button" aria-expanded={showAll} onClick={() => setShowAll(value => !value)}>{showAll ? 'Show less' : 'See all'}</button>}
          </div>
        </section>
        {refRows.length > 0 && <section className="insights-section" aria-label="Traffic sources" data-insights-series="opened"><header><h2 className="insights-section-title">Top sources</h2><span>{periodLabel}</span></header><div className="insights-data-surface insights-ranked-surface"><ul className="insights-list insights-sources">{refRows.map(row => <li key={row.key}><span className="insights-source-symbol" aria-hidden="true"><InterfaceIcon icon={EyeIcon} /></span><span className="insights-row-text"><strong>{row.label}</strong><span className="insights-row-value"><span className="insights-progress" aria-hidden="true"><i style={{ width: `${row.count / refMaximum * 100}%` }} /></span><span>{row.count.toLocaleString()} opens</span></span></span></li>)}</ul></div></section>}
      </div>
    </>}
    <section className="insights-section" aria-label="Audience"><header><h2 className="insights-section-title">Your audience</h2><span>Current totals</span></header>
      <div className="insights-data-surface">
        {saves.loading ? <LoadingState kind="audience" label="Loading audience" /> : saves.error ? <ErrorState title="Unable to load audience" description={saves.error} onRetry={saves.retry} /> : saves.data && <dl className="insights-audience">{([
          ['Creator saves', saves.data.creatorSaves, 'People who currently have your profile saved.'],
          ['Project saves', saves.data.projectSaves, 'Current bookmarks of your projects by other people.'],
          ['Followers', saves.data.followers, 'People following you. Pending requests are not included.'],
        ] as const).map(([label, count, description]) => <div key={label}><dt>{label}</dt><dd>{count.toLocaleString()}</dd><dd>{description}</dd></div>)}</dl>}
      </div>
      <p className="insights-note">Only you can see these insights. Reader and saver identities remain private. Saves recognise interest without requiring a follow. Removing a save reduces the current total; saving again never adds a duplicate.</p>
    </section>
    <section className="insights-section insights-locations" aria-label="Top locations"><header><h2 className="insights-section-title">Top locations</h2></header><svg className="insights-map" viewBox="0 0 360 160" aria-hidden="true">{worldOutline.map((ring, index) => <polygon key={index} points={ring.map(([longitude, latitude]) => `${longitude + 180},${80 - latitude}`).join(' ')} />)}</svg><p className="insights-note">Location insights are not available. This map does not show reader activity.</p></section>
    <p className="insights-note">Today uses UTC. All time includes available history; older daily data is retained for about 13 months.</p><Suspense fallback={null}><LoadTimingInsights /></Suspense>
  </div>;
}
