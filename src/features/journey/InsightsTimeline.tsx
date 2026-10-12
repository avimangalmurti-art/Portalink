import { FormattedText } from '../../components/text/FormattedText';
import { useJourneyCitations } from '../citations/useJourneyCitations';
import { journeyTimeline } from '../citations/journeyCitations';
import React, { useState } from 'react';
import { MoreHorizontalIcon } from 'lucide-react';
import { InterfaceIcon } from '../../components/ui/InterfaceIcon';
import { MobileProjectPopup } from '../../components/media/MobileProjectPopup';
import { usePresentation } from '../../presentation/usePresentation';
import type { Profile, Project } from '../../types/domain';
import { ProjectCover } from '../../components/media/ProjectCover';
import { learnedLine, projectMonth, visiblePair } from './journey';
import './journey.css';
import {InsightMetrics} from './InsightMetrics';
import type {JourneyInsights} from './insightsModel';

function JourneyCover({ project, sizes = '92px' }: { project: Project; sizes?: string }) {
  return <ProjectCover source={project.cover} thumbnail={project.coverThumbnail} kind={project.coverKind}
    alt={project.coverAlt || project.title} sizes={sizes} priority="viewport" fit="contain"
    allowPdfFallback={false} allowVideoFallback={false} fallbackAttachments={project.attachments} />;
}

export function InsightsTimeline({ profile, owner, onOpen, onEdit, onEditDescription, onDelete, onAdd, onPair, insights, onSelectWork }: {
  insights:JourneyInsights|null;onSelectWork:(project:Project)=>void;profile: Profile; owner: boolean; onOpen: (project: Project) => void;
  onEdit?: (project: Project) => void; onEditDescription?: (project: Project) => void; onDelete?: (project: Project) => void; onAdd?: (year?: number) => void; onPair?: () => void;
}) {
  const isMobile = usePresentation() === 'mobile';
  const [detailsProject, setDetailsProject] = useState<Project | null>(null);
  const events=useJourneyCitations(profile,owner);
  const groups = journeyTimeline(profile.projects,events,owner), pair = visiblePair(profile, owner);
  if (!groups.length && !owner) return null;
  if (!groups.length) return <div className="journey-view"><button type="button" className="journey-first" onClick={() => onAdd?.()} disabled={!onAdd}>
    <span aria-hidden="true">+</span>Add your first project
  </button></div>;
  return <section className="journey-view" aria-label={`${profile.name} Journey`}>
    {pair && <section className="journey-pair" aria-label="Then / Now">
      <h2>Then / Now</h2><div className="journey-pair-grid">{pair.map((project, index) => <div key={project.id}>
        <button type="button" onClick={() => onOpen(project)} aria-label={`Open ${index ? 'Now' : 'Then'}: ${project.title}`}>
          <span className="journey-pair-cover"><JourneyCover project={project} sizes="(max-width: 639px) 42vw, 240px" /></span>
          <strong>{project.title}{projectMonth(project) && ` · ${projectMonth(project)?.slice(0, 4)}`}</strong>
        </button><FormattedText className="journey-caption" text={project.thenNowCaption?.trim() || learnedLine(project)} />
      </div>)}</div>{owner && !isMobile && onPair && <button type="button" className="journey-text-action" onClick={onPair}>Change pair</button>}
    </section>}
    {owner && !isMobile && !pair && onPair && <button type="button" className="journey-text-action journey-pair-start" onClick={onPair}>Choose a Then/Now pair</button>}
    {groups.map(group => <section className="journey-year" key={group.year ?? 'undated'} aria-label={String(group.year ?? 'Date not set')}>
      <h2>{group.year ?? 'Date not set'}</h2>
      <ol className="journey-rail">{group.gap ? <li className="journey-entry journey-gap">
        <span className="journey-gap-cover" aria-hidden="true">+</span><div><h3>What were you making in {group.year}?</h3>
          <button type="button" className="journey-text-action" onClick={() => onAdd?.(group.year ?? undefined)}>Add something from {group.year}</button></div>
      </li> : group.entries.map(entry => entry.kind==='citation'?<li className="journey-entry" key={entry.event.id} data-insights-month={entry.event.date.slice(0,7)}>{entry.event.thumbnail&&<a href={entry.event.href}><img className="journey-entry-cover" src={entry.event.thumbnail} alt=""/></a>}<div className="journey-entry-copy"><time className="journey-month">{entry.event.date.slice(0,10)}</time><a href={entry.event.href}>{entry.event.label}</a></div></li>:(()=>{const project=entry.project;return <li className="journey-entry" key={project.id} data-insights-project={project.id} data-insights-month={(project.madeOn??project.publishedAt??'').slice(0,7)}>
        <button type="button" className="journey-entry-cover" style={{ aspectRatio: project.coverAspectRatio && project.coverAspectRatio > 0 ? project.coverAspectRatio : 1 }} onClick={() => onSelectWork(project)} aria-label={`Open ${project.title}`}><JourneyCover project={project} /></button>
        <div className="journey-entry-copy"><span className="journey-month">{(project.madeOn ?? project.publishedAt) && Number.isFinite(Date.parse(project.madeOn ?? project.publishedAt!)) ? new Date(project.madeOn ?? project.publishedAt!).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric', ...(project.madeOn ? { timeZone: 'UTC' } : {}) }) : 'Posting date unavailable'}</span>
          <button type="button" className="journey-title" onClick={() => onSelectWork(project)}>{project.title}</button>
          <span className="journey-portal">{profile.categories.find(portal => portal.id === project.categoryId)?.label}</span>
          <FormattedText className="journey-learned" text={learnedLine(project)} />
          <InsightMetrics work={insights?.projects.find(row=>row.projectId===project.id)}/>{(isMobile || (owner && onEdit)) && <button type="button" className="journey-project-options" aria-label={`Show details for ${project.title}`} aria-haspopup="dialog" aria-expanded={isMobile ? detailsProject?.id === project.id : undefined} onClick={() => isMobile ? setDetailsProject(project) : onEdit?.(project)}><InterfaceIcon icon={MoreHorizontalIcon} size="sm" weight="medium" /></button>}
        </div>
      </li>;})())}</ol>
    </section>)}
    {isMobile && detailsProject && <MobileProjectPopup project={detailsProject} creator={profile} onClose={() => setDetailsProject(null)} contextHandlers={owner ? { delete: onDelete ? () => onDelete(detailsProject) : undefined } : undefined} onEditDescription={owner && onEditDescription ? () => onEditDescription(detailsProject) : undefined} onOptions={owner && onEdit ? () => onEdit(detailsProject) : undefined} />}
  </section>;
}
