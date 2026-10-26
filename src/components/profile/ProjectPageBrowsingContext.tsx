import React, { createContext, useContext, type RefObject } from 'react';

const InlineProjectPagesContext = createContext(false);
export function useInlineProjectPages(): boolean { return useContext(InlineProjectPagesContext); }

type DensityAnchor = { projectId: string; offset: number; scroller: HTMLElement | null };
type Props = { columns: number; reordering?: boolean; surfaceRef: RefObject<HTMLElement | null>; children: React.ReactNode };
const cardSelector = '[data-preview-open][data-project-continuity-id]';

function available(surface: HTMLElement): boolean {
  return !surface.closest('[hidden], [inert], [aria-hidden="true"], .screen-exit') && surface.getBoundingClientRect().width > 0;
}

function scrollOwner(surface: HTMLElement): HTMLElement | null {
  for (let parent = surface.parentElement; parent && parent !== document.body && parent !== document.documentElement; parent = parent.parentElement) {
    if (/(auto|scroll|overlay)/.test(getComputedStyle(parent).overflowY) && parent.scrollHeight > parent.clientHeight) return parent;
  }
  return null;
}

function viewportTop(scroller: HTMLElement | null): number {
  return scroller ? scroller.getBoundingClientRect().top + scroller.clientTop : window.visualViewport?.offsetTop ?? 0;
}

function visibleViewportTop(surface: HTMLElement, scroller: HTMLElement | null): number {
  const top = viewportTop(scroller);
  if (!surface.closest('[data-presentation="mobile"]')) return top;
  const header = surface.closest<HTMLElement>('[data-profile-page]')?.querySelector<HTMLElement>(':scope > .profile-header-region');
  if (!header) return top;
  const style = getComputedStyle(header), rect = header.getBoundingClientRect(), wall = surface.getBoundingClientRect();
  // A card behind the phone's pinned identity is not a visible reading anchor.
  if (!['sticky', 'fixed'].includes(style.position) || rect.height <= 0 || rect.top > top + (parseFloat(style.top) || 0) + 1 || rect.right <= wall.left || rect.left >= wall.right) return top;
  return Math.max(top, rect.bottom);
}

/** Runs in React's pre-mutation snapshot phase, before a changed density regroups rows. */
export function captureCatalogueDensityAnchor(surface: HTMLElement | null): DensityAnchor | null {
  if (!surface || !available(surface)) return null;
  const scroller = scrollOwner(surface), top = visibleViewportTop(surface, scroller);
  const bottom = Math.min(window.innerHeight, scroller ? viewportTop(scroller) + scroller.clientHeight : window.innerHeight);
  const card = [...surface.querySelectorAll<HTMLElement>(cardSelector)].find(element => {
    if (element.closest('[hidden], [inert], [aria-hidden="true"]')) return false;
    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0 && rect.bottom > top && rect.top < bottom;
  });
  return card?.dataset.projectContinuityId ? { projectId: card.dataset.projectContinuityId, offset: card.getBoundingClientRect().top - top, scroller } : null;
}

/** Correct only this density transition, and surrender immediately to new user input. */
export function restoreCatalogueDensityAnchor(surface: HTMLElement | null, anchor: DensityAnchor): () => void {
  let frame = 0, attempts = 0, stable = 0, stopped = false;
  const events = ['pointerdown', 'touchstart', 'wheel', 'keydown'] as const;
  const stop = () => {
    stopped = true;
    cancelAnimationFrame(frame);
    events.forEach(type => window.removeEventListener(type, stop, true));
  };
  const restore = () => {
    if (stopped || !surface?.isConnected || !available(surface) || (anchor.scroller && !anchor.scroller.isConnected)) { stop(); return; }
    const card = [...surface.querySelectorAll<HTMLElement>(cardSelector)].find(element => element.dataset.projectContinuityId === anchor.projectId
      && !element.closest('[hidden], [inert], [aria-hidden="true"]'));
    if (!card) { stop(); return; }
    const rect = card.getBoundingClientRect();
    // If a tall card becomes a small cover, retain at least one touch-target's
    // worth of the project rather than preserving an impossible old offset.
    const targetOffset = Math.max(anchor.offset, Math.min(0, 44 - rect.height));
    const delta = rect.top - visibleViewportTop(surface, anchor.scroller) - targetOffset;
    if (Math.abs(delta) > 0.5) {
      if (anchor.scroller) anchor.scroller.scrollBy({ top: delta, behavior: 'instant' });
      else window.scrollBy({ top: delta, behavior: 'instant' });
    }
    stable = Math.abs(delta) <= 1 ? stable + 1 : 0;
    // Bento's existing resize measurement and layout motion can settle after
    // the first paint. Keep correction bounded to that brief transition.
    if (++attempts < 30 && (attempts < 12 || stable < 3)) frame = requestAnimationFrame(restore);
    else stop();
  };
  events.forEach(type => window.addEventListener(type, stop, { capture: true, passive: true }));
  restore();
  return stop;
}

/** No DOM wrapper: the existing row packing, artwork and scroll surfaces stay unchanged. */
export class ProjectPageBrowsingProvider extends React.Component<Props, Record<string, never>, DensityAnchor | null> {
  private stopRestoration: () => void = () => undefined;

  getSnapshotBeforeUpdate(previous: Readonly<Props>): DensityAnchor | null {
    if (previous.columns === this.props.columns || previous.reordering || this.props.reordering) return null;
    this.stopRestoration();
    return captureCatalogueDensityAnchor(this.props.surfaceRef.current);
  }

  componentDidUpdate(previous: Readonly<Props>, _state: Readonly<Record<string, never>>, anchor: DensityAnchor | null) {
    if (this.props.reordering && !previous.reordering) this.stopRestoration();
    if (anchor) this.stopRestoration = restoreCatalogueDensityAnchor(this.props.surfaceRef.current, anchor);
  }

  componentWillUnmount() { this.stopRestoration(); }

  render() {
    return <InlineProjectPagesContext.Provider value={this.props.columns === 1 && !this.props.reordering}>{this.props.children}</InlineProjectPagesContext.Provider>;
  }
}
