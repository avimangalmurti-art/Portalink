import React, { useMemo } from 'react';
import { useElementSize } from '../../hooks/useElementSize';
import { useContentZoom } from '../../hooks/useContentZoom';
import { ZoomReadout } from '../ui/ZoomReadout';
import { usePresentation } from '../../presentation/usePresentation';
import { WebGalleryControls } from '../../presentation/web/WebGalleryControls';
import { ImageWallRows, WALL_GAP as GAP, type WallItem, type ReorderMode, type WallRow as Row } from './ImageWallLayout';
export type { WallItem } from './ImageWallLayout';

const ReorderableImageWall = React.lazy(() => import('./ReorderableImageWall').then(module => ({ default: module.ReorderableImageWall })));

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

export function JustifiedImageWall({ items, columns, label, onColumnsChange, reorderMode, allowLayoutControls = true, fitColumns }: {
  items: WallItem[];
  /** Exact card count for every complete row. */
  columns: number;
  label: string;
  /** Optional Home-only density bound; never persists its responsive fallback. */
  fitColumns?: (columns:number,width:number)=>number;
  onColumnsChange?: (columns: number) => void;
  reorderMode?: ReorderMode;
  /** Hides layout chrome on public shares while retaining local card zoom. */
  allowLayoutControls?: boolean;
}) {
  const { ref, width } = useElementSize<HTMLDivElement>();
  const isMobile = usePresentation() === 'mobile';
  // Measurement and pinch selection survive loading/entering/exiting reorder.
  const view = useContentZoom<HTMLDivElement>(columns, !reorderMode?.enabled, columns, onColumnsChange, fitColumns ? value => fitColumns(value,width) : undefined);
  const effectiveColumns = view.columns;
  const rows = useMemo(() => {
    if (width === 0) return [];
    const trailingRowHeight = width / effectiveColumns / 0.82;
    return packRows(items, width, effectiveColumns, trailingRowHeight);
  }, [items, width, effectiveColumns]);
  const itemIndexByKey = useMemo(() => new Map(items.map((item, index) => [item.key, index])), [items]);
  const rowProps = { rows, items, itemIndexByKey, reorderMode };
  const canReorder = Boolean(reorderMode?.enabled || reorderMode?.onStart);
  return <div ref={view.ref} className="relative w-full">
    {allowLayoutControls && !isMobile && items.length > 0 && !reorderMode?.enabled && <WebGalleryControls columns={effectiveColumns} onChange={view.chooseColumns} />}
    {allowLayoutControls && <ZoomReadout view={view} />}
    {reorderMode?.enabled ? <p id="profile-project-reorder-instructions" className="sr-only">{isMobile ? 'Swipe to scroll. Hold a project briefly, then drag to move it. Hold near the top or bottom edge to scroll while dragging. ' : ''}Drag a project card toward the space where it belongs and the nearby cards will make room. For keyboard reordering, press Space, use the arrow keys, and press Space again; Alt plus an arrow also moves one position.</p> : null}
    <div ref={ref} role="list" aria-label={label} data-profile-wall-columns={effectiveColumns} className="w-full">
      {canReorder ? <React.Suspense fallback={<ImageWallRows {...rowProps} />}>
        <ReorderableImageWall {...rowProps} />
      </React.Suspense> : <ImageWallRows {...rowProps} />}
    </div>
  </div>;
}
