import type { Profile, Project } from '../../types/domain';

/** `headline` remains the existing long Bio column. Empty short text is intentional. */
export function profileHeadline(profile: Pick<Profile, 'headline' | 'portfolioHeadline'>): string {
  return (typeof profile.portfolioHeadline === 'string' ? profile.portfolioHeadline : (profile.headline ?? '').split(/\r?\n/).find(line => line.trim()) ?? '').trim().slice(0, 80);
}
export function profileFacts(profile: Profile) {
  // Bio belongs in its sheet; never reuse its first line as a public header fact.
  const field = (profile.portfolioHeadline ?? '').trim().slice(0, 80).split(/\s+[·|—]\s+/)[0];
  return [['School', profile.school], ['Field', field], ['City', profile.location], ['Available', profile.availability]]
    .filter((entry): entry is [string, string] => Boolean(entry[1]?.trim())).map(([label, value]) => ({label, value: value.trim()}));
}
export const validContactEmail = (value: string) => value.length <= 254 && /^[^\s<>@,;?&#]+@[^\s<>@,;?&#]+\.[^\s<>@,;?&#]+$/.test(value);
export function contactHref(profile: Profile): string | null {
  const email = profile.contactEmail?.trim() ?? '';
  return !profile.isPrivate && profile.contactEmailPublic === true && validContactEmail(email)
    ? `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(`Your portfolio — ${profile.name}`)}` : null;
}
export function publicProjects(profile: Profile): Project[] {
  return profile.isPrivate ? [] : profile.projects.filter(project => !project.sessionOnly && project.isPubliclyVisible !== false);
}
export function startHereProject(profile: Profile): Project | null {
  return publicProjects(profile).find(project => project.id === profile.startHereProjectId) ?? null;
}
export function readMinutes(pages: number | null | undefined): string | null {
  return pages && Number.isFinite(pages) && pages > 0 ? `Read in ${Math.max(1, Math.round(pages / 3))} min` : null;
}
export function readEmployerFields(row: Record<string, unknown>) {
  return {
    portfolioHeadline: typeof row.portfolio_headline === 'string' ? row.portfolio_headline.slice(0, 80) : null,
    school: typeof row.school === 'string' ? row.school.slice(0, 120) : '',
    availability: typeof row.availability === 'string' ? row.availability.slice(0, 120) : '',
    startHereProjectId: typeof row.start_here_project_id === 'string' ? row.start_here_project_id : null,
    contactEmailPublic: row.contact_email_public === true,
    contactEmail: row.contact_email_public === true && typeof row.contact_email === 'string' && validContactEmail(row.contact_email) ? row.contact_email : '',
    allowPdfDownload: row.allow_pdf_download !== false,
  };
}
export const PORTFOLIO_PAGE_LIMIT = 120;
export function exportProjectPageCount(project: Project): number {
  if (!project.attachments?.length) return Math.max(1, project.pageCount ?? 1);
  return project.attachments.reduce((sum, attachment) => sum + (attachment.kind === 'document' ? Math.max(1, attachment.metadata?.pageCount ?? 1) : 1), 0);
}
export function exportCoverSource(project: Project): string | undefined {
  return project.coverThumbnail?.variants.find(variant => variant.size === 400)?.sourceUrl
    || project.coverThumbnail?.variants.find(variant => variant.sourceUrl)?.sourceUrl
    || (project.coverKind !== 'document' && project.coverKind !== 'video' && !project.attachments?.some(attachment => attachment.sourceUrl === project.cover && attachment.kind !== 'image') ? project.cover : undefined) || undefined;
}
export function defaultExportIds(profile: Profile): string[] {
  const projects = publicProjects(profile).slice().sort((a,b) => (b.publishedAt ?? '').localeCompare(a.publishedAt ?? '') || a.id.localeCompare(b.id));
  const first = startHereProject(profile);
  return [...(first ? [first.id] : []), ...projects.filter(p => p.id !== first?.id).slice(0, 3).map(p => p.id)];
}
export function exportPageTotal(projects: Project[]): number {
  return 1 + projects.reduce((sum, project) => sum + exportProjectPageCount(project), 0);
}
