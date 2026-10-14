import { motionMs, motionEase, interruptNavigationMotion } from '../motion/motion';

export function preparePullSurface(surface: HTMLElement) {
  interruptNavigationMotion();
  const frame = surface.closest<HTMLElement>('.app-screen-layer');
  if (!frame) return { surface, restore: () => undefined };
  const offsets: Array<[HTMLElement, number, number]> = [];
  const ancestors = new Set<HTMLElement>();
  for (let parent = frame.parentElement; parent; parent = parent.parentElement) ancestors.add(parent);
  if (document.scrollingElement) ancestors.add(document.scrollingElement as HTMLElement);
  for (const node of ancestors) offsets.push([node, node.scrollTop, node.scrollLeft]);
  const placeholder = document.createElement('div');
  placeholder.setAttribute('aria-hidden', 'true');
  placeholder.style.height = `${frame.getBoundingClientRect().height}px`;
  frame.before(placeholder);
  frame.setAttribute('data-profile-pulling', '');
  frame.scrollTop = offsets.reduce((sum, [, top]) => sum + top, 0);
  let restored = false;
  const restore = () => { if (restored) return; restored = true; frame.removeAttribute('data-profile-pulling'); frame.style.removeProperty('--profile-pull-offset'); placeholder.remove(); frame.scrollTop = 0; for (const [node, top, left] of offsets) { node.scrollTop = top; node.scrollLeft = left; } };
  window.addEventListener('popstate', restore, { once: true });
  return { surface: frame, restore: () => { window.removeEventListener('popstate', restore); restore(); } };
}

export function isPullDismissActive() { return typeof document !== 'undefined' && Boolean(document.documentElement?.dataset.mobilePullDismiss); }
export function revealPullUnderlay() {
  document.documentElement.dataset.mobilePullDismiss = 'tracking';
  document.dispatchEvent(new Event('portalink-reveal-underlay'));
}
export function finishPullDismiss() { delete document.documentElement.dataset.mobilePullDismiss; }

/** Finish the one gesture animation before the native history pop; never reset then enter. */
export function commitPullDismiss(surface: HTMLElement, offset: number, onBack: () => void) {
  document.documentElement.dataset.mobilePullDismiss = 'committing';
  let committed = false;
  const finish = () => { if (committed) return; committed = true; onBack(); };
  const height = window.innerHeight;
  const duration = motionMs('slow');
  if (!duration || typeof surface.animate !== 'function') { finish(); return; }
  const animation = surface.animate([{ transform: `translate3d(0, ${offset}px, 0)` }, { transform: `translate3d(0, ${height}px, 0)` }], { duration, easing: motionEase('exit'), fill: 'forwards' });
  void animation.finished.then(finish, () => { finishPullDismiss(); });
  return animation;
}

export function cancelPullDismiss(surface: HTMLElement, offset: number, restore: () => void) {
  const duration = motionMs('base');
  if (!duration || typeof surface.animate !== 'function') { restore(); return; }
  const animation = surface.animate([{ transform: `translate3d(0, ${offset}px, 0)` }, { transform: 'translate3d(0, 0, 0)' }], { duration, easing: motionEase(), fill: 'forwards' });
  void animation.finished.then(() => { restore(); animation.cancel(); }, restore);
  return animation;
}
