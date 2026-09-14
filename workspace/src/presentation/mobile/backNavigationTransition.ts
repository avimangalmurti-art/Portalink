/**
 * Mobile Back animation marker.
 *
 * Mobile profile destinations deliberately share one screen layer, so a Back
 * navigation replaces the workspace in place and `useScreenTransition` sees no
 * key change. Marking the viewport lets the arriving screen animate without
 * giving navigation a second state machine or remounting the workspace.
 */
const BACK_NAVIGATION_ATTRIBUTE = 'data-mobile-back-navigation';
const BACK_NAVIGATION_MS = 300;

let clearTimer = 0;

export function markMobileBackNavigation(): void {
  if (typeof document === 'undefined') return;
  const viewport = document.getElementById('app-viewport');
  if (!viewport) return;
  window.clearTimeout(clearTimer);
  // Restart the animation when Back runs again before the first one settles.
  viewport.removeAttribute(BACK_NAVIGATION_ATTRIBUTE);
  void viewport.offsetWidth;
  viewport.setAttribute(BACK_NAVIGATION_ATTRIBUTE, '');
  clearTimer = window.setTimeout(() => {
    viewport.removeAttribute(BACK_NAVIGATION_ATTRIBUTE);
  }, BACK_NAVIGATION_MS);
}
