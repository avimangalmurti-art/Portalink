import type { Project } from '../types/domain';

/**
 * Presentation derived from canonical project records.
 *
 * Everything here is a pure function of fields the project actually carries.
 * Nothing invents a filename, a page count, a description, or a year: when a
 * project does not hold a fact, these return null and the surface omits it.
 */

/**
 * The shape a card gives a piece of work. Taken from the cover asset's real
 * proportions, or from the document's own paper proportions when the project is
 * a multi-page document.
 */
export function getProjectAspectRatio(project: Project): number {
  const isDocument = project.coverKind === 'document' || typeof project.pageCount === 'number' && project.pageCount > 1;
  if (!isDocument && project.coverAspectRatio && Number.isFinite(project.coverAspectRatio) && project.coverAspectRatio > 0) {
    return project.coverAspectRatio;
  }
  const orientation = project.coverOrientation ?? 'square';
  if (isDocument) {
    // Paper keeps its own ratio rather than the cover image's crop.
    return orientation === 'landscape' ? 1.414 : 1 / 1.414;
  }
  if (orientation === 'portrait') {
    return 2 / 3;
  }
  if (orientation === 'landscape') {
    return 3 / 2;
  }
  return 1;
}

/**
 * How much horizontal room a piece of work claims in the discovery bento.
 *
 * A pure function of the presentation ratio the canonical record already yields
 * (`getProjectAspectRatio`) plus the layout's resolved column count. It is
 * derived state: nothing is written back onto the project, no id has an
 * exception, and there is no randomness — the same work always packs the same
 * way.
 *
 * Deliberately expressed in terms of the RATIO rather than the orientation enum,
 * so if the canonical media model later carries exact dimensions, the sharper
 * number flows straight through here with no change to the feed. It also means
 * no distinction is drawn that the current data cannot support: there is no
 * "panoramic" or "very tall" class, because nothing in the record could
 * truthfully populate one.
 */
export function resolveFeedSpan({
  aspectRatio



}: {aspectRatio: number;}, columns: number): number {
  // On narrow layouts every project remains one column so the work never spills
  // beyond the available reading width.
  if (columns <= 2) {
    return 1;
  }
  const isLandscape = aspectRatio > 1.2;
  const base = isLandscape ? 2 : 1;
  // Ranking affects order, never size. Portrait and square work stay compact;
  // landscape work receives only the second column its native ratio needs.
  return Math.min(base, columns - 1);
}

/**
 * What the work is, in the creator's own words. Null when the project carries no
 * summary — never a generated sentence.
 */
export function getProjectDescription(project: Project): string | null {
  const summary = project.summary.trim();
  return summary.length > 0 ? summary : null;
}

/**
 * A truthful extent indicator: how many files the project holds, or how many
 * pages it declares. Null when the project declares neither.
 */
export function getProjectMediaLabel(project: Project): string | null {
  if (project.attachments && project.attachments.length > 0) {
    const count = project.attachments.length;
    return count === 1 ? '1 file' : `${count} files`;
  }
  if (typeof project.pageCount === 'number' && project.pageCount > 1) {
    return `${project.pageCount} pages`;
  }
  return null;
}
