/**
 * Mobile screen transition signal.
 *
 * Mobile profile destinations deliberately share one screen layer, so moving
 * between them would otherwise replace the workspace in place with no
 * transition at all. A direction mark lets `AppScreenLayers` keep the leaving
 * workspace mounted for exactly one transition, and tells the stylesheet which
 * way the two screens travel.
 *
 * This is a transient presentation signal. It never changes routing, history,
 * or which screen is authoritative, and an unmarked navigation keeps the
 * existing single-workspace behavior.
 */
export type MobileScreenDirection = 'back' | 'forward';

const DIRECTION_ATTRIBUTE = 'data-mobile-screen-navigation';
const DIRECTION_HOLD_MS = 300;
/**
 * A marked navigation lands in the same task as its mark. A later screen change
 * is ordinary navigation, so the mark expires rather than being consumed; a
 * missed mark costs the transition, never correct navigation.
 */
const DIRECTION_FRESH_MS = 120;

let clearTimer = 0;
let markedAt = 0;
const listeners = new Set<() => void>();

function markDirection(direction: MobileScreenDirection): void {
  markedAt = Date.now();
  listeners.forEach((listener) => listener());
  if (typeof document === 'undefined') return;
  const viewport = document.getElementById('app-viewport');
  if (!viewport) return;
  window.clearTimeout(clearTimer);
  // Restart the transition when a second move begins before the first settles.
  viewport.removeAttribute(DIRECTION_ATTRIBUTE);
  void viewport.offsetWidth;
  viewport.setAttribute(DIRECTION_ATTRIBUTE, direction);
  clearTimer = window.setTimeout(() => {
    viewport.removeAttribute(DIRECTION_ATTRIBUTE);
  }, DIRECTION_HOLD_MS);
}

/** Returning to the previous screen: it arrives from the left. */
export function markMobileBackNavigation(): void {
  markDirection('back');
}

/** Moving deeper into the workspace: the new screen arrives from the right. */
export function markMobileForwardNavigation(): void {
  markDirection('forward');
}

export function subscribeMobileScreenNavigation(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getMobileScreenNavigationMark(): number {
  return markedAt;
}

/** Server rendering and tests without a clock never report a move in flight. */
export function getServerMobileScreenNavigationMark(): number {
  return 0;
}

export function isMobileScreenNavigationFresh(markedTime: number): boolean {
  return markedTime > 0 && Date.now() - markedTime < DIRECTION_FRESH_MS;
}
