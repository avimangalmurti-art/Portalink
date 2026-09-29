import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { layoutBento, type BentoPosition } from '../../utils/bentoLayout';
import { useElementSize } from '../../hooks/useElementSize';
import { useContentZoom } from '../../hooks/useContentZoom';
import { ZoomReadout } from '../ui/ZoomReadout';
import { WebGalleryControls } from '../../presentation/web/WebGalleryControls';
import { usePresentation } from '../../presentation/usePresentation';

/**
 * The packing layer for the discovery feed.
 *
 * It owns where a cell sits, never fetches or writes a project record, and
 * receives every cell as an already-rendered node. Each project occupies one
 * column so zoom always enlarges or reduces all covers in the same direction.
 *
 * A plain grid forces a row's items to share a row height, which
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
  items,
  columns: savedColumns,
  onColumnsChange


}: {items: BentoCellItem[]; columns?: number; onColumnsChange?: (columns: number) => void;}) {
  const isWeb = usePresentation() === 'web';
  const {
    ref,
    width
  } = useElementSize<HTMLDivElement>();
  const view = useContentZoom<HTMLDivElement>(savedColumns ?? (width === 0 ? 2 : resolveColumns(width)), true, savedColumns, onColumnsChange);
  const columns = view.columns;
  /*
   * Without ResizeObserver a cell cannot know its own height, so the fine row
   * unit would leave content overlapping. The fallback is a plain auto-row grid
   * aligned to the top: the spans and the ratios still hold and nothing is
   * stretched — only the tight vertical packing is lost.
   */
  const canPack = typeof ResizeObserver !== 'undefined';
  const [measurements, setMeasurements] = useState<Record<string, { height: number; base: number }>>({});
  const measure = useCallback((key: string, height: number, base: number) => {
    setMeasurements((current) => current[key] && Math.abs(current[key].height - height) < 0.5 && Math.abs(current[key].base - base) < 0.5
      ? current : { ...current, [key]: { height, base } });
  }, []);
  const positions = canPack && items.every((item) => measurements[item.key]) ? layoutBento(items.map((item) => ({
    key: item.key,
    span: 1,
    baseRows: Math.ceil((measurements[item.key].base + GAP) / ROW_UNIT),
    rows: Math.ceil((measurements[item.key].height + GAP) / ROW_UNIT),
  })), columns) : null;
  return <div ref={view.ref} className="relative w-full">
      {isWeb && items.length > 0 && <WebGalleryControls columns={columns} onChange={view.chooseColumns} />}
      <ZoomReadout view={view} />
      <div ref={ref} data-project-grid-columns={columns} style={{
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
      {items.map((item) => <BentoCell key={item.key} cellKey={item.key} span={1} canPack={canPack} position={positions?.get(item.key)} onMeasure={measure}>
          {item.content}
        </BentoCell>)}
      </div>
    </div>;
}
function BentoCell({
  cellKey,
  position,
  onMeasure,
  span,
  canPack,
  children




}: {cellKey: string; position?: BentoPosition; onMeasure: (key: string, height: number, base: number) => void; span: number;canPack: boolean;children: React.ReactNode;}) {
  const contentRef = useRef<HTMLDivElement>(null);
  const reduceMotion = useReducedMotion();
  // Transient presentation state only: measured, never persisted, never written
  // back to a project.
  const [height, setHeight] = useState(0);
  // Measured before paint, so a cell never renders at the wrong span even for a
  // frame. Media that loads later is picked up by the observer below.
  useLayoutEffect(() => {
    const element = contentRef.current;
    if (element) {
      setHeight(element.getBoundingClientRect().height);
      onMeasure(cellKey, element.getBoundingClientRect().height, element.querySelector('[data-packing-base]')?.getBoundingClientRect().height ?? element.getBoundingClientRect().height);
    }
  }, [span, cellKey, onMeasure]);
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
      onMeasure(cellKey, next, element.querySelector('[data-packing-base]')?.getBoundingClientRect().height ?? next);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [cellKey, onMeasure]);
  // The gutter is claimed as part of the span, which is why the grid itself runs
  // no row gap: a cell owns its own trailing space.
  const rows = canPack && height > 0 ? Math.ceil((height + GAP) / ROW_UNIT) : null;
  return <motion.div data-project-preview-cell="" layout={reduceMotion ? false : 'position'} transition={{ layout: { duration: 0.18, ease: [0.2, 0.8, 0.2, 1] } }} className="min-w-0 self-start" style={{
    gridColumn: position ? `${position.column + 1} / span ${span}` : `span ${span}`,
    ...(position ? { gridRow: `${position.row + 1} / span ${position.rows}` } : rows ? {
      gridRow: `span ${rows}`
    } : {})
  }}>
      <div ref={contentRef} className="min-w-0">{children}</div>
    </motion.div>;
}
