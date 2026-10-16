import type { Project } from '../../types/domain';
import { journeyProjects } from '../journey/journey';

export type JourneyCitationEvent = { id: string; date: string; label: string; href: string; thumbnail?: string };
export type JourneyTimelineEntry = { kind: 'project'; project: Project; date: string } | { kind: 'citation'; event: JourneyCitationEvent; date: string };
export type TimelineOrder = 'newest' | 'oldest' | 'popular';

const entryKey = (entry: JourneyTimelineEntry) => `${entry.kind}:${entry.kind === 'project' ? entry.project.id : entry.event.id}`;

export function journeyTimeline(projects: Project[], events: JourneyCitationEvent[], owner: boolean, order: TimelineOrder = 'newest', opens: Record<string,number> = {}) {
  const entries: JourneyTimelineEntry[] = [
    ...journeyProjects(projects, owner).map(project => ({ kind: 'project' as const, project, date: project.madeOn ?? project.publishedAt ?? '' })),
    ...events.map(event => ({ kind: 'citation' as const, event, date: event.date })),
  ];
  const direction = order === 'oldest' ? 1 : -1;
  entries.sort((a, b) => {
    if(order==='popular') {
      const score=(entry:JourneyTimelineEntry)=>entry.kind==='project'?Math.max(0,opens[entry.project.id]??0):-1;
      const popularity=score(b)-score(a); if(popularity)return popularity;
    }
    const aTime = Date.parse(a.date), bTime = Date.parse(b.date);
    const aDated = Number.isFinite(aTime), bDated = Number.isFinite(bTime);
    if (aDated !== bDated) return aDated ? -1 : 1;
    const timeOrder = aDated ? direction * (aTime - bTime) : 0;
    if (timeOrder) return timeOrder;
    const aKey = entryKey(a), bKey = entryKey(b);
    return aKey === bKey ? 0 : aKey < bKey ? -1 : 1;
  });
  if(order==='popular')return entries.length?[{year:null,entries,projectCount:entries.filter(entry=>entry.kind==='project').length,gap:false}]:[];
  const years = new Map<number | null, JourneyTimelineEntry[]>();
  for (const entry of entries) {
    const time = Date.parse(entry.date);
    const year = Number.isFinite(time) ? new Date(time).getUTCFullYear() : null;
    const group = years.get(year);
    if (group) group.push(entry);
    else years.set(year, [entry]);
  }
  return [...years].sort(([a], [b]) => {
    if (a === null || b === null) return a === b ? 0 : a === null ? 1 : -1;
    return direction * (a - b);
  }).map(([year, entries]) => ({
    year,
    entries,
    projectCount: entries.filter(entry => entry.kind === 'project').length,
    gap: false,
  }));
}
