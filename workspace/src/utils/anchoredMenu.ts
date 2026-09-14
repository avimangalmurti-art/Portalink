/** Existing menus keep an 8px viewport gutter and prefer below their trigger. */
export function positionAnchoredMenu(anchor: { right: number; top: number; bottom: number }, width: number, height: number, viewportWidth: number, viewportHeight: number, preferredSide: 'below' | 'above' = 'below') {
  const gutter = 8;
  const gap = 6;
  const maxHeight = Math.max(0, viewportHeight - gutter * 2);
  const panelHeight = Math.min(height, maxHeight);
  const panelWidth = Math.min(width, Math.max(0, viewportWidth - gutter * 2));
  const below = anchor.bottom + gap;
  const above = anchor.top - gap - panelHeight;
  const top = preferredSide === 'above' && above >= gutter
    ? above
    : below + panelHeight <= viewportHeight - gutter ? below : above;
  return {
    left: Math.max(gutter, Math.min(anchor.right - panelWidth, viewportWidth - panelWidth - gutter)),
    top: Math.max(gutter, Math.min(top, viewportHeight - panelHeight - gutter)),
    maxHeight,
  };
}
