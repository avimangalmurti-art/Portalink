import type { ProjectCoverThumbnail } from '../../types/domain';
import { publicMediaUrl } from './publicMediaUrl';

/** Width descriptors must use actual bitmap widths, not the named long edge. */
export function coverThumbnailSources(thumbnail: ProjectCoverThumbnail | null | undefined) {
  const candidates = [...(thumbnail?.variants ?? [])]
    .filter(variant => variant.sourceUrl && Number.isFinite(variant.width) && variant.width > 0 && Number.isFinite(variant.height) && variant.height > 0)
    .sort((a, b) => a.width - b.width)
    .filter((variant, index, all) => index === all.length - 1 || variant.width !== all[index + 1].width);
  const largest = candidates[candidates.length - 1];
  return largest?.sourceUrl ? { src: publicMediaUrl(largest.sourceUrl), width: largest.width, height: largest.height,
    srcSet: candidates.map(variant => `${publicMediaUrl(variant.sourceUrl ?? '')} ${variant.width}w`).join(', ') } : null;
}
