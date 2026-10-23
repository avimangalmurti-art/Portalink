import type { Project } from '../../types/domain';

/** Overlap document viewer code with navigation; never open or read a document. */
export function warmProjectDocumentRenderer(project: Pick<Project, 'coverKind' | 'attachments'>): void {
  if (project.coverKind !== 'document' && !project.attachments?.some(attachment => attachment.kind === 'document')) return;
  // The renderer uses this same module URL. A failed speculative import must
  // not delay navigation or replace the reader's ordinary loading/error path.
  void import('./DocumentAttachment').catch(() => undefined);
}
