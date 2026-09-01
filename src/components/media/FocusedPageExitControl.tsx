import React, { useCallback, useLayoutEffect, useState } from 'react';
import { XIcon } from 'lucide-react';
import { InterfaceIcon } from '../ui/InterfaceIcon';

const CONTROL_SIZE = 32;
const PAGE_INSET = 8;

type ControlPosition = {
  left: number;
  top: number;
};

/**
 * Places the focused-page exit action inside the visible page artwork rather
 * than at the edge of the surrounding viewer. Object-contain can leave a grey
 * gutter around portrait or landscape work, so a fixed `left` value is not the
 * page's left edge. This derives the contained artwork rectangle from its
 * aspect ratio and follows it through rail, viewport, and zoom changes.
 */
export function FocusedPageExitControl({
  containerRef,
  pageAspectRatio,
  zoom = 1,
  onExit,
  label = 'Exit single-page view'
}: {
  containerRef: React.RefObject<HTMLElement | null>;
  pageAspectRatio: number;
  zoom?: number;
  onExit: () => void;
  label?: string;
}) {
  const [position, setPosition] = useState<ControlPosition>({
    left: PAGE_INSET,
    top: PAGE_INSET
  });

  const updatePosition = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;

    const { width, height } = container.getBoundingClientRect();
    if (width <= 0 || height <= 0) return;

    const safeAspectRatio = Number.isFinite(pageAspectRatio) && pageAspectRatio > 0
      ? pageAspectRatio
      : 1;
    const safeZoom = Number.isFinite(zoom) ? Math.max(1, zoom) : 1;
    const containerAspectRatio = width / height;
    const fittedWidth = containerAspectRatio > safeAspectRatio
      ? height * safeAspectRatio
      : width;
    const fittedHeight = containerAspectRatio > safeAspectRatio
      ? height
      : width / safeAspectRatio;
    const pageLeft = Math.max(0, (width - fittedWidth * safeZoom) / 2);
    const pageTop = Math.max(0, (height - fittedHeight * safeZoom) / 2);
    const maximumLeft = Math.max(PAGE_INSET, width - CONTROL_SIZE - PAGE_INSET);
    const maximumTop = Math.max(PAGE_INSET, height - CONTROL_SIZE - PAGE_INSET);

    setPosition({
      left: Math.min(maximumLeft, Math.max(PAGE_INSET, pageLeft + PAGE_INSET)),
      top: Math.min(maximumTop, Math.max(PAGE_INSET, pageTop + PAGE_INSET))
    });
  }, [containerRef, pageAspectRatio, zoom]);

  useLayoutEffect(() => {
    updatePosition();
    const container = containerRef.current;
    if (!container) return undefined;

    const observer = typeof ResizeObserver === 'undefined'
      ? null
      : new ResizeObserver(updatePosition);
    observer?.observe(container);
    window.addEventListener('resize', updatePosition, { passive: true });
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', updatePosition);
    };
  }, [containerRef, updatePosition]);

  return <button
    type="button"
    onClick={onExit}
    aria-label={label}
    className="premium-viewer-exit-control absolute z-50 flex h-8 w-8 items-center justify-center rounded-full text-white"
    style={position}
  >
      <InterfaceIcon icon={XIcon} size="lg" weight="medium" />
    </button>;
}
