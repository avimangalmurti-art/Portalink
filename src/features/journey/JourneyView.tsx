import { JourneyCalendar } from './JourneyCalendar';
import { useJourneyCitations } from '../citations/useJourneyCitations';
import { journeyTimeline } from '../citations/journeyCitations';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { CalendarDaysIcon, MoreHorizontalIcon } from 'lucide-react';
import { InterfaceIcon } from '../../components/ui/InterfaceIcon';
import { MobileProjectPopup } from '../../components/media/MobileProjectPopup';
import { usePresentation } from '../../presentation/usePresentation';
import type { Profile, Project } from '../../types/domain';
import { ProjectCover } from '../../components/media/ProjectCover';
import { journeyProjects, projectMonth, visiblePair } from './journey';
import { calendarDay, calendarRecord, workCalendarDay } from './calendar';
import { DeferredDialog } from '../../components/ui/DeferredDialog';
import './journey.css';

const JourneyMonthCalendar = React.lazy(() => import('./JourneyMonthCalendar').then(module => ({ default: module.JourneyMonthCalendar })));
const PortalProjectPopup = React.lazy(() => import('../../components/profile/PortalProjectPopup').then(module => ({ default: module.PortalProjectPopup })));

export function JourneyCover({ project, sizes = '92px' }: { project: Project; sizes?: string }) {
  return <ProjectCover source={project.cover} thumbnail={project.coverThumbnail} kind={project.coverKind}
    alt={project.coverAlt || project.title} sizes={sizes} priority="viewport" fit="contain"
    allowPdfFallback={false} allowVideoFallback={false} fallbackAttachments={project.attachments} />;
}
type JourneyViewProps = {
  profile: Profile; owner: boolean; onOpen: (project: Project) => void;
  onEdit?: (project: Project) => void; onEditDescription?: (project: Project) => void; onDelete?: (project: Project) => void; onAdd?: (year?: number) => void; onPair?: () => void;
};
export function JourneyView(props: JourneyViewProps) {
  // Calendar requests and citation state belong to one viewed profile/access mode.
  return <JourneyContent key={`${props.profile.id}:${props.owner}`} {...props} />;
}
function JourneyContent({ profile, owner, onOpen, onEdit, onEditDescription, onDelete, onAdd, onPair }: JourneyViewProps) {
  const isMobile = usePresentation() === 'mobile';
  const [detailsProject, setDetailsProject] = useState<Project | null>(null);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [portalPopupId, setPortalPopupId] = useState<string | null>(null);
  const [calendarJump, setCalendarJump] = useState<{ day: string; request: number }>();
  const desktopRoot = useRef<HTMLElement>(null);
  const events=useJourneyCitations(profile,owner);
  const groups = useMemo(() => journeyTimeline(profile.projects,events,owner), [profile.projects, events, owner]);
  const entries = useMemo(() => groups.flatMap(group => group.entries), [groups]);
  const record = useMemo(() => calendarRecord(entries), [entries]);
  const portalProjects = useMemo(() => journeyProjects(profile.projects, owner), [profile.projects, owner]);
  const portalProfile = useMemo(() => ({ ...profile, projects: portalProjects }), [profile, portalProjects]);
  const activePortalPopupId = profile.categories.some(category => category.id === portalPopupId) ? portalPopupId : null;
  const pair = visiblePair(profile, owner);
  useEffect(() => {
    if (portalPopupId && !activePortalPopupId) setPortalPopupId(null);
  }, [portalPopupId, activePortalPopupId]);
  useEffect(() => { setCalendarOpen(false); setCalendarJump(undefined); }, [profile.id, owner]);
  useEffect(() => {
    if (isMobile || calendarOpen || !calendarJump) return;
    const frame = requestAnimationFrame(() => {
      const item = desktopRoot.current?.querySelector<HTMLElement>(`[data-journey-date="${calendarJump.day}"]`);
      if (!item) return;
      const identity = desktopRoot.current?.closest('[data-profile-journey]')?.querySelector<HTMLElement>('.profile-header-region');
      item.style.scrollMarginTop = `${(identity?.getBoundingClientRect().height ?? 0) + 16}px`;
      item.scrollIntoView({ block: 'start', behavior: 'instant' });
    });
    return () => cancelAnimationFrame(frame);
  }, [calendarJump, calendarOpen, isMobile]);
  const calendarControls = <>
    <button type="button" className="journey-today-launch" aria-label="Open Timeline calendar for today" aria-haspopup="dialog" onClick={() => setCalendarOpen(true)}><CalendarDaysIcon size={20} aria-hidden="true" />Today</button>
    <DeferredDialog active={calendarOpen} onClose={() => setCalendarOpen(false)}>{calendarOpen && <JourneyMonthCalendar days={record.days} onClose={() => setCalendarOpen(false)} onSelect={requested => {
      const day = workCalendarDay(record.days.map(([date]) => date), requested);
      if (day) setCalendarJump(previous => ({ day, request: (previous?.request ?? 0) + 1 }));
      setCalendarOpen(false);
    }} />}</DeferredDialog>
  </>;
  const portalButton = (project: Project) => {
    const portal = profile.categories.find(category => category.id === project.categoryId);
    return portal ? <button type="button" className="journey-portal" aria-haspopup="dialog" aria-expanded={activePortalPopupId === portal.id} onClick={() => setPortalPopupId(portal.id)}>{portal.label}</button> : null;
  };
  const portalPopup = activePortalPopupId && <DeferredDialog active onClose={() => setPortalPopupId(null)}>
    <PortalProjectPopup profile={portalProfile} categoryId={activePortalPopupId} backLabel="Back to Timeline" onClose={() => setPortalPopupId(null)} onSelect={(categoryId, projectId) => {
      const project = portalProjects.find(candidate => candidate.id === projectId && candidate.categoryId === categoryId);
      if (categoryId !== activePortalPopupId || !project) return;
      setPortalPopupId(null);
      onOpen(project);
    }} />
  </DeferredDialog>;
  const pairContent = pair && <section className="journey-pair" aria-label="Then / Now">
      <h2>Then / Now</h2><div className="journey-pair-grid">{pair.map((project, index) => <div key={project.id}>
        <button type="button" onClick={() => onOpen(project)} aria-label={`Open ${index ? 'Now' : 'Then'}: ${project.title}`}>
          <span className="journey-pair-cover"><JourneyCover project={project} sizes="(max-width: 639px) 42vw, 240px" /></span>
          <strong>{project.title}{projectMonth(project) && ` · ${projectMonth(project)?.slice(0, 4)}`}</strong>
        </button>{portalButton(project)}
      </div>)}</div>{owner && !isMobile && onPair && <button type="button" className="journey-text-action" onClick={onPair}>Change pair</button>}
    </section>;
  const popup = isMobile && detailsProject && <MobileProjectPopup project={detailsProject} creator={profile} onClose={() => setDetailsProject(null)} contextHandlers={owner ? { delete: onDelete ? () => onDelete(detailsProject) : undefined } : undefined} onEditDescription={owner && onEditDescription ? () => onEditDescription(detailsProject) : undefined} onOptions={owner && onEdit ? () => onEdit(detailsProject) : undefined} />;
  if (isMobile) return <><JourneyCalendar key={`${profile.id}:${owner}`} profile={profile} owner={owner} entries={entries} onOpen={onOpen} onDetails={setDetailsProject} onOpenPortal={setPortalPopupId} openPortalId={activePortalPopupId} onAdd={onAdd} jumpTo={calendarJump}>{pairContent}</JourneyCalendar>{calendarControls}{popup}{portalPopup}</>;
  if (!groups.length && !owner) return <div className="journey-view">{calendarControls}</div>;
  if (!groups.length) return <div className="journey-view">{calendarControls}<button type="button" className="journey-first" onClick={() => onAdd?.()} disabled={!onAdd}>
    <span aria-hidden="true">+</span>Add your first project
  </button></div>;
  return <section ref={desktopRoot} className="journey-view" aria-label={`${profile.name} Timeline`}>
    {calendarControls}
    {pairContent}
    {owner && !isMobile && !pair && onPair && <button type="button" className="journey-text-action journey-pair-start" onClick={onPair}>Choose a Then/Now pair</button>}
    {groups.map(group => <section className="journey-year" key={group.year ?? 'undated'} aria-label={String(group.year ?? 'Date not set')}>
      <h2>{group.year ?? 'Date not set'}</h2>
      <ol className="journey-rail">{group.gap ? <li className="journey-entry journey-gap">
        <span className="journey-gap-cover" aria-hidden="true">+</span><div><h3>What were you making in {group.year}?</h3>
          <button type="button" className="journey-text-action" onClick={() => onAdd?.(group.year ?? undefined)}>Add something from {group.year}</button></div>
      </li> : group.entries.map(entry => entry.kind==='citation'?<li className="journey-entry" data-journey-date={calendarDay(entry.date) ?? undefined} key={entry.event.id}>{entry.event.thumbnail&&<a href={entry.event.href}><img className="journey-entry-cover" src={entry.event.thumbnail} alt=""/></a>}<div className="journey-entry-copy"><time className="journey-month">{entry.event.date.slice(0,10)}</time><a href={entry.event.href}>{entry.event.label}</a></div></li>:(()=>{const project=entry.project;return <li className="journey-entry" data-journey-date={calendarDay(entry.date) ?? undefined} key={project.id}>
        <button type="button" className="journey-entry-cover" style={{ aspectRatio: project.coverAspectRatio && project.coverAspectRatio > 0 ? project.coverAspectRatio : 1 }} onClick={() => onOpen(project)} aria-label={`Open ${project.title}`}><JourneyCover project={project} /></button>
        <div className="journey-entry-copy"><span className="journey-month">{(project.madeOn ?? project.publishedAt) && Number.isFinite(Date.parse(project.madeOn ?? project.publishedAt!)) ? new Date(project.madeOn ?? project.publishedAt!).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric', ...(project.madeOn ? { timeZone: 'UTC' } : {}) }) : 'Posting date unavailable'}</span>
          <button type="button" className="journey-title" onClick={() => onOpen(project)}>{project.title}</button>
          {portalButton(project)}
          {(isMobile || (owner && onEdit)) && <button type="button" className="journey-project-options" aria-label={`Show details for ${project.title}`} aria-haspopup="dialog" aria-expanded={isMobile ? detailsProject?.id === project.id : undefined} onClick={() => isMobile ? setDetailsProject(project) : onEdit?.(project)}><InterfaceIcon icon={MoreHorizontalIcon} size="sm" weight="medium" /></button>}
        </div>
      </li>;})())}</ol>
    </section>)}
    {popup}
    {portalPopup}
  </section>;
}
