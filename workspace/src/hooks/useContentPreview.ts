import { useEffect, useRef, useState } from 'react';
import type { MouseEvent, PointerEvent } from 'react';

/** Touch previews are armed by a completed tap, never by focus or a scroll. */
export function useContentPreview(disabled = false) {
  const ref = useRef<HTMLElement>(null);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [pinned, setPinned] = useState(false);
  const pinnedRef = useRef(false);
  const pointer = useRef<{ x: number; y: number; moved: boolean } | null>(null);
  const touchClick = useRef<'tap' | 'cancelled' | null>(null);
  const expanded = !disabled && (hovered || focused || pinned);

  const close = () => {
    pinnedRef.current = false;
    setPinned(false);
    setHovered(false);
    setFocused(false);
  };
  useEffect(() => {
    if (!pinned && !focused) return;
    const outside = (event: globalThis.PointerEvent) => {
      if (!ref.current?.contains(event.target as Node)) close();
    };
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, [pinned, focused]);
  useEffect(() => { if (disabled) close(); }, [disabled]);

  const open = (event: MouseEvent<HTMLElement>, action: () => void) => {
    if (disabled) return;
    if (touchClick.current === 'cancelled') {
      event.preventDefault();
      event.stopPropagation();
    } else if (touchClick.current === 'tap' && !pinnedRef.current) {
      event.preventDefault();
      event.stopPropagation();
      pinnedRef.current = true;
      setPinned(true);
    } else action();
    touchClick.current = null;
  };
  return {
    ref, expanded, open,
    events: {
      onPointerLeave: (event: PointerEvent<HTMLElement>) => {
        if (event.pointerType === 'mouse') setHovered(false);
      },
      onPointerDownCapture: (event: PointerEvent<HTMLElement>) => {
        touchClick.current = null;
        pointer.current = event.pointerType === 'touch' ? { x: event.clientX, y: event.clientY, moved: false } : null;
      },
      onPointerMoveCapture: (event: PointerEvent<HTMLElement>) => {
        // A neighbor can slide under a stationary pointer as another preview
        // closes. Only actual pointer movement should open that new card.
        if (event.pointerType === 'mouse') setHovered(true);
        if (pointer.current && Math.hypot(event.clientX - pointer.current.x, event.clientY - pointer.current.y) > 8) pointer.current.moved = true;
      },
      onPointerUpCapture: () => {
        touchClick.current = pointer.current ? pointer.current.moved ? 'cancelled' : 'tap' : touchClick.current;
        pointer.current = null;
      },
      onPointerCancel: () => { pointer.current = null; touchClick.current = 'cancelled'; },
      onFocusCapture: (event: React.FocusEvent<HTMLElement>) => {
        if (event.target.matches(':focus-visible')) setFocused(true);
      },
      onBlurCapture: (event: React.FocusEvent<HTMLElement>) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node)) setFocused(false);
      },
      onKeyDown: (event: React.KeyboardEvent<HTMLElement>) => {
        if (event.key === 'Enter' || event.key === ' ') touchClick.current = null;
        if (event.key === 'Escape' && !disabled && !event.defaultPrevented) {
          ref.current?.querySelector<HTMLButtonElement>('[data-preview-open]')?.focus({ preventScroll: true });
          close();
        }
      },
    },
  };
}
