import { positionAnchoredMenu } from '../../utils/anchoredMenu';

/** Keep comments at reading size, independent of the page thumbnail's scale. */
export function positionMediaComments(
  anchor: { left: number; top: number; bottom: number },
  height: number,
  viewport: { width: number; height: number; offsetLeft?: number; offsetTop?: number },
) {
  const { offsetLeft = 0, offsetTop = 0 } = viewport;
  const width = Math.min(320, Math.max(0, viewport.width - 16));
  const position = positionAnchoredMenu({
    right: anchor.left - offsetLeft + width,
    top: anchor.top - offsetTop,
    bottom: anchor.bottom - offsetTop,
  }, width, height, viewport.width, viewport.height, 'above');
  return { ...position, left: position.left + offsetLeft, top: position.top + offsetTop, width };
}
