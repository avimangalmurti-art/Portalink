import { useProjectReach } from '../../features/reads/useProjectReach';
import { useNavigate } from 'react-router-dom';
import { buildPath } from '../../app/routes';
import { useAuth } from '../../contexts/AuthContext';
import { MobileContextButton, useMobileScreenActions } from '../../presentation/mobile/MobileContextActions';
import { contextActions } from '../../presentation/mobile/contextActions';
import { shareContextLink } from '../../presentation/mobile/SharedContextActions';
import { copyPublicLink } from '../../utils/copyPublicLink';
import { MobilePageContext } from '../../features/media-interactions/MobilePageContext';
import { MediaInteractionBar } from '../../features/media-interactions/MediaInteractionBar';
import type { PagePosition } from './MobileProjectPageCounter';
import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ListIcon, UserRoundIcon, AlertCircleIcon, AudioLinesIcon, BadgeCheckIcon, BookUserIcon, BoxIcon, EllipsisIcon, FileIcon, FileTextIcon, ImageIcon, MessageCircleIcon, PanelRightCloseIcon, PanelRightOpenIcon, PlayIcon, XIcon } from 'lucide-react';
import { AttachmentRenderer } from './AttachmentRenderer';
import { MobileVideoSequence, type VideoSequenceEntry } from './MobileVideoSequence';
import { MobileVideoFrame, type VideoCreator } from './MobileVideoFrame';
import { useNavigationOutsideTap } from '../../presentation/mobile/useNavigationOutsideTap';
import { MobileProjectIndexPortal } from './MobileProjectIndexPortal';
import { MobileProjectPageCounter } from './MobileProjectPageCounter';
import { jumpToProjectPage } from './projectPageScroll';
import { MobileProjectDescriptionSheet } from './MobileProjectDescriptionSheet';
import type { ProjectManagement } from '../../features/projects/useProjectManagement';
import type { PdfDocument } from './PdfPage';
import { useProjectBackSwipe } from './useProjectBackSwipe';
import type { AssetProcessingState } from '../../features/media/useAssetProcessing';
import { EngagementBar, EngagementFeedback } from '../../features/engagement/EngagementBar';
import { useProjectEngagement } from '../../features/engagement/useProjectEngagement';
import { CommentThreadView } from '../comments/CommentThreadView';
import { MediaCommentsPopover } from '../../features/media-interactions/MediaCommentsPopover';
import { useProjectComments } from '../../features/comments/useProjectComments';
import type { MediaKind, ProjectAttachment, ProjectCredit } from '../../types/domain';
import type { LucideIcon } from 'lucide-react';
import { InterfaceIcon } from '../ui/InterfaceIcon';
import { normalizePagesPerRow } from '../../features/projects/pageLayout';
import { pinchDistance, pinchSteps } from '../../utils/pinchGesture';
import { beginContentPinch, touchMidpoint, type ContentPinchMotion } from './contentPinchMotion';
import { readViewerMemory, updateViewerMemory } from './viewerMemory';
import { projectContinuityStyle } from '../../utils/projectContinuity';
import { preloadProjectMedia } from '../../features/media/preloadProjectMedia';
import { ResizablePanelHandle, type useResizablePanelWidth } from '../ui/ResizablePanelHandle';
const KIND_ICONS: Record<MediaKind, LucideIcon> = {
  image: ImageIcon,
  video: PlayIcon,
  audio: AudioLinesIcon,
  document: FileTextIcon,
  model3d: BoxIcon,
  unknown: FileIcon
};

const SAMPLE_VERIFICATION_SIGNALS = [
  {
    key: 'original',
    label: 'Original signals',
    value: 72,
    color: '#0a84ff'
  },
  {
    key: 'cited',
    label: 'Cited material',
    value: 18,
    color: '#bf5af2'
  },
  {
    key: 'ai-like',
    label: 'AI-like signals',
    value: 7,
    color: '#ff9f0a'
  },
  {
    key: 'uncertain',
    label: 'Uncertain',
    value: 3,
    color: '#8e8e93'
  }
] as const;

const SAMPLE_CHECKER_EVIDENCE = [
  { provider: 'LumenProof AI', result: 'Low AI-pattern risk' },
  { provider: 'SourceTrace', result: 'References matched' },
  { provider: 'PatternLens', result: '3% uncertain' }
] as const;

function formatPublishedDate(value?: string): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' }).format(date);
}

/**
 * A project's files, each rendered by its own renderer.
 *
 * Mixed media is the normal case: a music project may hold a track, a stage
 * model, a photograph, and a rider, and each is presented for what it is.
 */
export function ProjectMediaViewer({
  responseRailWidth,
  singlePanel,
  mobileNavigation,
  videoSequence,
  creator,
  projectId,
  projectTitle,
  projectSummary,
  descriptionEditor,
  publishedAt,
  credits = [],
  pageCount,
  attachments,
  contentTypefaceStack,
  pagesPerRow = 3,
  onPagesPerRowChange,
  onPagesPerRowCommit,
  savingPageLayout = false,
  pageViewToggleRequest = 0,
  onPageFocusModeChange,
  processing,
  onDocumentPageCountResolved,
  isRailOpen,
  onRailOpenChange,
  isOwner = false,
  readOnlyShare = false,
  onClose










}: {creator?: VideoCreator;videoSequence?: { scope: string; entries: VideoSequenceEntry[]; onSelectProject: (id: string) => void };responseRailWidth: ReturnType<typeof useResizablePanelWidth>;singlePanel: 'index' | 'response' | null;mobileNavigation?: { indexOpener?: React.RefObject<HTMLButtonElement>; index: React.ReactNode; isIndexOpen: boolean; onOpenIndex: () => void; onCloseIndex: () => void; onBack: () => void };projectId: string;projectTitle: string; /** The project's own words about the work. Absent when it has none. */projectSummary?: string;descriptionEditor?: ProjectManagement['editor'];publishedAt?: string;credits?: ProjectCredit[];pageCount: number | null;attachments: ProjectAttachment[];contentTypefaceStack?: string; /** Creator-selected initial pages-per-row layout. */pagesPerRow?: number; /** Viewer-side density changes made directly over the work surface. */onPagesPerRowChange?: (pagesPerRow: number) => void; /** Persists the final density after a pinch settles. Omitted for public, read-only views. */onPagesPerRowCommit?: (pagesPerRow: number) => void; savingPageLayout?: boolean; /** A new value toggles between the page overview and the last focused page. */pageViewToggleRequest?: number;onPageFocusModeChange?: (focused: boolean) => void; /** Canonical processing state is owned by the workspace so the header and renderer read the same fixed total. */processing: AssetProcessingState; /** Reports the PDF catalog's immutable total to the navigation header. */onDocumentPageCountResolved?: (attachmentId: string, pageCount: number) => void; /** Controlled by the profile workspace so it survives project and portal navigation. */isRailOpen: boolean;onRailOpenChange: (open: boolean) => void; /** True when the signed-in creator is looking at their own project. */isOwner?: boolean; /** Public shares allow visitor responses while keeping creator editing unavailable. */readOnlyShare?: boolean;onClose: () => void;}) {
  /**
   * How many pages sit side by side. The creator chooses the opening reading for
   * this project and the project record carries it to every visitor. The choice
   * changes only presentation: never page proportions, order, or source files.
   *
   * Three across is the platform standard for a piece that genuinely has pages.
   * A single-page piece is never laid out in columns at all — there is nothing
   * to sit beside it, and a lone page in a third of the width would just be a
   * small image with two empty columns next to it.
  */
  const normalizedPagesPerRow = normalizePagesPerRow(pagesPerRow);
  const viewerMemoryScope = readOnlyShare ? 'shared' : 'workspace';
  const viewerMemoryKey = `${viewerMemoryScope}:project:${projectId}`;
  const attachmentIdsKey = attachments.map((attachment) => attachment.id).join('|');
  const deepLinkedAttachmentId = typeof window === 'undefined'
    ? null
    : new URLSearchParams(window.location.search).get('media');
  const resolveInitialAttachment = () => deepLinkedAttachmentId && attachments.some(attachment => attachment.id === deepLinkedAttachmentId)
    ? deepLinkedAttachmentId : readViewerMemory(viewerMemoryKey).activeAttachmentId ?? null;
  const [selection, setSelection] = useState(() => ({ scope: viewerMemoryKey, id: resolveInitialAttachment() }));
  // Resolve a newly navigated project before paint, rather than briefly mounting
  // its first (possibly non-video) attachment before the memory effect runs.
  const activeId = selection.scope === viewerMemoryKey ? selection.id : resolveInitialAttachment();
  const setActiveId = useCallback((id: string | null) => setSelection({ scope: viewerMemoryKey, id }), [viewerMemoryKey]);
  /**
   * Which of the two readings of the work the rail is showing. They share the one
   * area rather than stacking, because both are prose about the same piece and a
   * viewer is doing one or the other. The conversation leads, since it is the part
   * that changes.
   */
  const [railPanel, setRailPanel] = useState<'comments' | 'description'>('comments');
  const [isProjectShared, setIsProjectShared] = useState(false);
  const [isImmersive, setIsImmersive] = useState(false);
  const [areControlsVisible, setAreControlsVisible] = useState(true);
  const [sharedInfoPanel, setSharedInfoPanel] = useState<'project' | 'comments' | 'verification'>('project');
  const controlsTimerRef = useRef<number | null>(null);
  const viewerRootRef = useRef<HTMLDivElement>(null);
  const isMobileViewer = Boolean(mobileNavigation);
  const [mobilePopup, setMobilePopup] = useState<'description' | 'comments' | 'verification' | 'engagement' | null>(null);
  const [mobileEngagementOpen, setMobileEngagementOpen] = useState(false);
  const mobileEngagementRef = useRef<HTMLElement>(null);
  const mobileEngagementToggleRef = useRef<HTMLButtonElement>(null);
  const closeMobileEngagement = useCallback(() => {
    setMobileEngagementOpen(false);
    mobileEngagementToggleRef.current?.focus({ preventScroll: true });
  }, []);
  useNavigationOutsideTap(isMobileViewer && mobileEngagementOpen && !mobilePopup && !mobileNavigation?.isIndexOpen && !isImmersive, mobileEngagementRef, () => setMobileEngagementOpen(false));
  const popupAnchorRef = useRef<HTMLDivElement>(null);
  const descriptionTriggerRef = useRef<HTMLButtonElement>(null);
  const commentsTriggerRef = useRef<HTMLButtonElement>(null);
  const verificationTriggerRef = useRef<HTMLButtonElement>(null);
  const feedbackTriggerRef = useRef<HTMLButtonElement>(null);
  const closeMobilePopup = useCallback(() => setMobilePopup(null), []);
  useEffect(() => {
    setMobilePopup(null);
    setMobileEngagementOpen(false);
  }, [projectId, isMobileViewer, mobileNavigation?.isIndexOpen, isImmersive]);
  useEffect(() => {
    setSharedInfoPanel('project');
  }, [projectId]);
  useEffect(() => {
    if (deepLinkedAttachmentId && attachments.some((attachment) => attachment.id === deepLinkedAttachmentId)) {
      setActiveId(deepLinkedAttachmentId);
      setIsProjectShared(false);
      return;
    }
    const rememberedAttachmentId = readViewerMemory(viewerMemoryKey).activeAttachmentId;
    setActiveId(rememberedAttachmentId && attachments.some((attachment) => attachment.id === rememberedAttachmentId) ? rememberedAttachmentId : null);
    setIsProjectShared(false);
  }, [attachmentIdsKey, attachments, deepLinkedAttachmentId, viewerMemoryKey, setActiveId]);
  const revealControls = useCallback(() => {
    setAreControlsVisible(true);
    if (controlsTimerRef.current !== null) {
      window.clearTimeout(controlsTimerRef.current);
    }
    if (isImmersive && !isMobileViewer) {
      controlsTimerRef.current = window.setTimeout(() => {
        controlsTimerRef.current = null;
        setAreControlsVisible(false);
      }, 1800);
    }
  }, [isImmersive, isMobileViewer]);
  const holdControls = useCallback(() => {
    setAreControlsVisible(true);
    if (controlsTimerRef.current !== null) {
      window.clearTimeout(controlsTimerRef.current);
      controlsTimerRef.current = null;
    }
  }, []);
  useEffect(() => {
    revealControls();
    return () => {
      if (controlsTimerRef.current !== null) {
        window.clearTimeout(controlsTimerRef.current);
        controlsTimerRef.current = null;
      }
    };
  }, [isImmersive, revealControls]);
  /**
   * A project can exist while one of its files is still being prepared, so the
   * viewer asks the service what state each stored asset is actually in rather
   * than assuming the record is final. When a job finishes, the hook refreshes the
   * canonical data and the finished preview arrives through the normal read.
   */
  // Canonical engagement, shared with the viewer's own activity collections: the
  // same project can never read differently in two places. Public links expose
  // visitor actions through the same guest gate and backend permission checks.
  const engagement = useProjectEngagement(projectId);
  // Keyed to the project, so project A's thread, pending reply, or failure can
  // never appear on project B.
  const comments = useProjectComments(projectId);
  useEffect(() => {
    if (mobilePopup === 'engagement' && !engagement.resolveError && !engagement.failure) {
      setMobilePopup(null);
      // Wait for the dismissed modal to release its focus containment.
      requestAnimationFrame(() => descriptionTriggerRef.current?.focus({ preventScroll: true }));
    }
  }, [mobilePopup, engagement.resolveError, engagement.failure]);
  const shareProject = async () => {
    const url = window.location.href;
    // Selection feedback belongs to the click itself. Native share sheets can be
    // cancelled and clipboard permission can be unavailable, but neither should
    // make the control appear as though the intentional press never happened.
    setIsProjectShared(true);
    try {
      if (typeof navigator.share === 'function') {
        await navigator.share({ title: projectTitle, url });
      } else {
        await navigator.clipboard.writeText(url);
      }
    } catch (caught) {
      // Cancelling the operating-system sheet keeps the explicit pressed state;
      // it simply avoids a second clipboard attempt the user did not request.
      if (caught instanceof DOMException && caught.name === 'AbortError') {
        return;
      }
      try {
        await navigator.clipboard.writeText(url);
      } catch {
        // The visual confirmation still reports the click. Clipboard and native
        // share permissions are browser capabilities, not engagement state.
      }
    }
  };
  const active = attachments.find((item) => item.id === activeId) ?? attachments[0];
  useEffect(() => {
    setIsImmersive(false);
    onPageFocusModeChange?.(false);
  }, [active?.id, onPageFocusModeChange]);
  const handlePageFocusModeChange = useCallback((focused: boolean) => {
    setIsImmersive(focused);
    onPageFocusModeChange?.(focused);
  }, [onPageFocusModeChange]);
  /**
   * When audio and an image are uploaded as separate files, the image is the
   * track's cover rather than a second thing to click through to. Resolved from the
   * project's own files only — nothing is generated, so audio with no image simply
   * has no cover.
   */
  /*
   * Every image the project holds, in record order. They are read as pages of
   * one piece rather than as separate files to step between — a photo essay is
   * one work, not five attachments.
   */
  const isDocumentReading = isMobileViewer && active?.kind === 'document';
  const isVerticalReading = isMobileViewer && (active?.kind === 'document' || active?.kind === 'image');
  const isReadingHeader = isDocumentReading || (readOnlyShare && isVerticalReading);
  const imagePages = attachments.filter((item) => item.kind === 'image');
  const previewScope = `${projectId}:${active?.id ?? ''}`;
  // Opening work on a phone still starts at full width. Only an explicit
  // slider choice changes that reading; WEB keeps the authored density.
  const [mobileDensity, setMobileDensity] = useState<{ scope: string; value: number } | null>(null);
  const mobilePagesPerRow = mobileDensity?.scope === previewScope ? mobileDensity.value : 1;
  const changeMobileDensity = (value: number) => {
    const next = normalizePagesPerRow(value);
    setMobileDensity({ scope: previewScope, value: next });
    onPagesPerRowChange?.(next);
  };
  const [contextPosition, setContextPosition] = useState<PagePosition | null>(null);
  const currentPage = contextPosition?.scope === previewScope && contextPosition.ready !== false ? contextPosition.current - 1 : null;
  const pageAttachment = active?.kind === 'image' && currentPage !== null ? imagePages[currentPage] : active;
  const pageTarget = currentPage !== null && pageAttachment ? { projectId, attachmentId: pageAttachment.id, pageIndex: currentPage, label: `Page ${currentPage + 1}`, shared: readOnlyShare } : null;
  const journeyNavigate = useNavigate(), journeyAuth = useAuth();
  useProjectReach(viewerRootRef,projectId,attachments,!journeyAuth.isInitializing && journeyAuth.viewerProfileId !== creator?.id && !isOwner);
  const publicUrl = new URL(window.location.pathname.replace(/^\/p\//, '/share/'), window.location.origin).href;
  useMobileScreenActions(contextActions(readOnlyShare ? 'shared' : 'project', { signedIn: engagement.canEngage, owner: isOwner }, { title: projectTitle, handlers: {
    reads: isOwner ? () => journeyNavigate(`/insights?project=${encodeURIComponent(projectId)}`) : undefined,
    startHere: isOwner && journeyAuth.viewerProfileId ? () => journeyNavigate(`/p/${journeyAuth.viewerProfileId}?startHere=${encodeURIComponent(projectId)}`) : undefined,
    thenNow: isOwner && journeyAuth.viewerProfileId ? () => journeyNavigate(`/p/${journeyAuth.viewerProfileId}?journeyPair=${encodeURIComponent(projectId)}`) : undefined,
    saveProject: !engagement.isResolving && !engagement.isPending('save') && !engagement.resolveError ? () => engagement.toggle('save') : undefined,
    share: () => shareContextLink(publicUrl, projectTitle), copy: () => copyPublicLink(publicUrl),
  }, labels: { saveProject: engagement.isEngaged('save') ? 'Unsave project' : 'Save project' } }), 20);
  const [previewPdf, setPreviewPdf] = useState<{ scope: string; document: PdfDocument | null } | null>(null);
  const handlePreviewDocument = useCallback((document: PdfDocument | null) => {
    setPreviewPdf({ scope: previewScope, document });
  }, [previewScope]);
  const pagePreviewSources = active?.kind === 'image' ? imagePages.map(page => page.sourceUrl)
    : (active?.metadata?.renderedPages ?? []).filter(page => Boolean(page.sourceUrl)).map(page => page.sourceUrl);
  const switchable = attachments.filter((item) => item.kind !== 'image' || item.id === imagePages[0]?.id);
  useEffect(() => {
    const activeSwitchableIndex = switchable.findIndex((item) => item.id === active?.id || (active?.kind === 'image' && item.kind === 'image'));
    const nearby = active?.kind === 'image'
      ? imagePages.slice(0, 4)
      : [switchable[activeSwitchableIndex - 1], switchable[activeSwitchableIndex + 1]].filter((item): item is ProjectAttachment => Boolean(item));
    preloadProjectMedia(nearby, 4);
  }, [active?.id, active?.kind, imagePages, switchable]);
  const artworkAttachment = attachments.find((item) => item.kind === 'image' && item.sourceUrl);
  const artwork = artworkAttachment?.sourceUrl ? {
    url: artworkAttachment.sourceUrl,
    alt: artworkAttachment.displayName
  } : undefined;
  const documentPageCount = active?.kind === 'document'
    ? Math.max(active.metadata?.renderedPages?.length ?? 0, active.metadata?.pageCount ?? 0)
    : 0;
  const hasPageLayout = active?.kind === 'image'
    ? imagePages.length > 1
    : active?.kind === 'document' && documentPageCount !== 1;
  const publishedLabel = formatPublishedDate(publishedAt);
  const densitySurfaceRef = useRef<HTMLDivElement>(null);
  const backSwipe = useProjectBackSwipe(densitySurfaceRef, {
    enabled: isMobileViewer && !isImmersive && !mobileNavigation?.isIndexOpen && !mobilePopup && active?.kind !== 'model3d' && !isDocumentReading,
    scope: `${projectId}:${active?.id ?? ''}`,
    onBack: mobileNavigation?.onBack,
  });
  const wheelDeltaRef = useRef(0);
  const lastDensityStepRef = useRef(0);
  const densityCommitTimerRef = useRef<number | null>(null);
  const densityCommitCallbackRef = useRef(onPagesPerRowCommit);
  const densityPinchRef = useRef<{ distance: number; origin: { x: number; y: number }; pages: number; next: number; motion: ContentPinchMotion | null } | null>(null);
  const densitySettleRef = useRef<ContentPinchMotion | null>(null);
  useLayoutEffect(() => {
    densitySettleRef.current?.settle();
    densitySettleRef.current = null;
  }, [normalizedPagesPerRow]);
  useEffect(() => {
    densityCommitCallbackRef.current = onPagesPerRowCommit;
  }, [onPagesPerRowCommit]);
  useEffect(() => () => {
    densityPinchRef.current?.motion?.cancel();
    densitySettleRef.current?.cancel();
    densitySettleRef.current = null;
    densityPinchRef.current = null;
    if (densityCommitTimerRef.current !== null) {
      window.clearTimeout(densityCommitTimerRef.current);
      densityCommitTimerRef.current = null;
    }
  }, [projectId, active?.id, isImmersive, isMobileViewer]);
  /**
   * The work surface itself is the density instrument for touch or trackpad
   * pinches. Browsers expose a trackpad pinch as a wheel event with `ctrlKey`;
   * an ordinary two-finger vertical swipe has no modifier and must remain native
   * page scrolling. Pinching inward reveals more, smaller pages; page renderers
   * claim an outward gesture to enter single-page zoom. The listener is non-passive so only the
   * recognized pinch can be contained inside the 1–9 density range instead of
   * also zooming the browser page.
   */
  useEffect(() => {
    const surface = densitySurfaceRef.current;
    if (!surface || !hasPageLayout || !onPagesPerRowChange || isImmersive || isVerticalReading) {
      return undefined;
    }
    const handleDensityWheel = (event: WheelEvent) => {
      if ((!event.ctrlKey && !event.metaKey) || event.deltaY === 0) {
        wheelDeltaRef.current = 0;
        return;
      }

      event.preventDefault();
      const direction = event.deltaY > 0 ? 1 : -1;
      const next = normalizePagesPerRow(normalizedPagesPerRow + direction);
      if (next === normalizedPagesPerRow) {
        wheelDeltaRef.current = 0;
        return;
      }

      const deltaScale = event.deltaMode === WheelEvent.DOM_DELTA_LINE ? 24 : event.deltaMode === WheelEvent.DOM_DELTA_PAGE ? 120 : 1;
      wheelDeltaRef.current += event.deltaY * deltaScale;
      const threshold = 24;
      const now = performance.now();
      if (Math.abs(wheelDeltaRef.current) < threshold || now - lastDensityStepRef.current < 120) {
        return;
      }
      lastDensityStepRef.current = now;
      wheelDeltaRef.current = 0;
      onPagesPerRowChange(next);
      if (densityCommitTimerRef.current !== null) {
        window.clearTimeout(densityCommitTimerRef.current);
      }
      densityCommitTimerRef.current = window.setTimeout(() => {
        densityCommitTimerRef.current = null;
        densityCommitCallbackRef.current?.(next);
      }, 450);
    };
    const handleTouchStart = (event: TouchEvent) => {
      densityPinchRef.current?.motion?.cancel();
      const distance = pinchDistance(event.touches);
      densityPinchRef.current = distance === null ? null : { distance, origin: touchMidpoint(event.touches), pages: normalizedPagesPerRow, next: normalizedPagesPerRow,
        motion: null };
    };
    const handleTouchMove = (event: TouchEvent) => {
      const pinch = densityPinchRef.current;
      const distance = pinchDistance(event.touches);
      if (!pinch || distance === null) return;
      if (event.cancelable) event.preventDefault();
      if (isMobileViewer) {
        pinch.motion ??= beginContentPinch(surface, pinch.origin);
        pinch.motion?.update(Math.min(pinch.pages, Math.max(pinch.pages / 9, distance / pinch.distance)), touchMidpoint(event.touches));
      }
      const next = normalizePagesPerRow(isMobileViewer ? pinch.pages * pinch.distance / distance : pinch.pages - pinchSteps(distance, pinch.distance));
      if (next === pinch.next) return;
      pinch.next = next;
      if (!isMobileViewer) onPagesPerRowChange(next);
    };
    const handleTouchEnd = () => {
      const pinch = densityPinchRef.current;
      densityPinchRef.current = null;
      if (!pinch) return;
      if (pinch.next === pinch.pages) { pinch.motion?.settle(false); return; }
      if (isMobileViewer) {
        densitySettleRef.current = pinch.motion;
        onPagesPerRowChange(pinch.next);
      }
      if (densityCommitTimerRef.current !== null) window.clearTimeout(densityCommitTimerRef.current);
      densityCommitTimerRef.current = null;
      densityCommitCallbackRef.current?.(pinch.next);
    };
    const handleTouchCancel = () => {
      const pinch = densityPinchRef.current;
      if (!isMobileViewer) { handleTouchEnd(); return; }
      densityPinchRef.current = null;
      pinch?.motion?.settle(false);
    };
    surface.addEventListener('wheel', handleDensityWheel, { passive: false });
    surface.addEventListener('touchstart', handleTouchStart, { passive: true });
    surface.addEventListener('touchmove', handleTouchMove, { passive: false });
    surface.addEventListener('touchend', handleTouchEnd, { passive: true });
    surface.addEventListener('touchcancel', handleTouchCancel, { passive: true });
    return () => {
      surface.removeEventListener('wheel', handleDensityWheel);
      surface.removeEventListener('touchstart', handleTouchStart);
      surface.removeEventListener('touchmove', handleTouchMove);
      surface.removeEventListener('touchend', handleTouchEnd);
      surface.removeEventListener('touchcancel', handleTouchCancel);
    };
  }, [hasPageLayout, normalizedPagesPerRow, onPagesPerRowChange, isImmersive, isMobileViewer, isVerticalReading]);
  const emptyMedia = <div data-premium-project-viewer="" data-document-reading-view={isDocumentReading || undefined} data-mobile-page-reader={isMobileViewer && (active?.kind === 'document' || active?.kind === 'image') ? '' : undefined} data-project-continuity-surface="" data-project-continuity-id={projectId} style={projectContinuityStyle(projectId)} className="flex h-full min-h-0 w-full items-center justify-center p-6">
        <div className="premium-project-empty flex max-w-sm flex-col items-center text-center">
          <span className="mb-4 flex h-12 w-12 items-center justify-center rounded-[14px] bg-[var(--surface-sunken)] text-[var(--text-secondary)]">
            <InterfaceIcon icon={FileIcon} size="lg" weight="medium" />
          </span>
          <h2 className="text-[15px] font-semibold text-[var(--text-primary)]">No media yet</h2>
          <p className="mt-1.5 text-[13px] leading-relaxed text-[var(--text-secondary)]">This project is ready for its first image, document, video, audio file, or model.</p>
        </div>
      </div>;
  if (!active && !mobileNavigation) return emptyMedia;
  /**
   * The work and the response to it, side by side.
   *
   * Previously both engagement and the thread were stacked UNDER the work, each
   * capped by height, which squeezed the work into the top half and left the
   * conversation reading through a 45%-tall slot. Given a wide viewer the natural
   * split is horizontal: the work takes the width it can use, and the rail beside
   * it is a single continuous column so engagement and comments share one scroll
   * instead of two competing ones. It stacks back under the work on narrow
   * screens, where there is no width to give away.
   *
   * The work column ALWAYS takes everything the rail does not, and the work inside
   * it is sized by that width — so closing the rail genuinely enlarges the work
   * rather than leaving its freed space as empty canvas, and opening it contracts
   * the work back. The rail owns the only fixed dimension in the row.
   */
  const sharedProjectMetadata = <>
            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-2 text-[12px] leading-snug">
              {pageCount !== null && <><dt className="text-[var(--text-tertiary)]">Pages</dt><dd className="text-right font-medium tabular-nums text-[var(--text-primary)]">{pageCount}</dd></>}
              {publishedLabel && <><dt className="text-[var(--text-tertiary)]">Published</dt><dd className="text-right font-medium text-[var(--text-primary)]">{publishedLabel}</dd></>}
            </dl>
            {credits.length > 0 && <div>
                <h3 className="text-[12px] font-semibold text-[var(--text-primary)]">Credits</h3>
                <dl className="mt-2 flex flex-col gap-2">
                  {credits.map((credit, index) => <div key={`${credit.label}-${credit.value}-${index}`} className="text-[12px] leading-snug">
                      <dt className="text-[var(--text-tertiary)]">{credit.label}</dt>
                      <dd className="mt-0.5 text-[var(--text-primary)]">{credit.value}</dd>
                    </div>)}
                </dl>
              </div>}
  </>;
  const sharedProjectInformation = <div id="shared-project-detail-panel" className="side-panel-content-inset flex flex-col gap-4 py-2">
            <div>
              <h3 data-font-preview="" style={{ fontFamily: contentTypefaceStack }} className="text-[17px] font-semibold leading-snug text-[var(--text-primary)]">{projectTitle}</h3>
            </div>
            <div>
              {!isMobileViewer && <h3 className="text-[12px] font-semibold text-[var(--text-primary)]">Description</h3>}
              {projectSummary ? <p data-font-preview="" style={{ fontFamily: contentTypefaceStack }} className="mt-2 whitespace-pre-wrap break-words text-[13px] leading-relaxed text-[var(--text-primary)]">{projectSummary}</p> : <p className="mt-2 text-[13px] leading-relaxed text-[var(--text-secondary)]">No project description has been added.</p>}
            </div>
            {sharedProjectMetadata}
          </div>;
  const sharedVerification = <section id="shared-project-detail-panel" data-ai-verification-visualization="" aria-label="AI verification services" className="side-panel-content-inset flex flex-col gap-4 py-2">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-[14px] font-semibold text-[var(--text-primary)]">AI verification</h3>
                  <p className="mt-1 text-[11px] leading-relaxed text-[var(--text-tertiary)]">Evidence signals and creator disclosures.</p>
                </div>
                <span className="shrink-0 rounded-full bg-[var(--surface-sunken)] px-2 py-1 text-[9px] font-semibold uppercase tracking-[0.08em] text-[var(--text-secondary)]">Sample</span>
              </div>

              <div>
                <div className="mb-2.5 flex items-end justify-between gap-3">
                  <div>
                    <p className="text-[10px] text-[var(--text-tertiary)]">Verification strength</p>
                    <p className="mt-0.5 text-[13px] font-semibold text-[var(--text-primary)]">High agreement</p>
                  </div>
                  <p className="text-right text-[10px] leading-snug text-[var(--text-tertiary)]">3 checks<br />completed</p>
                </div>
                <div role="img" aria-label={SAMPLE_VERIFICATION_SIGNALS.map((signal) => `${signal.label} ${signal.value} percent`).join(', ')} className="flex h-5 w-full gap-[2px] overflow-hidden rounded-[7px] bg-[var(--surface-sunken)]">
                  {SAMPLE_VERIFICATION_SIGNALS.map((signal) => <span key={signal.key} aria-hidden="true" style={{ width: `${signal.value}%`, backgroundColor: signal.color }} />)}
                </div>
                <dl aria-label="Verification signal legend" className="mt-3 grid gap-2">
                  {SAMPLE_VERIFICATION_SIGNALS.map((signal) => <div key={signal.key} className="grid grid-cols-[8px_minmax(0,1fr)_auto] items-center gap-2 text-[10px] leading-none">
                      <span aria-hidden="true" style={{ backgroundColor: signal.color }} className="h-2 w-2 rounded-full" />
                      <dt className="min-w-0 text-[var(--text-secondary)]">{signal.label}</dt>
                      <dd className="font-semibold tabular-nums text-[var(--text-primary)]">{signal.value}%</dd>
                    </div>)}
                </dl>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-[10px] bg-[var(--surface-sunken)] px-3 py-2.5">
                  <p className="text-[9px] uppercase tracking-[0.08em] text-[var(--text-tertiary)]">Coverage</p>
                  <p className="mt-1 text-[11px] font-semibold text-[var(--text-primary)]">{pageCount !== null ? `${pageCount} of ${pageCount} pages` : `${attachments.length} files`}</p>
                </div>
                <div className="rounded-[10px] bg-[var(--surface-sunken)] px-3 py-2.5">
                  <p className="text-[9px] uppercase tracking-[0.08em] text-[var(--text-tertiary)]">Agreement</p>
                  <p className="mt-1 text-[11px] font-semibold text-[var(--text-primary)]">3 of 3 checks</p>
                </div>
              </div>

              <div>
                <h4 className="text-[11px] font-semibold text-[var(--text-primary)]">Checker evidence</h4>
                <div className="mt-2 divide-y divide-[var(--hairline)] border-y border-[var(--hairline)]">
                  {SAMPLE_CHECKER_EVIDENCE.map((checker) => <div key={checker.provider} className="flex items-center gap-2.5 py-2.5">
                      <span aria-hidden="true" className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[8px] bg-[var(--surface-sunken)] text-[var(--text-secondary)]">
                        <InterfaceIcon icon={BadgeCheckIcon} size="sm" weight="medium" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[10px] font-semibold text-[var(--text-primary)]">{checker.provider}</span>
                        <span className="mt-0.5 block text-[9px] text-[var(--text-tertiary)]">{checker.result}</span>
                      </span>
                    </div>)}
                </div>
              </div>

              <div>
                <h4 className="text-[11px] font-semibold text-[var(--text-primary)]">Creator-declared AI tools</h4>
                <div className="mt-2 rounded-[10px] bg-[var(--surface-sunken)] px-3 py-2.5">
                  <p className="text-[10px] font-medium text-[var(--text-secondary)]">No tools declared</p>
                  <p className="mt-1 text-[9px] leading-relaxed text-[var(--text-tertiary)]">Tool names appear here only when supplied by the creator. Checkers do not guess the product used.</p>
                </div>
              </div>

              <p className="text-[9px] leading-relaxed text-[var(--text-tertiary)]">Supporting signals are not proof of authorship. No live verification has been completed for this sample report.</p>
            </section>;
  const activeMedia = active ? <AttachmentRenderer verticalReading={isVerticalReading} projectId={projectId} attachment={active} imagePages={imagePages} imageColumns={isVerticalReading ? mobilePagesPerRow : hasPageLayout ? normalizedPagesPerRow : 1} projectTitle={projectTitle} artwork={artwork} processing={{
          state: processing.resolveState(active),
          message: processing.resolveMessage(active),
          canRetry: processing.canRetry(active),
          isRetrying: processing.retrying.includes(active.id),
          onRetry: () => void processing.retry(active.id)
        }} onDocumentPageCountResolved={onDocumentPageCountResolved} onPreviewDocument={isMobileViewer ? handlePreviewDocument : undefined} onFocusModeChange={handlePageFocusModeChange} controlsVisible={areControlsVisible} showMediaInteractions isOwner={isOwner && !readOnlyShare} memoryScope={viewerMemoryScope} pageViewToggleRequest={pageViewToggleRequest} onClose={onClose} /> : emptyMedia;
  return <MobilePageContext.Provider value={pageTarget}><div ref={viewerRootRef} data-premium-project-viewer="" data-document-reading-view={isDocumentReading || undefined} data-mobile-page-reader={isMobileViewer && (active?.kind === 'document' || active?.kind === 'image') ? '' : undefined} data-mobile-combined-rail={mobileNavigation ? '' : undefined} data-read-only-share={readOnlyShare ? 'true' : 'false'} data-immersive={isImmersive ? 'true' : 'false'} data-controls-visible={areControlsVisible ? 'true' : 'false'} onPointerMove={revealControls} onPointerDown={revealControls} onFocusCapture={holdControls} onBlurCapture={revealControls} onPointerLeave={() => {
    if (isImmersive && !isMobileViewer) setAreControlsVisible(false);
  }} className="flex h-full min-h-0 w-full flex-row">
      {isMobileViewer && !mobileNavigation?.isIndexOpen && <MobileProjectPageCounter density={!readOnlyShare && hasPageLayout && onPagesPerRowChange ? { value: mobilePagesPerRow, saving: savingPageLayout, onChange: changeMobileDensity, onCommit: value => onPagesPerRowCommit?.(normalizePagesPerRow(value)) } : undefined} readingMode={isDocumentReading && !isImmersive} showProgress={isReadingHeader && !isImmersive} segmentedProgress={!readOnlyShare} onSelectPage={isDocumentReading ? page => { jumpToProjectPage(densitySurfaceRef.current, page); } : undefined} onPositionChange={setContextPosition} showControl={!isImmersive} key={previewScope} surfaceRef={densitySurfaceRef} scope={previewScope} previewSources={pagePreviewSources} pdfDocument={previewPdf?.scope === previewScope ? previewPdf.document : null} />}

      {isMobileViewer && !isImmersive && active?.kind === 'document' && pageTarget && <MediaInteractionBar key={`${previewScope}:${currentPage}`} target={pageTarget} contextOnly isOwner={isOwner && !readOnlyShare} pageCount={contextPosition?.total ?? pageCount ?? undefined} />}
      <div data-project-work-column="" style={{ display: singlePanel === 'response' ? 'none' : undefined }} className="relative flex min-h-0 min-w-0 flex-1 flex-col">
        <div ref={densitySurfaceRef} {...backSwipe} data-project-stage="" data-page-density-surface="" data-project-continuity-surface="" data-project-continuity-id={projectId} style={projectContinuityStyle(projectId)} className="min-h-0 flex-1">
          {isMobileViewer && active?.kind === 'video' && videoSequence && videoSequence.entries.length > 1 ? <MobileVideoSequence key={videoSequence.scope}
            videos={videoSequence.entries} creator={creator} activeId={`${projectId}:${active.id}`} onSelect={entry => {
              updateViewerMemory(`${viewerMemoryScope}:project:${entry.projectId}`, { activeAttachmentId: entry.attachment.id });
              if (entry.projectId === projectId) setActiveId(entry.attachment.id);
              else videoSequence.onSelectProject(entry.projectId);
            }} renderVideo={(entry, playing) => <AttachmentRenderer key={`${entry.projectId}:${entry.attachment.id}`} projectId={entry.projectId} projectTitle={entry.projectTitle}
              attachment={entry.attachment} videoActive={playing} showMediaInteractions isOwner={isOwner && !readOnlyShare && entry.projectId === projectId}
              processing={entry.projectId === projectId ? {
                state: processing.resolveState(entry.attachment), message: processing.resolveMessage(entry.attachment), canRetry: processing.canRetry(entry.attachment),
                isRetrying: processing.retrying.includes(entry.attachment.id), onRetry: () => void processing.retry(entry.attachment.id),
              } : undefined} onClose={onClose} />} /> : isMobileViewer && active?.kind === 'video' ? <div className="mobile-video-single"><MobileVideoFrame creator={creator} sourceTitle={projectTitle}>{activeMedia}</MobileVideoFrame></div> : activeMedia}
        </div>

        {/* The status query itself failed — distinct from a job failing, so it says
           so and offers the query again rather than a retry of the work. It stays
           with the work, because that is what it is about. */}
        {processing.error && <div role="alert" className="flex shrink-0 items-center gap-2.5 border-t border-[var(--hairline)] px-4 py-2 text-[13px] text-[var(--text-secondary)]">
            <span className="min-w-0 flex-1">{processing.error}</span>
            <button type="button" onClick={processing.refresh} className="shrink-0 font-semibold text-[var(--accent-text)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]">Check again</button>
          </div>}

        {/* Only shown when there is genuinely more than one file to move between. */}
        {/* Images collapse to a single entry, because they are now read as pages
           of one piece — listing each of them here would offer a way to step
           through something that is already continuous. */}
        {switchable.length > 1 && <nav data-project-file-strip="" data-material="toolbar" aria-label={`${projectTitle} files`} className="side-panel-control-row side-panel-content-inset shrink-0 overflow-x-auto border-t border-[var(--hairline)] py-2">
          {switchable.map((attachment) => {
          const Icon = KIND_ICONS[attachment.kind];
          // Any image being shown means the whole image sequence is being shown,
          // so its single entry is the current one.
          const isActive = attachment.id === active?.id || attachment.kind === 'image' && active?.kind === 'image';
          return <button key={attachment.id} type="button" onClick={() => {
            setActiveId(attachment.id);
            updateViewerMemory(viewerMemoryKey, { activeAttachmentId: attachment.id });
          }} aria-current={isActive ? 'true' : undefined} aria-label={`${attachment.displayName}, ${attachment.typeLabel}`} className={`side-panel-primary-control side-panel-control-row max-w-[220px] px-2.5 text-[13px] transition-colors duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] ${isActive ? 'bg-[var(--surface-sunken)] font-semibold text-[var(--text-primary)]' : 'text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)]'}`}>
                <InterfaceIcon icon={Icon} size="sm" weight="medium" />
                <span className="min-w-0 truncate">{attachment.displayName}</span>
              </button>;
        })}
        </nav>}
      </div>



      {/* The rail: engagement above the conversation, in one scroll.
         Engagement reads the same canonical record the feed card does, so a like
         made here is already true there — no refetch, no second state. */}
      {/* The rail is the fixed side of the split, so the work absorbs the whole
         difference between its two states. The width animates so the work is seen
         to grow into the space rather than jumping into it. */}
      {/* The rail shares the work's canvas rather than sitting on a raised panel:
         it is part of the same page, and a second background only added a seam
         down the middle of one composition. The hairline carries the separation. */}
      {mobileNavigation?.isIndexOpen ? !isImmersive && <MobileProjectIndexPortal anchorRef={viewerRootRef}>
        <button type="button" aria-label="Close project list" className="mobile-project-index-dismiss" onClick={mobileNavigation.onCloseIndex} />
        {mobileNavigation.index}
      </MobileProjectIndexPortal> : isMobileViewer ? <aside ref={mobileEngagementRef} data-project-response-rail="" data-rail-expanded="false" data-mobile-engagement-open={mobileEngagementOpen ? 'true' : 'false'} aria-label={`Project controls for ${projectTitle}`} className="ps-panel flex flex-col overflow-y-auto" onKeyDown={event => {
        if (event.key === 'Escape' && mobileEngagementOpen && !mobilePopup) { event.preventDefault(); event.stopPropagation(); closeMobileEngagement(); }
      }}>
        <div id="mobile-project-engagement-actions" data-mobile-engagement-content="" hidden={!mobileEngagementOpen}>
        <div ref={popupAnchorRef} data-mobile-project-popup-controls="" className="side-panel-navigation-list items-center">
          <button ref={descriptionTriggerRef} type="button" aria-label="Show project description" aria-haspopup="dialog" aria-expanded={mobilePopup === 'description'} aria-controls="mobile-project-popup" onClick={() => setMobilePopup('description')} className="mobile-project-popup-trigger text-[var(--text-primary)]">
            <span data-shared-info-glyph="" aria-hidden="true" style={{ fontFamily: "'IBM Plex Mono', ui-monospace, SFMono-Regular, Menlo, monospace" }} className="flex h-[22px] w-[22px] items-center justify-center rounded-full border-[1.5px] border-current text-[15px] font-semibold leading-none">i</span>
          </button>
          <button ref={commentsTriggerRef} type="button" aria-label="Show comments" aria-haspopup="dialog" aria-expanded={mobilePopup === 'comments'} aria-controls="mobile-project-popup" onClick={() => setMobilePopup('comments')} className="mobile-project-popup-trigger">
            <InterfaceIcon icon={MessageCircleIcon} size="lg" weight="regular" keepColor stroke="var(--project-control-foreground, currentColor)" />
          </button>
          {readOnlyShare && <button ref={verificationTriggerRef} type="button" aria-label="Show AI verification services" aria-haspopup="dialog" aria-expanded={mobilePopup === 'verification'} aria-controls="mobile-project-popup" onClick={() => setMobilePopup('verification')} className="mobile-project-popup-trigger text-[var(--text-secondary)]">
            <InterfaceIcon icon={BookUserIcon} size="lg" weight="medium" />
          </button>}
        </div>
        <div data-project-rail-actions="" className="flex justify-center">
          <EngagementBar engagement={engagement} projectTitle={projectTitle} size="compact" variant="viewer" isShared={isProjectShared} onShare={() => void shareProject()} />
        </div>
        {(engagement.resolveError || engagement.failure) && <div className="side-panel-navigation-list items-center">
          <button ref={feedbackTriggerRef} type="button" aria-label="Review engagement error" aria-haspopup="dialog" aria-expanded={mobilePopup === 'engagement'} onClick={() => setMobilePopup('engagement')} className="mobile-project-popup-trigger text-[var(--text-primary)]">
            <InterfaceIcon icon={AlertCircleIcon} size="lg" weight="medium" />
          </button>
        </div>}
        </div>
        <nav className="mobile-content-action-bar" aria-label="Content controls">
          <button ref={mobileNavigation?.indexOpener} type="button" aria-label="Open portal" onClick={mobileNavigation?.onOpenIndex}><InterfaceIcon icon={ListIcon} size="lg" /></button>
          <MobileContextButton />
          <button ref={mobileEngagementToggleRef} type="button" className="mobile-project-engagement-toggle" aria-label={mobileEngagementOpen ? 'Hide project engagement' : 'Show project engagement'} aria-expanded={mobileEngagementOpen} aria-controls="mobile-project-engagement-actions" onClick={() => setMobileEngagementOpen(open => !open)}>
          <InterfaceIcon icon={mobileEngagementOpen ? XIcon : EllipsisIcon} size="lg" weight="regular" />
        </button>
          <button type="button" aria-label={`View ${creator?.name ?? 'creator'} profile`} disabled={!creator?.id} onClick={() => { if (creator?.id) journeyNavigate(buildPath(readOnlyShare ? 'sharedProfile' : 'profile', { profileId: creator.id })); }}><InterfaceIcon icon={UserRoundIcon} size="lg" /></button>
        </nav>
      </aside> : readOnlyShare ? <aside data-resizable-panel="" data-project-response-rail="" data-rail-expanded={isRailOpen} style={{ width: `${responseRailWidth.width}px` }} aria-label={`Project details and verification for ${projectTitle}`} className={`ps-panel relative flex shrink-0 flex-col overflow-y-auto border-t border-[var(--hairline)] bg-transparent transition-[width,opacity] duration-200 ease-out motion-reduce:transition-none flex-none border-l border-t-0`}>
          <div data-shared-navigation-header="" className={`ps-panel-toolbar global-control-header relative shrink-0 ${isRailOpen ? 'side-panel-control-row side-panel-content-inset' : 'justify-center px-1.5'}`}>
            <button type="button" data-structural-toggle="" onClick={() => onRailOpenChange(!isRailOpen)} aria-expanded={isRailOpen} aria-label={isRailOpen ? 'Hide project details' : 'Show project details'} className={`${isRailOpen ? 'side-panel-header-control side-panel-header-icon' : 'sidebar-rail-slot shape-compact'} flex shrink-0 items-center justify-center rounded-[8px] text-[var(--text-secondary)] transition-colors duration-150 hover:bg-[var(--control-hover-surface)] hover:text-[var(--control-hover-text)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]`}>
              {isRailOpen ? <InterfaceIcon icon={PanelRightCloseIcon} size="lg" weight="medium" mirroredInRtl /> : <InterfaceIcon icon={PanelRightOpenIcon} size="lg" weight="medium" mirroredInRtl />}
            </button>
            {isRailOpen && <button type="button" onClick={() => setSharedInfoPanel('project')} aria-label="Show project information" aria-pressed={sharedInfoPanel === 'project'} aria-controls="shared-project-detail-panel" className={`side-panel-header-control side-panel-header-icon flex shrink-0 items-center justify-center rounded-[8px] transition-colors duration-150 hover:bg-[var(--control-hover-surface)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] ${sharedInfoPanel === 'project' ? 'text-[var(--text-primary)]' : 'text-[var(--text-tertiary)] hover:text-[var(--text-primary)]'}`}>
                <span data-shared-info-glyph="" aria-hidden="true" style={{ fontFamily: "'IBM Plex Mono', ui-monospace, SFMono-Regular, Menlo, monospace" }} className="flex h-[18px] w-[18px] items-center justify-center rounded-full border border-current text-[12px] font-semibold leading-none">i</span>
              </button>}
            {isRailOpen && <button type="button" onClick={() => setSharedInfoPanel('verification')} aria-label="Show AI verification services" aria-pressed={sharedInfoPanel === 'verification'} aria-controls="shared-project-detail-panel" className={`side-panel-header-control side-panel-header-icon flex shrink-0 items-center justify-center rounded-[8px] transition-colors duration-150 hover:bg-[var(--control-hover-surface)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] ${sharedInfoPanel === 'verification' ? 'text-[var(--text-primary)]' : 'text-[var(--text-tertiary)] hover:text-[var(--text-primary)]'}`}>
                <InterfaceIcon icon={BookUserIcon} size="lg" weight="medium" />
              </button>}
          </div>
          <div data-project-rail-actions="" className="flex justify-center p-2">
            <EngagementBar engagement={engagement} projectTitle={projectTitle} size="compact" variant={isRailOpen ? 'inline' : 'rail'} isShared={isProjectShared} onShare={() => void shareProject()} />
          </div>
          {isRailOpen && <button type="button" onClick={() => setSharedInfoPanel(sharedInfoPanel === 'comments' ? 'project' : 'comments')} aria-pressed={sharedInfoPanel === 'comments'} aria-controls="shared-project-detail-panel" className="side-panel-content-inset min-h-11 text-left text-[13px] font-semibold text-[var(--text-primary)]">
            {sharedInfoPanel === 'comments' ? 'Show project information' : 'Show comments'}
          </button>}
          {isRailOpen && sharedInfoPanel === 'comments' && <div id="shared-project-detail-panel" className="side-panel-content-inset py-2"><CommentThreadView comments={comments} projectTitle={projectTitle} isOwner={false} /></div>}
          {isRailOpen && sharedInfoPanel === 'project' && sharedProjectInformation}
          {isRailOpen && sharedInfoPanel === 'verification' && sharedVerification}
        </aside> : <aside data-resizable-panel="" data-project-response-rail="" data-rail-expanded={isRailOpen} style={{ width: `${responseRailWidth.width}px` }} aria-label={`Response to ${projectTitle}`} className={`ps-panel relative flex shrink-0 flex-col overflow-y-auto border-t border-[var(--hairline)] bg-transparent transition-[width,opacity] duration-200 ease-out motion-reduce:transition-none flex-none border-l border-t-0`}>
        {/* The control travels with the rail rather than sitting on the work, so
           the thing that moves is the thing you press. */}
        {/* One row: the engagement controls and the control that hides them. The
           inline chip form is used here rather than the stacked panel, because a
           row shared with a 40px button has height for one line, not two. */}
        {/* Reading order: the control for the rail itself, then what the rail is
           showing, then the actions on the work. Broadest scope first. */}
        <div className={`ps-panel-toolbar global-control-header shrink-0 ${isRailOpen ? 'engagement-panel-toolbar px-2' : 'justify-center px-1.5'}`}>
          <button type="button" data-structural-toggle="" onClick={() => onRailOpenChange(!isRailOpen)} aria-expanded={isRailOpen} aria-label={isRailOpen ? 'Hide engagement and comments' : 'Show engagement and comments'} className={`${isRailOpen ? 'side-panel-header-control side-panel-header-icon' : 'sidebar-rail-slot shape-compact'} flex shrink-0 items-center justify-center rounded-[8px] text-[var(--text-secondary)] transition-colors duration-150 hover:bg-[var(--control-hover-surface)] hover:text-[var(--control-hover-text)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]`}>
            {isRailOpen ? <InterfaceIcon icon={PanelRightCloseIcon} size="lg" weight="medium" mirroredInRtl /> : <InterfaceIcon icon={PanelRightOpenIcon} size="lg" weight="medium" mirroredInRtl />}
          </button>
          {/* The semantic colour and spoken label identify the destination of the
             next press without adding a hover tooltip over the compact control. */}
          {isRailOpen && <button type="button" onClick={() => setRailPanel((panel) => panel === 'comments' ? 'description' : 'comments')} aria-label={railPanel === 'comments' ? 'Show project description' : 'Show comments'} data-keep-color="" style={{ color: railPanel === 'comments' ? 'var(--international-orange)' : 'var(--apple-purple)' }} className="side-panel-header-control side-panel-header-icon flex shrink-0 items-center justify-center rounded-[8px] transition-colors duration-150 hover:bg-[var(--control-hover-surface)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]">
              <InterfaceIcon icon={railPanel === 'comments' ? FileTextIcon : MessageCircleIcon} size="lg" weight="medium" keepColor stroke={railPanel === 'comments' ? 'var(--international-orange)' : 'var(--apple-purple)'} />
            </button>}
          {/* Offered only where it has something to do: the owner of the portal,
             looking at a piece that genuinely holds more than one page. The
             slider and its count carry the control on their own, with its name
             in the accessible label and a tooltip — the same form the profile
             grid's density control takes. */}
          {/* Acting on the work belongs where the work is being looked at, so these
             live here and NOT on the discovery or explore grids — a tile there is a
             way in to the project, not a place to respond to it. */}
          {isRailOpen && <div className="engagement-toolbar-actions min-w-0">
              <EngagementBar engagement={engagement} projectTitle={projectTitle} size="compact" isShared={isProjectShared} onShare={() => void shareProject()} />
            </div>}
        </div>

        {!isRailOpen && <div data-project-rail-actions="" className="flex flex-1 justify-center py-2">
            <EngagementBar engagement={engagement} projectTitle={projectTitle} size="compact" variant="rail" isShared={isProjectShared} onShare={() => void shareProject()} />
          </div>}

        {/* Closed, the rail carries nothing but its own control: the engagement
           controls remain available as a vertical icon rail, while the thread
           and prose are removed rather than squeezed into unreadable fragments. */}
        {isRailOpen && <div className="side-panel-content-inset py-2">
            {/* The conversation sits beside the work it is about, on the canonical
             project detail rather than on a page of its own. */}
            {railPanel === 'comments' ? <CommentThreadView comments={comments} projectTitle={projectTitle} isOwner={isOwner} /> : <section className="flex flex-col gap-2.5">
                <h3 className="text-left text-[13px] font-semibold text-[var(--text-primary)]">Description</h3>
                {/* Only what the creator wrote, in the face the work is set in. A
               project with no description says so rather than being padded with
               fields to fill the space. */}
                {projectSummary ? <p data-font-preview="" style={{
            fontFamily: contentTypefaceStack
          }} className="whitespace-pre-wrap break-words text-[13px] leading-relaxed text-[var(--text-primary)]">{projectSummary}</p> : <p className="text-[13px] leading-relaxed text-[var(--text-secondary)]">This project has no description.</p>}
              </section>}
          </div>}
        {isRailOpen && !singlePanel && !mobileNavigation && <ResizablePanelHandle side="left" value={responseRailWidth.width} min={readOnlyShare ? 240 : 304} max={440} onResize={responseRailWidth.updateWidth} onResizeEnd={responseRailWidth.commitWidth} onReset={responseRailWidth.resetWidth} label="Resize engagement sidebar. Double-click to restore the default width." />}
      </aside>}
      {isMobileViewer && mobilePopup === 'description' && !mobileNavigation?.isIndexOpen && !isImmersive && <MobileProjectDescriptionSheet key={projectId} projectId={projectId} description={projectSummary} typeface={contentTypefaceStack} details={readOnlyShare ? <><h3 className="font-semibold">{projectTitle}</h3>{sharedProjectMetadata}</> : undefined} editor={isOwner && !readOnlyShare ? descriptionEditor : undefined} onClose={closeMobilePopup} />}
      {isMobileViewer && mobilePopup && mobilePopup !== 'description' && !mobileNavigation?.isIndexOpen && !isImmersive && <MediaCommentsPopover id="mobile-project-popup" label={mobilePopup === 'comments' ? 'Project comments' : mobilePopup === 'engagement' ? 'Engagement update' : 'AI verification'} anchorRef={popupAnchorRef} triggerRef={mobilePopup === 'comments' ? commentsTriggerRef : mobilePopup === 'engagement' ? feedbackTriggerRef : verificationTriggerRef} onClose={closeMobilePopup}>
        <header data-comments-header="" className="flex items-center justify-between gap-3">
          <h3 className="font-semibold text-[var(--text-primary)]">{mobilePopup === 'comments' ? 'Comments' : mobilePopup === 'engagement' ? 'Engagement update' : 'AI verification'}</h3>
          <button type="button" data-comments-close="" aria-label="Close project popup" onClick={closeMobilePopup}><InterfaceIcon icon={XIcon} size="md" weight="medium" /></button>
        </header>
        <div data-mobile-project-popup-content="" className="min-h-0 overflow-y-auto overscroll-contain">
          {mobilePopup === 'engagement' ? <EngagementFeedback engagement={engagement} /> : mobilePopup === 'comments' ? <div data-mobile-project-comment-thread=""><CommentThreadView comments={comments} projectTitle={projectTitle} isOwner={isOwner && !readOnlyShare} /></div>
            : mobilePopup === 'verification' ? sharedVerification
            : readOnlyShare ? sharedProjectInformation
            : <p data-font-preview="" style={{ fontFamily: contentTypefaceStack }} className="whitespace-pre-wrap break-words text-[16px] leading-relaxed text-[var(--text-primary)]">{projectSummary || 'This project has no description.'}</p>}
        </div>
      </MediaCommentsPopover>}
    </div></MobilePageContext.Provider>;
}
