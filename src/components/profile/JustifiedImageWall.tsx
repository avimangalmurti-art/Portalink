import React, { useMemo, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { GripVerticalIcon } from 'lucide-react';
import { useElementSize } from '../../hooks/useElementSize';
import { useContentZoom } from '../../hooks/useContentZoom';
import { ZoomReadout } from '../ui/ZoomReadout';

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
 * A trailing row keeps the target height and ends naturally instead of being
 * enlarged or padded with content that is not part of the portfolio. DOM order
 * is source order throughout.
 */

/** The gutter, on both axes. Tight enough to read as a wall rather than tiles. */
const GAP = 8;
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
    const height = trailingRowHeight;
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
export function JustifiedImageWall({
  items,
  columns,
  label,
  reorderMode







}: {items: WallItem[]; /** Exact card count for every complete row. */columns: number;label: string;reorderMode?: ReorderMode;}) {
  const {
    ref,
    width
  } = useElementSize<HTMLDivElement>();
  /*
   * A reading preference layered over the creator's density choice: `columns`
   * is untouched, and the zoom only scales how many land in a row. Frames keep
   * their own proportions either way — nothing is cropped to zoom.
   */
  const view = useContentZoom<HTMLDivElement>();
  const shouldReduceMotion = useReducedMotion();
  const draggedKeyRef = useRef<string | null>(null);
  const [draggingKey, setDraggingKey] = useState<string | null>(null);
  const preferredColumns = Math.max(MIN_COLUMNS, Math.min(MAX_COLUMNS, view.scaleColumns(columns)));
  // Three is the standard minimum in the profile workspace. Only a genuinely
  // narrow viewport may reduce the rendered count so cards never become
  // unreadable; the saved 3–9 preference itself remains unchanged.
  const responsiveCapacity = width > 0
    ? Math.max(1, Math.floor((width + GAP) / (MIN_READABLE_CARD_WIDTH + GAP)))
    : preferredColumns;
  const effectiveColumns = Math.min(preferredColumns, responsiveCapacity);
  const rows = useMemo(() => {
    if (width === 0) {
      return [];
    }
    const trailingRowHeight = width / effectiveColumns / 0.82;
    return packRows(items, width, effectiveColumns, trailingRowHeight);
  }, [items, width, effectiveColumns]);
  return <div ref={view.ref} className="relative w-full">
      <ZoomReadout view={view} />
      {reorderMode?.enabled ? <p id="profile-project-reorder-instructions" className="sr-only">Drag a project card into a new position, or focus a card and hold Alt while pressing an arrow key.</p> : null}
      <div ref={ref} role="list" aria-label={label} data-profile-wall-columns={effectiveColumns} className="w-full">
      {rows.map((row, rowIndex) => <div key={row.items[0]?.key ?? rowIndex} className="flex w-full" style={{
        gap: GAP,
        marginBottom: rowIndex === rows.length - 1 ? 0 : GAP
      }}>
          {/* Basis carries the computed width; grow and shrink absorb the
             sub-pixel remainder so the row lands exactly on both edges. */}
          {row.items.map((item) => {
            const itemIndex = items.findIndex((candidate) => candidate.key === item.key);
            const isReordering = Boolean(reorderMode?.enabled);
            const isDisabled = Boolean(reorderMode?.disabled);
            const isDragging = draggingKey === item.key;
            return <motion.div
              key={item.key}
              layout={isReordering && !shouldReduceMotion ? 'position' : false}
              className={`min-w-0 ${isDragging ? 'z-30 opacity-75' : ''}`}
              style={{
                flex: row.justified ? `1 1 ${item.width}px` : `0 0 ${item.width}px`,
                height: row.height
              }}
            >
              <div
                role="listitem"
                tabIndex={isReordering ? 0 : undefined}
                draggable={isReordering && !isDisabled}
                aria-grabbed={isReordering ? isDragging : undefined}
                aria-describedby={isReordering ? 'profile-project-reorder-instructions' : undefined}
                aria-label={isReordering ? `Project ${itemIndex + 1} of ${items.length}; drag to reorder` : undefined}
                onKeyDown={isReordering && !isDisabled ? (event) => {
                  if (!event.altKey) return;
                  if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
                    event.preventDefault();
                    reorderMode?.onMoveByOffset(item.key, -1);
                  }
                  if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
                    event.preventDefault();
                    reorderMode?.onMoveByOffset(item.key, 1);
                  }
                } : undefined}
                onDragStart={isReordering && !isDisabled ? (event) => {
                  draggedKeyRef.current = item.key;
                  setDraggingKey(item.key);
                  event.dataTransfer.effectAllowed = 'move';
                  event.dataTransfer.setData('text/plain', item.key);
                } : undefined}
                onDragOver={isReordering && !isDisabled ? (event) => {
                  event.preventDefault();
                  event.dataTransfer.dropEffect = 'move';
                } : undefined}
                onDragEnter={isReordering && !isDisabled ? (event) => {
                  event.preventDefault();
                } : undefined}
                onDrop={isReordering && !isDisabled ? (event) => {
                  event.preventDefault();
                  const sourceKey = draggedKeyRef.current;
                  if (sourceKey && sourceKey !== item.key) reorderMode?.onMove(sourceKey, item.key);
                  draggedKeyRef.current = null;
                  setDraggingKey(null);
                } : undefined}
                onDragEnd={isReordering ? () => {
                  draggedKeyRef.current = null;
                  setDraggingKey(null);
                } : undefined}
                className={`h-full w-full min-w-0 ${isReordering ? 'cursor-grab rounded-[9px] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] active:cursor-grabbing' : ''}`}
              >
                <div className={`relative h-full w-full ${isReordering ? 'profile-project-reorder-card rounded-[8px] ring-2 ring-inset ring-[var(--accent-primary)]' : ''}`} style={isReordering ? {
                  animationDelay: `${itemIndex % 5 * -75}ms`,
                  animationDuration: `${620 + itemIndex % 4 * 55}ms`
                } : undefined}>
                  <div className={isReordering ? 'pointer-events-none h-full w-full select-none' : 'h-full w-full'}>
                    {item.content}
                  </div>
                  {isReordering ? <span aria-hidden="true" className="pointer-events-none absolute right-2 top-2 z-30 inline-flex h-7 items-center gap-1 rounded-full bg-[var(--surface-raised)] px-2 text-[10px] font-semibold tabular-nums text-[var(--accent-text)] shadow-[var(--shadow-pop)]">
                      <GripVerticalIcon className="h-3.5 w-3.5" />
                      {itemIndex + 1}
                    </span> : null}
                </div>
              </div>
              </motion.div>;
          })}
        </div>)}
      </div>
    </div>;
}
