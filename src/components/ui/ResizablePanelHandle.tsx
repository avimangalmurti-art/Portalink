import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

const STORAGE_PREFIX = 'portalink.layout.panel.';
const STORAGE_REVISION_KEY = 'portalink.layout.panel-revision';
const STORAGE_REVISION = 'maximum-defaults-v1';
const RESET_EVENT = 'portalink:reset-panel-widths';

type ResizablePanelOptions = {
  id: string;
  defaultWidth: number;
  minWidth: number;
  maxWidth: number;
  /** Space that must remain for the panel beside this one. */
  viewportReserve: number;
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.round(value)));
}

/**
 * The maximum-width layout is the platform baseline. Clear widths saved by the
 * previous midpoint-default layout once, then continue respecting any widths
 * the viewer deliberately chooses under the new baseline.
 */
function migrateStoredPanelWidths(): void {
  if (typeof window === 'undefined') return;
  if (window.localStorage.getItem(STORAGE_REVISION_KEY) === STORAGE_REVISION) return;
  for (let index = window.localStorage.length - 1; index >= 0; index -= 1) {
    const key = window.localStorage.key(index);
    if (key?.startsWith(STORAGE_PREFIX)) window.localStorage.removeItem(key);
  }
  window.localStorage.setItem(STORAGE_REVISION_KEY, STORAGE_REVISION);
}

function readStoredWidth(key: string, fallback: number, min: number, max: number): number {
  if (typeof window === 'undefined') return fallback;
  migrateStoredPanelWidths();
  const stored = Number(window.localStorage.getItem(key));
  return Number.isFinite(stored) ? clamp(stored, min, max) : fallback;
}

/** Clears every user-sized panel and asks mounted panels to return to defaults. */
export function resetResizablePanelLayout(): void {
  if (typeof window === 'undefined') return;
  for (let index = window.localStorage.length - 1; index >= 0; index -= 1) {
    const key = window.localStorage.key(index);
    if (key?.startsWith(STORAGE_PREFIX)) window.localStorage.removeItem(key);
  }
  window.dispatchEvent(new Event(RESET_EVENT));
}

/**
 * Keeps the user's preferred width separate from the width that currently fits.
 * A narrow window can therefore compress a panel without overwriting the width
 * that returns when the browser has room again.
 */
export function useResizablePanelWidth({
  id,
  defaultWidth,
  minWidth,
  maxWidth,
  viewportReserve
}: ResizablePanelOptions) {
  const storageKey = `${STORAGE_PREFIX}${id}`;
  const [preferredWidth, setPreferredWidth] = useState(() =>
    readStoredWidth(storageKey, defaultWidth, minWidth, maxWidth)
  );
  const [viewportWidth, setViewportWidth] = useState(() =>
    typeof window === 'undefined' ? Number.POSITIVE_INFINITY : window.innerWidth
  );

  useEffect(() => {
    const handleResize = () => setViewportWidth(window.innerWidth);
    const handleReset = () => setPreferredWidth(defaultWidth);
    window.addEventListener('resize', handleResize, { passive: true });
    window.addEventListener(RESET_EVENT, handleReset);
    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener(RESET_EVENT, handleReset);
    };
  }, [defaultWidth]);

  const updateWidth = useCallback((nextWidth: number) => {
    setPreferredWidth(clamp(nextWidth, minWidth, maxWidth));
  }, [maxWidth, minWidth]);

  const commitWidth = useCallback((nextWidth?: number) => {
    const committed = clamp(nextWidth ?? preferredWidth, minWidth, maxWidth);
    setPreferredWidth(committed);
    window.localStorage.setItem(storageKey, String(committed));
  }, [maxWidth, minWidth, preferredWidth, storageKey]);

  const resetWidth = useCallback(() => {
    setPreferredWidth(defaultWidth);
    window.localStorage.removeItem(storageKey);
  }, [defaultWidth, storageKey]);

  const width = useMemo(() => {
    const widthThatFits = Math.max(minWidth, viewportWidth - viewportReserve);
    return Math.min(preferredWidth, maxWidth, widthThatFits);
  }, [maxWidth, minWidth, preferredWidth, viewportReserve, viewportWidth]);

  return { width, preferredWidth, updateWidth, commitWidth, resetWidth };
}

type ResizablePanelHandleProps = {
  side: 'left' | 'right';
  value: number;
  min: number;
  max: number;
  onResize: (width: number) => void;
  onResizeEnd: (width?: number) => void;
  onReset: () => void;
  label: string;
  desktopOnly?: boolean;
};

/** A quiet, keyboard-accessible drag edge shared by every resizable sidebar. */
export function ResizablePanelHandle({
  side,
  value,
  min,
  max,
  onResize,
  onResizeEnd,
  onReset,
  label,
  desktopOnly = false
}: ResizablePanelHandleProps) {
  const dragRef = useRef<{ pointerId: number; startX: number; startWidth: number; latestWidth: number } | null>(null);
  const handleRef = useRef<HTMLDivElement>(null);

  const finishResize = useCallback(() => {
    const drag = dragRef.current;
    if (!drag) return;
    dragRef.current = null;
    handleRef.current?.removeAttribute('data-resizing');
    document.body.style.removeProperty('cursor');
    document.body.style.removeProperty('user-select');
    onResizeEnd(drag.latestWidth);
  }, [onResizeEnd]);

  useEffect(() => () => {
    document.body.style.removeProperty('cursor');
    document.body.style.removeProperty('user-select');
  }, []);

  const direction = side === 'right' ? 1 : -1;

  return <div
    ref={handleRef}
    role="separator"
    aria-label={label}
    aria-orientation="vertical"
    aria-valuemin={min}
    aria-valuemax={max}
    aria-valuenow={Math.round(value)}
    tabIndex={0}
    data-panel-resize-handle=""
    data-side={side}
    data-desktop-only={desktopOnly ? '' : undefined}
    onDoubleClick={onReset}
    onPointerDown={(event) => {
      if (event.button !== 0) return;
      event.preventDefault();
      dragRef.current = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startWidth: value,
        latestWidth: value
      };
      event.currentTarget.setPointerCapture(event.pointerId);
      event.currentTarget.setAttribute('data-resizing', '');
      document.body.style.setProperty('cursor', 'col-resize');
      document.body.style.setProperty('user-select', 'none');
    }}
    onPointerMove={(event) => {
      const drag = dragRef.current;
      if (!drag || drag.pointerId !== event.pointerId) return;
      const nextWidth = clamp(drag.startWidth + (event.clientX - drag.startX) * direction, min, max);
      drag.latestWidth = nextWidth;
      onResize(nextWidth);
    }}
    onPointerUp={(event) => {
      if (dragRef.current?.pointerId !== event.pointerId) return;
      event.currentTarget.releasePointerCapture(event.pointerId);
      finishResize();
    }}
    onPointerCancel={finishResize}
    onLostPointerCapture={finishResize}
    onKeyDown={(event) => {
      let nextWidth: number | null = null;
      if (event.key === 'ArrowRight') nextWidth = value + 12 * direction;
      if (event.key === 'ArrowLeft') nextWidth = value - 12 * direction;
      if (event.key === 'Home') {
        event.preventDefault();
        onReset();
        return;
      }
      if (nextWidth === null) return;
      event.preventDefault();
      const clamped = clamp(nextWidth, min, max);
      onResize(clamped);
      onResizeEnd(clamped);
    }}
  />;
}
