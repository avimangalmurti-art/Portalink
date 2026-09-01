/** Controls begin on the artwork's true left edge while remaining fully inside it. */
export const FOCUSED_PAGE_CONTROL_INSET = 0;

export type FittedPageRect = {
  left: number;
  top: number;
  width: number;
  height: number;
};

/**
 * Resolves the visible artwork rectangle inside an object-contain surface.
 * Focused controls share this geometry so the close and engagement controls
 * land on the exact same left edge instead of drifting toward the centre.
 */
export function getFittedPageRect(
  containerWidth: number,
  containerHeight: number,
  pageAspectRatio: number,
  zoom = 1
): FittedPageRect {
  const safeAspectRatio = Number.isFinite(pageAspectRatio) && pageAspectRatio > 0
    ? pageAspectRatio
    : 1;
  const safeZoom = Number.isFinite(zoom) ? Math.max(1, zoom) : 1;
  const containerAspectRatio = containerWidth / containerHeight;
  const fittedWidth = containerAspectRatio > safeAspectRatio
    ? containerHeight * safeAspectRatio
    : containerWidth;
  const fittedHeight = containerAspectRatio > safeAspectRatio
    ? containerHeight
    : containerWidth / safeAspectRatio;
  const width = fittedWidth * safeZoom;
  const height = fittedHeight * safeZoom;

  return {
    left: Math.max(0, (containerWidth - width) / 2),
    top: Math.max(0, (containerHeight - height) / 2),
    width,
    height
  };
}
