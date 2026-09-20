import { useLayoutEffect, type RefObject } from 'react';
import type { Presentation } from '../usePresentation';
import { PORTALINK_SPLASH_EXIT_EVENT } from '../../app/splashLifecycle';

const HEIGHT_PROPERTY = '--mobile-viewport-height';

/** Reconcile Safari's initial/toolbar viewport without waiting for a swipe. */
export function useMobileViewportFrame(presentation: Presentation, frameRef: RefObject<HTMLDivElement>) {
  useLayoutEffect(() => {
    const frame = frameRef.current;
    if (presentation !== 'mobile' || !frame) return;

    const previous = frame.style.getPropertyValue(HEIGHT_PROPERTY);
    const priority = frame.style.getPropertyPriority(HEIGHT_PROPERTY);
    const viewport = window.visualViewport;
    let pendingFrame = 0;
    let keyboardSettleTimer = 0;
    let settledHeight = 0;
    let settledWidth = window.innerWidth;
    let editingSession = false;
    let rotatedWhileEditing = false;

    const isEditing = () => document.activeElement?.matches(
      'input:not([type="button"], [type="submit"], [type="reset"], [type="checkbox"], [type="radio"], [type="range"], [type="color"], [type="file"], [type="hidden"]), textarea, select, [contenteditable]:not([contenteditable="false"])',
    ) ?? false;

    const sync = () => {
      // Pinch zoom changes the visual viewport, not the app's layout size.
      if (viewport && Math.abs(viewport.scale - 1) > 0.01) return;
      let height = viewport?.height || window.innerHeight;
      if (!Number.isFinite(height) || height <= 0) return;
      editingSession ||= isEditing();
      if (editingSession) {
        // Preserve the pre-focus size through every animation frame, not just
        // a large keyboard resize. On rotation use Safari's layout viewport;
        // the smaller visual viewport belongs to keyboard-aware dialogs.
        rotatedWhileEditing ||= settledWidth !== window.innerWidth;
        height = !rotatedWhileEditing && settledHeight
          ? settledHeight : window.innerHeight;
      }
      settledWidth = window.innerWidth;
      settledHeight = height;
      const value = `${Math.round(height * 100) / 100}px`;
      if (frame.style.getPropertyValue(HEIGHT_PROPERTY) !== value) {
        frame.style.setProperty(HEIGHT_PROPERTY, value);
      }
    };
    const schedule = () => {
      window.clearTimeout(keyboardSettleTimer);
      if (editingSession && !isEditing()) {
        // Blur precedes the closing animation. Accept the visible size only
        // once its resize events settle, even if browser chrome also changes.
        keyboardSettleTimer = window.setTimeout(() => {
          editingSession = false;
          rotatedWhileEditing = false;
          sync();
        }, 200);
      }
      if (pendingFrame) return;
      pendingFrame = window.requestAnimationFrame(() => {
        pendingFrame = 0;
        sync();
      });
    };
    const reconcile = () => { sync(); schedule(); };

    reconcile();
    // Safari can finalize its visible area after the splash or BFCache restore.
    window.addEventListener(PORTALINK_SPLASH_EXIT_EVENT, reconcile);
    window.addEventListener('pageshow', reconcile);
    window.addEventListener('resize', schedule);
    window.addEventListener('orientationchange', schedule);
    viewport?.addEventListener('resize', schedule);
    viewport?.addEventListener('scroll', schedule);
    const focus = () => { editingSession ||= isEditing(); schedule(); };
    document.addEventListener('focusin', focus);
    document.addEventListener('focusout', schedule);
    return () => {
      window.cancelAnimationFrame(pendingFrame);
      window.clearTimeout(keyboardSettleTimer);
      window.removeEventListener(PORTALINK_SPLASH_EXIT_EVENT, reconcile);
      window.removeEventListener('pageshow', reconcile);
      window.removeEventListener('resize', schedule);
      window.removeEventListener('orientationchange', schedule);
      viewport?.removeEventListener('resize', schedule);
      viewport?.removeEventListener('scroll', schedule);
      document.removeEventListener('focusin', focus);
      document.removeEventListener('focusout', schedule);
      if (previous) frame.style.setProperty(HEIGHT_PROPERTY, previous, priority);
      else frame.style.removeProperty(HEIGHT_PROPERTY);
    };
  }, [presentation, frameRef]);
}
