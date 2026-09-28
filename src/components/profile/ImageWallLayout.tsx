import React from 'react';

export const WALL_GAP = 4;
export type WallItem = {
  key: string;
  /** width / height. The frame's own proportion — never modified here. */
  ratio: number;
  content: React.ReactNode;
};
export type ReorderMode = {
  enabled: boolean;
  disabled?: boolean;
  onStart?: () => void;
  onMove: (sourceKey: string, targetKey: string) => void;
  onMoveByOffset: (key: string, offset: -1 | 1) => void;
};
export type WallRow = {
  items: (WallItem & { width: number })[];
  height: number;
  justified: boolean;
};
export type ImageWallCardProps = {
  item: WallRow['items'][number] & { height: number };
  itemIndex: number;
  itemCount: number;
  rowJustified: boolean;
  isReordering: boolean;
  isDisabled: boolean;
  shouldReduceMotion: boolean;
  reorderMode?: ReorderMode;
};
export type ImageWallRowsProps = {
  rows: WallRow[];
  items: WallItem[];
  itemIndexByKey: Map<string, number>;
  reorderMode?: ReorderMode;
};

/** Keep the browsing frames identical to a stationary sortable card. */
function StaticWallCard({ item, rowJustified }: ImageWallCardProps) {
  return <div role="listitem" data-project-preview-cell="" className="min-w-0" style={{
    flex: rowJustified ? `1 1 ${item.width}px` : `0 0 ${item.width}px`,
    '--project-cover-height': `${item.height}px`,
    alignSelf: 'flex-start',
  } as React.CSSProperties}>
    <div className="w-full min-w-0"><div className="relative w-full"><div className="w-full">{item.content}</div></div></div>
  </div>;
}

/** Shared row geometry for plain browsing, lazy fallback and active ordering. */
export function ImageWallRows({ rows, items, itemIndexByKey, reorderMode, Card = StaticWallCard, shouldReduceMotion = false }: ImageWallRowsProps & {
  Card?: React.ComponentType<ImageWallCardProps>;
  shouldReduceMotion?: boolean;
}) {
  return <>{rows.map((row, rowIndex) => <div key={row.items[0]?.key ?? rowIndex} className="flex w-full" style={{
    gap: WALL_GAP,
    marginBottom: rowIndex === rows.length - 1 ? 0 : WALL_GAP,
  }}>
    {row.items.map(item => <Card key={item.key} item={{ ...item, height: row.height }}
      itemIndex={itemIndexByKey.get(item.key) ?? 0} itemCount={items.length} rowJustified={row.justified}
      isReordering={Boolean(reorderMode?.enabled)} isDisabled={Boolean(reorderMode?.disabled)}
      shouldReduceMotion={shouldReduceMotion} reorderMode={reorderMode} />)}
  </div>)}</>;
}
