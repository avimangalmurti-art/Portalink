import React from 'react';
import { AudioPlayer } from '../profile/AudioPlayer';
import { PdfViewer } from '../profile/PdfViewer';
import { MediaFrame } from './MediaFrame';
import { ImageAttachment } from './ImageAttachment';
import { AudioAttachment } from './AudioAttachment';
import { DocumentAttachment } from './DocumentAttachment';
import { VideoAttachment } from './VideoAttachment';
import { ModelAttachment } from './ModelAttachment';
import { GenericFileCard } from './GenericFileCard';
import { ProcessingNotice } from './ProcessingNotice';
import type { ProjectAttachment, ProjectOpeningPage } from '../../types/domain';

/**
 * The one place an attachment becomes a presentation.
 *
 * It reads `attachment.kind` and nothing else — no category, no region, no
 * filename inspection — so the same file renders identically wherever it is
 * filed. New renderers are added here; category pages never learn about them.
 */
export function AttachmentRenderer({
  projectId,
  attachment,
  imagePages,
  imageColumns,
  projectTitle,
  artwork,
  processing,
  onDocumentPageCountResolved,
  onFocusModeChange,
  controlsVisible,
  showMediaInteractions = true,
  isOwner = false,
  memoryScope = 'workspace',
  openingPage,
  openingPageRequest = 0,
  useOpeningPageOnMount = false,
  pageViewToggleRequest = 0,
  onClose































}: {projectId: string;attachment: ProjectAttachment; /**
   * Every image the project holds, in order. A multi-image piece is ONE piece,
   * so it is read as stacked pages rather than as separate files. Absent falls
   * back to the active attachment alone.
   */imagePages?: ProjectAttachment[]; /** How many image pages sit side by side. Presentation only. */imageColumns?: number;projectTitle: string; /**
   * An image the project uploaded separately, used as the cover when the file being
   * played is audio. Absent when the project holds no image.
   */artwork?: {url: string;alt: string;}; /**
   * The live processing state for this asset, when the service has been asked.
   * Absent falls back to the record's own state.
   */processing?: {state: ProjectAttachment['status'];message: string | null;canRetry: boolean;isRetrying: boolean;onRetry: () => void;}; /** Reports the PDF catalog's immutable total to the navigation header. */onDocumentPageCountResolved?: (attachmentId: string, pageCount: number) => void; /** Lets the surrounding project viewer become immersive while one page is isolated. */onFocusModeChange?: (focused: boolean) => void;controlsVisible?: boolean; /** Public presentation links omit account engagement entirely. */showMediaInteractions?: boolean; /** True when the authenticated profile owns the project. */isOwner?: boolean; /** Keeps public-share history separate from the signed-in workspace. */memoryScope?: string;openingPage?: ProjectOpeningPage;openingPageRequest?: number;useOpeningPageOnMount?: boolean; /** A new value toggles overview and the last focused page. */pageViewToggleRequest?: number;onClose: () => void;}) {// The title reads as the work when the project holds a single file, and as
  // the file when it holds several.
  const title = attachment.displayName || projectTitle;const state = processing?.state ?? attachment.status; /**
   * A stored asset whose derived preview does not exist yet. Rendering a viewer
   * here would present an empty frame as though a preview had been produced, so
   * the state is stated instead — for either outcome, and never conflated with an
   * upload failure.
   */const canShowOriginalPdf = attachment.kind === 'document' && Boolean(attachment.sourceUrl);
  if ((state === 'processing' || state === 'processing-failed') && !canShowOriginalPdf) {return <MediaFrame>
        <ProcessingNotice attachment={attachment} state={state} message={processing?.message ?? null} canRetry={processing?.canRetry ?? false} isRetrying={processing?.isRetrying ?? false} onRetry={processing?.onRetry ?? (() => undefined)} />
      </MediaFrame>;}switch (attachment.kind) {case 'audio': // A real file plays natively; seeded work with no file keeps the
      // synthetic player and its derived length.
      return attachment.sourceUrl ? <MediaFrame>
          <AudioAttachment attachment={attachment} />
        </MediaFrame> : <AudioPlayer fileName={title} duration={attachment.metadata?.durationSeconds ?? 0} artworkUrl={artwork?.url} artworkAlt={artwork?.alt} onClose={onClose} />;case 'document':
      // A real document is shown as itself; seeded work keeps the paginated view.
      return attachment.sourceUrl ? <MediaFrame>
          <DocumentAttachment attachment={attachment} columns={imageColumns} processing={state === 'processing' || state === 'processing-failed' ? {
          state,
          message: processing?.message ?? null,
          canRetry: processing?.canRetry ?? false,
          isRetrying: processing?.isRetrying ?? false,
          onRetry: processing?.onRetry ?? (() => undefined)
        } : undefined} projectId={projectId} onPageCountResolved={(pageCount) => onDocumentPageCountResolved?.(attachment.id, pageCount)} onFocusModeChange={onFocusModeChange} controlsVisible={controlsVisible} showMediaInteractions={showMediaInteractions} isOwner={isOwner} memoryScope={memoryScope} openingPage={openingPage} openingPageRequest={openingPageRequest} useOpeningPageOnMount={useOpeningPageOnMount} pageViewToggleRequest={pageViewToggleRequest} />
        </MediaFrame> : <PdfViewer fileName={title} pageCount={attachment.metadata?.pageCount ?? 6} onClose={onClose} />;
    case 'image':
      return <MediaFrame>
          <ImageAttachment projectId={projectId} pages={imagePages && imagePages.length > 0 ? imagePages : [attachment]} columns={imageColumns} onFocusModeChange={onFocusModeChange} controlsVisible={controlsVisible} showMediaInteractions={showMediaInteractions} isOwner={isOwner} memoryScope={memoryScope} openingPage={openingPage} openingPageRequest={openingPageRequest} useOpeningPageOnMount={useOpeningPageOnMount} pageViewToggleRequest={pageViewToggleRequest} />
        </MediaFrame>;
    case 'video':
      return <MediaFrame>
          <VideoAttachment attachment={attachment} />
        </MediaFrame>;
    case 'model3d':
      return <MediaFrame>
          <ModelAttachment attachment={attachment} />
        </MediaFrame>;
    default:
      return <MediaFrame>
          <GenericFileCard attachment={attachment} />
        </MediaFrame>;
  }
}
