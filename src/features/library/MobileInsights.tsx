import React, { lazy, Suspense, useCallback, useState } from 'react';
import { ArrowUpRightIcon, BookmarkIcon, CheckIcon, EyeIcon, FileTextIcon } from 'lucide-react';
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

const LoadTimingInsights = lazy(() => import('./LoadTimingInsights'));
const metrics = [
  { key: 'opened', label: 'Opens', icon: EyeIcon },
  { key: 'finished', label: 'Completed', icon: CheckIcon },
  { key: 'saved', label: 'Page saves', icon: BookmarkIcon },
] as const;
const sources = [['own-link', 'Your link'], ['messages', 'Messages'], ['linkedin', 'LinkedIn'], ['other', 'Other']] as const;
type Metric = typeof metrics[number]['key'];
type SavesState = { data?: SaveInsights; loading: boolean; error?: string; retry: () => void };

export function MobileInsights({ saves }: { saves: SavesState }) {
  const { reads, projects } = useServices();
  const navigate = useNavigate();
  const [period, setPeriod] = useState<ReadPeriod>('7d');
  const periodLabel = READ_PERIODS.find(item => item.key === period)?.label ?? '7 days';
  const query = useCallback(() => reads ? reads.list(period) : Promise.reject(new Error('Reads are not available yet.')), [reads, period]);
  const state = useAccountQuery(query);
  const coverQuery = useCallback(async () => {
    const ids = [...new Set((state.data ?? []).map(row => row.profileId))];
    return (await Promise.all(ids.map(id => projects.listProjects(id)))).flat();
  }, [projects, state.data]);
  const covers = useAccountQuery(coverQuery);
  const [metric, setMetric] = useState<Metric>('opened');
  const [showAll, setShowAll] = useState(false);
  const rows = state.data ?? [];
  const activeMetric = metrics.find(item => item.key === metric) ?? metrics[0];
  const total = rows.reduce((sum, row) => sum + row[metric], 0);
  const ranked = [...rows].sort((a, b) => b[metric] - a[metric] || a.title.localeCompare(b.title));
  const chartRows = ranked.slice(0, 8);
  const maximum = Math.max(1, ...chartRows.map(row => row[metric]));
  const refRows = sources.map(([key, label]) => ({ key, label, count: rows.reduce((sum, row) => sum + (row.refs[key] ?? 0), 0) })).filter(row => Number.isFinite(row.count) && row.count > 0).sort((a, b) => b.count - a.count);
  const openProject = (id: string) => navigate(`/insights?project=${encodeURIComponent(id)}&period=${period}`);
  const refresh = () => { state.retry(); covers.retry(); saves.retry(); };
  return <div className="mobile-insights-content">
    <div className="mobile-insights-period"><select aria-label="Insights period" value={period} onChange={event => setPeriod(event.target.value as ReadPeriod)}>{READ_PERIODS.map(item => <option key={item.key} value={item.key}>{item.label}</option>)}</select><button type="button" onClick={refresh} disabled={state.loading || saves.loading}>Refresh</button></div>
    {state.loading ? <LoadingState label="Loading insights" /> : state.error ? <ErrorState title="Unable to load reads" description={state.error} onRetry={state.retry} /> : <>
      <h2 className="mobile-insights-headline">{total.toLocaleString()} {metric === 'opened' ? 'project opens' : metric === 'finished' ? 'completed reads' : 'current page saves'}{metric !== 'saved' && ` · ${periodLabel}`}</h2>
      <div className="mobile-insights-metrics" role="group" aria-label="Insight metric">
        {metrics.map(item => <button type="button" key={item.key} aria-pressed={metric === item.key} onClick={() => setMetric(item.key)}><InterfaceIcon icon={item.icon} size="xs" /><span>{rows.reduce((sum, row) => sum + row[item.key], 0).toLocaleString()} {item.label.toLowerCase()}</span></button>)}
      </div>
      <div className="mobile-insights-chart-caption"><strong>By project</strong><span>{metric === 'saved' ? 'Current totals' : periodLabel}</span></div>
      {chartRows.length ? <div className="mobile-insights-chart" role="group" aria-label={`${activeMetric.label} by project`}>
        {chartRows.map((row, index) => <button type="button" key={row.projectId} aria-label={`${row.title}: ${row[metric]} ${metric === 'opened' ? 'opens' : metric === 'finished' ? 'completed reads' : 'page saves'}. Open project insights`} onClick={() => openProject(row.projectId)}><span className="mobile-insights-bar-track"><span className="mobile-insights-bar" style={{ height: `${row[metric] / maximum * 100}%` }} /><span className="mobile-insights-bar-count">{row[metric]}</span></span><span className="mobile-insights-bar-label" title={row.title}>{index + 1}</span></button>)}
      </div> : <p className="mobile-insights-empty">No project reads yet. Insights will appear here when your work is read.</p>}
      <p className="mobile-insights-note">{metric === 'saved' ? 'Page saves are current bookmarks, not saves made during this period.' : 'Opens count anonymous visits, not unique people. Daily trends are not available.'}</p>
      <section className="mobile-insights-section" aria-label="Top projects"><header><h2>Top projects</h2>{ranked.length > 3 && <button type="button" aria-expanded={showAll} onClick={() => setShowAll(value => !value)}>{showAll ? 'Show less' : 'See all'}</button>}</header><p>{metric === 'saved' ? 'Current page saves' : periodLabel}</p>
        <ol className="mobile-insights-list">{(showAll ? ranked : ranked.slice(0, 3)).map((row, index) => <li key={row.projectId}><button type="button" onClick={() => openProject(row.projectId)}><span className="mobile-insights-project-art" aria-hidden="true">{(() => { const project = covers.data?.find(item => item.id === row.projectId); return project ? <ProjectCover source={project.cover} thumbnail={project.coverThumbnail} previewSource={getProjectCoverPreview(project)} alt={project.coverAlt || project.title} kind={project.coverKind} frame={project.coverFrame} pageNumber={project.coverPageNumber} sizes="68px" fallbackAttachments={project.attachments} /> : <InterfaceIcon icon={FileTextIcon} />; })()}<small>{index + 1}</small></span><span className="mobile-insights-row-text"><strong>{row.title}</strong><span><InterfaceIcon icon={activeMetric.icon} size="xs" />{row[metric].toLocaleString()} {metric === 'opened' ? 'opens' : metric === 'finished' ? 'completed' : 'page saves'}</span></span><InterfaceIcon icon={ArrowUpRightIcon} size="xs" /></button></li>)}</ol>
      </section>
      {refRows.length > 0 && <section className="mobile-insights-section" aria-label="Traffic sources"><header><h2>Top sources</h2></header><p>{periodLabel}</p><ul className="mobile-insights-list mobile-insights-sources">{refRows.map(row => <li key={row.key}><span className="mobile-insights-source-symbol" aria-hidden="true"><InterfaceIcon icon={EyeIcon} /></span><span className="mobile-insights-row-text"><strong>{row.label}</strong><span>{row.count.toLocaleString()} opens</span></span></li>)}</ul></section>}
    </>}
    <section className="mobile-insights-section" aria-label="Audience"><header><h2>Your audience</h2></header><p>Current totals</p>
      {saves.loading ? <LoadingState label="Loading audience" /> : saves.error ? <ErrorState title="Unable to load audience" description={saves.error} onRetry={saves.retry} /> : saves.data && <dl className="mobile-insights-audience">{([['Creator saves', saves.data.creatorSaves], ['Project saves', saves.data.projectSaves], ['Followers', saves.data.followers]] as const).map(([label, count]) => <div key={label}><dt>{label}</dt><dd>{count.toLocaleString()}</dd></div>)}</dl>}
      <p className="mobile-insights-note">Only you can see these insights. Reader and saver identities remain private.</p>
    </section>
    <section className="mobile-insights-section" aria-label="Top locations"><header><h2>Top locations</h2></header><svg className="mobile-insights-map" viewBox="0 0 360 160" aria-hidden="true">{worldOutline.map((ring, index) => <polygon key={index} points={ring.map(([longitude, latitude]) => `${longitude + 180},${80 - latitude}`).join(' ')} />)}</svg><p className="mobile-insights-note">Location insights are not available. This map does not show reader activity.</p></section>
    <p className="mobile-insights-note">Today uses UTC. All time includes available history; older daily data is retained for about 13 months.</p><Suspense fallback={null}><LoadTimingInsights /></Suspense>
  </div>;
}
