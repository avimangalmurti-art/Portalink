import React from 'react';
import type { Profile, Project } from '../../types/domain';
import { ProjectCover } from '../../components/media/ProjectCover';
import { readMinutes, startHereProject } from './employer';
import { projectMonth } from '../journey/journey';
import './employer.css';

export function EmployerOverview({profile, onOpen}: {profile: Profile; onOpen: (project: Project) => void}) {
  const start = startHereProject(profile);
  if (!start) return null;
  const month = projectMonth(start);
  return <section className="employer-overview" aria-label="Catalogue introduction">
    <button type="button" className="employer-start" onClick={() => onOpen(start)} aria-label={`Start here: ${start.title}`}>
      <span className="employer-start-cover"><ProjectCover source={start.cover} thumbnail={start.coverThumbnail} kind={start.coverKind} alt={start.coverAlt || start.title} sizes="92px" priority="viewport" allowPdfFallback={false} allowVideoFallback={false} fallbackAttachments={start.attachments} /></span>
      <span className="employer-start-copy"><span className="employer-eyebrow">Start here</span><strong>{start.title}</strong><span>{[start.pageCount ? `${start.pageCount} ${start.pageCount === 1 ? 'page' : 'pages'}` : null, month ? new Date(`${month}-01T12:00:00Z`).toLocaleDateString(undefined,{month:'short',year:'numeric',timeZone:'UTC'}) : null, readMinutes(start.pageCount)].filter(Boolean).join(' · ')}</span></span>
    </button>
  </section>;
}
