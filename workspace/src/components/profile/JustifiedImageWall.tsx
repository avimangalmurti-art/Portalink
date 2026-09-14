import React, { useMemo } from 'react';
import {
  DndContext,
  KeyboardSensor,
  MouseSensor,
  PointerSensor,
  closestCenter,
  pointerWithin,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  defaultAnimateLayoutChanges,
  rectSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useReducedMotion } from 'framer-motion';
import { GripVerticalIcon } from 'lucide-react';
import { useElementSize } from '../../hooks/useElementSize';
import { useContentZoom } from '../../hooks/useContentZoom';
import { ZoomReadout } from '../ui/ZoomReadout';
import { usePresentation } from '../../presentation/usePresentation';
import { SingleTouchSensor } from '../../presentation/mobile/SingleTouchSensor';

/**
 * A justified wall of images — the packing layer for pure imagery.
 *
 * Why not the bento packer: that one gives every cell the same width and lets
 * heights vary, so columns end at different points and the wall reads ragged. A
 * wall of photographs with no metadata beneath them can do better. Here the
 * ROW is the fixed unit: each complete row receives the exact selected card
 * count, then scales those frames so the row spans the full width. Every full
 * row therefore ends flush on both edges and rows sit flush against each other.
 *
 * Crucially this leaves every frame at its own proportions — widths differ
 * within a row precisely BECAUSE the ratios differ. Nothing is cropped or
 * stretched to fit.
 *
 * A trailing row inherits the preceding row's height whenever its contents fit.
 * That keeps the last projects from appearing visually less important merely
 * because the collection does not divide evenly. If the inherited height would
 * overflow, it is reduced only as far as needed. DOM order is source order
 * throughout.
 */

/** The gutter, on both axes. Tight enough to read as a wall rather than tiles. */
const GAP = 4;
const MIN_COLUMNS = 3;
const MAX_COLUMNS = 9;
const MIN_READABLE_CARD_WIDTH = 112;
export type WallItem = {
  key: string;
  /** width / height. The frame's own proportion — never modified here. */
  ratio: number;
  content: React.ReactNode;
};
type ReorderMode = {
  enabled: boolean;
  disabled?: boolean;
  /** Supplied only by the owner's mobile profile, to enter via a long press. */
  onStart?: () => void;
  onMove: (sourceKey: string, targetKey: string) => void;
  onMoveByOffset: (key: string, offset: -1 | 1) => void;
};
type Row = {
  items: (WallItem & {
    width: number;
  })[];
  height: number;
  justified: boolean;
};

/**
 * Prefer the card under the pointer, then fall back to the closest card centre.
 * The fallback is what makes the empty gutter between two cards a useful drop
 * target instead of a dead strip that ignores the creator's gesture.
 */
const gapAwareCollisionDetection: CollisionDetection = (args) => {
  const directHits = pointerWithin(args);
  return directHits.length > 0 ? directHits : closestCenter(args);
};

/**
 * Count-based row packing. Pure — same inputs, same layout.
 */
function packRows(items: WallItem[], width: number, columns: number, trailingRowHeight: number): Row[] {
  const rows: Row[] = [];
  let current: WallItem[] = [];
  const flush = (entries: WallItem[]): Row => {
    const ratioSum = entries.reduce((total, entry) => total + entry.ratio, 0);
    const available = width - GAP * (entries.length - 1);
    const height = available / ratioSum;
    return {
      height,
      justified: true,
      items: entries.map((entry) => ({
        ...entry,
        width: height * entry.ratio
      }))
    };
  };
  items.forEach((item) => {
    current.push(item);
    // Density is a count, not an approximate target height. Flushing after the
    // selected number fixes portrait documents producing an extra card per row
    // while the justified sizing still preserves every item's real ratio.
    if (current.length === columns) {
      rows.push(flush(current));
      current = [];
    }
  });
  if (current.length > 0) {
    const ratioSum = current.reduce((total, entry) => total + entry.ratio, 0);
    const available = width - GAP * (current.length - 1);
    const precedingRowHeight = rows[rows.length - 1]?.height ?? trailingRowHeight;
    const maximumFittingHeight = available / ratioSum;
    // A short final row should carry the same visual weight as the projects
    // directly above it. Preserve that height whenever it fits, and only scale
    // down for unusually wide trailing content that would otherwise overflow.
    const height = Math.min(precedingRowHeight, maximumFittingHeight);
    rows.push({
      height,
      justified: false,
      items: current.map((entry) => ({
        ...entry,
        width: height * entry.ratio
      }))
    });
  }
  return rows;
}

type SortableWallCardProps = {
  item: Row['items'][number] & { height: number };
  itemIndex: number;
  itemCount: number;
  rowJustified: boolean;
  isReordering: boolean;
  isDisabled: boolean;
  shouldReduceMotion: boolean;
  reorderMode?: ReorderMode;
};

function SortableWallCard({
  item,
  itemIndex,
  itemCount,
  rowJustified,
  isReordering,
  isDisabled,
  shouldReduceMotion,
  reorderMode,
}: SortableWallCardProps) {
  const isMobile = usePresentation() === 'mobile';
  const canHoldToReorder = Boolean(reorderMode?.onStart) && !isDisabled;
  const canSort = !isDisabled && (isReordering || canHoldToReorder);
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: item.key,
    disabled: !canSort,
    transition: shouldReduceMotion ? null : {
      duration: 190,
      easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)',
    },
    animateLayoutChanges: (args) => !shouldReduceMotion && defaultAnimateLayoutChanges(args),
  });

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!isReordering || isDisabled) return;
    if (event.altKey && (event.key === 'ArrowLeft' || event.key === 'ArrowUp')) {
      event.preventDefault();
      reorderMode?.onMoveByOffset(item.key, -1);
      return;
    }
    if (event.altKey && (event.key === 'ArrowRight' || event.key === 'ArrowDown')) {
      event.preventDefault();
      reorderMode?.onMoveByOffset(item.key, 1);
      return;
    }
    listeners?.onKeyDown?.(event);
  };
  const visualTransform = isDragging && transform
    ? { ...transform, scaleX: 1, scaleY: 1 }
    : transform;
  const startFromArtwork = (event: React.SyntheticEvent, name: 'onTouchStart' | 'onMouseDown') => {
    if ((event.target as HTMLElement).closest('[data-preview-open]')) listeners?.[name]?.(event);
  };

  return <div
    ref={setNodeRef}
    role="listitem"
    data-project-preview-cell=""
    className={`min-w-0 ${isReordering ? 'will-change-transform' : ''} ${isDragging ? 'z-30 opacity-90 drop-shadow-[0_16px_30px_rgba(0,0,0,0.32)]' : ''}`}
    style={{
      flex: rowJustified ? `1 1 ${item.width}px` : `0 0 ${item.width}px`,
      '--project-cover-height': `${item.height}px`,
      alignSelf: 'flex-start',
      transform: CSS.Transform.toString(visualTransform),
      transition: shouldReduceMotion ? undefined : transition,
    } as React.CSSProperties}
  >
      <div
        ref={canSort ? setActivatorNodeRef : undefined}
        {...(isReordering ? attributes : {})}
        {...(canSort ? isReordering ? listeners : {
          onTouchStart: (event: React.TouchEvent) => startFromArtwork(event, 'onTouchStart'),
          onMouseDown: (event: React.MouseEvent) => startFromArtwork(event, 'onMouseDown'),
        } : {})}
        data-profile-hold-reorder={canHoldToReorder || undefined}
        aria-describedby={isReordering ? 'profile-project-reorder-instructions' : undefined}
        aria-label={isReordering ? `Project ${itemIndex + 1} of ${itemCount}; drag to reorder` : undefined}
        onKeyDown={isReordering ? handleKeyDown : undefined}
        className={`w-full min-w-0 ${isReordering ? `cursor-grab ${isMobile ? 'touch-pan-y' : 'touch-none'} rounded-[9px] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] active:cursor-grabbing` : ''}`}
      >
        <div className={`relative w-full ${isReordering ? 'profile-project-reorder-card rounded-[8px] ring-2 ring-inset ring-[var(--accent-primary)]' : ''}`} style={isReordering ? {
          animationDelay: `${itemIndex % 5 * -75}ms`,
          animationDuration: `${620 + itemIndex % 4 * 55}ms`
        } : undefined}>
          <div className={isReordering ? 'pointer-events-none w-full select-none' : 'w-full'}>
            {item.content}
          </div>
          {isReordering ? <span aria-hidden="true" className="pointer-events-none absolute right-2 top-2 z-30 inline-flex h-7 items-center gap-1 rounded-full bg-[var(--surface-raised)] px-2 text-[10px] font-semibold tabular-nums text-[var(--accent-text)] shadow-[var(--shadow-pop)]">
              <GripVerticalIcon className="h-3.5 w-3.5" />
              {itemIndex + 1}
            </span> : null}
        </div>
      </div>
    </div>;
}

export function JustifiedImageWall({
  items,
  columns,
  label,
  columnCapacityWidth,
  reorderMode







}: {items: WallItem[]; /** Exact card count for every complete row. */columns: number;label: string;/** MOBILE Home keeps its columns when the navigation rail takes space. */columnCapacityWidth?: number;reorderMode?: ReorderMode;}) {
  const {
    ref,
    width
  } = useElementSize<HTMLDivElement>();
  /*
   * A reading preference layered over the creator's density choice: `columns`
   * is untouched, and the zoom only scales how many land in a row. Frames keep
   * their own proportions either way — nothing is cropped to zoom.
   */
  const view = useContentZoom<HTMLDivElement>(!reorderMode?.enabled);
  // Hiding the phone rail enlarges the same two columns instead of shrinking
  // the artwork to squeeze in a third. The saved WEB density remains intact.
  const isMobile = usePresentation() === 'mobile';
  const readableCardWidth = isMobile ? 150 : MIN_READABLE_CARD_WIDTH;
  const shouldReduceMotion = useReducedMotion();
  const pointerSensor = useSensor(PointerSensor, { activationConstraint: { distance: 6 } });
  const touchSensor = useSensor(SingleTouchSensor, {
    // A swipe scrolls; a brief stationary hold picks up a card for dragging.
    activationConstraint: { delay: reorderMode?.enabled ? 250 : 450, tolerance: 8 },
  });
  const mouseSensor = useSensor(MouseSensor, {
    activationConstraint: isMobile && !reorderMode?.enabled ? { delay: 450, tolerance: 8 } : { distance: 6 },
  });
  const keyboardSensor = useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates });
  // dnd-kit uses the sensor list as effect dependencies: keep its length stable
  // when resizing. PointerSensor wins mouse activation on WEB; MouseSensor is
  // its fallback and complements TouchSensor on the owner's mobile profile.
  const sensors = useSensors(isMobile && reorderMode ? touchSensor : pointerSensor, mouseSensor, keyboardSensor);
  // Three is the standard minimum in the profile workspace. Only a genuinely
  // narrow viewport may reduce the rendered count so cards never become
  // unreadable; the saved 3–9 preference itself remains unchanged.
  const capacityWidth = isMobile ? columnCapacityWidth ?? width : width;
  const responsiveCapacity = capacityWidth > 0
    ? Math.max(1, Math.floor((capacityWidth + GAP) / (readableCardWidth + GAP)))
    : MAX_COLUMNS;
  // On phones zoom starts from the columns actually visible, so enlarging a
  // two-column feed can reach one column instead of hitting the WEB minimum.
  const preferredColumns = Math.max(isMobile ? 1 : MIN_COLUMNS, Math.min(MAX_COLUMNS,
    view.scaleColumns(isMobile ? Math.min(columns, responsiveCapacity) : columns)));
  const effectiveColumns = Math.min(preferredColumns, responsiveCapacity);
  const rows = useMemo(() => {
    if (width === 0) {
      return [];
    }
    const trailingRowHeight = width / effectiveColumns / 0.82;
    return packRows(items, width, effectiveColumns, trailingRowHeight);
  }, [items, width, effectiveColumns]);
  const itemIndexByKey = useMemo(() => new Map(items.map((item, index) => [item.key, index])), [items]);
  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    if (!reorderMode?.enabled || reorderMode.disabled || !over || active.id === over.id) return;
    reorderMode.onMove(String(active.id), String(over.id));
  };
  return <div ref={view.ref} className="relative w-full">
      <ZoomReadout view={view} />
      {reorderMode?.enabled ? <p id="profile-project-reorder-instructions" className="sr-only">{isMobile ? 'Swipe to scroll. Hold a project briefly, then drag to move it. Hold near the top or bottom edge to scroll while dragging. ' : ''}Drag a project card toward the space where it belongs and the nearby cards will make room. For keyboard reordering, press Space, use the arrow keys, and press Space again; Alt plus an arrow also moves one position.</p> : null}
      <DndContext sensors={sensors} collisionDetection={gapAwareCollisionDetection} onDragStart={() => {
        if (!reorderMode?.enabled && !reorderMode?.disabled) reorderMode?.onStart?.();
      }} onDragEnd={handleDragEnd}>
        <SortableContext items={items.map((item) => item.key)} strategy={rectSortingStrategy} disabled={(!reorderMode?.enabled && !reorderMode?.onStart) || reorderMode?.disabled}>
          <div ref={ref} role="list" aria-label={label} data-profile-wall-columns={effectiveColumns} className="w-full">
          {rows.map((row, rowIndex) => <div key={row.items[0]?.key ?? rowIndex} className="flex w-full" style={{
            gap: GAP,
            marginBottom: rowIndex === rows.length - 1 ? 0 : GAP
          }}>
              {/* Basis carries the computed width; grow and shrink absorb the
                 sub-pixel remainder so the row lands exactly on both edges. */}
              {row.items.map((item) => <SortableWallCard
                key={item.key}
                item={{ ...item, height: row.height }}
                itemIndex={itemIndexByKey.get(item.key) ?? 0}
                itemCount={items.length}
                rowJustified={row.justified}
                isReordering={Boolean(reorderMode?.enabled)}
                isDisabled={Boolean(reorderMode?.disabled)}
                shouldReduceMotion={Boolean(shouldReduceMotion)}
                reorderMode={reorderMode}
              />)}
            </div>)}
          </div>
        </SortableContext>
      </DndContext>
    </div>;
}
