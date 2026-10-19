import { useEffect, type RefObject } from 'react';

const editableSelector = 'input:not([type="button"], [type="submit"], [type="reset"], [type="checkbox"], [type="radio"], [type="range"], [type="color"], [type="file"], [type="hidden"]):not([readonly]):not(:disabled), textarea:not([readonly]):not(:disabled), [contenteditable="true"]';

/** Keep typing inside this authoring screen's own scroll area after it resizes. */
export function useAuthoringFocus(frameRef: RefObject<HTMLElement>, enabled = true): void {
  useEffect(() => {
    const frame = frameRef.current;
    if (!enabled || !frame) return;
    const viewport = window.visualViewport;
    let pending: number | null = null;
    const reveal = () => {
      pending = null;
      if (viewport && Math.abs(viewport.scale - 1) > 0.01) return;
      const active = document.activeElement;
      if (!(active instanceof HTMLElement) || !frame.contains(active) || !active.matches(editableSelector)) return;
      const scroller = active.closest<HTMLElement>('.mobile-publish-body, #project-editor-form');
      if (!scroller || !frame.contains(scroller)) return;
      const fieldBounds = active.getBoundingClientRect();
      const scrollBounds = scroller.getBoundingClientRect();
      const frameBounds = frame.getBoundingClientRect();
      if (fieldBounds.height <= 0 || scroller.clientHeight <= 0) return;
      const screenTop = viewport?.offsetTop ?? 0;
      const screenBottom = screenTop + (viewport?.height ?? window.innerHeight);
      const top = Math.max(scrollBounds.top + scroller.clientTop, frameBounds.top, screenTop) + 8;
      const bottom = Math.min(scrollBounds.top + scroller.clientTop + scroller.clientHeight, frameBounds.bottom, screenBottom) - 8;
      if (bottom <= top) return;
      // A tall textarea should start in view rather than scroll its first line
      // above the screen merely to expose its lower border.
      const delta = fieldBounds.height > bottom - top || fieldBounds.top < top
        ? fieldBounds.top - top
        : fieldBounds.bottom > bottom ? fieldBounds.bottom - bottom : 0;
      const limit = Math.max(0, scroller.scrollHeight - scroller.clientHeight);
      const next = Math.max(0, Math.min(limit, scroller.scrollTop + delta));
      if (next !== scroller.scrollTop) scroller.scrollTop = next;
    };
    const schedule = () => {
      if (pending !== null) cancelAnimationFrame(pending);
      // useDialogViewport updates the frame's CSS properties in the event;
      // measure the resulting layout in the following animation frame.
      pending = requestAnimationFrame(reveal);
    };
    schedule();
    viewport?.addEventListener('resize', schedule);
    viewport?.addEventListener('scroll', schedule);
    window.addEventListener('resize', schedule);
    frame.addEventListener('focusin', schedule);
    return () => {
      if (pending !== null) cancelAnimationFrame(pending);
      viewport?.removeEventListener('resize', schedule);
      viewport?.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
      frame.removeEventListener('focusin', schedule);
    };
  }, [enabled, frameRef]);
}
