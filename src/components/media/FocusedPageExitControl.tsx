import React, { useCallback, useLayoutEffect, useState } from 'react';
import { XIcon } from 'lucide-react';
import { InterfaceIcon } from '../ui/InterfaceIcon';
import { FOCUSED_PAGE_CONTROL_INSET, getFittedPageRect } from '../../utils/focusedPageControls';

const CONTROL_SIZE = 32;

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
    left: FOCUSED_PAGE_CONTROL_INSET,
    top: FOCUSED_PAGE_CONTROL_INSET
  });

  const updatePosition = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;

    const { width, height } = container.getBoundingClientRect();
    if (width <= 0 || height <= 0) return;

    const page = getFittedPageRect(width, height, pageAspectRatio, zoom);
    const maximumLeft = Math.max(FOCUSED_PAGE_CONTROL_INSET, width - CONTROL_SIZE - FOCUSED_PAGE_CONTROL_INSET);
    const maximumTop = Math.max(FOCUSED_PAGE_CONTROL_INSET, height - CONTROL_SIZE - FOCUSED_PAGE_CONTROL_INSET);

    setPosition({
      left: Math.min(maximumLeft, Math.max(FOCUSED_PAGE_CONTROL_INSET, page.left + FOCUSED_PAGE_CONTROL_INSET)),
      top: Math.min(maximumTop, Math.max(FOCUSED_PAGE_CONTROL_INSET, page.top + FOCUSED_PAGE_CONTROL_INSET))
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
