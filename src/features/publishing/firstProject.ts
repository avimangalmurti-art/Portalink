import type { ProjectCreationDetails } from '../../types/domain';

export const EMPTY_CREATION: ProjectCreationDetails = { madeIn: '', field: '', answers: { what: '', did: '', learned: '' } };
export function composeProjectDescription(answers: ProjectCreationDetails['answers']): string {
  return [answers.what, answers.did, answers.learned].map(value => value.trim()).filter(Boolean).join('\n\n');
}
export function firstProjectTitle(fileName: string, pdfTitle?: unknown): string {
  const title = typeof pdfTitle === 'string' ? pdfTitle.replace(/\s+/g, ' ').trim() : '';
  return (title || fileName.replace(/\.[^.]+$/, '').trim()).slice(0, 80);
}
export function firstProjectMonth(lastModified: number, pdfDate?: Date | null): string {
  const date = pdfDate && Number.isFinite(pdfDate.getTime()) ? pdfDate : new Date(lastModified);
  return Number.isFinite(date.getTime()) ? `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}` : '';
}
export function shouldStartFirstProject(mobile: boolean, projectCount: number, intent?: string | null): boolean {
  return mobile && projectCount === 0 && (!intent || ['my-profile', 'create-project', 'interaction'].includes(intent));
}
export function normalizeCreationDetails(value: unknown): ProjectCreationDetails | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const row = value as Record<string, unknown>;
  const text = (value: unknown, max: number) => typeof value === 'string' ? value.slice(0, max) : '';
  const answers = row.answers && typeof row.answers === 'object' ? row.answers as Record<string, unknown> : {};
  const madeIn = text(row.madeIn, 7);
  return { madeIn: /^\d{4}-(0[1-9]|1[0-2])$/.test(madeIn) ? madeIn : '', field: text(row.field, 120),
    answers: { what: text(answers.what, 20000), did: text(answers.did, 20000), learned: text(answers.learned, 20000) } };
}
export function readCreationDetails(row: { made_in?: unknown; field?: unknown; story_answers?: unknown; design?: unknown }): ProjectCreationDetails | undefined {
  const design = row.design && typeof row.design === 'object' ? row.design as Record<string, unknown> : {};
  if (row.made_in != null || row.field != null || row.story_answers != null) {
    return normalizeCreationDetails({ madeIn: row.made_in, field: row.field, answers: row.story_answers });
  }
  return normalizeCreationDetails(design.projectContext);
}
export function isMissingCreationColumn(error: { code?: string; message?: string } | null): boolean {
  return Boolean(error && ['42703', 'PGRST204'].includes(error.code ?? '') && /made_in|story_answers|(?:['" ]field['" ])/i.test(error.message ?? ''));
}
const liveKey = (profileId: string) => `portalink:first-portfolio-live:${profileId}`;
export function livePortfolioDismissed(profileId: string, storage?: Pick<Storage, 'getItem'>): boolean {
  try { return (storage ?? window.localStorage).getItem(liveKey(profileId)) === 'dismissed'; } catch { return false; }
}
export function readLivePortfolio(profileId: string, storage?: Pick<Storage, 'getItem'>): string | null {
  try { const value = (storage ?? window.localStorage).getItem(liveKey(profileId)); return value && value !== 'dismissed' ? value : null; } catch { return null; }
}
export function rememberLivePortfolio(profileId: string, projectId: string, storage?: Pick<Storage, 'getItem' | 'setItem'>): boolean {
  try { const target = storage ?? window.localStorage; if (target.getItem(liveKey(profileId)) === 'dismissed') return false; target.setItem(liveKey(profileId), projectId); } catch { /* This view still works when persistence is unavailable. */ }
  return true;
}
export function dismissLivePortfolio(profileId: string, storage?: Pick<Storage, 'setItem'>): void {
  try { (storage ?? window.localStorage).setItem(liveKey(profileId), 'dismissed'); } catch { /* The caller also dismisses in memory. */ }
}
