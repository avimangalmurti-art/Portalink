import { useState } from 'react';
import { ProjectCover } from '../../components/media/ProjectCover';
import { ResponsiveImage } from '../../components/ui/ResponsiveImage';
import { usePresentation } from '../../presentation/usePresentation';
import type { Project } from '../../types/domain';
import type { ImagePosition } from '../../types/imageCrop';
import { imagePositionStyle } from '../../utils/imageCrop';
import { getProjectCoverPreview } from '../../utils/projectPresentation';
import { timelinePairArtwork } from './timelinePairArtwork';

function FramedCover({ artwork, alt, sizes, position, fallback }: {
  artwork: NonNullable<ReturnType<typeof timelinePairArtwork>>;
  alt: string;
  sizes: string;
  position: ImagePosition;
  fallback: React.ReactNode;
}) {
  const [failed, setFailed] = useState(false);
  if (failed) return fallback;
  return <ResponsiveImage {...artwork} alt={alt} sizes={sizes} priority="viewport" measureWidth
    className="block h-full w-full object-cover" style={imagePositionStyle(position)}
    onError={() => setFailed(true)} />;
}

export function TimelinePairCover({ project, position }: { project: Project; position?: ImagePosition | null }) {
  const isMobile = usePresentation() === 'mobile';
  const alt = project.coverAlt || project.title;
  const sizes = '(max-width: 639px) 42vw, 240px';
  const fallback = <ProjectCover source={project.cover} thumbnail={project.coverThumbnail} kind={project.coverKind}
    previewSource={getProjectCoverPreview(project)} alt={alt} sizes={sizes} priority="viewport" fit="contain"
    allowPdfFallback={false} allowVideoFallback={isMobile} fallbackAttachments={project.attachments} />;
  const artwork = position ? timelinePairArtwork(project) : null;
  return <span className="journey-pair-cover">
    {position && artwork ? <FramedCover key={artwork.src} {...{ artwork, alt, sizes, position, fallback }} /> : fallback}
  </span>;
}
