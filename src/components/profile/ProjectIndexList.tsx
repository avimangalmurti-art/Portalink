import { motionSeconds } from '../../presentation/motion/motion';
import { MobileProjectPopup } from '../media/MobileProjectPopup';
import { useMenuFocus } from '../../hooks/useMenuFocus';
import React, { lazy, Suspense, useCallback, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { positionAnchoredMenu } from '../../utils/anchoredMenu';
import { AnimatePresence, motion, Reorder, useDragControls } from 'framer-motion';
import { EyeIcon, EyeOffIcon, FolderIcon, GripVerticalIcon, MoreHorizontalIcon, PencilIcon, PinIcon, PinOffIcon, Trash2Icon } from 'lucide-react';
// Canonical domain model, not the seed module's parallel copy.
import type { Project as ProjectEntry } from '../../types/domain';
import { InterfaceIcon } from '../ui/InterfaceIcon';
import { TypographyInspector } from './TypographyInspector';
import { usePresentation } from '../../presentation/usePresentation';
import type { MobileReorderList as MobileReorderListType, MobileReorderActivator, MobileReorderActions } from '../../presentation/mobile/MobileReorderList';
import { ProjectCover } from '../media/ProjectCover';
import { getProjectCoverPreview } from '../../utils/projectPresentation';
import { videoSources } from '../../features/media/videoPlayback';
import { useInlineProjectContent } from '../../features/profile/useInlineProjectContent';
const ProjectExportSheet=lazy(()=>import('../../features/references/ExportSheet').then(module=>({default:module.ExportSheet})));
const MobileReorderList = lazy(() => import('../../presentation/mobile/MobileReorderList').then(module => ({ default: module.MobileReorderList }))) as unknown as typeof MobileReorderListType;
type ProjectIndexListProps = {
  profileId?: string;
  arrangementWriteDisabled?: boolean;
  projects: ProjectEntry[];
  /** Featured projects use the arrangement of their original Portal. */
  primaryPortalId?: string;
  /** Each row reads in the face of the project it points at, keyed by id. */
  typefaceStacks: Record<string, string>;
  typefaceIds: Record<string, string>;
  hiddenIds: string[];
  /** Work fixed to the top of the index. Published, so visitors see it too. */
  pinnedIds: string[];
  activeProjectId: string | null;
  /** Arranging and hiding work belongs to whoever owns the portfolio. */
  isOwner: boolean;
  /** Shared navigation uses existing bitmaps without opening original media. */
  sharedReadOnly?: boolean;
  /** MOBILE waits for a complete, writable arrangement before starting a hold. */
  mobileReorderDisabled?: boolean;
  /** The floating MOBILE navigation list keeps reordering in its row menu. */
  mobileReorderFromMenu?: boolean;
  /** MOBILE changes only the presentation of this same navigation list. */
  mobileLayout?: 'list' | 'grid';
  /** Explicit WEB chooser adaptation; ordinary desktop indexes stay unchanged. */
  readOnlyBrowsing?: boolean;
  onReorder: (projects: ProjectEntry[]) => void;
  onToggleHidden: (projectId: string) => void;
  onTogglePinned: (projectId: string) => void;
  onSelect: (projectId: string) => void;
  /** Owner-only: opens the real editor for this project's published record. */
  onEdit?: (projectId: string) => void;
  onChangeCover?: (projectId: string) => void;
  /** Owner-only: changes the selected project's published typeface. */
  onTypefaceChange?: (projectId: string, typefaceId: string) => void;
  /** Owner-only: asks for the destructive confirmation. Never deletes directly. */
  onDelete?: (projectId: string) => void;
};

/** A quiet group label. Sections are what carry meaning here, not the rows. */
function SectionHeading({
  label,
  icon: Icon



}: {label: string;icon: typeof PinIcon;}) {
  /*
   * Every group is marked the same way — icon, then a heavier grey label — and
   * sits further left than the rows beneath it, so the projects inside a group
   * read as indented under their heading rather than sharing its margin. The
   * icon is required rather than optional: one heading without a mark would look
   * like a different kind of thing.
   */
  return <h3 className="ps-heading flex items-center gap-1.5 pb-1 pl-0.5 pr-2.5 pt-3.5 text-[12px] font-extrabold tracking-[0.01em] text-[var(--text-tertiary)]">
      <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      {label}
    </h3>;
}
export function ProjectIndexList({
  profileId,
  arrangementWriteDisabled = false,
  projects,
  primaryPortalId,
  typefaceStacks,
  typefaceIds,
  hiddenIds,
  pinnedIds,
  activeProjectId,
  isOwner,
  sharedReadOnly = false,
  mobileReorderDisabled = false,
  mobileReorderFromMenu = false,
  mobileLayout = 'list',
  readOnlyBrowsing = false,
  onReorder,
  onToggleHidden,
  onTogglePinned,
  onSelect,
  onEdit,
  onChangeCover,
  onTypefaceChange,
  onDelete,
}: ProjectIndexListProps) {
  const isMobile = usePresentation() === 'mobile';
  const mobileGrid = isMobile && mobileLayout === 'grid';
  /*
   * Three groups, in reading order: pinned work first, then the rest of the
   * category, then — for the owner alone — work they have hidden. Pinning is a
   * position and hiding is a privacy state, so they are separate groups rather
   * than one ranked list, and a heading states which is which instead of leaving
   * the viewer to infer it from position.
   */
  const [desktopDraft, setDesktopDraft] = useState<{ scope: string; ids: string[] } | null>(null);
  const desktopDraftRef = useRef<typeof desktopDraft>(null);
  const dragScope = JSON.stringify([projects.map(project => project.id), pinnedIds, hiddenIds]);
  const byId = new Map(projects.map(project => [project.id, project]));
  const displayedProjects = !isMobile && desktopDraft?.scope === dragScope
    ? desktopDraft.ids.flatMap(id => byId.get(id) ?? []) : projects;
  const pinned = displayedProjects.filter((project) => pinnedIds.includes(project.id) && !hiddenIds.includes(project.id));
  const hidden = displayedProjects.filter((project) => hiddenIds.includes(project.id));
  const rest = displayedProjects.filter((project) => !pinnedIds.includes(project.id) && !hiddenIds.includes(project.id));
  const isPrimary = (project: ProjectEntry) => !primaryPortalId || project.categoryId === primaryPortalId;

  // Keep drag frames local; persist exactly the final dropped order.
  const startDesktopDrag = () => {
    if (mobileReorderDisabled) return;
    const next = { scope: dragScope, ids: projects.map(project => project.id) };
    desktopDraftRef.current = next;
    setDesktopDraft(next);
  };
  const stageDesktopDrag = (reordered: ProjectEntry[]) => {
    if (desktopDraftRef.current?.scope !== dragScope) return;
    const next = { scope: dragScope, ids: [...pinned, ...reordered, ...rest.filter(project => !isPrimary(project)), ...hidden].map(project => project.id) };
    desktopDraftRef.current = next;
    setDesktopDraft(next);
  };
  const finishDesktopDrag = () => {
    const draft = desktopDraftRef.current;
    desktopDraftRef.current = null;
    setDesktopDraft(null);
    if (!draft || draft.scope !== dragScope || mobileReorderDisabled ||
      JSON.stringify(draft.ids) === JSON.stringify(projects.map(project => project.id))) return;
    onReorder(draft.ids.flatMap(id => byId.get(id) ?? []).filter(isPrimary));
  };

  // A visitor reads a published index, so it is a plain list with no handles.
  if (!isOwner) {
    return <div data-mobile-project-layout={isMobile ? mobileLayout : undefined} data-web-project-layout={!isMobile && readOnlyBrowsing ? mobileLayout : undefined}>
        {pinned.length > 0 && <>
            <SectionHeading label="Pinned" icon={PinIcon} />
            <ul className="side-panel-navigation-list m-0 list-none p-0 inset-row-group inset-row-group-icons">
              {pinned.map((project) => <li key={project.id}>
                  <ProjectLink profileId={profileId} project={project} typefaceStack={typefaceStacks[project.id]} isActive={project.id === activeProjectId} sharedReadOnly={sharedReadOnly} previewLabel={!isMobile && readOnlyBrowsing} mobileGrid={mobileGrid} onSelect={() => onSelect(project.id)} />
                </li>)}
            </ul>
          </>}
        {rest.length > 0 && <>
            {pinned.length > 0 && <SectionHeading label="Projects" icon={FolderIcon} />}
            <ul className="side-panel-navigation-list m-0 list-none p-0 inset-row-group inset-row-group-icons">
              {rest.map((project) => <li key={project.id}>
                  <ProjectLink profileId={profileId} project={project} typefaceStack={typefaceStacks[project.id]} isActive={project.id === activeProjectId} sharedReadOnly={sharedReadOnly} previewLabel={!isMobile && readOnlyBrowsing} mobileGrid={mobileGrid} onSelect={() => onSelect(project.id)} />
                </li>)}
            </ul>
          </>}
      </div>;
  }

  /*
   * Only the unpinned group is draggable — dragging inside a pinned group would
   * be arranging something whose position is the point of pinning it. A drag
   * still emits the WHOLE order, with the pinned and hidden ids kept in place
   * around it, so reordering one group can never drop the others from the saved
   * arrangement.
   */
  const rowProps = (project: ProjectEntry) => ({
    profileId,
    mobileGrid,
    contextDisabled: arrangementWriteDisabled,
    project,
    typefaceStack: typefaceStacks[project.id],
    typefaceId: typefaceIds[project.id],
    isHidden: hiddenIds.includes(project.id),
    isPinned: pinnedIds.includes(project.id),
    isActive: project.id === activeProjectId,
    onToggleHidden: isPrimary(project) ? () => onToggleHidden(project.id) : undefined,
    onTogglePinned: isPrimary(project) ? () => onTogglePinned(project.id) : undefined,
    onSelect: () => onSelect(project.id),
    onChangeCover: onChangeCover ? () => onChangeCover(project.id) : undefined,
    onEdit: onEdit ? () => onEdit(project.id) : undefined,
    onTypefaceChange: onTypefaceChange ? (typefaceId: string) => onTypefaceChange(project.id, typefaceId) : undefined,
    onDelete: onDelete ? () => onDelete(project.id) : undefined,
  });
  if (isMobile) {
    const group = (items: ProjectEntry[], label: string, combine: (reordered: ProjectEntry[]) => ProjectEntry[]) =>
      mobileReorderDisabled ? <ul aria-label={label} className="side-panel-navigation-list m-0 list-none p-0 inset-row-group inset-row-group-icons">{items.map(project => <li key={project.id}><ProjectRow {...rowProps(project)} isDraggable={false} /></li>)}</ul> : <Suspense fallback={null}><MobileReorderList items={items} label={label} disabled={mobileReorderDisabled}
        className="side-panel-navigation-list m-0 list-none p-0 inset-row-group inset-row-group-icons"
        groupForItem={project => isPrimary(project) ? 'primary' : project.id}
        onReorder={reordered => onReorder(combine(reordered).filter(isPrimary))}
        renderItem={(project, activator, actions) => <ProjectRow reorderActions={isPrimary(project) ? actions : undefined}
          {...rowProps(project)} isDraggable={false} reorderActivator={!mobileReorderFromMenu && isPrimary(project) ? activator : undefined} />} /></Suspense>;
    return <div data-mobile-project-layout={mobileLayout}>
      {pinned.length > 0 && <><SectionHeading label="Pinned" icon={PinIcon} />{group(pinned, 'Pinned projects', reordered => [...reordered, ...rest, ...hidden])}</>}
      {rest.length > 0 && <>
        {(pinned.length > 0 || hidden.length > 0) && <SectionHeading label="Projects" icon={FolderIcon} />}
        {group(rest, 'Projects', reordered => [...pinned, ...reordered, ...hidden])}
      </>}
      {hidden.length > 0 && <><SectionHeading label="Hidden" icon={EyeOffIcon} />{group(hidden, 'Hidden projects', reordered => [...pinned, ...rest, ...reordered])}</>}
    </div>;
  }
  return <div>
      {pinned.length > 0 && <>
          <SectionHeading label="Pinned" icon={PinIcon} />
          <ul className="side-panel-navigation-list m-0 list-none p-0 inset-row-group inset-row-group-icons">
            {pinned.map((project) => <li key={project.id}>
                <ProjectRow {...rowProps(project)} isDraggable={false} />
              </li>)}
          </ul>
        </>}

      {(pinned.length > 0 || hidden.length > 0) && rest.length > 0 && <SectionHeading label="Projects" icon={FolderIcon} />}
      {rest.length > 0 && <Reorder.Group as="ul" axis="y" values={rest.filter(isPrimary)} onReorder={stageDesktopDrag} className="side-panel-navigation-list m-0 list-none p-0 inset-row-group inset-row-group-icons">
          {rest.map(project => isPrimary(project)
            ? <ProjectRow key={project.id} {...rowProps(project)} isDraggable dragDisabled={mobileReorderDisabled} onReorderStart={startDesktopDrag} onReorderEnd={finishDesktopDrag} />
            : <li key={project.id}><ProjectRow {...rowProps(project)} isDraggable={false} /></li>)}
        </Reorder.Group>}

      {/* Hidden work sits under its own heading, dimmed, so the owner can see
         what is withheld without it reading as part of the published index. */}
      {hidden.length > 0 && <>
          <SectionHeading label="Hidden" icon={EyeOffIcon} />
          <ul className="side-panel-navigation-list m-0 list-none p-0 inset-row-group inset-row-group-icons">
            {hidden.map((project) => <li key={project.id}>
                <ProjectRow {...rowProps(project)} isDraggable={false} />
              </li>)}
          </ul>
        </>}
    </div>;
}

function ProjectIndexCover({ project, sharedReadOnly, sources, frame = project.coverFrame }: {
  project: ProjectEntry; sharedReadOnly: boolean; sources?: string[]; frame?: ProjectEntry['coverFrame'];
}) {
  return <ProjectCover source={project.cover} thumbnail={project.coverThumbnail} previewSource={getProjectCoverPreview(project)}
    alt={project.coverAlt} kind={project.coverKind} frame={frame} pageNumber={project.coverPageNumber} aspectRatio={project.coverAspectRatio}
    sizes="160px" priority={sharedReadOnly ? 'viewport' : undefined} allowPdfFallback={!sharedReadOnly}
    allowVideoFallback={!sharedReadOnly} autoplaySources={sources} />;
}

function ProjectIndexVideoCover({ project, profileId, sharedReadOnly }: {
  project: ProjectEntry; profileId: string; sharedReadOnly: boolean;
}) {
  const hostRef = useRef<HTMLSpanElement>(null);
  const coverId = project.coverThumbnail?.sourceAttachmentId;
  const findVideo = (work: ProjectEntry) => work.attachments?.find(attachment =>
    attachment.kind === 'video' && (coverId ? attachment.id === coverId : videoSources(attachment).includes(work.cover)));
  const summaryVideo = findVideo(project);
  const summarySources = summaryVideo ? videoSources(summaryVideo) : !coverId && project.cover ? [project.cover] : [];
  const { project: loadedProject } = useInlineProjectContent({
    project, creatorId: profileId, enabled: summarySources.length === 0, active: true, hostRef,
  });
  const loadedVideo = findVideo(loadedProject);
  return <span ref={hostRef} className="block h-full w-full">
    <ProjectIndexCover project={project} sharedReadOnly={sharedReadOnly}
      sources={loadedVideo ? videoSources(loadedVideo) : summarySources}
      frame={loadedVideo?.metadata?.coverFrame ?? project.coverFrame} />
  </span>;
}

/** Mobile navigation shows the real cover and publication date without a preview popup. */
function MobileProjectLabel({ project, isActive, profileId, mobileGrid = false, sharedReadOnly = false }: {
  project: ProjectEntry; isActive: boolean; profileId?: string; mobileGrid?: boolean; sharedReadOnly?: boolean;
}) {
  const published = project.publishedAt ? new Date(project.publishedAt) : null;
  const validPublished = published && Number.isFinite(published.getTime()) ? published : null;
  return <>
    <span className="mobile-project-index-cover" aria-hidden="true">
      <span className="mobile-project-index-artwork">
        {mobileGrid && project.coverKind === 'video' && profileId
          ? <ProjectIndexVideoCover project={project} profileId={profileId} sharedReadOnly={sharedReadOnly} />
          : <ProjectIndexCover project={project} sharedReadOnly={sharedReadOnly} />}
      </span>
    </span>
    <span className="mobile-project-index-copy">
      <span className={`mobile-project-index-title ${isActive ? 'font-semibold text-[var(--accent-text)]' : 'font-medium text-[var(--text-primary)]'}`}>{project.title}</span>
      {validPublished && <time className="mobile-project-index-date" dateTime={project.publishedAt}>{new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(validPublished)}</time>}
    </span>
  </>;
}

/** The shared row body: a tinted fill and weight mark the current document. */
function ProjectLink({
  profileId,
  project,
  typefaceStack,
  isActive,
  isHidden = false,
  sharedReadOnly = false,
  previewLabel = false,
  mobileGrid = false,
  onSelect








}: {profileId?: string;contextDisabled?: boolean;project: ProjectEntry;typefaceStack?: string;isActive: boolean;isHidden?: boolean;sharedReadOnly?: boolean;previewLabel?: boolean;mobileGrid?: boolean;onSelect: () => void;}) {
  const isMobile = usePresentation() === 'mobile';
  return <div className={`side-panel-row project-index-row ps-list-item group relative overflow-hidden rounded-[8px] transition-colors duration-[var(--m-fast)] ${isActive ? 'active bg-[var(--surface-selected)] hover:bg-[var(--surface-pressed)]' : 'hover:bg-[var(--control-hover-surface)]'}`}>
      <button data-preview-open="" type="button" onClick={onSelect} aria-current={isActive ? 'true' : undefined} title={project.title} className={`flex h-full min-w-0 flex-1 cursor-pointer items-center rounded-[8px] px-2 py-1 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--focus-ring)] ${isHidden ? 'opacity-45' : ''}`}>
        {isMobile || previewLabel ? <MobileProjectLabel project={project} isActive={isActive} profileId={profileId} sharedReadOnly={sharedReadOnly} mobileGrid={mobileGrid} /> : <span data-font-preview="" style={{
        fontFamily: typefaceStack
      }} className={`cdx-dense-label min-w-0 flex-1 ${isActive ? 'font-semibold text-[var(--accent-text)]' : 'font-medium text-[var(--text-secondary)]'}`} title={project.title}>{project.title}</span>}
      </button>
    </div>;
}
function ProjectRow({
  profileId,
  mobileGrid,
  project,
  typefaceStack,
  typefaceId,
  isHidden,
  isPinned,
  isActive,
  isDraggable,
  dragDisabled = false,
  onReorderStart,
  onReorderEnd,
  reorderActivator,
  reorderActions,
  onToggleHidden,
  onTogglePinned,
  onSelect,
  onEdit,
  onTypefaceChange,
  onDelete,













}: {profileId?: string;mobileGrid?: boolean;contextDisabled?: boolean;project: ProjectEntry;typefaceStack?: string;typefaceId: string;isHidden: boolean;isPinned: boolean;isActive: boolean;isDraggable: boolean;dragDisabled?: boolean;onReorderStart?: () => void;onReorderEnd?: () => void;reorderActivator?: MobileReorderActivator;reorderActions?: MobileReorderActions;onToggleHidden?: () => void;onTogglePinned?: () => void;onSelect: () => void;onEdit?: () => void;onChangeCover?: () => void;onTypefaceChange?: (typefaceId: string) => void;onDelete?: () => void;}) {
  const isMobile = usePresentation() === 'mobile';
  const dragControls = useDragControls();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [exportOpen,setExportOpen]=useState(false),[citationStatus,setCitationStatus]=useState('');
  const [popupOpen, setPopupOpen] = useState(false);
  const rowRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuFocus = useMenuFocus({ open: isMenuOpen, menuRef, triggerRef, onOpen: () => setIsMenuOpen(true), onClose: () => setIsMenuOpen(false), childSelector: '[data-typography-popover]' });
  const [position, setPosition] = useState<ReturnType<typeof positionAnchoredMenu> | null>(null);
  const positionMenu = useCallback(() => {
    if (!triggerRef.current || !menuRef.current) return;
    const panel = menuRef.current;
    setPosition(positionAnchoredMenu(triggerRef.current.getBoundingClientRect(), panel.offsetWidth, panel.scrollHeight + panel.offsetHeight - panel.clientHeight, window.innerWidth, window.innerHeight));
  }, []);
  useLayoutEffect(() => {
    if (!isMenuOpen) { setPosition(null); return; }
    positionMenu();
    const observer = new ResizeObserver(positionMenu);
    if (menuRef.current) observer.observe(menuRef.current);
    window.addEventListener('resize', positionMenu);
    window.addEventListener('scroll', positionMenu, true);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', positionMenu);
      window.removeEventListener('scroll', positionMenu, true);
    };
  }, [isMenuOpen, positionMenu]);

  const body = <div ref={rowRef} className="relative">
      <div className={`side-panel-row project-index-row ps-list-item group/row relative overflow-hidden rounded-[8px] transition-colors duration-[var(--m-fast)] ${isActive ? 'active bg-[var(--surface-selected)] hover:bg-[var(--surface-pressed)]' : 'hover:bg-[var(--control-hover-surface)]'}`}>
        {isDraggable && <span aria-hidden="true" data-project-drag-handle="" onPointerDown={(event) => { if (!dragDisabled) dragControls.start(event); }} className="ml-1 flex h-full w-3 shrink-0 touch-none cursor-grab items-center justify-center text-[var(--text-tertiary)] active:cursor-grabbing">
            <GripVerticalIcon className="h-3 w-3" />
          </span>}
        <button {...reorderActivator} data-preview-open="" type="button" onClick={onSelect} aria-current={isActive ? 'true' : undefined} title={project.title} className={`flex h-full min-w-0 flex-1 cursor-pointer items-center rounded-[8px] py-1 pl-1.5 ${isMobile ? 'pr-14' : 'pr-10'} text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--focus-ring)] ${isHidden ? 'opacity-45' : ''}`}>
          {isMobile ? <MobileProjectLabel project={project} isActive={isActive} profileId={profileId} mobileGrid={mobileGrid} /> : <span data-font-preview="" style={{
          fontFamily: typefaceStack
        }} className={`cdx-dense-label min-w-0 flex-1 ${isActive ? 'font-semibold text-[var(--accent-text)]' : 'font-medium text-[var(--text-secondary)]'}`} title={project.title}>{project.title}</span>}
        </button>

        {/* Matches the portal-row control: hidden until hover/focus, round hit
            surface, and held visible while its menu is open. */}
        <div data-project-row-actions="" className={`absolute inset-y-0 right-2 flex items-center transition-opacity duration-[var(--m-fast)] ease-[var(--m-enter)] motion-reduce:transition-none ${isMobile || isMenuOpen ? 'opacity-100' : 'opacity-0 focus-within:opacity-100 group-hover/row:opacity-100'}`}>
          <button data-ui-shape="icon" data-control-size="sm" ref={triggerRef} onKeyDown={menuFocus.onTriggerKeyDown} type="button" data-static-icon="" data-row-menu="" onClick={() => isMobile ? setPopupOpen(true) : setIsMenuOpen((open) => !open)} aria-haspopup={isMobile ? "dialog" : "menu"} aria-expanded={isMobile ? popupOpen : isMenuOpen} aria-label={`Options for ${project.title}`} className="flex items-center justify-center rounded-full text-[var(--text-tertiary)] transition-colors hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]">
            <InterfaceIcon icon={MoreHorizontalIcon} size={isMobile ? "lg" : "md"} style={{'--interface-icon-size': isMobile ? '20px' : '16px'} as React.CSSProperties} weight="medium" />
          </button>
        </div>
      </div>

      {isActive&&exportOpen&&profileId&&<Suspense fallback={null}><ProjectExportSheet profileId={profileId} projectId={project.id} onClose={()=>setExportOpen(false)}/></Suspense>}
      {isActive&&citationStatus&&<span role="status">{citationStatus}</span>}
      {isMobile && popupOpen && <MobileProjectPopup project={project} creatorId={profileId} contextHandlers={{ edit: onEdit, delete: onDelete }} onClose={() => setPopupOpen(false)} onOptions={() => setIsMenuOpen(true)} />}
      {createPortal(<AnimatePresence>
        {isMenuOpen && <motion.div ref={menuRef} tabIndex={-1} data-presentation={isMobile ? 'mobile' : 'web'} style={position ?? { visibility: 'hidden' }} role="menu" initial={{
        opacity: 0,
        y: -4
      }} animate={{
        opacity: 1,
        y: 0
      }} exit={{
        opacity: 0,
        y: -4
      }} transition={{
        duration: motionSeconds('fast')
      }} className="fixed z-[45] w-48 max-w-[calc(100vw-16px)] overflow-y-auto rounded-[10px] border border-[var(--hairline)] bg-[var(--surface-raised)] p-1 shadow-[0_10px_26px_rgba(0,0,0,0.22)]">
            {[[reorderActions?.moveUp, 'Move up'], [reorderActions?.moveDown, 'Move down']].map(([action, label]) => typeof action === 'function' && <button key={String(label)} type="button" role="menuitem" onClick={() => { setIsMenuOpen(false); action(); }} className="flex min-h-11 w-full items-center rounded-lg px-2 text-left text-sm hover:bg-[var(--surface-hover)] focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]">{String(label)}</button>)}
            {onEdit && <button type="button" role="menuitem" onClick={() => {
          triggerRef.current?.focus();
          onEdit();
          setIsMenuOpen(false);
        }} className="side-panel-primary-control side-panel-control-row w-full px-2 text-left text-[13px] font-medium text-[var(--text-primary)] transition-colors duration-[var(--m-fast)] hover:bg-[var(--surface-sunken)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]">
                <InterfaceIcon icon={PencilIcon} size="sm" weight="medium" />
                Edit project…
              </button>}
            {onTypefaceChange && <TypographyInspector typefaceId={typefaceId} triggerVariant="menu" onTypefaceChange={onTypefaceChange} onSelectComplete={() => setIsMenuOpen(false)} />}
            {onTogglePinned && <button type="button" role="menuitem" onClick={() => {
          onTogglePinned();
          setIsMenuOpen(false);
        }} className="side-panel-primary-control side-panel-control-row w-full px-2 text-left text-[13px] font-medium text-[var(--text-primary)] transition-colors duration-[var(--m-fast)] hover:bg-[var(--surface-sunken)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]">
              {isPinned ? <PinOffIcon className="h-3.5 w-3.5" aria-hidden="true" /> : <PinIcon className="h-3.5 w-3.5" aria-hidden="true" />}
              {isPinned ? 'Unpin' : 'Pin'}
            </button>}
            {onToggleHidden && <button type="button" role="menuitem" onClick={() => {
          onToggleHidden();
          setIsMenuOpen(false);
        }} className="side-panel-primary-control side-panel-control-row w-full px-2 text-left text-[13px] font-medium text-[var(--text-primary)] transition-colors duration-[var(--m-fast)] hover:bg-[var(--surface-sunken)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]">
              {isHidden ? <EyeIcon className="h-3.5 w-3.5" aria-hidden="true" /> : <EyeOffIcon className="h-3.5 w-3.5" aria-hidden="true" />}
              {isHidden ? 'Make visible' : 'Hide'}
            </button>}
            {isActive&&profileId&&<button type="button" role="menuitem" className="side-panel-primary-control side-panel-control-row w-full px-2 text-left text-[13px]" onClick={()=>{setIsMenuOpen(false);setExportOpen(true);}}>Export</button>}
            {isActive&&profileId&&onEdit&&project.attachments?.some(attachment=>attachment.kind==='image'||attachment.kind==='document')&&<button type="button" role="menuitem" className="side-panel-primary-control side-panel-control-row w-full px-2 text-left text-[13px]" onClick={()=>{setIsMenuOpen(false);const attachment=project.attachments?.find(item=>item.kind==='image'||item.kind==='document');if(attachment)void import('../../features/references/ownCitation').then(module=>module.ownPageCitation(profileId,project.id,attachment.id,0)).then(text=>navigator.clipboard.writeText(text)).then(()=>setCitationStatus('Citation copied.')).catch(()=>setCitationStatus('Citation could not be copied.'));}}>Copy citation</button>}
            {/* These act on the published record itself, through the project
             management boundary — not on a local copy of it. */}
            {onDelete && <button type="button" data-keep-color="" role="menuitem" onClick={() => {
          triggerRef.current?.focus();
          onDelete();
          setIsMenuOpen(false);
        }} className="side-panel-primary-control side-panel-control-row w-full px-2 text-left text-[13px] font-medium text-[var(--status-danger)] transition-colors duration-[var(--m-fast)] hover:bg-[var(--surface-sunken)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]">
                <InterfaceIcon icon={Trash2Icon} size="sm" weight="medium" />
                Delete project…
              </button>}
          </motion.div>}
      </AnimatePresence>, document.querySelector<HTMLElement>('.app-shell') ?? document.body)}
    </div>;
  if (!isDraggable) {
    return body;
  }
  return <Reorder.Item value={project} drag={dragDisabled ? false : 'y'} onDragStart={onReorderStart} onDragEnd={onReorderEnd} dragListener={false} dragControls={dragControls} className="relative">
      {body}
    </Reorder.Item>;
}
