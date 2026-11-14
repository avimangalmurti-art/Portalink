import { coverThumbnailSources } from '../media/coverThumbnailSources';
import { publicMediaUrl } from '../media/publicMediaUrl';
import type { Project } from '../../types/domain';
import { getProjectCoverPreview } from '../../utils/projectPresentation';

/** Use the same bitmap in the editor and Timeline, including the selected PDF page. */
export function timelinePairArtwork(project: Project) {
  const thumbnail = coverThumbnailSources(project.coverThumbnail);
  if (thumbnail) return thumbnail;
  const source = project.coverKind === 'document' ? getProjectCoverPreview(project)
    : project.coverKind === 'video' ? undefined : project.cover;
  return source ? { src: publicMediaUrl(source) } : null;
}
