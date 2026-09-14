/**
 * Mobile Back transition signal.
 *
 * Mobile profile destinations deliberately share one screen layer, so a Back
 * navigation would otherwise replace the workspace in place with no transition
 * at all. Marking the viewport lets the arriving screen animate, and the
 * subscribable mark lets `AppScreenLayers` keep the leaving workspace mounted
 * for exactly one transition so it can move off-screen behind it.
 *
 * This is a transient presentation signal. It never changes routing, history,
 * or which screen is authoritative.
 */
const BACK_NAVIGATION_ATTRIBUTE = 'data-mobile-back-navigation';
const BACK_NAVIGATION_MS = 300;
/**
 * A Back gesture's navigation lands in the same task as the mark. A later
 * screen change is ordinary navigation, so the mark expires instead of being
 * consumed; a missed mark costs the animation, never correct navigation.
 */
const BACK_NAVIGATION_FRESH_MS = 120;

let clearTimer = 0;
let markedAt = 0;
const listeners = new Set<() => void>();

export function markMobileBackNavigation(): void {
  markedAt = Date.now();
  listeners.forEach((listener) => listener());
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

export function subscribeMobileBackNavigation(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getMobileBackNavigationMark(): number {
  return markedAt;
}

/** Server rendering and tests without a clock never report a Back in flight. */
export function getServerMobileBackNavigationMark(): number {
  return 0;
}

export function isMobileBackNavigationFresh(mark: number): boolean {
  return mark > 0 && Date.now() - mark < BACK_NAVIGATION_FRESH_MS;
}
