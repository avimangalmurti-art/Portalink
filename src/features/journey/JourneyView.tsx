import { useJourneyCitations } from '../citations/useJourneyCitations';
import { journeyTimeline, type TimelineOrder } from '../citations/journeyCitations';
import React, { useEffect, useMemo, useState } from 'react';
import { MoreHorizontalIcon } from 'lucide-react';
import { InterfaceIcon } from '../../components/ui/InterfaceIcon';
import { MobileProjectPopup } from '../../components/media/MobileProjectPopup';
import { usePresentation } from '../../presentation/usePresentation';
import type { Profile, Project } from '../../types/domain';
import { ProjectCover } from '../../components/media/ProjectCover';
import { journeyProjects, projectMonth } from './journey';
import { calendarDay } from './calendar';
import { DeferredDialog } from '../../components/ui/DeferredDialog';
import './journey.css';
import { useTimelinePairs } from './useTimelinePairs';

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
  // Sorting, popup and citation state belong to one viewed profile/access mode.
  return <JourneyContent key={`${props.profile.id}:${props.owner}`} {...props} />;
}
function JourneyContent({ profile, owner, onOpen, onEdit, onEditDescription, onDelete, onAdd, onPair }: JourneyViewProps) {
  const isMobile = usePresentation() === 'mobile';
  const [order, setOrder] = useState<TimelineOrder>('newest');
  const [detailsProject, setDetailsProject] = useState<Project | null>(null);
  const [portalPopupId, setPortalPopupId] = useState<string | null>(null);
  const events=useJourneyCitations(profile,owner);
  const groups = useMemo(() => journeyTimeline(profile.projects,events,owner,order), [profile.projects, events, owner, order]);
  const portalProjects = useMemo(() => journeyProjects(profile.projects, owner), [profile.projects, owner]);
  const portalProfile = useMemo(() => ({ ...profile, projects: portalProjects }), [profile, portalProjects]);
  const activePortalPopupId = profile.categories.some(category => category.id === portalPopupId) ? portalPopupId : null;
  const { pairs, error: pairsError } = useTimelinePairs(profile, owner);
  useEffect(() => {
    if (portalPopupId && !activePortalPopupId) setPortalPopupId(null);
  }, [portalPopupId, activePortalPopupId]);
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
  const pairContent = pairs.map(record => {
    const pair = [record.then, record.now].map(id => profile.projects.find(project => project.id === id)!);
    return <section key={record.id} className="journey-pair" aria-label="Then / Now">
      <h2>Then / Now</h2><div className="journey-pair-grid">{pair.map((project, index) => <div key={project.id}>
        <button type="button" onClick={() => onOpen(project)} aria-label={`Open ${index ? 'Now' : 'Then'}: ${project.title}`}>
          <span className="journey-pair-cover"><JourneyCover project={project} sizes="(max-width: 639px) 42vw, 240px" /></span>
          <strong>{project.title}{projectMonth(project) && ` · ${projectMonth(project)?.slice(0, 4)}`}</strong>
        </button>{portalButton(project)}
      </div>)}</div>{owner && !isMobile && onPair && <button type="button" className="journey-text-action" onClick={onPair}>Manage pairs</button>}
    </section>;
  });
  const popup = isMobile && detailsProject && <MobileProjectPopup project={detailsProject} creator={profile} onClose={() => setDetailsProject(null)} contextHandlers={owner ? { delete: onDelete ? () => onDelete(detailsProject) : undefined } : undefined} onEditDescription={owner && onEditDescription ? () => onEditDescription(detailsProject) : undefined} onOptions={owner && onEdit ? () => onEdit(detailsProject) : undefined} />;
  return <section className="journey-view" data-timeline-order={order} aria-label={`${profile.name} Timeline`}>
    <div className="journey-toolbar">
      <div className="journey-order" role="group" aria-label="Timeline order">
        <button type="button" aria-pressed={order === 'newest'} onClick={() => setOrder('newest')}>Newest first</button>
        <button type="button" aria-pressed={order === 'oldest'} onClick={() => setOrder('oldest')}>Oldest first</button>
      </div>
      {isMobile && owner && onAdd && <button type="button" className="journey-toolbar-action" onClick={() => onAdd()}>Add work</button>}
      {isMobile && owner && onPair && <button type="button" className="journey-toolbar-action" onClick={onPair}>Choose a Then/Now pair</button>}
    </div>
    {groups.map(group => <section className="journey-year" key={group.year ?? 'undated'} aria-label={String(group.year ?? 'Date not set')}>
      <h2>{group.year ?? 'Date not set'}<span className="journey-year-count">{group.projectCount} {group.projectCount === 1 ? 'project' : 'projects'}</span></h2>
      <ol className="journey-list">{group.entries.map(entry => {
        const day = calendarDay(entry.date);
        const date = day ? <time className="journey-date" dateTime={day} title={new Date(`${day}T00:00:00Z`).toLocaleDateString(undefined, { dateStyle: 'long', timeZone: 'UTC' })}>{new Date(`${day}T00:00:00Z`).toLocaleDateString(undefined, { day: 'numeric', month: 'short', timeZone: 'UTC' })}</time> : <span className="journey-date" aria-label="Posting date unavailable">—</span>;
        if (entry.kind === 'citation') return <li className="journey-entry" data-journey-date={day ?? undefined} key={`citation:${entry.event.id}`}>
          {date}<div className="journey-entry-copy"><a className="journey-title" href={entry.event.href}>{entry.event.label}</a></div>
        </li>;
        const project = entry.project;
        const hasOptions = isMobile || (owner && onEdit);
        return <li className="journey-entry" data-journey-date={day ?? undefined} data-has-options={Boolean(hasOptions) || undefined} key={`project:${project.id}`}>
          {date}
          <div className="journey-entry-copy">
            <button type="button" className="journey-title" onClick={() => onOpen(project)}>{project.title}</button>
            {portalButton(project)}
          </div>
          {hasOptions && <button type="button" className="journey-project-options" aria-label={`Show details for ${project.title}`} aria-haspopup="dialog" aria-expanded={isMobile ? detailsProject?.id === project.id : undefined} onClick={() => isMobile ? setDetailsProject(project) : onEdit?.(project)}><InterfaceIcon icon={MoreHorizontalIcon} size="sm" weight="medium" /></button>}
        </li>;
      })}</ol>
    </section>)}
    {!isMobile && !groups.length && owner && <button type="button" className="journey-first" onClick={() => onAdd?.()} disabled={!onAdd}><span aria-hidden="true">+</span>Add your first project</button>}
    {!isMobile && groups.length > 0 && owner && onAdd && <button type="button" className="journey-text-action journey-add" onClick={() => onAdd()}>+ Add work</button>}
    {owner && pairsError && <p role="status">{pairsError}</p>}
    {pairContent}
    {!isMobile && owner && !pairs.length && onPair && <button type="button" className="journey-text-action journey-pair-start" onClick={onPair}>Choose a Then/Now pair</button>}
    {popup}
    {portalPopup}
  </section>;
}
