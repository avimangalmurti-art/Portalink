import type { Profile, Project } from '../../types/domain';

export type ThenNow = { then: string; now: string };
export type JourneyGroup = { year: number | null; projects: Project[]; gap: boolean };
export function readJourneyCaption(row: { then_now_caption?: unknown; design?: unknown }): string {
  if (Object.prototype.hasOwnProperty.call(row, 'then_now_caption')) return typeof row.then_now_caption === 'string' ? row.then_now_caption.slice(0, 180) : '';
  const design = row.design && typeof row.design === 'object' ? row.design as Record<string, unknown> : {};
  return typeof design.journeyCaption === 'string' ? design.journeyCaption.slice(0, 180) : '';
}
export function readThenNow(value: unknown): ThenNow | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const pair = value as Record<string, unknown>;
  if (Object.keys(pair).length !== 2) return null;
  return typeof pair.then === 'string' && typeof pair.now === 'string' && pair.then !== pair.now
    && pair.then.length > 0 && pair.now.length > 0 ? { then: pair.then, now: pair.now } : null;
}
export function journeyAllowed(profile: Pick<Profile, 'showJourney'>, owner: boolean): boolean {
  return owner || profile.showJourney === true;
}
export function projectMonth(project: Project): string | null {
  if (project.madeOn && /^\d{4}-\d{2}-\d{2}$/.test(project.madeOn)) return project.madeOn.slice(0,7);
  const madeIn = project.creationDetails?.madeIn;
  if (madeIn && /^(?:[1-9]\d{3})-(0[1-9]|1[0-2])$/.test(madeIn)) return madeIn;
  const date = new Date(project.publishedAt ?? '');
  return Number.isFinite(date.getTime()) ? date.toISOString().slice(0, 7) : null;
}
export function learnedLine(project: Project): string {
  return (project.creationDetails?.answers.learned?.trim() || project.summary.split(/\r?\n/).map(line => line.trim()).find(Boolean) || '').replace(/\s+/g, ' ');
}
export function journeyProjects(projects: Project[], owner: boolean): Project[] {
  // Drafts are a separate service type; session-only upload previews are not published work.
  return projects.filter(project => !project.sessionOnly && (owner || project.isPubliclyVisible !== false));
}
export function journeyGroups(projects: Project[], owner: boolean, currentYear = new Date().getFullYear()): JourneyGroup[] {
  const sorted = journeyProjects(projects, owner).slice().sort((a, b) =>
    (projectMonth(b) ?? '').localeCompare(projectMonth(a) ?? '')
    || (b.madeOn ?? b.publishedAt ?? '').localeCompare(a.madeOn ?? a.publishedAt ?? '') || a.id.localeCompare(b.id));
  const years = new Map<number | null, Project[]>();
  for (const project of sorted) {
    const month = projectMonth(project), year = month ? Number(month.slice(0, 4)) : null;
    years.set(year, [...(years.get(year) ?? []), project]);
  }
  const dated = [...years.keys()].filter((year): year is number => year !== null);
  if (owner && dated.length) for (let year = Math.min(...dated); year <= currentYear; year++) if (!years.has(year)) years.set(year, []);
  return [...years].sort(([a], [b]) => (b ?? -1) - (a ?? -1)).map(([year, entries]) => ({ year, projects: entries, gap: entries.length === 0 }));
}
export function visiblePair(profile: Profile, owner: boolean): [Project, Project] | null {
  if (!journeyAllowed(profile, owner)) return null;
  const pair = readThenNow(profile.thenNow), projects = journeyProjects(profile.projects, false);
  const then = projects.find(project => project.id === pair?.then), now = projects.find(project => project.id === pair?.now);
  return then && now ? [then, now] : null;
}
export function journeyPreferenceKey(viewerId: string | null | undefined, profileId: string): string {
  return `portalink:profile-view:${viewerId || 'guest'}:${profileId}`;
}
export function readJourneyPreference(key: string): 'portfolio' | 'journey' {
  try { return localStorage.getItem(key) === 'journey' ? 'journey' : 'portfolio'; } catch { return 'portfolio'; }
}
export function rememberJourneyPreference(key: string, view: 'portfolio' | 'journey') {
  try { localStorage.setItem(key, view); } catch { /* Per-device convenience only. */ }
}
