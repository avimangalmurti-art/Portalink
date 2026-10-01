import { useLayoutEffect, type RefObject } from 'react';
import type { Presentation } from '../usePresentation';
import { PORTALINK_SPLASH_EXIT_EVENT } from '../../app/splashLifecycle';

const HEIGHT_PROPERTY = '--mobile-viewport-height';
const DOCK_HEIGHT_PROPERTY = '--mobile-dock-viewport-height';

/** Measure bounded overlays/readers only. The mobile page itself scrolls in the
 * document and must never use this value as its root height or clipping box.
 * Installed apps measure only the dock's visible bottom edge; the public page
 * and other installed overlays retain their existing CSS sizing.
 */
export function useMobileViewportFrame(presentation: Presentation, frameRef: RefObject<HTMLDivElement>) {
  useLayoutEffect(() => {
    const frame = frameRef.current;
    if (presentation !== 'mobile' || !frame) return;

    const standalone = window.matchMedia?.('(display-mode: standalone)').matches
      || (window.navigator as Navigator & { standalone?: boolean })?.standalone;
    const heightProperty = standalone ? DOCK_HEIGHT_PROPERTY : HEIGHT_PROPERTY;

    const previous = frame.style.getPropertyValue(heightProperty);
    const priority = frame.style.getPropertyPriority(heightProperty);
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
      if (standalone) {
        // 100vh may extend below the drawable app area during launch/resume.
        // Bound only the controls, in layout-viewport coordinates. A panned
        // visual viewport contributes its origin, never the document scroll.
        const offset = viewport?.offsetTop;
        height += typeof offset === 'number' && Number.isFinite(offset) && offset > 0 ? offset : 0;
        if (Number.isFinite(window.innerHeight) && window.innerHeight > 0) {
          height = Math.min(height, window.innerHeight);
        }
      }
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
      if (frame.style.getPropertyValue(heightProperty) !== value) {
        frame.style.setProperty(heightProperty, value);
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
      if (previous) frame.style.setProperty(heightProperty, previous, priority);
      else frame.style.removeProperty(heightProperty);
    };
  }, [presentation, frameRef]);
}
