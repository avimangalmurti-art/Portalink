import React, { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, Reorder, useDragControls } from 'framer-motion';
import { EyeIcon, EyeOffIcon, FolderIcon, GripVerticalIcon, MoreHorizontalIcon, PencilIcon, PinIcon, PinOffIcon, ReplaceIcon, Trash2Icon } from 'lucide-react';
// Canonical domain model, not the seed module's parallel copy.
import type { Project as ProjectEntry } from '../../types/domain';
import { InterfaceIcon } from '../ui/InterfaceIcon';
import { TypographyInspector } from './TypographyInspector';
type ProjectIndexListProps = {
  projects: ProjectEntry[];
  /** Each row reads in the face of the project it points at, keyed by id. */
  typefaceStacks: Record<string, string>;
  typefaceIds: Record<string, string>;
  hiddenIds: string[];
  /** Work fixed to the top of the index. Published, so visitors see it too. */
  pinnedIds: string[];
  activeProjectId: string | null;
  /** Arranging and hiding work belongs to whoever owns the portfolio. */
  isOwner: boolean;
  onReorder: (projects: ProjectEntry[]) => void;
  onToggleHidden: (projectId: string) => void;
  onTogglePinned: (projectId: string) => void;
  onSelect: (projectId: string) => void;
  /** Owner-only: opens the real editor for this project's published record. */
  onEdit?: (projectId: string) => void;
  /** Owner-only: opens the editor directly at the file replacement controls. */
  onReplaceFiles?: (projectId: string) => void;
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
  projects,
  typefaceStacks,
  typefaceIds,
  hiddenIds,
  pinnedIds,
  activeProjectId,
  isOwner,
  onReorder,
  onToggleHidden,
  onTogglePinned,
  onSelect,
  onEdit,
  onReplaceFiles,
  onTypefaceChange,
  onDelete,
}: ProjectIndexListProps) {
  /*
   * Three groups, in reading order: pinned work first, then the rest of the
   * category, then — for the owner alone — work they have hidden. Pinning is a
   * position and hiding is a privacy state, so they are separate groups rather
   * than one ranked list, and a heading states which is which instead of leaving
   * the viewer to infer it from position.
   */
  const pinned = projects.filter((project) => pinnedIds.includes(project.id) && !hiddenIds.includes(project.id));
  const hidden = projects.filter((project) => hiddenIds.includes(project.id));
  const rest = projects.filter((project) => !pinnedIds.includes(project.id) && !hiddenIds.includes(project.id));

  // A visitor reads a published index, so it is a plain list with no handles.
  if (!isOwner) {
    return <div>
        {pinned.length > 0 && <>
            <SectionHeading label="Pinned" icon={PinIcon} />
            <ul className="side-panel-navigation-list m-0 list-none p-0">
              {pinned.map((project) => <li key={project.id}>
                  <ProjectLink project={project} typefaceStack={typefaceStacks[project.id]} isActive={project.id === activeProjectId} onSelect={() => onSelect(project.id)} />
                </li>)}
            </ul>
          </>}
        {rest.length > 0 && <>
            {pinned.length > 0 && <SectionHeading label="Projects" icon={FolderIcon} />}
            <ul className="side-panel-navigation-list m-0 list-none p-0">
              {rest.map((project) => <li key={project.id}>
                  <ProjectLink project={project} typefaceStack={typefaceStacks[project.id]} isActive={project.id === activeProjectId} onSelect={() => onSelect(project.id)} />
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
    project,
    typefaceStack: typefaceStacks[project.id],
    typefaceId: typefaceIds[project.id],
    isHidden: hiddenIds.includes(project.id),
    isPinned: pinnedIds.includes(project.id),
    isActive: project.id === activeProjectId,
    onToggleHidden: () => onToggleHidden(project.id),
    onTogglePinned: () => onTogglePinned(project.id),
    onSelect: () => onSelect(project.id),
    onEdit: onEdit ? () => onEdit(project.id) : undefined,
    onReplaceFiles: onReplaceFiles ? () => onReplaceFiles(project.id) : undefined,
    onTypefaceChange: onTypefaceChange ? (typefaceId: string) => onTypefaceChange(project.id, typefaceId) : undefined,
    onDelete: onDelete ? () => onDelete(project.id) : undefined,
  });
  return <div>
      {pinned.length > 0 && <>
          <SectionHeading label="Pinned" icon={PinIcon} />
          <ul className="side-panel-navigation-list m-0 list-none p-0">
            {pinned.map((project) => <li key={project.id}>
                <ProjectRow {...rowProps(project)} isDraggable={false} />
              </li>)}
          </ul>
        </>}

      {(pinned.length > 0 || hidden.length > 0) && rest.length > 0 && <SectionHeading label="Projects" icon={FolderIcon} />}
      {rest.length > 0 && <Reorder.Group as="ul" axis="y" values={rest} onReorder={(reordered) => onReorder([...pinned, ...reordered, ...hidden])} className="side-panel-navigation-list m-0 list-none p-0">
          {rest.map((project) => <ProjectRow key={project.id} {...rowProps(project)} isDraggable />)}
        </Reorder.Group>}

      {/* Hidden work sits under its own heading, dimmed, so the owner can see
         what is withheld without it reading as part of the published index. */}
      {hidden.length > 0 && <>
          <SectionHeading label="Hidden" icon={EyeOffIcon} />
          <ul className="side-panel-navigation-list m-0 list-none p-0">
            {hidden.map((project) => <li key={project.id}>
                <ProjectRow {...rowProps(project)} isDraggable={false} />
              </li>)}
          </ul>
        </>}
    </div>;
}

/** The shared row body: a tinted fill and weight mark the current document. */
function ProjectLink({
  project,
  typefaceStack,
  isActive,
  isHidden = false,
  onSelect








}: {project: ProjectEntry;typefaceStack?: string;isActive: boolean;isHidden?: boolean;onSelect: () => void;}) {
  /*
   * A row is the project's title and nothing else. The cover thumbnail, the audio
   * length, and the waveform signature were removed: an index is read as a list of
   * names, and per-row artwork and metadata made every row a small card competing
   * with the work actually open beside it.
   */
  return <div className={`side-panel-row project-index-row ps-list-item group relative overflow-hidden rounded-[8px] transition-colors duration-150 ${isActive ? 'active bg-[var(--surface-selected)] hover:bg-[var(--surface-pressed)]' : 'hover:bg-[var(--control-hover-surface)]'}`}>
      <button type="button" onClick={onSelect} aria-current={isActive ? 'true' : undefined} title={project.title} className={`flex h-full min-w-0 flex-1 cursor-pointer items-center rounded-[8px] px-2 py-1 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--focus-ring)] ${isHidden ? 'opacity-45' : ''}`}>
        <span data-font-preview="" style={{
        fontFamily: typefaceStack
      }} className={`cdx-dense-label min-w-0 flex-1 ${isActive ? 'font-semibold text-[var(--accent-text)]' : 'font-medium text-[var(--text-secondary)]'}`} title={project.title}>{project.title}</span>
      </button>
    </div>;
}
function ProjectRow({
  project,
  typefaceStack,
  typefaceId,
  isHidden,
  isPinned,
  isActive,
  isDraggable,
  onToggleHidden,
  onTogglePinned,
  onSelect,
  onEdit,
  onReplaceFiles,
  onTypefaceChange,
  onDelete,













}: {project: ProjectEntry;typefaceStack?: string;typefaceId: string;isHidden: boolean;isPinned: boolean;isActive: boolean;isDraggable: boolean;onToggleHidden: () => void;onTogglePinned: () => void;onSelect: () => void;onEdit?: () => void;onReplaceFiles?: () => void;onTypefaceChange?: (typefaceId: string) => void;onDelete?: () => void;}) {
  const dragControls = useDragControls();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const rowRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!isMenuOpen) {
      return;
    }
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Element;
      if (!rowRef.current?.contains(target) && !target.closest('[data-typography-popover]')) {
        setIsMenuOpen(false);
      }
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [isMenuOpen]);
  const body = <div ref={rowRef} className="relative">
      <div className={`side-panel-row project-index-row ps-list-item group/row relative overflow-hidden rounded-[8px] transition-colors duration-150 ${isActive ? 'active bg-[var(--surface-selected)] hover:bg-[var(--surface-pressed)]' : 'hover:bg-[var(--control-hover-surface)]'}`}>
        {isDraggable && <span aria-hidden="true" data-project-drag-handle="" onPointerDown={(event) => dragControls.start(event)} className="ml-1 flex h-full w-3 shrink-0 touch-none cursor-grab items-center justify-center text-[var(--text-tertiary)] active:cursor-grabbing">
            <GripVerticalIcon className="h-3 w-3" />
          </span>}
        <button type="button" onClick={onSelect} aria-current={isActive ? 'true' : undefined} title={project.title} className={`flex h-full min-w-0 flex-1 cursor-pointer items-center rounded-[8px] py-1 pl-1.5 pr-10 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--focus-ring)] ${isHidden ? 'opacity-45' : ''}`}>
          <span data-font-preview="" style={{
          fontFamily: typefaceStack
        }} className={`cdx-dense-label min-w-0 flex-1 ${isActive ? 'font-semibold text-[var(--accent-text)]' : 'font-medium text-[var(--text-secondary)]'}`} title={project.title}>{project.title}</span>
        </button>

        {/* Matches the portal-row control: hidden until hover/focus, round hit
            surface, and held visible while its menu is open. */}
        <div className={`absolute inset-y-0 right-2 flex items-center transition-opacity duration-150 ease-out motion-reduce:transition-none ${isMenuOpen ? 'opacity-100' : 'opacity-0 focus-within:opacity-100 group-hover/row:opacity-100'}`}>
          <button type="button" data-static-icon="" data-row-menu="" onClick={() => setIsMenuOpen((open) => !open)} aria-haspopup="menu" aria-expanded={isMenuOpen} aria-label={`Options for ${project.title}`} className="flex h-6 w-6 items-center justify-center rounded-full text-[var(--text-tertiary)] transition-colors hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]">
            <InterfaceIcon icon={MoreHorizontalIcon} weight="medium" />
          </button>
        </div>
      </div>

      <AnimatePresence>
        {isMenuOpen && <motion.div role="menu" initial={{
        opacity: 0,
        y: -4
      }} animate={{
        opacity: 1,
        y: 0
      }} exit={{
        opacity: 0,
        y: -4
      }} transition={{
        duration: 0.14
      }} className="absolute right-1 top-[calc(100%-2px)] z-30 w-48 rounded-[10px] border border-[var(--hairline)] bg-[var(--surface-raised)] p-1 shadow-[0_10px_26px_rgba(0,0,0,0.22)]">
            {onEdit && <button type="button" role="menuitem" onClick={() => {
          onEdit();
          setIsMenuOpen(false);
        }} className="side-panel-primary-control side-panel-control-row w-full px-2 text-left text-[13px] font-medium text-[var(--text-primary)] transition-colors duration-150 hover:bg-[var(--surface-sunken)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]">
                <InterfaceIcon icon={PencilIcon} size="sm" weight="medium" />
                Edit details…
              </button>}
            {onTypefaceChange && <TypographyInspector typefaceId={typefaceId} triggerVariant="menu" onTypefaceChange={onTypefaceChange} onSelectComplete={() => setIsMenuOpen(false)} />}
            <button type="button" role="menuitem" onClick={() => {
          onTogglePinned();
          setIsMenuOpen(false);
        }} className="side-panel-primary-control side-panel-control-row w-full px-2 text-left text-[13px] font-medium text-[var(--text-primary)] transition-colors duration-150 hover:bg-[var(--surface-sunken)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]">
              {isPinned ? <PinOffIcon className="h-3.5 w-3.5" aria-hidden="true" /> : <PinIcon className="h-3.5 w-3.5" aria-hidden="true" />}
              {isPinned ? 'Unpin' : 'Pin'}
            </button>
            <button type="button" role="menuitem" onClick={() => {
          onToggleHidden();
          setIsMenuOpen(false);
        }} className="side-panel-primary-control side-panel-control-row w-full px-2 text-left text-[13px] font-medium text-[var(--text-primary)] transition-colors duration-150 hover:bg-[var(--surface-sunken)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]">
              {isHidden ? <EyeIcon className="h-3.5 w-3.5" aria-hidden="true" /> : <EyeOffIcon className="h-3.5 w-3.5" aria-hidden="true" />}
              {isHidden ? 'Make visible' : 'Hide'}
            </button>
            {/* These act on the published record itself, through the project
             management boundary — not on a local copy of it. */}
            {onReplaceFiles && <button type="button" role="menuitem" onClick={() => {
          onReplaceFiles();
          setIsMenuOpen(false);
        }} className="side-panel-primary-control side-panel-control-row w-full px-2 text-left text-[13px] font-medium text-[var(--text-primary)] transition-colors duration-150 hover:bg-[var(--surface-sunken)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]">
                <InterfaceIcon icon={ReplaceIcon} size="sm" weight="medium" />
                Replace files…
              </button>}
            {onDelete && <button type="button" role="menuitem" onClick={() => {
          onDelete();
          setIsMenuOpen(false);
        }} className="side-panel-primary-control side-panel-control-row w-full px-2 text-left text-[13px] font-medium text-[var(--status-danger)] transition-colors duration-150 hover:bg-[var(--surface-sunken)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]">
                <InterfaceIcon icon={Trash2Icon} size="sm" weight="medium" />
                Delete project…
              </button>}
          </motion.div>}
      </AnimatePresence>
    </div>;
  if (!isDraggable) {
    return body;
  }
  return <Reorder.Item value={project} dragListener={false} dragControls={dragControls} className="relative">
      {body}
    </Reorder.Item>;
}
