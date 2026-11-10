type Edges = { left: number; right: number; top: number; bottom: number };

// Three 44px reaction targets, two 6px gaps, and 8px padding on each side.
const MIN_REACTION_ROW_WIDTH = 160;

export function positionMessageContext({ anchor, bounds, stackHeight, previewOffset, isMine }: {
  anchor: Edges;
  bounds: Edges;
  stackHeight: number;
  previewOffset: number;
  isMine: boolean;
}) {
  const maxTop = Math.max(0, bounds.bottom - bounds.top - stackHeight);
  const top = Math.max(0, Math.min(anchor.top - bounds.top - previewOffset, maxTop));
  const maxInset = Math.max(0, bounds.right - bounds.left - MIN_REACTION_ROW_WIDTH);
  const leftInset = Math.max(0, anchor.left - bounds.left);
  const rightInset = Math.max(0, bounds.right - anchor.right);

  return {
    top,
    leftInset: isMine ? leftInset : Math.min(leftInset, maxInset),
    rightInset: isMine ? Math.min(rightInset, maxInset) : rightInset,
  };
}
