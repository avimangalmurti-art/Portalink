import { useEffect } from 'react';

/** Suppress browser menus without consuming the app's own hold/reorder gestures. */
export function useMobileSelectionBoundary(presentation: 'mobile' | 'web') {
  useEffect(() => {
    if (presentation !== 'mobile') return;
    const mobileTarget = (event: Event) => {
      const target = event.target;
      return target instanceof Element && target.closest('[data-presentation="mobile"]') ? target : null;
    };
    const contextMenu = (event: Event) => {
      const target = mobileTarget(event);
      if (!target) return;
      // Read the same CSS policy that enables descriptions and text fields.
      if (!target.closest('img, picture, video, canvas, svg') && getComputedStyle(target).userSelect === 'text') return;
      if (event.cancelable) event.preventDefault();
    };
    const drag = (event: Event) => {
      if (mobileTarget(event)?.closest('img, picture, video, canvas, svg') && event.cancelable) event.preventDefault();
    };
    document.addEventListener('contextmenu', contextMenu, true);
    document.addEventListener('dragstart', drag, true);
    return () => {
      document.removeEventListener('contextmenu', contextMenu, true);
      document.removeEventListener('dragstart', drag, true);
    };
  }, [presentation]);
}
