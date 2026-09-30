import React from 'react';
import type { Profile, Project } from '../../types/domain';
import { ProjectCover } from '../../components/media/ProjectCover';
import { journeyGroups, learnedLine, projectMonth, visiblePair } from './journey';
import './journey.css';

export function JourneyCover({ project, sizes = '92px' }: { project: Project; sizes?: string }) {
  return <ProjectCover source={project.cover} thumbnail={project.coverThumbnail} kind={project.coverKind}
    alt={project.coverAlt || project.title} sizes={sizes} priority="viewport" fit="contain"
    allowPdfFallback={false} allowVideoFallback={false} fallbackAttachments={project.attachments} />;
}
export function JourneyView({ profile, owner, onOpen, onEdit, onAdd, onPair }: {
  profile: Profile; owner: boolean; onOpen: (project: Project) => void;
  onEdit?: (project: Project) => void; onAdd?: (year?: number) => void; onPair?: () => void;
}) {
  const groups = journeyGroups(profile.projects, owner), pair = visiblePair(profile, owner);
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
        </button><p className="journey-caption">{project.thenNowCaption?.trim() || learnedLine(project)}</p>
      </div>)}</div>{owner && onPair && <button type="button" className="journey-text-action" onClick={onPair}>Change pair</button>}
    </section>}
    {owner && !pair && onPair && <button type="button" className="journey-text-action journey-pair-start" onClick={onPair}>Choose a Then/Now pair</button>}
    {groups.map(group => <section className="journey-year" key={group.year ?? 'undated'} aria-label={String(group.year ?? 'Date not set')}>
      <h2>{group.year ?? 'Date not set'}</h2>
      <ol className="journey-rail">{group.gap ? <li className="journey-entry journey-gap">
        <span className="journey-gap-cover" aria-hidden="true">+</span><div><h3>What were you making in {group.year}?</h3>
          <button type="button" className="journey-text-action" onClick={() => onAdd?.(group.year ?? undefined)}>Add something from {group.year}</button></div>
      </li> : group.projects.map(project => <li className="journey-entry" key={project.id}>
        <button type="button" className="journey-entry-cover" onClick={() => onOpen(project)} aria-label={`Open ${project.title}`}><JourneyCover project={project} /></button>
        <div className="journey-entry-copy"><span className="journey-month">{projectMonth(project) ? new Date(`${projectMonth(project)}-01T12:00:00Z`).toLocaleString(undefined, { month: 'short', timeZone: 'UTC' }) : 'Date not set'}</span>
          <button type="button" className="journey-title" onClick={() => onOpen(project)}>{project.title}</button>
          <p className="journey-learned">{learnedLine(project)}</p>
          {owner && onEdit && <button type="button" className="journey-text-action" onClick={() => onEdit(project)} aria-label={`Edit Journey details for ${project.title}`}>Edit details</button>}
        </div>
      </li>)}</ol>
    </section>)}
  </section>;
}
