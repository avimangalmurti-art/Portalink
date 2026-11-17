import type { ProjectAttachment } from '../../types/domain';

export const MIN_PAGES_PER_ROW = 1;
export const MAX_PAGES_PER_ROW = 9;
export const DEFAULT_PAGES_PER_ROW = 3;

export function defaultDesktopPagesPerRow(pageCount: number | null, attachments: readonly ProjectAttachment[]) {
  const mixedPages = attachments.every(file => file.kind === 'image' || file.kind === 'document')
    && attachments.some(file => file.kind === 'image') && attachments.some(file => file.kind === 'document');
  if (mixedPages) return MIN_PAGES_PER_ROW;
  if (pageCount !== null) return pageCount > 1 ? DEFAULT_PAGES_PER_ROW : MIN_PAGES_PER_ROW;
  const hasPageGrid = attachments.some(file => file.kind === 'document') || attachments.filter(file => file.kind === 'image').length > 1;
  return hasPageGrid ? DEFAULT_PAGES_PER_ROW : MIN_PAGES_PER_ROW;
}

export function normalizePagesPerRow(
  value: number,
  fallback = DEFAULT_PAGES_PER_ROW,
): number {
  const candidate = Number.isFinite(value) ? value : fallback;
  return Math.max(MIN_PAGES_PER_ROW, Math.min(MAX_PAGES_PER_ROW, Math.round(candidate)));
}
