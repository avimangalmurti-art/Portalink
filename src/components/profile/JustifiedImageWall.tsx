import React, { useMemo } from 'react';
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
  label







}: {items: WallItem[]; /** Exact card count for every complete row. */columns: number;label: string;}) {
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
      <div ref={ref} role="list" aria-label={label} data-profile-wall-columns={effectiveColumns} className="w-full">
      {rows.map((row, rowIndex) => <div key={row.items[0]?.key ?? rowIndex} className="flex w-full" style={{
        gap: GAP,
        marginBottom: rowIndex === rows.length - 1 ? 0 : GAP
      }}>
          {/* Basis carries the computed width; grow and shrink absorb the
             sub-pixel remainder so the row lands exactly on both edges. */}
          {row.items.map((item) => <div key={item.key} className="min-w-0" style={{
          flex: row.justified ? `1 1 ${item.width}px` : `0 0 ${item.width}px`,
          height: row.height
        }}>
              {item.content}
            </div>)}
        </div>)}
      </div>
    </div>;
}
