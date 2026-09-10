import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useElementSize } from '../../hooks/useElementSize';
import { useContentZoom } from '../../hooks/useContentZoom';
import { ZoomReadout } from '../ui/ZoomReadout';

/**
 * The packing layer for the discovery feed.
 *
 * It owns ONE thing: where a cell sits and how many columns it occupies. It does
 * not know what a project is, never fetches anything, and never reads or writes
 * a project record — every cell arrives as an already-rendered node with a pure
 * function describing its width at a given column count.
 *
 * Why not multi-column: CSS columns pack beautifully but cannot give an item a
 * horizontal span, so a landscape piece can never be wider than a portrait one.
 * A grid can, but a plain grid forces a row's items to share a row height, which
 * either stretches cards or leaves holes under short ones. So the grid is laid
 * out on a fine row unit and each cell claims as many of those rows as its own
 * content actually needs — true masonry with controllable spans, and no card is
 * ever stretched to match a neighbour.
 *
 * DOM order is feed order, always. Nothing is reordered to fill a visual hole,
 * so reading order and keyboard order stay coherent with the stream.
 */

/** The gutter, on both axes. Tight enough to read as a wall rather than tiles. */
const GAP = 4;
/** The row quantum. Small enough that a card's real height rounds invisibly. */
const ROW_UNIT = 4;
export type BentoCellItem = {
  key: string;
  /**
   * How many columns this cell occupies. A pure function of the resolved column
   * count, so the same input always produces the same layout — no randomness and
   * no per-item exceptions.
   */
  span: (columns: number) => number;
  content: React.ReactNode;
};

/**
 * Column count from the container's own width rather than the viewport's, so the
 * feed is correct in either sidebar state without knowing the sidebar exists.
 */
/* Six across wherever the width can carry it, stepping down only when a piece
   would fall below a readable width. */
function resolveColumns(width: number): number {
  if (width < 300) {
    return 1;
  }
  if (width < 460) {
    return 2;
  }
  if (width < 620) {
    return 3;
  }
  if (width < 780) {
    return 4;
  }
  if (width < 940) {
    return 5;
  }
  if (width < 1180) {
    return 6;
  }
  // Wider displays gain columns rather than inflating every piece, so the extra
  // width carries more work instead of more empty margin.
  if (width < 1420) {
    return 7;
  }
  return 8;
}
export function BentoFeedGrid({
  items


}: {items: BentoCellItem[];}) {
  const {
    ref,
    width
  } = useElementSize<HTMLDivElement>();
  /*
   * The viewer's reading size, applied ON TOP of the width-derived column count.
   * Spans and ratios are untouched: a landscape piece is still twice a portrait
   * one at every zoom, so the composition scales rather than being re-authored.
   */
  const view = useContentZoom<HTMLDivElement>();
  const columns = view.scaleColumns(width === 0 ? 2 : resolveColumns(width));
  /*
   * Without ResizeObserver a cell cannot know its own height, so the fine row
   * unit would leave content overlapping. The fallback is a plain auto-row grid
   * aligned to the top: the spans and the ratios still hold and nothing is
   * stretched — only the tight vertical packing is lost.
   */
  const canPack = typeof ResizeObserver !== 'undefined';
  return <div ref={view.ref} className="relative w-full">
      <ZoomReadout view={view} />
      <div ref={ref} style={{
      display: 'grid',
      gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
      columnGap: GAP,
      /*
       * Dense flow lets a compact single-column cell drop back into a gap a wider
       * neighbour left open, which is what closes the holes that varied artwork
       * heights create. Only small cells move, and only backwards into space that
       * is already on screen, so the reading order stays essentially the feed's.
       */
      gridAutoFlow: 'row dense',
      ...(canPack ? {
        gridAutoRows: `${ROW_UNIT}px`,
        rowGap: 0
      } : {
        gridAutoRows: 'minmax(0, auto)',
        rowGap: GAP,
        alignItems: 'start'
      })
    }}>
      {items.map((item) => <BentoCell key={item.key} span={Math.max(1, Math.min(item.span(columns), columns))} canPack={canPack}>
          {item.content}
        </BentoCell>)}
      </div>
    </div>;
}
function BentoCell({
  span,
  canPack,
  children




}: {span: number;canPack: boolean;children: React.ReactNode;}) {
  const contentRef = useRef<HTMLDivElement>(null);
  // Transient presentation state only: measured, never persisted, never written
  // back to a project.
  const [height, setHeight] = useState(0);
  // Measured before paint, so a cell never renders at the wrong span even for a
  // frame. Media that loads later is picked up by the observer below.
  useLayoutEffect(() => {
    const element = contentRef.current;
    if (element) {
      setHeight(element.getBoundingClientRect().height);
    }
  }, [span]);
  useEffect(() => {
    const element = contentRef.current;
    if (!element || typeof ResizeObserver === 'undefined') {
      return undefined;
    }
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) {
        return;
      }
      const next = entry.borderBoxSize?.[0]?.blockSize ?? entry.contentRect.height;
      setHeight((current) => Math.abs(current - next) < 0.5 ? current : next);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  // The gutter is claimed as part of the span, which is why the grid itself runs
  // no row gap: a cell owns its own trailing space.
  const rows = canPack && height > 0 ? Math.ceil((height + GAP) / ROW_UNIT) : null;
  return <div className="min-w-0" style={{
    gridColumn: `span ${span}`,
    ...(rows ? {
      gridRow: `span ${rows}`
    } : {})
  }}>
      <div ref={contentRef} className="min-w-0">{children}</div>
    </div>;
}
