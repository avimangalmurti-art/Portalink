import { createPortal } from 'react-dom';
import { useServices } from '../../contexts/ServicesContext';
import { useJourneyCitations } from '../citations/useJourneyCitations';
import { journeyTimeline, type TimelineOrder } from '../citations/journeyCitations';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { EyeIcon, MoreHorizontalIcon } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { InterfaceIcon } from '../../components/ui/InterfaceIcon';
import { MobileProjectPopup } from '../../components/media/MobileProjectPopup';
import { usePresentation } from '../../presentation/usePresentation';
import type { TimelinePair } from '../../services/interfaces';
import type { Profile, Project } from '../../types/domain';
import { ProjectCover } from '../../components/media/ProjectCover';
import { getProjectCoverPreview } from '../../utils/projectPresentation';
import { journeyProjects, projectMonth } from './journey';
import { calendarDay } from './calendar';
import { DeferredDialog } from '../../components/ui/DeferredDialog';
import './journey.css';
import { useTimelinePairs } from './useTimelinePairs';
import { useTimelineSection } from './useTimelineSection';

const PortalProjectPopup = React.lazy(() => import('../../components/profile/PortalProjectPopup').then(module => ({ default: module.PortalProjectPopup })));
const ReorderTimelinePairs = React.lazy(() => import('./ThenNowDialog').then(module => ({ default: module.ReorderTimelinePairs })));

export function JourneyCover({ project, sizes = '92px' }: { project: Project; sizes?: string }) {
  const isMobile = usePresentation() === 'mobile';
  return <ProjectCover source={project.cover} thumbnail={project.coverThumbnail} kind={project.coverKind} previewSource={getProjectCoverPreview(project)}
    alt={project.coverAlt || project.title} sizes={sizes} priority="viewport" fit="contain"
    allowPdfFallback={false} allowVideoFallback={isMobile} fallbackAttachments={project.attachments} />;
}
type JourneyViewProps = {
  active?: boolean;
  showPopular?: boolean;
  toolbarHost?: HTMLElement | null; profile: Profile; owner: boolean; onOpen: (project: Project) => void;
  onEdit?: (project: Project) => void; onEditDescription?: (project: Project) => void; onDelete?: (project: Project) => void; onAdd?: (year?: number) => void; onPair?: () => void;
  onEditPair?: (pair: TimelinePair) => void;
};
export function JourneyView(props: JourneyViewProps) {
  // Sorting, popup and citation state belong to one viewed profile/access mode.
  return <JourneyContent key={`${props.profile.id}:${props.owner}`} {...props} />;
}
function JourneyContent({ active = true, showPopular = true, toolbarHost, profile, owner, onOpen, onEdit, onEditDescription, onDelete, onAdd, onPair, onEditPair }: JourneyViewProps) {
  const isMobile = usePresentation() === 'mobile';
  const { reads } = useServices();
  const [popular, setPopular] = useState<{profileId:string; counts:Record<string,number>} | null>(null);
  const [popularError, setPopularError] = useState(false);
  useEffect(() => {
    let current=true; setPopular(null); setPopularError(false);
    if(isMobile && owner && reads) void reads.list('all').then(rows=>{if(current)setPopular({profileId:profile.id,counts:Object.fromEntries(rows.filter(row=>row.profileId===profile.id).map(row=>[row.projectId,row.opened]))});}).catch(()=>{if(current)setPopularError(true);});
    return()=>{current=false;};
  },[reads,profile.id,owner,isMobile]);
  const popularCounts=owner&&popular?.profileId===profile.id?popular.counts:undefined;
  const [order, setOrder] = useState<TimelineOrder>('newest');
  const [pairsOnly, setPairsOnly] = useState(false);
  const [reorderingPairs, setReorderingPairs] = useState(false);
  const closePairOrder = () => setReorderingPairs(false);
  const showingPairsOnly = isMobile && pairsOnly;
  const [detailsProject, setDetailsProject] = useState<Project | null>(null);
  const [portalPopupId, setPortalPopupId] = useState<string | null>(null);
  useEffect(() => { if (!active) { setDetailsProject(null); setPortalPopupId(null); setReorderingPairs(false); } }, [active]);
  const events=useJourneyCitations(profile,owner);
  const groups = useMemo(() => journeyTimeline(profile.projects,events,owner,order,popularCounts), [profile.projects, events, owner, order, popularCounts]);
  const popularityRanks = useMemo(() => {
    const result = new Map<string,{rank:number;opens:number}>();
    if (!isMobile || order !== 'popular' || !popularCounts) return result;
    let previous = -1, rank = 0, position = 0;
    for (const group of groups) for (const entry of group.entries) {
      if (entry.kind !== 'project') continue;
      const opens = Math.max(0, popularCounts[entry.project.id] ?? 0);
      position += 1;
      if (opens !== previous) rank = position;
      result.set(entry.project.id, {rank, opens});
      previous = opens;
    }
    return result;
  }, [groups, isMobile, order, popularCounts]);
  const portalProjects = useMemo(() => journeyProjects(profile.projects, owner), [profile.projects, owner]);
  const portalProfile = useMemo(() => ({ ...profile, projects: portalProjects }), [profile, portalProjects]);
  const activePortalPopupId = profile.categories.some(category => category.id === portalPopupId) ? portalPopupId : null;
  const { pairs, error: pairsError, orderError, loading: pairsLoading, saveOrder } = useTimelinePairs(profile, owner);
  const orderUnavailable = pairsLoading || Boolean(pairsError || orderError);
  useEffect(() => {
    if (portalPopupId && !activePortalPopupId) setPortalPopupId(null);
  }, [portalPopupId, activePortalPopupId]);
  const portalButton = (project: Project) => {
    const portal = profile.categories.find(category => category.id === project.categoryId);
    return portal ? <button type="button" className="journey-portal" aria-haspopup="dialog" aria-expanded={activePortalPopupId === portal.id} onClick={() => setPortalPopupId(portal.id)}>{portal.label}</button> : null;
  };
  const portalPopup = active && activePortalPopupId && <DeferredDialog active onClose={() => setPortalPopupId(null)}>
    <PortalProjectPopup profile={portalProfile} categoryId={activePortalPopupId} backLabel="Back to Timeline" onClose={() => setPortalPopupId(null)} onSelect={(categoryId, projectId) => {
      const project = portalProjects.find(candidate => candidate.id === projectId && candidate.categoryId === categoryId);
      if (categoryId !== activePortalPopupId || !project) return;
      setPortalPopupId(null);
      onOpen(project);
    }} />
  </DeferredDialog>;
  const rootRef = useRef<HTMLElement>(null), toolbarRef = useRef<HTMLElement>(null), pairRef = useRef<HTMLElement>(null);
  const section = useTimelineSection({
    enabled: isMobile && active && !showingPairsOnly && pairs.length > 0,
    paused: Boolean(detailsProject || activePortalPopupId),
    rootRef, toolbarRef, pairRef, toolbarHost,
    contentKey: `${order}:${pairs.map(pair => `${pair.id}:${pair.then}:${pair.now}`).join(',')}`,
  });
  const showingPairs = showingPairsOnly || section.atPairs;
  const pairContent = pairs.map((record, pairIndex) => {
    const then = profile.projects.find(project => project.id === record.then);
    const now = profile.projects.find(project => project.id === record.now);
    if (!then || !now) return null;
    const heading = <h2>Then / Now</h2>;
    return <section key={record.id} ref={pairIndex === 0 ? pairRef : undefined} className="journey-pair" aria-label="Then / Now">
      {active && isMobile && owner && onEditPair ? <header className="journey-pair-heading">
        {heading}
        <Button variant="secondary" size="sm" data-ui-shape="action" aria-haspopup="dialog"
          aria-label={`Edit pair: ${then.title} and ${now.title}`}
          onClick={event => {
            event.currentTarget.focus({ preventScroll: true });
            onEditPair(record);
          }}>Edit pair</Button>
      </header> : heading}
      <div className="journey-pair-grid">{[then, now].map((project, index) => <div key={project.id}>
        <button type="button" onClick={() => onOpen(project)} aria-label={`Open ${index ? 'Now' : 'Then'}: ${project.title}`}>
          <span className="journey-pair-cover"><JourneyCover project={project} sizes="(max-width: 639px) 42vw, 240px" /></span>
          <strong>{project.title}{projectMonth(project) && ` · ${projectMonth(project)?.slice(0, 4)}`}</strong>
        </button>{portalButton(project)}
      </div>)}</div>{owner && !isMobile && onPair && <button type="button" className="journey-text-action" onClick={onPair}>Manage pairs</button>}
    </section>;
  });
  const popup = active && isMobile && detailsProject && <MobileProjectPopup project={detailsProject} creator={profile} onClose={() => setDetailsProject(null)} contextHandlers={owner ? { delete: onDelete ? () => onDelete(detailsProject) : undefined } : undefined} onEditDescription={owner && onEditDescription ? () => onEditDescription(detailsProject) : undefined} onOptions={owner && onEdit ? () => onEdit(detailsProject) : undefined} />;
  const toolbar = <header ref={toolbarRef} className="journey-toolbar">
    <div className="journey-order" role="group" aria-label="Timeline order">
      <button type="button" aria-pressed={!showingPairs && order === 'newest'} onClick={() => { section.reset(); setPairsOnly(false); setOrder('newest'); }}>{isMobile?'Latest':'Newest first'}</button>
      {isMobile&&showPopular&&<button type="button" aria-pressed={!showingPairs && order === 'popular'} disabled={!popularCounts} title={popularError?'Project opens could not be loaded. Reopen Timeline to retry.':!owner?'Project-open ranking is unavailable for this profile.':!popularCounts?'Loading project opens…':'Most project opens · all time'} onClick={() => { section.reset(); setPairsOnly(false); setOrder('popular'); }}>Popular</button>}
      <button type="button" aria-pressed={!showingPairs && order === 'oldest'} onClick={() => { section.reset(); setPairsOnly(false); setOrder('oldest'); }}>{isMobile?'Oldest':'Oldest first'}</button>
      {isMobile && <button type="button" aria-pressed={showingPairs} onClick={() => setPairsOnly(true)}>Then/Now</button>}
    </div>
  </header>;
  return <section ref={rootRef} className="journey-view" data-timeline-order={order} aria-label={`${profile.name} Timeline`}>
    {isMobile&&toolbarHost?createPortal(toolbar,toolbarHost):toolbar}
    {!showingPairsOnly && groups.map(group => <section className="journey-year" key={group.year ?? 'undated'} aria-label={String(group.year ?? 'Date not set')}>
      <h2>{order==='popular'?'Popular':group.year ?? 'Date not set'}<span className="journey-year-count">{group.projectCount} {group.projectCount === 1 ? 'project' : 'projects'}</span></h2>
      <ol className="journey-list">{group.entries.map(entry => {
        const day = calendarDay(entry.date);
        const date = day ? <time className="journey-date" dateTime={day} title={new Date(`${day}T00:00:00Z`).toLocaleDateString(undefined, { dateStyle: 'long', timeZone: 'UTC' })}>{new Date(`${day}T00:00:00Z`).toLocaleDateString(undefined, { day: 'numeric', month: 'short', timeZone: 'UTC' })}</time> : <span className="journey-date" aria-label="Posting date unavailable">—</span>;
        if (entry.kind === 'citation') return <li className="journey-entry" data-journey-date={day ?? undefined} key={`citation:${entry.event.id}`}>
          {date}<div className="journey-entry-copy"><a className="journey-title" href={entry.event.href}>{entry.event.label}</a></div>
        </li>;
        const project = entry.project;
        const popularity = popularityRanks.get(project.id);
        const hasOptions = isMobile || (owner && onEdit);
        return <li className="journey-entry" data-journey-date={day ?? undefined} data-has-options={Boolean(hasOptions) || undefined} key={`project:${project.id}`}>
          {date}
          <div className="journey-entry-copy">
            {popularity ? <div className="journey-popular-heading"><button type="button" className="journey-title" onClick={() => onOpen(project)}>{project.title}</button><span className="journey-popularity" aria-label={`${popularity.opens} project ${popularity.opens === 1 ? 'open' : 'opens'}`}><InterfaceIcon icon={EyeIcon} size="xs" />{popularity.opens}</span></div> : <button type="button" className="journey-title" onClick={() => onOpen(project)}>{project.title}</button>}
            {portalButton(project)}
          </div>
          {hasOptions && <button type="button" className="journey-project-options" aria-label={`Show details for ${project.title}`} aria-haspopup="dialog" aria-expanded={isMobile ? detailsProject?.id === project.id : undefined} onClick={() => isMobile ? setDetailsProject(project) : onEdit?.(project)}><InterfaceIcon icon={MoreHorizontalIcon} size="sm" weight="medium" /></button>}
        </li>;
      })}</ol>
    </section>)}
    {!isMobile && !groups.length && owner && <button type="button" className="journey-first" onClick={() => onAdd?.()} disabled={!onAdd}><span aria-hidden="true">+</span>Add your first project</button>}
    {!isMobile && groups.length > 0 && owner && onAdd && <button type="button" className="journey-text-action journey-add" onClick={() => onAdd()}>+ Add work</button>}
    {owner && pairsError && <p role="status">{pairsError}</p>}
    {owner && showingPairsOnly && orderError && <p role="status">{orderError}</p>}
    {showingPairsOnly && pairsLoading && !pairs.length && <p role="status">Loading Then/Now pairs…</p>}
    {active && showingPairsOnly && owner && saveOrder && pairs.length > 1 && <Button
      variant="secondary" size="sm" data-ui-shape="action" className="journey-pair-order-trigger"
      aria-haspopup="dialog" aria-disabled={orderUnavailable}
      onClick={event => {
        if (orderUnavailable) return;
        event.currentTarget.focus({ preventScroll: true });
        setReorderingPairs(true);
      }}>Reorder pairs</Button>}
    {pairContent}
    {showingPairsOnly && !pairsLoading && !pairs.length && !pairsError && <p role="status">No Then/Now pairs yet.</p>}
    {!isMobile && owner && !pairs.length && onPair && <button type="button" className="journey-text-action journey-pair-start" onClick={onPair}>Choose a Then/Now pair</button>}
    {popup}
    {portalPopup}
    {active && showingPairsOnly && reorderingPairs && saveOrder && <DeferredDialog active onClose={closePairOrder}>
      <ReorderTimelinePairs pairs={pairs} projects={profile.projects} loading={orderUnavailable}
        saveOrder={saveOrder} onClose={closePairOrder} />
    </DeferredDialog>}
  </section>;
}
